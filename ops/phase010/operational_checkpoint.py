"""Governed checkpoint wrapper. Import only; no production mutation CLI."""
import json
import time
import subprocess

import b3b_recovery as recovery
import upgrade_036_039 as u
from operational_custody import ExecutionAuthority, binding, canonical, require, strict_json


def validate(evidence, authority, expected, custody):
    binding(authority, expected)
    binding(evidence, expected)
    prefix = u.contract()['prefixes']['27']
    require(evidence['source_ledger_count'] == 27 and evidence['source_catalog_count'] == 0, 'CHECKPOINT_PREFIX')
    require(evidence['source_raw'] == prefix['raw'] and
            evidence['source_structural'] == prefix['structure'], 'CHECKPOINT_SCHEMA')
    require(type(evidence['created_at']) is int and 0 <= time.time() - evidence['created_at'] <= 3600,
            'CHECKPOINT_AGE')
    require(evidence['identity']['database'] == 'skia_prod', 'CHECKPOINT_DATABASE')
    require(evidence['identity'] == authority['database_identity'], 'CHECKPOINT_IDENTITY')
    source = evidence['source_snapshot']
    require(source['raw'] == prefix['raw'] and source['structure']['hash'] == prefix['structure']
            and source['catalog'] == [] and source['baseline'] == evidence['baseline'],
            'SOURCE_BASELINE_BINDING')
    require(source['ledger'] == sorted([[x['path'], x['sha256']]
            for x in u.contract()['migrations'][:27]]), 'SOURCE_LEDGER_BINDING')
    raw, record = custody.read('checkpoint.dump', evidence['dump_custody'])
    require(record['sha256'] == evidence['sha256'], 'CHECKPOINT_HASH')
    return raw


def restore(db, evidence, authority, expected, custody, target):
    """Consume the exact protected bytes, never reopen an untrusted path."""
    raw = validate(evidence, authority, expected, custody)
    require(db.database == expected['database'], 'SOURCE_DATABASE')
    restored, meta = recovery.prepare(db, target)
    # Recheck custody immediately before consumption. Bytes remain pinned in memory.
    require(validate(evidence, authority, expected, custody) == raw, 'DUMP_CHANGED')
    result = subprocess.run(['docker', 'exec', '-i', restored.container, 'pg_restore',
                             '-U', restored.user, '-d', target, '--exit-on-error'],
                            input=raw, capture_output=True)
    require(result.returncode == 0 and not result.stderr, 'RESTORE_FAILED')
    recovery.extensions(restored)
    recovery.acl(restored, target)
    validate(evidence, authority, expected, custody)
    snapshot = u.recovery_snapshot(restored)
    snapshot.update(restore_exit=0, restore_stderr='EMPTY')
    return u.verify_restore(evidence['source_snapshot'], snapshot)


def restore_evidence(db, custody, target):
    """Recovery entry: protected persisted evidence, never a caller dump path."""
    execution = ExecutionAuthority(custody)
    authority, _ = execution.load('checkpoint.authorization', 'LOCKSTEP_CHECKPOINT', u.identity(db))
    raw, record = custody.read('checkpoint.json')
    evidence = strict_json(raw)
    custody.read('checkpoint.json', record)
    result = restore(db, evidence, authority, execution.expected, custody, target)
    custody.read('checkpoint.json', record)
    return result


def create(db, quiescence, custody, targets):
    execution = ExecutionAuthority(custody)
    expected = execution.expected
    authority, authority_record = execution.load('checkpoint.authorization', 'LOCKSTEP_CHECKPOINT', u.identity(db))
    require(db.database == 'skia_prod' and db.user == 'skia_bootstrap', 'DATABASE_AUTHORITY')
    require(db.container == 'skia_postgres_prod' if expected['environment'] == 'production'
            else db.container.startswith('skia-activation-test-'), 'DATABASE_TARGET')
    require(len(set(targets)) == 2 and db.database not in targets, 'TWO_ISOLATED_TARGETS')
    for target in targets: recovery.name(target)
    # Reserve before database work; incomplete evidence intentionally blocks reentry.
    execution.consume('checkpoint.authorization', 'LOCKSTEP_CHECKPOINT', u.identity(db))
    custody.create('checkpoint.started', canonical(authority))
    with u.Session(db) as session:
        require(session.execute('SELECT pg_try_advisory_lock(' + str(u.LOCK) + ');') == 't', 'COMPETING_EXECUTOR')
        observed = u.observe(db, u.contract())
        require(observed['ledger_count'] == 27, 'POST035_REQUIRED')
        u.quiescence(session, observed, quiescence)
        execution.load('checkpoint.authorization', 'LOCKSTEP_CHECKPOINT', observed['identity'])
        custody.read('checkpoint.authorization', authority_record)
        before = u.recovery_snapshot(db)
        require(before['catalog'] == [], 'CATALOG_NOT_EMPTY')
        dump = db.command('pg_dump', '-U', 'skia_bootstrap', '-d', db.database, '-Fc')
        record = custody.create('checkpoint.dump', dump)
        evidence = {**expected, 'created_at': int(time.time()), 'identity': observed['identity'],
                    'source_ledger_count': 27, 'source_catalog_count': 0,
                    'source_raw': observed['raw'], 'source_structural': before['structure']['hash'],
                    'source_snapshot': before, 'baseline': observed['baseline'],
                    'sha256': record['sha256'], 'dump_custody': record,
                    'restore_targets': list(targets), 'restore_evidence': []}
        validate(evidence, authority, expected, custody)
        for target in targets:
            evidence['restore_evidence'].append(restore(db, evidence, authority, expected, custody, target))
        require(u.recovery_snapshot(db) == before, 'SOURCE_CHANGED')
        u.quiescence(session, observed, quiescence)
        execution.load('checkpoint.authorization', 'LOCKSTEP_CHECKPOINT', observed['identity'])
        custody.read('checkpoint.authorization', authority_record)
        evidence['recovery_verified'] = True
        custody.create('checkpoint.json', canonical(evidence))
        persisted, _ = custody.read('checkpoint.json')
        require(json.loads(persisted) == evidence, 'EVIDENCE_READBACK')
        validate(evidence, authority, expected, custody)
        return evidence
