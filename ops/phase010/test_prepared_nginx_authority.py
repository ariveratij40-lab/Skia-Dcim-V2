"""Prepared authority negatives; original reviewed candidate is not changed."""
import os
from pathlib import Path
import tempfile
import unittest

import admission_control as a
import prepared_nginx_authority as p

BASE=(Path(__file__).parent/'fixtures/skia_nginx_observed.conf.fixture').read_bytes()


class PreparedTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()/'window';self.root.mkdir(mode=0o700)
        self.owner=os.getuid();self.now=1000
        self.manifest=p.prepare(self.root,BASE,'window','CLOSED','a'*64,owner=self.owner,now=self.now)
    def verify(self,**kw):
        params=dict(root=self.root,base=BASE,window='window',operation='CLOSED',current=BASE,
                    graph_sha256='a'*64,target_device=self.root.stat().st_dev,
                    lock_held=True,owner=self.owner,now=1001)
        params.update(kw);return p.verify(**params)
    def rewrite(self,value):
        (self.root/'CLOSED.manifest').write_bytes(a.canonical(value))
    def test_exact_source_and_determinism(self):
        self.assertEqual(a.sha(BASE),p.BASE_HASH)
        raw,_=self.verify();self.assertEqual(raw.count(b'return 503'),4)
        self.assertEqual(p.derive(BASE,'OPEN'),BASE)
        self.assertEqual(raw,p.derive(BASE,'CLOSED'))
        self.assertNotIn(b'proxy_pass ',raw)
        self.assertEqual(p.derive(BASE,'OPEN').count(b'proxy_pass '),3)
    def test_wrong_base_and_current_drift(self):
        for field in ('base','current'):
            with self.subTest(field=field),self.assertRaises(a.Rejected):self.verify(**{field:BASE+b'\n'})
    def test_window_stale_owner_graph_device_lock(self):
        for kwargs in ({'window':'other'},{'now':1900},{'owner':self.owner+1},
                       {'graph_sha256':'b'*64},{'target_device':-1},{'lock_held':False}):
            with self.subTest(kwargs=kwargs),self.assertRaises(a.Rejected):self.verify(**kwargs)
    def test_artifact_tampering_and_bad_hash(self):
        self.verify();(self.root/'CLOSED.artifact').write_bytes(b'changed after validation')
        with self.assertRaises(a.Rejected):self.verify()
    def test_wrong_prepared_hash(self):
        self.manifest['artifact_sha256']='0'*64;self.rewrite(self.manifest)
        with self.assertRaises(a.Rejected):self.verify()
    def test_wrong_closed_source(self):
        (self.root/'CLOSED.artifact').write_bytes(BASE)
        self.manifest['artifact_sha256']=a.sha(BASE);self.rewrite(self.manifest)
        with self.assertRaises(a.Rejected):self.verify()
    def test_wrong_open_source(self):
        p.prepare(self.root,BASE,'window','OPEN','a'*64,owner=self.owner,now=1000,
                  closed_evidence_sha256='b'*64,reopen_bundle_sha256='c'*64)
        path=self.root/'OPEN.artifact';path.write_bytes(BASE+b'\n')
        with self.assertRaises(a.Rejected):self.verify(operation='OPEN',current=p.derive(BASE,'CLOSED'))
    def test_permissions_symlink(self):
        path=self.root/'CLOSED.artifact';path.chmod(0o644)
        with self.assertRaises(a.Rejected):self.verify()
        path.chmod(0o600);path.rename(self.root/'saved');path.symlink_to(self.root/'saved')
        with self.assertRaises(a.Rejected):self.verify()
    def test_malformed_extra_authority_duplicate(self):
        path=self.root/'CLOSED.manifest'
        for raw in (b'{',b'{"a":1,"a":2}',a.canonical(dict(self.manifest,override=True))):
            path.write_bytes(raw)
            with self.assertRaises((a.Rejected,ValueError)):self.verify()
    def test_exclusive_preparation(self):
        with self.assertRaises(FileExistsError):
            p.prepare(self.root,BASE,'window','CLOSED','a'*64,owner=self.owner,now=1000)


if __name__=='__main__':unittest.main()
