"""Local-only custody unit tests; not a substitute for recovery rehearsal."""
import os
from pathlib import Path
import tempfile
import unittest
import time
import copy
import shutil
import json
from unittest.mock import patch, Mock

from operational_custody import Custody, binding, ExecutionAuthority, CANONICAL_MAIN, canonical
import operational_checkpoint as checkpoint


class CustodyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='skia-custody-test-')
        self.root = Path(self.temp.name).resolve()
        self.root.chmod(0o700)
        self.custody = Custody(self.root, os.getuid(), os.getgid())

    def tearDown(self):
        self.custody.close()
        self.temp.cleanup()

    def test_exclusive_roundtrip(self):
        record = self.custody.create('dump', b'synthetic fixture')
        self.assertEqual(self.custody.read('dump', record)[0], b'synthetic fixture')
        with self.assertRaises(FileExistsError):
            self.custody.create('dump', b'replacement')

    def test_replacement_and_hash_drift(self):
        record = self.custody.create('dump', b'original')
        alternate = self.custody.create('alternate', b'original')
        self.assertNotEqual(record['identity'], alternate['identity'])
        os.replace(self.root/'alternate', self.root/'dump')
        with self.assertRaises(ValueError):
            self.custody.read('dump', record)
        current = self.custody.read('dump')[1]
        current['sha256'] = '0' * 64
        with self.assertRaises(ValueError):
            self.custody.read('dump', current)

    def test_mode_owner_and_symlinks(self):
        self.custody.create('dump', b'fixture')
        (self.root/'dump').chmod(0o644)
        with self.assertRaises(ValueError):
            self.custody.read('dump')
        (self.root/'dump').chmod(0o600)
        self.custody.uid += 1
        with self.assertRaises(ValueError):
            self.custody.identity((self.root/'dump').stat())
        self.custody.uid -= 1
        for name in ('checkpoint.dump', 'checkpoint.json'):
            (self.root/name).symlink_to(self.root/'dump')
            with self.assertRaises(OSError):
                self.custody.read(name)

    def test_root_mode_drift(self):
        self.root.chmod(0o755)
        with self.assertRaises(ValueError):
            self.custody.create('dump', b'fixture')
        self.root.chmod(0o700)

    def test_explicit_binding(self):
        expected = dict(window_id='fixture', environment='disposable',
                        database='skia_prod', canonical_main_sha='a' * 40)
        binding(expected, expected)
        for key in expected:
            with self.subTest(key=key):
                missing = dict(expected)
                missing.pop(key)
                with self.assertRaises(ValueError):
                    binding(missing, expected)
                with self.assertRaises(ValueError):
                    binding({**expected, key: 'wrong'}, expected)
        for sha in ('', 'z' * 40, 'a' * 39):
            malformed = {**expected, 'canonical_main_sha': sha}
            with self.assertRaises(ValueError):
                binding(malformed, malformed)

    def authority(self):
        now=int(time.time())
        value=dict(purpose='LOCKSTEP_WINDOW',authorized=True,window_id='fixture',
            environment='disposable',database='skia_prod',canonical_main_sha=CANONICAL_MAIN,
            operator='fixture',issued_at=now,expires_at=now+900,nonce='a'*32,
            database_identity=dict(database='skia_prod',cluster='fixture',oid=1,version='16.14'))
        record=self.custody.create('window.json',canonical(value))
        grant={**value,'purpose':'LOCKSTEP_CHECKPOINT','nonce':'b'*32,
               'window_sha256':record['sha256']}
        self.custody.create('checkpoint.authorization',canonical(grant))
        return value,grant

    def replace_fixture(self,name,value):
        # Deliberate attacks in the private unit fixture only.
        (self.root/name).unlink()
        self.custody.create(name,canonical(value))

    def test_authority_missing_and_reentry(self):
        with self.assertRaises(FileNotFoundError):ExecutionAuthority(self.custody)
        window,grant=self.authority();execution=ExecutionAuthority(self.custody)
        execution.consume('checkpoint.authorization','LOCKSTEP_CHECKPOINT',window['database_identity'])
        with self.assertRaises(FileExistsError):
            execution.consume('checkpoint.authorization','LOCKSTEP_CHECKPOINT',window['database_identity'])

    def test_authority_negative_matrix(self):
        window,grant=self.authority();execution=ExecutionAuthority(self.custody)
        cases=dict(purpose='OTHER',window_id='other',canonical_main_sha='b'*40,
            database='other',environment='production',window_sha256='0'*64,
            operator='other',expires_at=0,issued_at=int(time.time())+60,nonce='',
            database_identity={'database':'skia_prod','cluster':'different'})
        for field,bad in cases.items():
            with self.subTest(field=field):
                self.replace_fixture('checkpoint.authorization',{**grant,field:bad})
                with self.assertRaises(ValueError):
                    execution.load('checkpoint.authorization','LOCKSTEP_CHECKPOINT',window['database_identity'])
        self.replace_fixture('checkpoint.authorization',grant)
        (self.root/'checkpoint.authorization').chmod(0o644)
        with self.assertRaises(ValueError):
            execution.load('checkpoint.authorization','LOCKSTEP_CHECKPOINT',window['database_identity'])

    def test_window_replacement(self):
        window,_=self.authority();execution=ExecutionAuthority(self.custody)
        self.replace_fixture('window.json',window)
        with self.assertRaises(ValueError):
            execution.load('checkpoint.authorization','LOCKSTEP_CHECKPOINT',window['database_identity'])

    def test_checkpoint_evidence_matrix(self):
        window,grant=self.authority()
        expected=ExecutionAuthority(self.custody).expected
        record=self.custody.create('checkpoint.dump',b'synthetic dump')
        contract={'prefixes':{'27':{'raw':'raw','structure':'struct'}},'migrations':[]}
        evidence={**expected,'created_at':int(time.time()),'identity':window['database_identity'],
            'source_ledger_count':27,'source_catalog_count':0,'source_raw':'raw',
            'source_structural':'struct','source_snapshot':{'raw':'raw','structure':{'hash':'struct'},
                'catalog':[],'baseline':[],'ledger':[]},'baseline':[],
            'dump_custody':record,'sha256':record['sha256']}
        with patch.object(checkpoint.u,'contract',return_value=contract):
            checkpoint.validate(evidence,grant,expected,self.custody)
            for field,bad in dict(window_id='other',canonical_main_sha='b'*40,database='other',
                    source_ledger_count=28,source_catalog_count=1,source_raw='wrong',
                    source_structural='wrong',sha256='0'*64,baseline=['different']).items():
                with self.subTest(field=field):
                    with self.assertRaises(ValueError):
                        checkpoint.validate({**evidence,field:bad},grant,expected,self.custody)
            os.replace(self.root/'checkpoint.dump',self.root/'old.dump')
            self.custody.create('checkpoint.dump',b'synthetic dump')
            with self.assertRaises(ValueError):
                checkpoint.validate(evidence,grant,expected,self.custody)

    def test_checkpoint_consumption_toctou(self):
        window,grant=self.authority()
        expected=ExecutionAuthority(self.custody).expected
        record=self.custody.create('checkpoint.dump',b'synthetic dump')
        contract={'prefixes':{'27':{'raw':'raw','structure':'struct'}},'migrations':[]}
        evidence={**expected,'created_at':int(time.time()),'identity':window['database_identity'],
            'source_ledger_count':27,'source_catalog_count':0,'source_raw':'raw',
            'source_structural':'struct','source_snapshot':{'raw':'raw','structure':{'hash':'struct'},
                'catalog':[],'baseline':[],'ledger':[]},'baseline':[],
            'dump_custody':record,'sha256':record['sha256']}
        db=Mock(database='skia_prod')
        def replacement(*args):
            self.custody.create('replacement',b'synthetic dump')
            os.replace(self.root/'replacement',self.root/'checkpoint.dump')
            return Mock(),{}
        with patch.object(checkpoint.u,'contract',return_value=contract), \
             patch.object(checkpoint.recovery,'prepare',side_effect=replacement), \
             patch.object(checkpoint.subprocess,'run') as restore:
            with self.assertRaises(ValueError):
                checkpoint.restore(db,evidence,grant,expected,self.custody,'disposable')
            restore.assert_not_called()

    def test_checkpoint_failure_reserves_authority(self):
        window,grant=self.authority()
        db=Mock(database='skia_prod',user='skia_bootstrap',container='skia-activation-test-unit')
        with patch.object(checkpoint.u,'identity',return_value=window['database_identity']), \
             patch.object(checkpoint.u,'Session',side_effect=RuntimeError('injected-before-dump')):
            with self.assertRaises(RuntimeError):
                checkpoint.create(db,{},self.custody,('restore_a','restore_b'))
            with self.assertRaises(FileExistsError):
                checkpoint.create(db,{},self.custody,('restore_a','restore_b'))
        self.assertFalse((self.root/'checkpoint.json').exists())
        self.assertFalse((self.root/'checkpoint.dump').exists())
        self.assertTrue((self.root/'checkpoint.started').exists())

    def test_partial_write_and_readback_fail_closed(self):
        with patch('operational_custody.os.write',return_value=0):
            with self.assertRaises(ValueError):self.custody.create('partial',b'fixture')
        with self.assertRaises(FileExistsError):self.custody.create('partial',b'fixture')
        with patch.object(self.custody,'read',return_value=(b'wrong',{})):
            with self.assertRaises(ValueError):self.custody.create('readback',b'fixture')

    def test_hardlink_duplicate_json_and_parent_replacement(self):
        from operational_custody import strict_json
        with self.assertRaises(ValueError):strict_json(b'{"purpose":"a","purpose":"b"}')
        self.custody.create('one',b'fixture');os.link(self.root/'one',self.root/'two')
        with self.assertRaises(ValueError):self.custody.read('one')
        original=self.custody.root_identity;self.custody.root_identity=(0,0)
        with self.assertRaises(ValueError):self.custody.read('one')
        self.custody.root_identity=original

    def test_checkpoint_dump_and_restore_failure_matrix(self):
        window,_=self.authority()
        db=Mock(database='skia_prod',user='skia_bootstrap',container='skia-activation-test-unit')
        session=Mock();session.execute.return_value='t'
        observed=dict(identity=window['database_identity'],ledger_count=27,raw='raw',baseline=[])
        before=dict(catalog=[],structure={'hash':'struct'},baseline=[],ledger=[],raw='raw')
        with patch.object(checkpoint.u,'identity',return_value=window['database_identity']), \
             patch.object(checkpoint.u,'Session') as context, \
             patch.object(checkpoint.u,'observe',return_value=observed), \
             patch.object(checkpoint.u,'quiescence'), \
             patch.object(checkpoint.u,'recovery_snapshot',return_value=before), \
             patch.object(checkpoint,'validate'), \
             patch.object(checkpoint,'restore',side_effect=ValueError('INJECTED_RESTORE_FAILURE')):
            context.return_value.__enter__.return_value=session
            db.command.return_value=b'synthetic fixture dump'
            with self.assertRaises(ValueError):checkpoint.create(db,{},self.custody,('restore_a','restore_b'))
            self.assertTrue((self.root/'checkpoint.dump').exists())
            self.assertFalse((self.root/'checkpoint.json').exists())
            with self.assertRaises(FileExistsError):checkpoint.create(db,{},self.custody,('restore_a','restore_b'))


