"""Synthetic-only executor contract, negative and failure/reentry tests."""
import copy
import json
import contextlib
import io
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import execute_prewindow_activation as e


def container(t, component, exact=False):
    b = e.body(t, component, {})
    return {'Id': component * 8, 'Name': '/' + t[component],
            'Image': t[component + '_image'] if exact else 'sha256:' + '0' * 64,
            'Config': {k: b[k] for k in ('Cmd', 'Entrypoint', 'User', 'WorkingDir', 'Env', 'Healthcheck')},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0},
                           'PortBindings': {}},
            'NetworkSettings': {'Networks': {t['network']: {'NetworkID': 'network-id',
                                  'Aliases': t[component + '_aliases']}}, 'Ports': {}},
            'Mounts': [{'Type': 'volume', 'Name': t['volume'], 'Destination': '/app/uploads', 'RW': True}]
            if component == 'api' else [],
            'State': {'StartedAt': 'fixture', 'Running': exact or component == 'web',
                      'Health': {'Status': 'healthy'}}, 'RestartCount': 0}


class FakeDocker:
    def __init__(self, t):
        self.t, self.actions, self.fail = t, [], None
        self.containers = {c: container(t, c) for c in ('api', 'web')}

    def daemon(self):
        return 'fixture-daemon'

    def inspect(self, kind, name):
        if kind == 'image':
            e.require(self.fail != 'missing-image', 'MISSING_IMAGE')
            return {'Id': name}
        if kind == 'network':
            e.require(self.fail != 'missing-network', 'MISSING_NETWORK')
            return {'Id': 'network-id', 'Name': self.t['network'], 'Driver': 'bridge', 'Internal': True}
        if kind == 'volume':
            e.require(self.fail != 'missing-volume', 'MISSING_VOLUME')
            return {'Name': self.t['volume'], 'Driver': 'local', 'CreatedAt': 'fixture', 'Options': None, 'Labels': None}
        return self.containers['api' if name == self.t['api'] else 'web']

    def run(self, args, data=None):
        self.actions.append(args)
        if args[0] == 'exec':
            return b'PROBE_PASS'
        return b''

    def create(self, name, body):
        component = 'api' if name == self.t['api'] else 'web'
        e.require(self.fail != 'before-' + component, 'INJECTED_CREATE_FAILURE')
        self.actions.append(['create', component])
        self.containers[component] = container(self.t, component, True)
        if self.fail == component + '-unhealthy':
            self.containers[component]['State']['Health']['Status'] = 'unhealthy'
        return self.containers[component]['Id']


