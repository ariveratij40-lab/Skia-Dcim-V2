"""Disposable-only IO-boundary failure injection using the real executor.

Requires an existing local rehearsal fixture; never targets production names.
Does not change images or create a second activation implementation.
"""
import argparse
import copy
import json
from pathlib import Path
import secrets
import tempfile
import time

import execute_prewindow_activation as e


class InjectedDocker(e.Docker):
    def __init__(self, t, failure):
        self.t, self.failure, self.created, self.actions = t, failure, {}, []

    def inspect(self, kind, name):
        result = super().inspect(kind, name)
        if kind == 'container':
            for component, cid in self.created.items():
                if result['Id'] == cid and self.failure == component + '-unhealthy':
                    # Deterministic failure of the health observation boundary.
                    result['State']['Health'] = {'Status': 'unhealthy'}
        return result

    def run(self, args, data=None):
        if args[0] in ('start', 'stop', 'rename') or args[:2] == ['network', 'disconnect']:
            self.actions.append(args)
        if self.failure == 'before-web' and args[0] == 'stop':
            raise e.Rejected('INJECT_BEFORE_WEB')
        if self.failure == 'after-api-create' and args[0] == 'start' and args[1] == self.created.get('api'):
            raise e.Rejected('INJECT_AFTER_API_CREATE')
        return super().run(args, data)

    def create(self, name, body):
        cid = super().create(name, body)
        self.created['api' if name == self.t['api'] else 'web'] = cid
        return cid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture-evidence', required=True)
    args = parser.parse_args()
    source = Path(args.fixture_evidence).resolve()
    auth = e.strict_json(e.protected_read(source / 'authorization.json', False))
    original = auth['topology']
    e.require(original == e.topology(original['network']), 'FIXTURE_ONLY')
    d = e.Docker()
    env = e.parse_secrets(e.protected_read(source / 'fixture.env', False), False, original['network'] + '-pg')
    session = e.protected_read(source / 'session', False).decode()
    stage = Path(tempfile.mkdtemp(prefix='skia-activation-failures-')).resolve()
    print('FAILURE_EVIDENCE=' + str(stage), flush=True)
    for failure in ('before-api', 'after-api-create', 'api-unhealthy', 'before-web', 'web-unhealthy'):
        prefix = 'skia-activation-test-' + secrets.token_hex(6)
        t = e.topology(prefix)
        d.run(['network', 'create', '--internal', prefix])
        d.run(['volume', 'create', t['volume']])
        # Attach only the explicitly identified disposable PG to the new fixture.
        d.run(['network', 'connect', '--alias', prefix + '-pg', prefix, original['network'] + '-pg'])
        local_env = {k: v.replace(original['network'] + '-pg', prefix + '-pg') for k, v in env.items()}
        old = {}
        for c, image in [('api', 'sha256:35e62b53527a2562b8db49902b2baba08d366564098a2f3b1b8b05f17ea7d5d9'),
                         ('web', 'sha256:3fae38986f33404f205d13e49839c4d5d0e84ca18d4125ab3c6a21be43fdad14')]:
            b = e.body(t, c, {}); b['Image'] = image
            old[c] = d.create(t[c], b)
            if c == 'web':
                d.run(['start', old[c]])
                for _ in range(60):
                    if d.inspect('container', old[c])['State'].get('Health', {}).get('Status') == 'healthy':
                        break
                    time.sleep(1)
                else:
                    raise e.Rejected('FIXTURE_WEB_NOT_HEALTHY')
        now = int(time.time())
        evidence = json.loads((source / 'database.json').read_bytes())
        evidence['observed_at'] = now
        eraw = json.dumps(evidence).encode()
        a = copy.deepcopy(auth)
        a.update(topology=t, package_sha256=e.package_digest(), issued_at=now, expires_at=now + 900,
                 current_containers=old, db_evidence_sha256=e.digest(eraw),
                 network_id=d.inspect('network', prefix)['Id'])
        vol = d.inspect('volume', t['volume'])
        a['volume_identity'] = {k: vol.get(k) for k in ('Name', 'Driver', 'CreatedAt', 'Options', 'Labels')}
        inj = InjectedDocker(t, failure)
        journal = stage / (failure + '.jsonl')
        if failure == 'before-api':
            a['activation_authorized'] = False
        try:
            e.Executor(inj, t, a, eraw, local_env, session, journal).execute()
            raise AssertionError('INJECTION_NOT_DETECTED')
        except e.Rejected:
            pass
        e.require(not d.inspect('container', old['api'])['State']['Running'], 'OLD_API_REACTIVATED')
        e.require(d.inspect('network', prefix)['Id'] == a['network_id'], 'NETWORK_RECREATED')
        e.require(d.inspect('volume', t['volume'])['CreatedAt'] == a['volume_identity']['CreatedAt'], 'VOLUME_RECREATED')
        if failure == 'before-api':
            e.require(not inj.actions and not journal.exists(), 'PREFLIGHT_MUTATION')
        else:
            e.require('STOP_NO_ROLLBACK' in journal.read_text(), 'MISSING_FAILURE_EVIDENCE')
            expected_failure = {'after-api-create': 'INJECT_AFTER_API_CREATE',
                                'api-unhealthy': 'CANDIDATE_UNHEALTHY',
                                'before-web': 'INJECT_BEFORE_WEB',
                                'web-unhealthy': 'CANDIDATE_UNHEALTHY'}[failure]
            e.require(expected_failure in journal.read_text(), 'WRONG_FAILURE_POINT')
        if failure in ('before-api', 'after-api-create', 'api-unhealthy', 'before-web'):
            e.require('web' not in inj.created, 'WEB_ACTIVATED_TOO_EARLY')
        print('FAILURE_' + failure.upper().replace('-', '_') + '=PASS', flush=True)
    # Fresh authorization for exact healthy API+WEB: same engine, no replacements.
    t = original; a = copy.deepcopy(auth)
    now = int(time.time()); evidence = json.loads((source / 'database.json').read_bytes())
    evidence['observed_at'] = now; eraw = json.dumps(evidence).encode()
    a.update(package_sha256=e.package_digest(), issued_at=now, expires_at=now + 900,
             db_evidence_sha256=e.digest(eraw), current_containers={c: d.inspect('container', t[c])['Id'] for c in ('api', 'web')})
    inj = InjectedDocker(t, None)
    e.Executor(inj, t, a, eraw, env, session, stage / 'reentry.jsonl').execute()
    e.require(not inj.actions, 'DESTRUCTIVE_REENTRY')
    print('REAL_HEALTHY_REENTRY=PASS; NO_OLD_API_FALLBACK=PASS', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAILURE_MATRIX=FAILED; CODE=' + (str(error) if isinstance(error, e.Rejected) else 'INTERNAL_FAILURE'))
        raise SystemExit(1)
