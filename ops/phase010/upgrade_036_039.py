#!/usr/bin/env python3
"""Bounded upgrade; explicit local Docker target only. No service control or 040.

An external isolation attestation is necessary but not sufficient: no other
client may be connected at a migration boundary. This does not install a write
freeze. Production writer-isolation mechanics require separate authorization.
"""
import argparse
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid

import b3b_release as b
import b3b_recovery as recovery

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = Path(__file__).with_name('upgrade_036_039.json')
LOCK = 3612039
ADDITIONS = {
    'naming_rules': ['include_floor', 'include_distribution', 'include_housing',
                     'sequence_scope', 'source_type', 'source_preset_id',
                     'source_preset_version', 'accepted_by', 'accepted_at',
                     'accepted_by_snapshot', 'customized_after_acceptance'],
    'assets': ['nomenclature_sequence_scope', 'nomenclature_sequence_scope_location_id'],
}


class Session:
    """One backend owns the session lock AND every migration transaction."""
    def __init__(self, db):
        self.process = subprocess.Popen(
            ['docker', 'exec', '-i', db.container, 'psql', '-X', '-qAt',
             '-v', 'ON_ERROR_STOP=1', '-U', 'skia_bootstrap', '-d', db.database],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.pending = b''

    def execute(self, sql):
        marker = 'UPGRADE_END_' + uuid.uuid4().hex
        self.process.stdin.write((sql + '\n\\echo ' + marker + '\n').encode())
        self.process.stdin.flush()
        deadline = time.monotonic() + 180
        while marker.encode() + b'\n' not in self.pending:
            b.require(time.monotonic() < deadline, 'PSQL_TIMEOUT')
            if self.selector.select(1):
                chunk = os.read(self.process.stdout.fileno(), 65536)
                b.require(bool(chunk), 'SQL_TRANSACTION_FAILED')
                self.pending += chunk
        result, self.pending = self.pending.split(marker.encode() + b'\n', 1)
        return result.decode().strip()

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            self.process.wait(timeout=5)
        self.selector.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def contract():
    c = json.loads(CONTRACT.read_text())
    expected = b.git(ROOT, 'show', b.APP + ':' + b.MANIFEST).decode().splitlines()[:-1]
    b.require([x['path'] for x in c['migrations']] == expected, 'BOUNDED_MANIFEST_PATHS')
    b.require(len(expected) == 31 and expected[-1].startswith('migrations/039_'), 'BOUNDARY')
    for entry in c['migrations']:
        data = (ROOT / entry['path']).read_bytes()
        canonical = b.git(ROOT, 'show', b.APP + ':' + entry['path'])
        b.require(data == canonical and b.digest(data) == entry['sha256'], 'MIGRATION_CHECKSUM')
    b.require(set(c['prefixes']) == {'27', '28', '29', '30', '31'}, 'PREFIX_MATRIX')
    return c


def identity(db):
    return db.query("SELECT jsonb_build_object('database',current_database(),"
                    "'cluster',(SELECT system_identifier::text FROM pg_control_system()),"
                    "'oid',(SELECT oid FROM pg_database WHERE datname=current_database()),"
                    "'version',current_setting('server_version'))")[0]


def baseline(db, project=True):
    tables = db.query("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables "
                      "WHERE schemaname='public' AND tablename NOT IN "
                      "('production_bootstrap_migrations','system_naming_presets')")[0]
    statements = []
    for table in tables:
        b.require(re.fullmatch('[a-z_][a-z0-9_]*', table), 'TABLE_NAME')
        row = 'to_jsonb(t)'
        for field in ADDITIONS.get(table, []) if project else []:
            row += "-'" + field + "'"
        statements.append("SELECT jsonb_build_object('table','" + table +
                          "','count',count(*),'hash',encode(sha256(convert_to("
                          "coalesce(jsonb_agg(" + row + " ORDER BY (" + row +
                          ")::text COLLATE \"C\"),'[]'::jsonb)::text,'UTF8')),'hex')) "
                          'FROM public."' + table + '" t')
    return db.query(';'.join(statements))


def observe(db, c):
    ident = identity(db)
    b.require(ident['version'] == '16.14', 'POSTGRES_VERSION')
    ledger = db.query("SELECT coalesce(jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path),'[]') "
                      "FROM production_bootstrap_migrations")[0]
    n = len(ledger)
    b.require(str(n) in c['prefixes'], 'UNRECOGNIZED_LEDGER_COUNT')
    wanted = sorted([[x['path'], x['sha256']] for x in c['migrations'][:n]])
    b.require(ledger == wanted, 'LEDGER_PREFIX_OR_CHECKSUM')
    b.require(db.query('SELECT count(*) FROM system_naming_presets') == [0], 'CATALOG_NONEMPTY')
    raw = db.fingerprint()
    b.require(raw == c['prefixes'][str(n)]['raw'], 'LIVE_RAW_FINGERPRINT')
    structural = b.structure(db)['hash']
    b.require(structural == c['prefixes'][str(n)]['structure'], 'STRUCTURE_OR_SECURITY')
    return {'identity': ident, 'ledger_count': n, 'raw': raw,
            'structure': structural, 'baseline': baseline(db)}


def quiescence(session, observed, evidence):
    b.require(evidence['identity'] == observed['identity'], 'QUIESCENCE_IDENTITY')
    b.require(0 <= time.time() - evidence['observed_at'] <= 600, 'QUIESCENCE_STALE')
    b.require(evidence['requested'] is True and evidence['verified'] is True
              and evidence['old_api_writers_active'] is False
              and evidence['in_flight_drained'] is True
              and bool(evidence['external_isolation_reference']), 'QUIESCENCE_NOT_VERIFIED')
    count = session.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                            "AND backend_type='client backend' AND pid<>pg_backend_pid();")
    b.require(count == '0', 'OTHER_DATABASE_CLIENTS')


