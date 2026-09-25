"""Narrow two-field release update; protected evidence, never arbitrary content."""
import fcntl
import json
import os
import time

import execute_prewindow_activation as e
import production_reopen_gate as reopen
import upgrade_036_039 as u
from operational_custody import ExecutionAuthority, binding, canonical, digest, require, strict_json


def preconditions(custody, expected, db, docker, topology, adapter, journal_custody):
    def read(name):
        raw, _ = custody.read(name)
        return strict_json(raw), raw
    execution = ExecutionAuthority(custody)
    require(execution.expected == expected, 'WINDOW_CONTEXT')
    auth, _ = execution.load('descriptor.authorization', 'RELEASE_DESCRIPTOR_UPDATE', u.identity(db))
    binding(auth, expected)
    now = int(time.time())
    require(auth.get('operation') == 'UPDATE_RELEASE_DESCRIPTOR' and auth.get('authorized') is True,
            'DESCRIPTOR_AUTHORIZATION')
    require(type(auth.get('issued_at')) is int and type(auth.get('expires_at')) is int and
            auth['issued_at'] <= now < auth['expires_at'] <= auth['issued_at'] + 900, 'AUTH_EXPIRED')
    window = expected['window_id']
    require(topology == e.topology() if expected['environment'] == 'production'
            else topology['environment'] == 'disposable', 'TOPOLOGY')
    evidence, raw = read('post039.json')
    require(auth.get('post039_sha256') == digest(raw), 'POST039_BINDING')
    require(evidence.get('window') == window and evidence.get('environment') == expected['environment']
            and evidence.get('database') == expected['database']
            and evidence.get('daemon_id') == docker.daemon(), 'POST039_IDENTITY')
    require(type(evidence.get('observed_at')) is int and
            0 <= now - evidence['observed_at'] <= 300, 'POST039_STALE')
    require(evidence.get('ledger') == u.contract()['migrations'] and evidence.get('ledger_count') == 31
            and evidence.get('catalog_count') == 0 and evidence.get('migration_040_count') == 0
            and evidence.get('fingerprint') == e.POST039, 'POST039_CONTRACT')
    require(all(evidence.get(k) is True for k in ('security_pass','tenant_preservation_pass',
                'writers_isolated','admission_closed')), 'POST039_APPROVAL')
    activation, activation_raw = read('activation.authorization')
    e.validate_authority(activation, raw, topology, now)
    require(auth.get('activation_sha256') == digest(activation_raw)
            and activation.get('window') == window
            and activation.get('db_evidence_sha256') == digest(raw)
            and activation.get('api_image') == e.contract.IMAGE and activation.get('web_image') == e.WEB
            and activation.get('activation_authorized') is True, 'ACTIVATION_BINDING')
    journal, _ = journal_custody.read('activation-' + window + '.jsonl')
    require(auth.get('activation_journal_sha256') == digest(journal), 'ACTIVATION_JOURNAL_BINDING')
    records = [strict_json(line) for line in journal.splitlines()]
    require(records and records[-1]['event'] == 'COMPLETE' and
            [r.get('data') for r in records if r['event'] == 'GATE_PASS'] == ['api', 'web'] and
            not any(r['event'] == 'STOP_NO_ROLLBACK' for r in records), 'ACTIVATION_NOT_COMPLETE')
    observed = u.observe(db, u.contract())
    u0, u0_raw = read('u0.json')
    require(observed['ledger_count'] == 31 and observed['raw'] == e.POST039
            and observed['identity'] == evidence['database_identity']
            and evidence.get('u0_sha256') == digest(u0_raw) and u0.get('window') == window
            and u0.get('baseline') == observed['baseline'], 'LIVE_DATABASE_GATE')
    closed = adapter.verify('CLOSED', window)
    require(closed['identity']['daemon'] == docker.daemon(), 'ADMISSION_DAEMON')
    token, _ = custody.read('session')
    metadata, _ = read('session-metadata.json')
    runtime = reopen.runtime(docker, topology, window, token.decode(), metadata)
    integrated, integrated_raw = read('runtime.json')
    require(auth.get('integrated_runtime_sha256') == digest(integrated_raw)
            and set(integrated) == set(runtime)
            and all(integrated[k] == runtime[k] for k in runtime if k != 'observed_at')
            and type(integrated.get('observed_at')) is int
            and 0 <= now - integrated['observed_at'] <= 300, 'INTEGRATED_RUNTIME_BINDING')
    require(auth.get('api_container_id') == runtime['api']['id'] and
            auth.get('web_container_id') == runtime['web']['id'], 'RUNTIME_BINDING')
    require(time.time() < auth['expires_at'], 'AUTH_EXPIRED_DURING_CHECKS')
    return auth


