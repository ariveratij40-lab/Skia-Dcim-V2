import fcntl
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import admission_control as a
import prepared_nginx_authority as p
from production_admission_adapter import Adapter

BASE=(Path(__file__).parent/'fixtures/skia_nginx_observed.conf.fixture').read_bytes()


class Observer:
    def __init__(self,target):self.target=target;self.state='OPEN';self.fail=None;self.reloads=0
    def identity(self):return {'daemon':'fixture','nginx':'fixture'}
    def graph(self):return 'a'*64
    def syntax(self):self.boundary('syntax')
    def boundary(self,point):
        if self.fail==point:self.fail=None;raise a.Rejected('INJECTED')
    def reload(self):
        self.boundary('reload');self.reloads+=1
        self.state='OPEN' if self.target.read_bytes()==BASE else 'CLOSED'
    def drained(self):pass
    def probe(self,state):
        self.boundary('probe_'+state);a.require(state==self.state,'WRONG_STATE');return a.sha(state.encode())
    def reopen_gate(self,window,bundle):self.boundary('prerequisites')


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve();self.uid=os.getuid()
        self.target=self.root/'20-skia-staging.conf';p.exclusive(self.target,BASE)
        self.staging=self.root/'stage';self.staging.mkdir(mode=0o700)
        self.evidence=self.root/'evidence';self.evidence.mkdir(mode=0o700)
        for parent in (self.staging,self.evidence):(parent/'window').mkdir(mode=0o700)
        self.observer=Observer(self.target)
        self.adapter=Adapter(self.target,self.staging,self.evidence,self.root/'lock',self.observer,self.uid)
    def authority(self,operation='CLOSED',**updates):
        kwargs={}
        if operation=='OPEN':kwargs=dict(closed_evidence_sha256=a.sha((self.evidence/'window/CLOSED.evidence').read_bytes()),reopen_bundle_sha256='b'*64)
        manifest=p.prepare(self.staging/'window',BASE,'window',operation,'a'*64,owner=self.uid,**kwargs)
        now=int(time.time());auth=dict(authorized=True,operation=operation,window='window',issued_at=now,
            expires_at=now+900,identity=self.observer.identity(),manifest_sha256=a.sha(a.canonical(manifest)))
        auth.update(updates);path=self.root/(operation+'.authorization');p.exclusive(path,a.canonical(auth));return path
    def test_close_then_exact_open(self):
        self.adapter.transition('CLOSED','window',self.authority())
        self.assertEqual(self.observer.state,'CLOSED')
        self.adapter.transition('OPEN','window',self.authority('OPEN'))
        self.assertEqual(self.target.read_bytes(),BASE)
    def test_expired_authorization(self):
        with self.assertRaisesRegex(a.Rejected,'AUTH_EXPIRED'):
            self.adapter.transition('CLOSED','window',self.authority(expires_at=0))
        self.assertEqual(self.target.read_bytes(),BASE)
    def test_lock_contention(self):
        auth=self.authority()
        with open(self.root/'lock','w') as f:
            os.chmod(f.name,0o600);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaisesRegex(a.Rejected,'TRANSITION_BUSY'):
                self.adapter.transition('CLOSED','window',auth)
    def test_base_drift(self):
        auth=self.authority();self.target.write_bytes(BASE+b'\n')
        with self.assertRaisesRegex(a.Rejected,'BASE_DRIFT'):self.adapter.transition('CLOSED','window',auth)
    def test_unrelated_graph_change(self):
        auth=self.authority();self.observer.graph=lambda:'b'*64
        with self.assertRaisesRegex(a.Rejected,'UNRELATED_GRAPH_DRIFT'):self.adapter.transition('CLOSED','window',auth)
    def test_syntax_failure_no_reload(self):
        auth=self.authority()
        # First syntax checks the original graph; inject only after install.
        self.observer.boundary=lambda point: setattr(self.observer,'fail','syntax') if point=='after_install' else None
        def syntax():
            if self.observer.fail=='syntax':raise a.Rejected('SYNTAX_FAILURE')
        self.observer.syntax=syntax
        with self.assertRaises(a.Rejected):self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.target.read_bytes(),BASE);self.assertEqual(self.observer.reloads,0)
    def test_open_prerequisite_failure(self):
        self.adapter.transition('CLOSED','window',self.authority())
        self.observer.fail='prerequisites'
        with self.assertRaises(a.Rejected):self.adapter.transition('OPEN','window',self.authority('OPEN'))
        self.assertEqual(self.target.read_bytes(),p.derive(BASE,'CLOSED'))
    def test_open_verification_failure_recovers_closed(self):
        self.adapter.transition('CLOSED','window',self.authority())
        self.observer.fail='probe_OPEN'
        with self.assertRaises(a.Rejected):self.adapter.transition('OPEN','window',self.authority('OPEN'))
        self.assertEqual(self.observer.state,'CLOSED')
        self.assertEqual(self.target.read_bytes(),p.derive(BASE,'CLOSED'))
    def test_atomic_install_failure(self):
        auth=self.authority()
        with patch.object(a,'atomic',side_effect=OSError('fixture')):
            with self.assertRaises(OSError):self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.target.read_bytes(),BASE);self.assertEqual(self.observer.reloads,0)
    def test_atomic_failure_after_replace_restores_closed_before_reload(self):
        self.adapter.transition('CLOSED','window',self.authority())
        auth=self.authority('OPEN');original=a.atomic;calls=[]
        def fail_after_replace(path,raw):
            original(path,raw);calls.append(raw)
            if len(calls)==1:raise OSError('directory fsync failed')
        with patch.object(a,'atomic',side_effect=fail_after_replace):
            with self.assertRaises(OSError):self.adapter.transition('OPEN','window',auth)
        self.assertEqual(self.target.read_bytes(),p.derive(BASE,'CLOSED'))
        self.assertEqual(self.observer.state,'CLOSED');self.assertEqual(self.observer.reloads,1)
    def test_preinstall_artifact_drift(self):
        auth=self.authority()
        def boundary(point):
            if point=='before_install':(self.staging/'window/CLOSED.artifact').write_bytes(b'drift')
        self.observer.boundary=boundary
        with self.assertRaisesRegex(a.Rejected,'ARTIFACT_DRIFT'):
            self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.target.read_bytes(),BASE);self.assertEqual(self.observer.reloads,0)
    def test_preinstall_base_drift_never_overwritten(self):
        auth=self.authority()
        def boundary(point):
            if point=='before_install':self.target.write_bytes(BASE+b'drift')
        self.observer.boundary=boundary
        with self.assertRaisesRegex(a.Rejected,'BASE_DRIFT'):
            self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.target.read_bytes(),BASE+b'drift');self.assertEqual(self.observer.reloads,0)
    def test_reload_failure_blocks_further_transitions(self):
        auth=self.authority();self.observer.fail='reload'
        with self.assertRaises(a.Rejected):self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.target.read_bytes(),p.derive(BASE,'CLOSED'))
        with self.assertRaisesRegex(a.Rejected,'INCOMPLETE_TRANSITION'):
            self.adapter.transition('CLOSED','window',auth)
    def test_close_probe_failure_never_opens(self):
        auth=self.authority();self.observer.fail='probe_CLOSED'
        with self.assertRaises(a.Rejected):self.adapter.transition('CLOSED','window',auth)
        self.assertEqual(self.observer.state,'CLOSED')
        self.assertEqual(self.target.read_bytes(),p.derive(BASE,'CLOSED'))


if __name__=='__main__':unittest.main()
