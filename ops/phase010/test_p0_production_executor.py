"""No production connections. Unit contract and disposable-only adapter."""
import json
import os
from pathlib import Path
import secrets
import tempfile
import time
import unittest
from unittest import mock

import b3b_release as b
import execute_p0_production_repair as p
import p0_security_repair as r


def authorization():
    now = int(time.time())
    return {'purpose': 'P0_SECURITY_REPAIR', 'environment': 'production',
            'database': 'skia_prod', 'canonical_sha': p.BASE,
            'tooling_sha256': p.tooling_hash(), 'manifest_sha256': p.manifest_hash(),
            'source_structure': r.DRIFT, 'target_structure': r.CANONICAL,
            'raw_fingerprint': r.RAW, 'affected_routine_count': 8,
            'source_ledger': 27, 'catalog_count': 0, 'operator': 'alvaro',
            'issued_at': now, 'expires_at': now+900, 'id': secrets.token_hex(16)}


class SyntheticAuthority:
    uid = os.getuid()

    def provenance(self, sha):
        b.require(sha == p.BASE, 'CANONICAL_SHA')

    def operator(self, name):
        b.require(name == 'alvaro', 'OPERATOR_IDENTITY')


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.a = authorization()
        self.authority = SyntheticAuthority()

    def test_authorization_negative_matrix(self):
        mutations = {k: 'incorrect' for k in self.a if k not in
                     ('issued_at', 'expires_at', 'id')}
        mutations.update(issued_at=int(time.time())+100, expires_at=0, id='../unsafe')
        for key, value in mutations.items():
            with self.subTest(field=key):
                candidate = dict(self.a, **{key: value})
                with self.assertRaises(ValueError):
                    p.validate_authorization(candidate, self.authority)
        p.validate_authorization(self.a, self.authority)
        for candidate in (dict(self.a, unexpected=True),
                          dict(self.a, expires_at=self.a['issued_at']+901),
                          dict(self.a, issued_at=self.a['issued_at']-1000,
                               expires_at=self.a['issued_at']-100),
                          dict(self.a, issued_at=True),
                          dict(self.a, affected_routine_count=True)):
            with self.assertRaises(ValueError):
                p.validate_authorization(candidate, self.authority)

    def test_file_security_exclusive_claim_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            file = root/'auth'
            p.exclusive_json(file, self.a)
            self.assertEqual(p.strict_json(p.protected(file, os.getuid())), self.a)
            with self.assertRaises(FileExistsError):
                p.exclusive_json(file, self.a)
            link = root/'link'; link.symlink_to(file)
            with self.assertRaises(ValueError):
                p.protected(link, os.getuid())
            file.chmod(0o644)
            with self.assertRaises(ValueError):
                p.protected(file, os.getuid())
            if os.getuid() != 0:
                with self.assertRaises(ValueError):
                    p.protected(file, 0)
            file.chmod(0o600)
            os.link(file, root/'hardlink')
            with self.assertRaises(ValueError):
                p.protected(file, os.getuid())

    def test_duplicate_fields(self):
        with self.assertRaises(ValueError):
            p.strict_json('{"id":1,"id":2}')

    def test_disposable_guard_preserved(self):
        class Production:
            container = 'skia_postgres_prod'; database = 'skia_prod'; user = 'skia_bootstrap'
        with self.assertRaisesRegex(ValueError, 'DISPOSABLE_TARGET_ONLY'):
            r.repair(Production())

    def test_production_requires_root(self):
        with mock.patch.object(p.os, 'geteuid', return_value=501):
            with self.assertRaisesRegex(ValueError, 'ROOT_REQUIRED'):
                p.ProductionAuthority()

    def test_actual_production_identity_gate(self):
        authority = object.__new__(p.ProductionAuthority)
        authority.contract = json.loads((p.HERE/'p0_production_identity.json').read_text())
        authority.db = mock.Mock()
        c = authority.contract
        container = {'Name': '/'+c['container'], 'Id': c['container_id'], 'Image': c['image'],
                     'NetworkSettings': {'Networks': {n: {'NetworkID': v} for n,v in c['networks'].items()}},
                     'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
        def run(args):
            if args[1:3] == ['context', 'inspect']:
                return json.dumps([{'Endpoints': {'docker': {'Host': 'unix:///var/run/docker.sock'}}}]).encode()
            if args[1] == 'inspect': return json.dumps([container]).encode()
            return c['daemon'].encode()
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(b, 'run', side_effect=run), \
                mock.patch.object(p, 'database_identity', return_value=c['database_identity']), \
                mock.patch.object(Path, 'read_text', return_value=c['machine_id']):
            authority.check_identity()
            for key in ('Id', 'Name', 'Image'):
                original = container[key]; container[key] = 'wrong'
                with self.assertRaisesRegex(ValueError, 'TARGET_IDENTITY'):
                    authority.check_identity()
                container[key] = original
            with mock.patch.dict(os.environ, {'DOCKER_HOST': 'tcp://invalid'}):
                with self.assertRaisesRegex(ValueError, 'REMOTE_DOCKER_OVERRIDE'):
                    authority.check_identity()
            for key in c['database_identity']:
                bad = dict(c['database_identity'], **{key: 'wrong'})
                with mock.patch.object(p, 'database_identity', return_value=bad):
                    with self.assertRaisesRegex(ValueError, 'TARGET_IDENTITY'):
                        authority.check_identity()

    def test_rejected_artifact_never_opens_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.authority.store = Path(tmp).resolve()
            self.authority.check_identity = mock.Mock()
            for key in ('purpose', 'environment', 'database', 'canonical_sha',
                        'tooling_sha256', 'manifest_sha256', 'source_structure',
                        'target_structure', 'raw_fingerprint', 'source_ledger'):
                a = dict(self.a, **{key: 'wrong'}, id=secrets.token_hex(16))
                path = self.authority.store/(a['id']+'.json')
                p.exclusive_json(path, a)
                with self.assertRaises(ValueError):
                    p.execute(path, self.authority)
            self.authority.check_identity.assert_not_called()
            self.assertEqual(list(self.authority.store.glob('*.claimed')), [])

    def test_operator_binding_and_single_use_concurrent(self):
        from concurrent.futures import ThreadPoolExecutor
        authority = object.__new__(p.ProductionAuthority)
        with mock.patch.dict(os.environ, {'SUDO_USER': 'other'}):
            with self.assertRaisesRegex(ValueError, 'OPERATOR_IDENTITY'):
                authority.operator('alvaro')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve()/'one.claimed'
            def claim(_):
                try: p.exclusive_json(path, {'state': 'claimed'}); return True
                except FileExistsError: return False
            with ThreadPoolExecutor(max_workers=4) as pool:
                self.assertEqual(sum(pool.map(claim, range(8))), 1)

    def test_default_cli_nonmutating(self):
        with mock.patch('sys.argv', ['executor']), mock.patch.object(p, 'execute') as execute:
            p.main()
            execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
