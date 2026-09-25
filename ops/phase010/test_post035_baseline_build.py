"""Governance tests; exact historical Git source, no Docker/network/credentials."""
import copy
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import post035_baseline_build as b
from test_api_build_context import extract_fixture

REPO = Path(__file__).resolve().parents[2]


class BaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = b.git(REPO, 'archive', b.SOURCE)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='skia-post035-governance-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root/'source'
        self.source.mkdir()
        extract_fixture(self.archive, self.source)
        self.out = self.root/'sanitized'

    def derive(self, **kw):
        return b.derive(REPO, self.source, self.out, **kw)

    def reject(self, **kw):
        with self.assertRaises(b.Rejected):
            self.derive(**kw)
        self.assertFalse(self.out.exists())

    def test_two_independent_derivations(self):
        first = self.derive()
        second_source = self.root/'independent-source'
        second_source.mkdir()
        extract_fixture(b.git(REPO, 'archive', b.SOURCE), second_source)
        second = b.derive(REPO, second_source, self.root/'second')
        self.assertEqual(first, second)
        c1 = b.context(self.out, self.root/'context1')
        c2 = b.context(self.root/'second', self.root/'context2')
        self.assertEqual(c1, c2)
        print('SANITIZED_SOURCE_RUN1_HASH='+first+'; SANITIZED_SOURCE_RUN2_HASH='+second)
        print('BUILD_CONTEXT_RUN1_HASH='+c1+'; BUILD_CONTEXT_RUN2_HASH='+c2)

    def test_wrong_sha(self):
        self.reject(source_sha='0'*40)

    def test_wrong_tree(self):
        original = b.git
        def altered(repo, *args):
            if args[0] == 'rev-parse':
                return b'wrong\n'
            return original(repo, *args)
        with patch.object(b, 'git', altered):
            self.reject()

    def test_unknown_source_file(self):
        (self.source/'unknown').touch()
        self.reject()

    def test_unknown_empty_directory(self):
        (self.source/'unknown-directory').mkdir()
        self.reject()

    def test_symlink(self):
        path=self.source/'backend/main.go'
        path.unlink();path.symlink_to(self.source/'backend/go.mod')
        self.reject()

    def test_policy_tamper(self):
        path=self.root/'policy.json'
        path.write_bytes(b.POLICY.read_bytes()+b' ')
        self.reject(policy_path=path)

    def test_wrong_patch_hash(self):
        with patch.object(b.transform_module, '__file__', str(self.source/'backend/go.mod')):
            self.reject()

    def test_twice_or_cannot_apply(self):
        self.derive()
        path = self.out/'backend/database_roles.go'
        policy = b.load_policy()
        for data in (path.read_bytes(), b'package main\n'):
            with self.assertRaises(ValueError):
                b.transform_module.transform(data, policy['transform_input_sha256'])

    def test_source_change(self):
        (self.source/'backend/main.go').write_bytes(b'package main\n')
        self.reject()

    def test_sanitized_hash_and_dockerfile(self):
        self.derive()
        for name in ('main.go', 'Dockerfile'):
            path = self.out/'backend'/name
            original = path.read_bytes()
            path.write_bytes(original+b'\n')
            with self.assertRaises(b.Rejected):
                b.context(self.out, self.root/'context')
            path.write_bytes(original)

    def test_forbidden_inputs(self):
        self.derive()
        for name in ('skia-backend', 'skia-api', 'image.tar', '.env', 'backup.sql', 'session', 'oauth.secret', 'redis.secret', 'jwt.key'):
            path = self.out/'backend'/name
            path.write_bytes(b'FORBIDDEN_ARTIFACT')
            with self.assertRaises(b.Rejected):
                b.context(self.out, self.root/'context')
            path.unlink()

    def test_secret_patterns(self):
        for data in (b'postgres://user:synthetic@invalid/db', b'GOCSPX-synthetic',
                     b'-----BEGIN PRIVATE KEY-----', b'jwt_secret="synthetic-marker"',
                     b'client_secret="synthetic-marker"', b'redis://u:synthetic@invalid'):
            with self.assertRaises(b.Rejected) as error:
                b.hygiene(data)
            self.assertEqual(str(error.exception), 'SECRET_INPUT_REJECTED')

    def test_unknown_build_arg(self):
        self.derive()
        with self.assertRaises(b.Rejected):
            b.context(self.out, self.root/'context', {'UNKNOWN': 'x'})

    def test_context_drift(self):
        self.derive()
        output = self.root/'context'
        b.context(self.out, output)
        (output/'main.go').write_bytes(b'changed')
        with self.assertRaises(b.Rejected):
            b.verify_context(output)

    def test_semantic_boundary(self):
        self.derive()
        records, data = b.read_tree(self.out)
        changed = []
        for r in records:
            old = (self.source/r['path']).read_bytes()
            if old != data[r['path']]:
                changed.append(r['path'])
        self.assertEqual(changed, ['backend/database_roles.go'])
        before = (self.source/changed[0]).read_bytes()
        after = data[changed[0]]
        self.assertNotIn(b'localDevelopmentDSN', after)
        # Everything after configuration, including every SQL/RLS gate, identical.
        self.assertEqual(before.split(b'type runtimeRoleState', 1)[1],
                         after.split(b'type runtimeRoleState', 1)[1])
        for token in (b'read_active_system_naming_presets_v2', b'write_nomenclature_onboarding_audit'):
            self.assertFalse(any(token in content for content in data.values()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