def apply_one(session, entry):
    # Paths/checksums are checked against immutable Git, never user SQL input.
    data = (ROOT / entry['path']).read_bytes()
    b.require(b.digest(data) == entry['sha256'], 'MIGRATION_CHANGED_BEFORE_EXECUTION')
    sql = data.decode()
    session.execute("BEGIN; SET LOCAL ROLE skia_migrator; SET LOCAL lock_timeout='5s';\n" + sql +
                    "\nINSERT INTO public.production_bootstrap_migrations(path,sha256) VALUES ('" +
                    entry['path'] + "','" + entry['sha256'] + "'); COMMIT;")


def upgrade(db, evidence, preservation, checkpoint):
    c = contract()
    with Session(db) as session:
        b.require(session.execute('SELECT pg_try_advisory_lock(' + str(LOCK) + ');') == 't',
                  'COMPETING_EXECUTOR')
        before = observe(db, c)
        b.require(before['baseline'] == preservation, 'PRESERVATION_BASELINE')
        b.require(checkpoint['identity'] == before['identity']
                  and checkpoint['source_ledger_count'] == 27
                  and checkpoint['source_raw'] == c['prefixes']['27']['raw']
                  and checkpoint['baseline'] == preservation
                  and checkpoint['recovery_verified'] is True
                  and len(set(checkpoint['restore_targets'])) == 2
                  and b.file_hash(checkpoint['path']) == checkpoint['sha256'], 'CHECKPOINT_CONTRACT')
        quiescence(session, before, evidence)
        for i in range(before['ledger_count'], 31):
            quiescence(session, before, evidence)
            apply_one(session, c['migrations'][i])
            after = observe(db, c)
            b.require(after['baseline'] == preservation, 'UNAUTHORIZED_DATA_DELTA')
            print('COMMITTED_LEDGER_COUNT=' + str(after['ledger_count']), flush=True)
        result = observe(db, c)
        b.require(result['baseline'] == preservation, 'UNAUTHORIZED_DATA_DELTA')
        return result


def verify_restore(source, restored):
    # Raw equality is never sufficient. Security is included in full structure.
    for key in ('structure', 'baseline', 'ledger', 'catalog'):
        b.require(source[key] == restored[key], 'RESTORE_' + key.upper())
    b.require(source['normalized_raw'] == restored['normalized_raw'], 'UNCLASSIFIED_RAW_DIFFERENCE')
    b.require(restored['restore_exit'] == 0 and restored['restore_stderr'] == 'EMPTY', 'RESTORE_ERROR')
    return {'recovery_verified': True, 'restore_raw_hash_match': source['raw'] == restored['raw'],
            'raw_classification': 'POSTGRESQL_CANONICAL_EXPRESSION_RESERIALIZATION'}