def recovery_matrix(db, source):
    """Real recovery entry, private cloned evidence, no restore may begin."""
    before=db.query('SELECT json_agg(datname ORDER BY datname) FROM pg_database')
    cases=('window','sha','database','hash','dump','evidence_mode','dump_mode','symlink','baseline')
    for case in cases:
        with tempfile.TemporaryDirectory(prefix='skia-recovery-negative-') as tmp:
            root=Path(tmp).resolve()
            for file in Path(source).iterdir():
                if file.is_file():shutil.copy2(file,root/file.name)
            c=Custody(root,os.getuid(),os.getgid())
            try:
                raw,record=c.read('checkpoint.dump')
                evidence=json.loads((root/'checkpoint.json').read_bytes())
                # Cloning intentionally creates a new inode: rebind the valid
                # control before injecting one independent negative condition.
                evidence['dump_custody']=record
                if case=='window':evidence['window_id']='other'
                elif case=='sha':evidence['canonical_main_sha']='b'*40
                elif case=='database':evidence['database']='other'
                elif case=='hash':evidence['sha256']='0'*64
                elif case=='baseline':evidence['baseline']=['different']
                (root/'checkpoint.json').unlink()
                c.create('checkpoint.json',canonical(evidence))
                if case=='dump':
                    (root/'checkpoint.dump').unlink();c.create('checkpoint.dump',b'modified')
                elif case=='evidence_mode':(root/'checkpoint.json').chmod(0o644)
                elif case=='dump_mode':(root/'checkpoint.dump').chmod(0o644)
                elif case=='symlink':
                    (root/'checkpoint.json').rename(root/'original.json')
                    (root/'checkpoint.json').symlink_to(root/'original.json')
                try:checkpoint.restore_evidence(db,c,'must_not_be_created')
                except (ValueError,OSError):pass
                else:raise AssertionError('RECOVERY_NEGATIVE_ACCEPTED_'+case)
                assert db.query('SELECT json_agg(datname ORDER BY datname) FROM pg_database')==before
            finally:c.close()
        print('RECOVERY_NEGATIVE_'+case.upper()+'=PASS',flush=True)


if __name__ == '__main__':
    unittest.main()
