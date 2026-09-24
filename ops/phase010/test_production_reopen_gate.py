import copy
import os
from pathlib import Path
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import admission_control as a
import prepared_nginx_authority as p
import production_reopen_gate as g


class ReopenTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()/'window';self.root.mkdir(mode=0o700)
        self.uid=os.getuid();now=int(time.time())
        self.closed=dict(window='window',observed_at=now,state='CLOSED')
        self.u0=dict(window='window',daemon_id='fixture',baseline=[{'count':1}])
        self.record=dict(window='window',observed_at=now,daemon_id='fixture',api={'id':'api'},web={'id':'web'})
        self.evidence=dict(window='window',observed_at=now,environment='disposable',database='skia_prod',
            daemon_id='fixture',ledger=[],ledger_count=31,migration_counts={'036':1,'037':1,'038':1,'039':1,'040':0},
            migration_040_count=0,catalog_count=0,fingerprint=g.e.POST039,security_pass=True,
            tenant_preservation_pass=True,writers_isolated=True,admission_closed=True,
            admission_evidence_sha256=a.sha(a.canonical(self.closed)),database_identity={'id':'db'},
            u0_sha256=a.sha(a.canonical(self.u0)))
        self.observation=dict(ledger_count=31,raw=g.e.POST039,identity={'id':'db'},baseline=self.u0['baseline'])
        self.descriptor=self.root/'RELEASE.env'
        p.exclusive(self.descriptor,('API_SOURCE_SHA='+g.SOURCE+'\nWEB_SOURCE_SHA='+g.SOURCE+'\n').encode())
        for name,value in [('post039.json',self.evidence),('CLOSED.evidence',self.closed),
                           ('runtime.json',self.record),('u0.json',self.u0),('session-metadata.json',{})]:
            p.exclusive(self.root/name,a.canonical(value))
        p.exclusive(self.root/'session',b'synthetic-fixture-session')
        self.bundle=g.assemble_bundle(self.root,self.descriptor,owner=self.uid,descriptor_owner=self.uid)
        p.exclusive(self.root/'reopen.json',a.canonical(self.bundle))
        self.gate=g.Gate(self.root,self.descriptor,None,SimpleNamespace(daemon=lambda:'fixture'),
                         {'environment':'disposable'},self.uid,self.uid)
        for name,value in [('contract',{'migrations':[]}),('observe',self.observation)]:
            mock=patch.object(g.u,name,return_value=value);mock.start();self.addCleanup(mock.stop)
        self.runtime=patch.object(g,'runtime',return_value=self.record)
        self.runtime_mock=self.runtime.start();self.addCleanup(self.runtime.stop)
    def call(self):return self.gate('window',a.sha(a.canonical(self.bundle)))
    def replace(self,name,value):a.atomic(self.root/name,a.canonical(value))
    def test_success_independently_rechecks_runtime(self):
        self.call();self.assertEqual(self.runtime_mock.call_count,1)
    def test_each_bound_artifact_tamper(self):
        for name in ('post039.json','runtime.json','CLOSED.evidence','RELEASE.env'):
            with self.subTest(name=name):
                raw=(self.root/name).read_bytes();a.atomic(self.root/name,raw+b' ')
                with self.assertRaisesRegex(a.Rejected,'REOPEN_ARTIFACT_HASH'):self.call()
                a.atomic(self.root/name,raw)
    def test_bundle_wrong_window_age_identity(self):
        for key,value in [('window','other'),('observed_at',0),('daemon_id','other'),('extra',True)]:
            old=copy.deepcopy(self.bundle);self.bundle[key]=value;self.replace('reopen.json',self.bundle)
            with self.assertRaises(a.Rejected):self.call()
            self.bundle=old;self.replace('reopen.json',old)
    def test_partial_runtime_or_failed_probe(self):
        self.runtime_mock.side_effect=a.Rejected('READ_PROBE_FAILED')
        with self.assertRaisesRegex(a.Rejected,'READ_PROBE_FAILED'):self.call()
    def test_database_drift(self):
        self.observation['raw']='wrong'
        with self.assertRaisesRegex(a.Rejected,'REOPEN_DATABASE_DRIFT'):self.call()
    def test_tenant_drift(self):
        self.observation['baseline']=[]
        with self.assertRaisesRegex(a.Rejected,'REOPEN_TENANT_DRIFT'):self.call()
    def test_descriptor_rejects_other_release(self):
        with self.assertRaisesRegex(a.Rejected,'DESCRIPTOR_NOT_ALIGNED'):
            g.descriptor(b'API_SOURCE_SHA=wrong\nWEB_SOURCE_SHA=wrong\n')
    def test_false_post039_fact_even_with_rehashed_bundle(self):
        self.evidence['security_pass']=False;self.replace('post039.json',self.evidence)
        self.bundle['post039_sha256']=a.sha(a.canonical(self.evidence));self.replace('reopen.json',self.bundle)
        with self.assertRaisesRegex(a.Rejected,'POST039_NOT_APPROVED'):self.call()


if __name__=='__main__':unittest.main()
