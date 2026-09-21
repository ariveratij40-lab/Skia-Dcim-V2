"""Opt-in disposable TEST instrumentation. Never imported by the upgrade runner.

Persist only projected metadata and fail-closed redacted streams. SQL, argv,
environment values, dump contents and structural payloads are never persisted.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import types
from unittest.mock import patch

import b3b_release as b
import upgrade_036_039 as u


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def redact(value):
    """Unknown lines are entirely suppressed, including unlabeled secrets.

    Keep only exact operational diagnostics; no free-form PostgreSQL DETAIL,
    SQL statement, Docker attributes, URL, token, environment or error text.
    """
    text = value.decode(errors='replace') if isinstance(value, bytes) else str(value)
    safe = ('ERROR:  division by zero', 'ERROR:  canceling statement due to statement timeout',
            'FATAL:  terminating connection due to administrator command')
    return '\n'.join(line if line in safe else '[REDACTED]' for line in text.splitlines())


def classification(data):
    text = data.decode(errors='replace') if isinstance(data, bytes) else str(data)
    for needle, label in (
        ('division by zero', 'INJECTED_DIVISION_BY_ZERO'),
        ('statement timeout', 'POSTGRES_STATEMENT_TIMEOUT'),
        ('No such container', 'CONTAINER_NOT_FOUND'),
        ('Cannot connect to the Docker daemon', 'DOCKER_DAEMON_UNAVAILABLE'),
        ('out of memory', 'RESOURCE_EXHAUSTION'),
        ('context deadline exceeded', 'DOCKER_DEADLINE'),
        ('permission denied', 'PERMISSION_DENIED'),
        ('connection refused', 'CONNECTION_REFUSED')):
        if needle.lower() in text.lower():
            return label
    return 'UNCLASSIFIED' if text else 'EMPTY'


class Diagnostics:
    def __init__(self, container, directory):
        if not re.fullmatch(r'skia-upgrade-matrix-[a-zA-Z0-9-]+', container):
            raise ValueError('DISPOSABLE_CONTAINER_REQUIRED')
        self.container = container
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.started = stamp()
        self.stage = 'FIXTURE_SETUP'
        self.database = 'skia_prod'
        self.failures = []
        self.sessions = []
        self.processes = []
        self.lock = threading.Lock()
        self.last_migrations = {}

    def write(self, name, value):
        # Exclusive creation: never replace historical evidence.
        with (self.directory/name).open('x') as out:
            json.dump(value, out, sort_keys=True, indent=2)
            out.write('\n')

    def record(self, category, rc, stdout, stderr):
        item = {'timestamp': stamp(), 'stage': self.stage,
                'category': category, 'exit_code': rc,
                'stdout': redact(stdout), 'stderr': redact(stderr),
                'stderr_classification': classification(stderr),
                'stdout_bytes': len(stdout), 'stderr_bytes': len(stderr)}
        with self.lock:
            self.failures.append(item)

    def run(self, args, data=None):
        self.track_target(args)
        result = subprocess.run(args, input=data, capture_output=True)
        if result.returncode:
            self.record('SUBPROCESS', result.returncode, result.stdout, result.stderr)
        b.require(result.returncode == 0, 'SUBPROCESS_FAILED:'+Path(args[0]).name)
        return result.stdout

    def track_target(self, args):
        if len(args) > 3 and args[:3] == ['docker', 'exec', '-i'] and args[3] == self.container and '-d' in args:
            name = args[args.index('-d')+1]
            if re.fullmatch(r'[a-z][a-z0-9_]{0,62}', name):
                self.database = name

    def popen(self, args, **kwargs):
        # Session stdout/SQL/locking/timeouts remain unchanged. Drain stderr to
        # redacted memory rather than DEVNULL; never write raw SQL to disk.
        self.track_target(args)
        capture = kwargs.get('stderr') == subprocess.DEVNULL
        if capture:
            kwargs['stderr'] = subprocess.PIPE
        process = subprocess.Popen(args, **kwargs)
        self.processes.append(process)
        if capture:
            def drain():
                for line in iter(process.stderr.readline, b''):
                    with self.lock:
                        self.sessions.append({'timestamp': stamp(), 'stage': self.stage,
                                              'stderr': redact(line),
                                              'classification': classification(line)})
            thread = threading.Thread(target=drain, daemon=True)
            thread.start()
            self.readers.append(thread)
        return process

    def __enter__(self):
        self.readers = []
        # Replace only the module references within this TEST process.
        proxy = types.SimpleNamespace(**{k: getattr(subprocess, k) for k in dir(subprocess)})
        proxy.Popen = self.popen
        original_apply, original_structure = u.apply_one, b.structure
        original_execute = u.Session.execute

        def apply(session, entry):
            self.stage = 'APPLY_MIGRATION'
            result = original_apply(session, entry)
            self.last_migrations[self.database] = Path(entry['path']).name[:3]
            return result

        def structure(db):
            self.database = db.database if hasattr(db, 'database') else self.database
            self.stage = 'STRUCTURE_VERIFICATION_AFTER_'+self.last_migrations.get(self.database, 'NONE_IN_THIS_PROCESS')
            return original_structure(db)

        def execute(session, sql):
            try:
                return original_execute(session, sql)
            except BaseException:
                self.record('SESSION', session.process.poll(), session.pending, b'')
                raise

        self.patches = [patch.object(b, 'run', self.run), patch.object(u, 'subprocess', proxy),
                        patch.object(u, 'apply_one', apply), patch.object(b, 'structure', structure),
                        patch.object(u.Session, 'execute', execute)]
        for p in self.patches:
            p.start()
        return self

    def __exit__(self, *_):
        for p in reversed(self.patches):
            p.stop()
        for thread in self.readers:
            thread.join(timeout=5)

    def probe(self, args):
        try:
            return subprocess.run(args, capture_output=True, timeout=90)
        except (OSError, subprocess.TimeoutExpired) as error:
            return subprocess.CompletedProcess(args, -1, b'', type(error).__name__.encode())

    def snapshot(self, label):
        """Best-effort independent read-only probes, even after runner failure."""
        report = {'format': 'UPGRADE_HARNESS_DIAGNOSTICS_V1', 'timestamp': stamp(),
                  'started': self.started, 'stage': self.stage, 'container': self.container,
                  'database': self.database, 'environment_names': sorted(os.environ),
                  'failures': list(self.failures), 'session_stderr': list(self.sessions),
                  'session_exit_codes': [p.poll() for p in self.processes]}
        inspect = self.probe(['docker', 'inspect', self.container])
        report['inspect_exit_code'] = inspect.returncode
        report['container_state'] = 'UNAVAILABLE'
        if inspect.returncode == 0:
            try:
                obj = json.loads(inspect.stdout)[0]
                state = obj['State']
                report['container_state'] = {k: state[k] for k in
                    ('Status', 'Running', 'OOMKilled', 'ExitCode', 'StartedAt', 'FinishedAt')}
                report['container_id'] = obj['Id']
                report['image_id'] = obj['Image']
            except (ValueError, KeyError, IndexError, TypeError):
                report['inspect_parse'] = 'UNAVAILABLE'
        for name, args in (
            ('logs', ['docker', 'logs', '--since', self.started, self.container]),
            ('events', ['docker', 'events', '--since', self.started, '--until', stamp(),
                        '--filter', 'container='+self.container,
                        '--format', '{{.TimeNano}}|{{.Action}}|{{.Actor.ID}}']),
            ('daemon', ['docker', 'info', '--format', '{{.ServerVersion}}'])):
            result = self.probe(args)
            report[name] = {'exit_code': result.returncode,
                            'stdout': redact(result.stdout), 'stderr': redact(result.stderr),
                            'classification': classification(result.stdout+result.stderr)}
            if name == 'events':
                report[name]['safe_events'] = [line for line in result.stdout.decode(errors='replace').splitlines()
                    if re.fullmatch(r'[0-9]+\|(create|start|die|destroy|oom|exec_die|health_status: (healthy|unhealthy))\|[a-f0-9]{64}', line)]
            if name == 'logs':
                report[name]['classified_lines'] = [classification(line) for line in
                    (result.stdout+result.stderr).splitlines() if classification(line) not in ('EMPTY', 'UNCLASSIFIED')]
        # Never read business rows, tokens or credentials.
        db = b.DB(self.container, self.database, 'skia_bootstrap')
        probes = {
            'ledger': lambda: db.query("SELECT count(*) FROM production_bootstrap_migrations")[0],
            'migration_counts': lambda: db.query("SELECT jsonb_object_agg(id,n) FROM (SELECT "
                "substring(path from 'migrations/([0-9]+)') id,count(*) n FROM "
                "production_bootstrap_migrations WHERE path ~ '^migrations/0(3[6-9]|40)_' GROUP BY path) s")[0],
            'raw_fingerprint': db.fingerprint,
            'catalog_count': lambda: db.query('SELECT count(*) FROM system_naming_presets')[0],
            'structure': lambda: b.structure(db)['hash'],
        }
        # DB diagnostic commands get finite capture time, without changing the
        # bounded runner's own command/SQL deadlines.
        def diagnostic_run(args, data=None):
            result = subprocess.run(args, input=data, capture_output=True, timeout=90)
            b.require(result.returncode == 0, 'DIAGNOSTIC_QUERY_FAILED')
            return result.stdout
        with patch.object(b, 'run', diagnostic_run):
            for key, call in probes.items():
                try:
                    report[key] = {'status': 'PASS', 'value': call()}
                except Exception as error:
                    report[key] = {'status': 'UNAVAILABLE', 'error_type': type(error).__name__}
        self.write(label+'.json', report)
        return report


if __name__ == '__main__':
    if sys.argv[1:] == ['--redact-stream']:
        for line in sys.stdin:
            print(redact(line), flush=True)
        raise SystemExit(0)
    parser = argparse.ArgumentParser()
    parser.add_argument('--container', required=True)
    parser.add_argument('--directory', required=True)
    parser.add_argument('--exit-code', type=int, required=True)
    args = parser.parse_args()
    diag = Diagnostics(args.container, args.directory)
    diag.stage = 'SHELL_SETUP_OR_TEST_EXIT'
    diag.record('SHELL', args.exit_code, b'', b'')
    diag.snapshot('shell-exit')