def update(custody, descriptor_custody, journal_custody, db, docker, topology, adapter):
    execution = ExecutionAuthority(custody)
    expected = execution.expected
    if expected['environment'] == 'production':
        require(str(descriptor_custody.root) == '/opt/apps/skia/prod/runtime', 'DESCRIPTOR_PATH')
        require((descriptor_custody.uid, descriptor_custody.gid) == (1001, 1001), 'DESCRIPTOR_OWNER')
        require(custody.uid == custody.gid == journal_custody.uid == journal_custody.gid == 0,
                'EVIDENCE_OWNER')
    custody.name('descriptor.lock')
    lock = os.open('descriptor.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600, dir_fd=custody.fd)
    try:
        custody.identity(os.fstat(lock))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        auth = preconditions(custody, expected, db, docker, topology, adapter, journal_custody)
        previous, previous_record = descriptor_custody.read('RELEASE.env')
        require(auth.get('previous_descriptor_sha256') == digest(previous), 'DESCRIPTOR_PREIMAGE')
        keys=[line.partition('=')[0] for line in previous.decode().splitlines()
              if line and not line.startswith('#')]
        require(sorted(keys) == ['API_SOURCE_SHA', 'WEB_SOURCE_SHA'], 'UNEXPECTED_DESCRIPTOR_FIELDS')
        raw = ('API_SOURCE_SHA=' + reopen.SOURCE + '\nWEB_SOURCE_SHA=' + reopen.SOURCE + '\n').encode()
        require(previous != raw, 'ALREADY_UPDATED_REENTRY_REQUIRES_REVIEW')
        execution.consume('descriptor.authorization', 'RELEASE_DESCRIPTOR_UPDATE', u.identity(db))
        custody.create('descriptor.started', canonical({'window_id': expected['window_id'],
                       'canonical_main_sha': expected['canonical_main_sha'], 'before': previous_record}))
        temporary = 'RELEASE.env.' + expected['window_id'] + '.pending'
        pending_record = descriptor_custody.create(temporary, raw)
        # Repeat all independent gates immediately before atomic replace.
        preconditions(custody, expected, db, docker, topology, adapter, journal_custody)
        descriptor_custody.read('RELEASE.env', previous_record)
        descriptor_custody.read(temporary, pending_record)
        os.replace(temporary, 'RELEASE.env', src_dir_fd=descriptor_custody.fd, dst_dir_fd=descriptor_custody.fd)
        os.fsync(descriptor_custody.fd)
        actual, record = descriptor_custody.read('RELEASE.env')
        require(actual == raw and reopen.descriptor(actual) == digest(raw), 'DESCRIPTOR_POSTWRITE')
        custody.create('descriptor.verified', canonical({**expected, 'sha256': record['sha256'],
                       'verified_at': int(time.time())}))
        return record
    finally:
        os.close(lock)


class VerifiedReopenGate:
    """New governed workflow adds completion receipt to the existing live gate."""
    def __init__(self, custody, descriptor_custody, gate):
        self.custody, self.descriptor_custody, self.gate = custody, descriptor_custody, gate

    def __call__(self, window, bundle_hash):
        execution = ExecutionAuthority(self.custody)
        raw, record = self.custody.read('descriptor.verified')
        receipt = strict_json(raw)
        binding(receipt, execution.expected)
        require(window == receipt['window_id'], 'REOPEN_WINDOW')
        descriptor, _ = self.descriptor_custody.read('RELEASE.env')
        require(receipt['sha256'] == digest(descriptor), 'VERIFIED_DESCRIPTOR_DRIFT')
        result = self.gate(window, bundle_hash)
        self.custody.read('descriptor.verified', record)
        return result