def authorization(t, d):
    now = int(time.time())
    evidence = json.dumps({'window': 'fixture', 'daemon_id': d.daemon(), 'database': 'skia_prod',
        'database_identity': 'fixture-database', 'observed_at': now,
        'ledger': e.strict_json((e.HERE / 'upgrade_036_039.json').read_bytes())['migrations'],
        'catalog_count': 0, 'migration_040_count': 0, 'fingerprint': e.POST039,
        'security_pass': True, 'tenant_preservation_pass': True, 'writers_isolated': True,
        'admission_closed': True}).encode()
    a = {'activation_authorized': True, 'environment': t['environment'], 'database': 'skia_prod',
         'package_sha256': e.package_digest(), 'api_image': e.contract.IMAGE, 'web_image': e.WEB,
         'topology': copy.deepcopy(t), 'issued_at': now, 'expires_at': now + 600,
         'window': 'fixture', 'operator': 'test', 'db_evidence_sha256': e.digest(evidence),
         'daemon_id': d.daemon(), 'network_id': 'network-id',
         'volume_identity': d.inspect('volume', t['volume']),
         'session_authority': {'user_id': 'f2000000-0000-4000-8000-000000000002',
                               'tenant_id': 'f2000000-0000-4000-8000-000000000001',
                               'branch_id': 'f2100000-0000-4000-8000-000000000001',
                               'source': 'DISPOSABLE_FIXTURE', 'expires_at': now + 7200},
         'current_containers': {c: x['Id'] for c, x in d.containers.items()}}
    return a, evidence


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.t = e.topology('skia-activation-test-123456abcdef')
        self.d = FakeDocker(self.t)
        self.a, self.evidence = authorization(self.t, self.d)
        self.journal = Path(self.tmp.name) / 'activation-fixture.jsonl'

    def executor(self):
        return e.Executor(self.d, self.t, self.a, self.evidence, {}, 'sentinel-session', self.journal)

    def test_success_order_capture_and_secret_hygiene(self):
        self.executor().execute()
        journal = self.journal.read_text()
        self.assertLess(journal.index('"GATE_PASS", "data": "api"'), journal.index('"data": "web"'))
        self.assertNotIn('sentinel-session', journal)
        self.assertNotIn('sentinel-session', repr(self.d.actions))
        self.assertFalse(any(a[0] in ('rm', 'volume', 'network-create') for a in self.d.actions))

    def test_authority_negative_matrix(self):
        for key, value in [('activation_authorized', False), ('activation_authorized', 1),
                           ('expires_at', 1), ('environment', 'other'), ('package_sha256', 'wrong'),
                           ('api_image', 'tag:latest'), ('web_image', 'tag:latest'),
                           ('db_evidence_sha256', 'wrong'), ('daemon_id', 'wrong'),
                           ('network_id', 'wrong'), ('volume_identity', {})]:
            with self.subTest(key=key, value=value):
                a = copy.deepcopy(self.a); a[key] = value
                with self.assertRaises(e.Rejected):
                    e.Executor(self.d, self.t, a, self.evidence, {}, 'x', self.journal).preflight()
                self.assertEqual(self.d.actions, [])

    def test_database_negative_matrix(self):
        for key, value in [('ledger', []), ('catalog_count', 12), ('migration_040_count', 1),
                           ('fingerprint', 'post035'), ('security_pass', False),
                           ('writers_isolated', False), ('admission_closed', False), ('observed_at', 0)]:
            with self.subTest(key=key):
                data = json.loads(self.evidence); data[key] = value
                raw = json.dumps(data).encode(); a = dict(self.a); a['db_evidence_sha256'] = e.digest(raw)
                with self.assertRaises(e.Rejected):
                    e.validate_authority(a, raw, self.t, int(time.time()))

    def test_missing_resources(self):
        for failure in ('missing-image', 'missing-network', 'missing-volume'):
            self.d.fail = failure
            with self.assertRaises(e.Rejected):
                self.executor().preflight()
            self.assertEqual(self.d.actions, [])

    def test_topology_negative_matrix(self):
        for key, value in [('ports', {'8080/tcp': 18081}), ('ports', {'3000/tcp': 13001}),
                           ('volume', 'anonymous'), ('network', 'wrong'), ('api_health', {}),
                           ('public', {'FRONTEND_URL': 'https://skia.mx'})]:
            t = copy.deepcopy(self.t); t[key] = value
            with self.assertRaises(e.Rejected):
                e.validate_authority(self.a, self.evidence, t, int(time.time()))

    def test_failure_injection_and_no_fallback(self):
        for failure in ('before-api', 'api-unhealthy', 'before-web', 'web-unhealthy'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                d = FakeDocker(self.t); d.fail = failure
                a, ev = authorization(self.t, d)
                journal = Path(tmp) / 'journal'
                with self.assertRaises(e.Rejected):
                    e.Executor(d, self.t, a, ev, {}, 'x', journal).execute()
                self.assertIn('STOP_NO_ROLLBACK', journal.read_text())
                if failure in ('before-api', 'api-unhealthy'):
                    self.assertNotIn(['create', 'web'], d.actions)
                self.assertNotIn(['start', 'old-api'], d.actions)
                self.assertFalse(any(x[0] == 'rm' for x in d.actions))

    def test_reentry_exact_healthy_skips_replacement(self):
        for c in ('api', 'web'):
            self.d.containers[c] = container(self.t, c, True)
        self.executor().execute()
        self.assertFalse(any(x[0] in ('create', 'stop', 'rename') for x in self.d.actions))
        with self.assertRaises(FileExistsError):
            self.executor().execute()

    def test_api_exact_web_pending(self):
        self.d.containers['api'] = container(self.t, 'api', True)
        self.executor().execute()
        self.assertNotIn(['create', 'api'], self.d.actions)
        self.assertIn(['create', 'web'], self.d.actions)

    def test_failed_candidate_reentry_stops(self):
        self.d.containers['web'] = container(self.t, 'web', True)
        self.d.containers['web']['State']['Health']['Status'] = 'unhealthy'
        with self.assertRaises(e.Rejected):
            self.executor().preflight()
        self.assertEqual(self.d.actions, [])

    def test_secret_matrix(self):
        env = {k: 'opaque-value' for k in e.contract.OAUTH_NAMES}
        for k, role in zip(e.contract.expected()['required_secret_names'],
                           ('skia_runtime', 'skia_migrator', 'skia_onboarding')):
            env[k] = 'postgresql://' + role + ':opaque@skia_postgres_prod/skia_prod'
        def raw(v):
            return '\n'.join(k + '=' + x for k, x in v.items()).encode()
        self.assertEqual(e.parse_secrets(raw(env), True, 'skia_postgres_prod'), env)
        for name in env:
            for value in ('', 'synthetic-sentinel'):
                bad = dict(env); bad[name] = value
                with self.assertRaises(e.Rejected) as error:
                    e.parse_secrets(raw(bad), True, 'skia_postgres_prod')
                self.assertNotIn(value or 'opaque-value', str(error.exception))
            bad = dict(env); del bad[name]
            with self.assertRaises(e.Rejected):
                e.parse_secrets(raw(bad), True, 'skia_postgres_prod')
        with self.assertRaises(e.Rejected):
            e.parse_secrets(raw(env) + b'\nGOOGLE_CLIENT_ID=sentinel', True, 'skia_postgres_prod')

    def test_original_spec_stays_unauthorized(self):
        self.assertIs(e.strict_json(e.contract.SPEC.read_bytes())['activation_authorized'], False)

    def test_default_is_offline_plan(self):
        with patch('sys.argv', ['executor']), patch('builtins.print') as output, patch.object(e.Docker, 'run') as run:
            e.main()
        run.assert_not_called()
        self.assertIn('PLAN_ONLY', output.call_args.args[0])

    def test_missing_authorization_and_safe_file_rules(self):
        with patch('sys.argv', ['executor', '--verify', '--disposable-prefix', self.t['network']]):
            with self.assertRaises(e.Rejected):
                e.main()
        path = Path(self.tmp.name).resolve() / 'input'
        path.write_text('sentinel-secret')
        path.chmod(0o644)
        with self.assertRaises(e.Rejected):
            e.protected_read(path, False)
        path.chmod(0o600)
        self.assertEqual(e.protected_read(path, False), b'sentinel-secret')
        link = Path(self.tmp.name).resolve() / 'link'; link.symlink_to(path)
        with self.assertRaises(e.Rejected):
            e.protected_read(link, False)

    def test_runtime_negative_matrix(self):
        for component in ('api', 'web'):
            for variant in ('ports', 'health', 'network', 'public', 'image'):
                with self.subTest(component=component, variant=variant):
                    c = container(self.t, component, True)
                    if variant == 'ports':
                        c['HostConfig']['PortBindings'] = {'3000/tcp': [{'HostPort': '13001'}]}
                    elif variant == 'health':
                        c['Config']['Healthcheck'] = {}
                    elif variant == 'network':
                        c['NetworkSettings']['Networks'] = {}
                    elif variant == 'public':
                        c['Config']['Env'] = ['FRONTEND_URL=https://skia.mx']
                    else:
                        c['Image'] = 'tag-only'
                    with self.assertRaises(e.Rejected):
                        e.identity(c, self.t, component)

    def test_docker_secret_transport_not_argv(self):
        sentinel = 'sentinel-not-a-real-secret'
        calls = []
        class Result:
            returncode = 0
            stdout = b'{"Id":"created"}'
        def run(argv, **kwargs):
            calls.append((argv, kwargs))
            return Result()
        d = e.Docker()
        with patch.object(d, 'run', return_value=b'[{"Endpoints":{"docker":{"Host":"unix:///fixture.sock"}}}]'), \
                patch('subprocess.run', side_effect=run), contextlib.redirect_stdout(io.StringIO()) as stdout:
            d.create('fixture', {'Env': ['TEST=' + sentinel]})
        self.assertNotIn(sentinel, repr(calls[0][0]))
        self.assertIn(sentinel.encode(), calls[0][1]['input'])
        self.assertNotIn(sentinel, stdout.getvalue())

    def test_current_legacy_port_classification(self):
        for component, internal, host in [('api','8080/tcp','18081'),('web','3000/tcp','13001')]:
            c = container(self.t, component)
            c['HostConfig']['PortBindings'] = {internal: [{'HostIp': '127.0.0.1','HostPort': host}]}
            c['NetworkSettings']['Ports'] = {internal: None}
            now = int(time.time())
            a = {'container_id': c['Id'], 'nginx_upstream': 'http://' + self.t[component] + ':' + internal.split('/')[0],
                 'nginx_config_sha256': 'a'*64, 'listening_socket_count': 0, 'observed_at': now}
            self.assertEqual(e.classify_current_ports(c,self.t,component,a,now),'LEGACY_PERSISTED_ONLY_EXPECTED_REMOVAL')
            for bad in (None, {}, {**a, 'nginx_upstream':'http://localhost:'+host}, {**a,'listening_socket_count':1}):
                with self.assertRaises(e.Rejected): e.classify_current_ports(c,self.t,component,bad,now)
            for location in ('HostConfig','NetworkSettings'):
                bad = copy.deepcopy(c)
                if location == 'HostConfig': bad[location]['PortBindings'][internal][0]['HostPort']='9999'
                else: bad[location]['Ports'][internal]=[{'HostIp':'127.0.0.1','HostPort':host}]
                with self.assertRaises(e.Rejected): e.classify_current_ports(bad,self.t,component,a,now)
            c['Image']=self.t[component+'_image']
            with self.assertRaises(e.Rejected): e.classify_current_ports(c,self.t,component,a,now)
            c['HostConfig']['PortBindings']={}
            c['NetworkSettings']['Ports'][internal]=[{'HostIp':'127.0.0.1','HostPort':host}]
            with self.assertRaises(e.Rejected): e.identity(c,self.t,component)

    def test_session_authority_negative_matrix(self):
        now=int(time.time()); a=self.a['session_authority']
        for token in ('', 'token with spaces', 'synthetic-session'):
            with self.assertRaises(e.Rejected): e.validate_session_authority(token,a,self.a,True,now)
        for key,value in [('user_id',''),('tenant_id',''),('branch_id',''),('expires_at',now-1),('source','FABRICATED')]:
            with self.assertRaises(e.Rejected):
                e.validate_session_authority('valid-fixture',{**a,key:value},self.a,False,now)
        with patch('sys.argv',['executor','--session-token','sentinel']),contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit): e.main()


if __name__ == '__main__':
    unittest.main()
