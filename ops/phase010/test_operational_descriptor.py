"""Deterministic local descriptor attacks; real Docker rehearsal is separate."""
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import operational_descriptor as d
from operational_custody import Custody, CANONICAL_MAIN, canonical, digest


class DescriptorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='skia-descriptor-tests-')
        root=Path(self.tmp.name).resolve()
        (root/'evidence').mkdir(mode=0o700);(root/'descriptor').mkdir(mode=0o700)
        self.c=Custody(root/'evidence',os.getuid(),os.getgid())
        self.dc=Custody(root/'descriptor',os.getuid(),os.getgid())
        now=int(time.time());self.ident={'database':'skia_prod','cluster':'fixture','oid':1,'version':'16.14'}
        self.window=dict(window_id='fixture',canonical_main_sha=CANONICAL_MAIN,
            environment='disposable',database='skia_prod',purpose='LOCKSTEP_WINDOW',
            authorized=True,operator='fixture',nonce='a'*32,issued_at=now,expires_at=now+900,
            database_identity=self.ident)
        self.put('window.json',self.window)
        self.topology={'environment':'disposable'}
        self.db=Mock();self.docker=Mock();self.docker.daemon.return_value='daemon'
        self.adapter=Mock();self.adapter.verify.return_value={'identity':{'daemon':'daemon'}}
        self.runtime={'window':'fixture','observed_at':now,'daemon_id':'daemon',
                      'api':{'id':'api','image':d.e.contract.IMAGE},'web':{'id':'web','image':d.e.WEB}}
        self.put('runtime.json',self.runtime)
        self.put('u0.json',{'window':'fixture','baseline':[]})
        self.evidence={'window':'fixture','environment':'disposable','database':'skia_prod',
            'daemon_id':'daemon','database_identity':self.ident,'observed_at':now,
            'ledger':[],'ledger_count':31,'catalog_count':0,'migration_040_count':0,
            'fingerprint':d.e.POST039,'security_pass':True,'tenant_preservation_pass':True,
            'writers_isolated':True,'admission_closed':True,'u0_sha256':self.hash('u0.json')}
        self.put('post039.json',self.evidence)
        self.activation={'window':'fixture','db_evidence_sha256':self.hash('post039.json'),
            'api_image':d.e.contract.IMAGE,'web_image':d.e.WEB,'activation_authorized':True}
        self.put('activation.authorization',self.activation)
        self.c.create('activation-fixture.jsonl',b'\n'.join(canonical(x) for x in
            [{'event':'GATE_PASS','data':'api'},{'event':'GATE_PASS','data':'web'},{'event':'COMPLETE'}]))
        self.c.create('session',b'synthetic');self.put('session-metadata.json',{})
        self.dc.create('RELEASE.env',b'API_SOURCE_SHA=old\nWEB_SOURCE_SHA=old\n')
        self.auth={**self.window,'purpose':'RELEASE_DESCRIPTOR_UPDATE','nonce':'b'*32,
            'window_sha256':self.hash('window.json'),'operation':'UPDATE_RELEASE_DESCRIPTOR',
            'post039_sha256':self.hash('post039.json'),
            'activation_sha256':self.hash('activation.authorization'),
            'activation_journal_sha256':self.hash('activation-fixture.jsonl'),
            'integrated_runtime_sha256':self.hash('runtime.json'),
            'api_container_id':'api','web_container_id':'web',
            'previous_descriptor_sha256':digest(self.dc.read('RELEASE.env')[0])}
        self.put('descriptor.authorization',self.auth)
        self.patches=[patch.object(d.u,'identity',return_value=self.ident),
            patch.object(d.u,'contract',return_value={'migrations':[]}),
            patch.object(d.u,'observe',return_value={'ledger_count':31,'raw':d.e.POST039,
                'identity':self.ident,'baseline':[]}),
            patch.object(d.e,'validate_authority'),patch.object(d.reopen,'runtime',return_value=self.runtime)]
        self.mocks=[p.start() for p in self.patches]

    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.c.close();self.dc.close();self.tmp.cleanup()

    def put(self,name,value):
        path=self.c.root/name
        if path.exists():path.unlink()
        self.c.create(name,canonical(value))

    def hash(self,name):return self.c.read(name)[1]['sha256']
    def update(self):return d.update(self.c,self.dc,self.c,self.db,self.docker,self.topology,self.adapter)

    def test_actual_atomic_write_and_reentry(self):
        old=self.dc.read('RELEASE.env')[1]
        result=self.update()
        self.assertNotEqual(old['identity'][1],result['identity'][1])
        d.reopen.descriptor(self.dc.read('RELEASE.env')[0])
        self.assertTrue((self.c.root/'descriptor.verified').exists())
        with self.assertRaises(ValueError):self.update()

    def test_authorization_matrix(self):
        for field,bad in dict(purpose='other',window_id='other',canonical_main_sha='b'*40,
                database='other',expires_at=0,nonce='',post039_sha256='0'*64,
                integrated_runtime_sha256='0'*64,api_container_id='other',web_container_id='other').items():
            with self.subTest(field=field):
                self.put('descriptor.authorization',{**self.auth,field:bad})
                with self.assertRaises(ValueError):self.update()
        (self.c.root/'descriptor.authorization').unlink()
        with self.assertRaises(FileNotFoundError):self.update()

    def test_consumed_authority(self):
        self.c.create('consumed-'+self.auth['nonce'],b'previous attempt')
        with self.assertRaises(FileExistsError):self.update()

    def test_missing_integrated_and_post039(self):
        for name in ('runtime.json','post039.json'):
            raw=self.c.read(name)[0];(self.c.root/name).unlink()
            with self.assertRaises(FileNotFoundError):self.update()
            self.c.create(name,raw)

    def test_runtime_admission_and_activation_failures(self):
        for label in ('API_IDENTITY','API_UNHEALTHY','WEB_IDENTITY','WEB_UNHEALTHY','INTEGRATED'):
            with self.subTest(label=label), patch.object(d.reopen,'runtime',side_effect=ValueError(label)):
                with self.assertRaises(ValueError):self.update()
        self.adapter.verify.side_effect=ValueError('ADMISSION_OPEN')
        with self.assertRaises(ValueError):self.update()
        self.adapter.verify.side_effect=None
        with patch.object(d.e,'validate_authority',side_effect=ValueError('ACTIVATION_NOT_AUTHORIZED')):
            with self.assertRaises(ValueError):self.update()

    def test_descriptor_filesystem_security(self):
        path=self.dc.root/'RELEASE.env';path.chmod(0o644)
        with self.assertRaises(ValueError):self.update()
        path.chmod(0o600);path.rename(self.dc.root/'original')
        path.symlink_to(self.dc.root/'original')
        with self.assertRaises(OSError):self.update()

    def test_concurrent_update(self):
        fd=os.open(self.c.root/'descriptor.lock',os.O_CREAT|os.O_RDWR,0o600)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):self.update()
        finally:os.close(fd)

    def test_write_failure_no_receipt(self):
        previous=self.dc.read('RELEASE.env')[0]
        with patch.object(d.os,'replace',side_effect=OSError('INJECTED')):
            with self.assertRaises(OSError):self.update()
        self.assertEqual(previous,self.dc.read('RELEASE.env')[0])
        self.assertFalse((self.c.root/'descriptor.verified').exists())

    def test_postwrite_verification_failure_blocks_open(self):
        with patch.object(d.reopen,'descriptor',side_effect=ValueError('INJECTED_VERIFY')):
            with self.assertRaises(ValueError):self.update()
        self.assertFalse((self.c.root/'descriptor.verified').exists())
        # Replacement did happen: never claim rollback or permit blind retry.
        self.assertIn(d.reopen.SOURCE.encode(),self.dc.read('RELEASE.env')[0])
        downstream=Mock()
        with self.assertRaises(FileNotFoundError):
            d.VerifiedReopenGate(self.c,self.dc,downstream)('fixture','hash')
        downstream.assert_not_called()

    def test_post039_semantic_negative_matrix(self):
        for key,bad in {'observed_at':0,'ledger_count':30,'catalog_count':1,
                        'migration_040_count':1,'fingerprint':'wrong','security_pass':False,
                        'tenant_preservation_pass':False,'writers_isolated':False,
                        'admission_closed':False,'database_identity':{},'u0_sha256':'wrong'}.items():
            with self.subTest(key=key):
                self.put('post039.json',{**self.evidence,key:bad})
                self.put('descriptor.authorization',{**self.auth,'post039_sha256':self.hash('post039.json')})
                with self.assertRaises(ValueError):self.update()
                self.assertFalse((self.c.root/'descriptor.started').exists())

    def test_descriptor_toctou_and_reentry(self):
        original=d.preconditions;calls=[]
        def raced(*args):
            result=original(*args);calls.append(1)
            if len(calls)==2:
                # Same contents but replaced inode must not be silently accepted.
                self.dc.create('replacement',self.dc.read('RELEASE.env')[0])
                os.replace(self.dc.root/'replacement',self.dc.root/'RELEASE.env')
            return result
        with patch.object(d,'preconditions',side_effect=raced):
            with self.assertRaises(ValueError):self.update()
        self.assertFalse((self.c.root/'descriptor.verified').exists())
        self.assertTrue((self.c.root/'descriptor.started').exists())
        with self.assertRaises(FileExistsError):self.update()

    def test_incomplete_activation_journal(self):
        path=self.c.root/'activation-fixture.jsonl'
        path.unlink();self.c.create(path.name,canonical({'event':'STOP_NO_ROLLBACK'}))
        self.put('descriptor.authorization',{**self.auth,'activation_journal_sha256':self.hash(path.name)})
        with self.assertRaises(ValueError):self.update()
        self.assertFalse((self.c.root/'descriptor.started').exists())


if __name__=='__main__':unittest.main()
