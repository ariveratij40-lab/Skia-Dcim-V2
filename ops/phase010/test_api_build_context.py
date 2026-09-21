#!/usr/bin/env python3
"""Local-only golden, negative and redaction gates; no Docker/network/DB."""
import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

import derive_api_build_context as d

REPO = Path(__file__).resolve().parents[2]


def extract_fixture(archive, destination):
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        members = tar.getmembers()
        for member in members:
            d.safe_path(member.name.rstrip('/'))
            d.require(member.isfile() or member.isdir(), 'UNSAFE_FIXTURE_ENTRY')
        for member in members:
            path = destination / member.name
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open('xb') as out:
                    out.write(tar.extractfile(member).read())
                path.chmod(member.mode)


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='skia-context-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        archive = subprocess.check_output(['git', '-C', str(REPO), 'archive', d.SOURCE_SHA])
        extract_fixture(archive, self.source)
        self.output = self.root / 'context'

    def derive(self, **kwargs):
        return d.derive(REPO, self.source, self.output, **kwargs)

    def reject(self, **kwargs):
        with self.assertRaises(d.GateError):
            self.derive(**kwargs)
        self.assertFalse(self.output.exists())

    def bad_policy(self, mutate):
        policy = copy.deepcopy(d.load_policy(d.DEFAULT_POLICY))
        mutate(policy)
        path = self.root / 'bad-policy.json'
        path.write_bytes(d.encoded(policy))
        self.reject(policy_path=path)

    def test_golden_and_independent_archive_location(self):
        first = self.derive()
        with tempfile.TemporaryDirectory(prefix='skia-context-location-b-') as second:
            other = Path(second) / 'source'
            other.mkdir()
            archive = subprocess.check_output(['git', '-C', str(REPO), 'archive', d.SOURCE_SHA])
            extract_fixture(archive, other)
            output = Path(second) / 'context'
            result = d.derive(REPO, other, output)
            self.assertEqual(first, result)
            records = []
            for item in d.load_policy(d.DEFAULT_POLICY)['included']:
                p = output / item['target']
                record = dict(item, sha256=d.digest(p.read_bytes()),
                              mode=format(0o100000 | (p.stat().st_mode & 0o777), 'o'))
                records.append(record)
                self.assertEqual(p.read_bytes(), (self.output / p.name).read_bytes())
            self.assertEqual(d.digest(d.encoded(records)), d.CONTEXT_HASH)
            self.assertEqual(len(list(output.iterdir())), 58)
            self.assertEqual(d.digest((output / 'Dockerfile').read_bytes()), d.DOCKERFILE_HASH)
            self.assertFalse(any(p.suffix in ('.sql', '.bak') or p.name in
                                 ('skia-backend', 'skia_backend', '.env') for p in output.iterdir()))
        print('RUN1_HASH=' + first['context_hash'])
        print('RUN2_HASH=' + result['context_hash'])
        print('LOCATION_INDEPENDENT=PASS')

    def test_missing_required(self):
        (self.source / 'backend/main.go').unlink()
        self.reject()

    def test_unexpected_source(self):
        (self.source / 'backend/unexpected.go').write_text('package main\n')
        self.reject()

    def test_modified_required(self):
        with (self.source / 'backend/main.go').open('ab') as f:
            f.write(b'\n// changed\n')
        self.reject()

    def test_mode_change(self):
        (self.source / 'backend/main.go').chmod(0o755)
        self.reject()

    def test_symlink_escape(self):
        p = self.source / 'backend/main.go'
        p.unlink()
        p.symlink_to('/etc/passwd')
        self.reject()

    def test_policy_path_traversal(self):
        self.bad_policy(lambda p: p['included'][0].update(target='../escape'))

    def test_policy_absolute_path(self):
        self.bad_policy(lambda p: p['included'][0].update(source='/tmp/escape'))

    def test_policy_duplicate_path(self):
        self.bad_policy(lambda p: p['included'].append(p['included'][0]))

    def test_policy_unknown_field(self):
        self.bad_policy(lambda p: p.update(unknown=True))

    def test_wrong_runtime_sha(self):
        self.reject(source_sha='b48a79c780a0ad2444b81ee6f4e12260ca2b4a4d')

    def test_wrong_policy_sha(self):
        self.bad_policy(lambda p: p.update(source_sha='0' * 40))

    def test_excluded_artifact_inclusion(self):
        for path in ('backend/skia-backend', 'backend/skia_backend',
                     'backups/skia_db_pre_migration_009_20260724_184642.sql',
                     'backups/import-integration-20260724-073359/main.go',
                     'backups/routes-integration-20260724-103440/main.go'):
            with self.subTest(path=path):
                def mutate(p):
                    p['excluded'] = [x for x in p['excluded'] if x['path'] != path]
                    p['included'].append(dict(source=path, target='forbidden', mode='100644',
                                              sha256='0' * 64, classification='BUILD_REQUIRED'))
                self.bad_policy(mutate)

    def test_unexpected_policy_inclusion(self):
        self.bad_policy(lambda p: p['included'].append(dict(source='new.go', target='new.go',
                        mode='100644', sha256='0' * 64, classification='SOURCE_REQUIRED')))

    def test_no_overlay(self):
        self.output.mkdir()
        marker = self.output / 'preserve'
        marker.write_text('keep')
        with self.assertRaises(d.GateError):
            self.derive()
        self.assertEqual(marker.read_text(), 'keep')

    def test_secret_redaction(self):
        sentinel = b'postgres://sentinel_user:NOT_A_REAL_SECRET@invalid/db'
        with self.assertRaises(d.GateError) as error:
            d.secret_hygiene(sentinel)
        self.assertNotIn('NOT_A_REAL_SECRET', str(error.exception))
        (self.source / 'backend/main.go').write_bytes(sentinel)
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = d.main(['--repo', str(REPO), '--source-dir', str(self.source),
                         '--output', str(self.output), '--source-sha', d.SOURCE_SHA])
        self.assertEqual(rc, 1)
        self.assertNotIn('NOT_A_REAL_SECRET', out.getvalue() + err.getvalue())
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