def recovery_snapshot(db):
    return {'raw': db.fingerprint(), 'normalized_raw': b.digest(b.normalized_raw(db.schema_dump())),
            'structure': b.structure(db), 'baseline': baseline(db, project=False),
            'ledger': db.query("SELECT jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path) FROM production_bootstrap_migrations")[0],
            'catalog': db.query('SELECT coalesce(jsonb_agg(to_jsonb(p)),\'[]\') FROM system_naming_presets p')[0]}


def checkpoint_create(db, evidence, output, targets):
    b.require(len(set(targets)) == 2 and db.database not in targets, 'TWO_ISOLATED_TARGETS')
    for target in targets:
        recovery.name(target)
    output = Path(output)
    b.require(not output.exists(), 'CHECKPOINT_PATH_EXISTS')
    with Session(db) as session:
        b.require(session.execute('SELECT pg_try_advisory_lock('+str(LOCK)+');') == 't', 'COMPETING_EXECUTOR')
        observed = observe(db, contract())
        b.require(observed['ledger_count'] == 27, 'CHECKPOINT_NOT_POST035')
        quiescence(session, observed, evidence)
        before = recovery_snapshot(db)
        dump = db.command('pg_dump', '-U', 'skia_bootstrap', '-d', db.database, '-Fc')
        # Exclusive create: never overwrite an existing recovery artifact.
        with output.open('xb') as stream:
            stream.write(dump)
        cp = {'path': str(output.resolve()), 'sha256': b.digest(dump),
              'identity': observed['identity'], 'source_ledger_count': 27,
              'source_raw': observed['raw'], 'baseline': observed['baseline'],
              'source_snapshot': before,
              'restore_targets': [], 'restore_evidence': [], 'created_at': b.stamp()}
        for target in targets:
            restored, meta = recovery.restore(db, cp, target)
            after = recovery_snapshot(restored)
            after.update(restore_exit=meta['pg_restore_exit_code'], restore_stderr=meta['pg_restore_stderr'])
            verdict = verify_restore(before, after)
            cp['restore_targets'].append(target)
            cp['restore_evidence'].append(dict(verdict, raw=after['raw'], structure=after['structure']['hash']))
        b.require(recovery_snapshot(db) == before, 'CHECKPOINT_SOURCE_CHANGED')
        quiescence(session, observed, evidence)
        cp['recovery_verified'] = True
        return cp


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['observe', 'checkpoint', 'upgrade', 'validate'])
    parser.add_argument('--container', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--quiescence')
    parser.add_argument('--baseline')
    parser.add_argument('--checkpoint')
    parser.add_argument('--dump')
    parser.add_argument('--restore-targets', nargs=2)
    parser.add_argument('--application-evidence')
    args = parser.parse_args()
    db = b.DB(args.container, args.database, 'skia_bootstrap')
    try:
        if args.action == 'checkpoint':
            result = checkpoint_create(db, json.loads(Path(args.quiescence).read_text()),
                                       args.dump, args.restore_targets)
        elif args.action == 'upgrade':
            result = upgrade(db, json.loads(Path(args.quiescence).read_text()),
                             json.loads(Path(args.baseline).read_text()),
                             json.loads(Path(args.checkpoint).read_text()))
        else:
            result = observe(db, contract())
            if args.action == 'validate':
                b.require(result['ledger_count'] == 31, 'NOT_POST039')
                b.require(result['baseline'] == json.loads(Path(args.baseline).read_text()), 'DATA_PRESERVATION')
                app = json.loads(Path(args.application_evidence).read_text())
                b.require(app['application_sha'] == b.APP and app['database_identity'] == result['identity']
                          and app['status'] == 'PASS'
                          and app['authenticated_reads'] == 'PASS'
                          and app['health'] == 'PASS'
                          and bool(re.fullmatch(r'sha256:[0-9a-f]{64}', app['image_id']))
                          and 0 <= time.time() - app['observed_at'] <= 600, 'APPLICATION_EVIDENCE')
                result['POST039_READY_FOR_B3B_R2'] = 'YES'
        print(json.dumps(result, sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, BrokenPipeError):
        # Never echo SQL/server diagnostics or credentials. Observe committed
        # boundary separately even when an executor connection failed mid-step.
        boundary = db.query('SELECT count(*) FROM production_bootstrap_migrations')[0]
        print(json.dumps({'status': 'BLOCKED', 'committed_ledger_count': boundary}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
