"""Negative assembly contracts; no production or Docker access."""
import copy
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import admission_control as a
import post039_activation_evidence as p


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.db=SimpleNamespace(database='skia_prod',user='skia_bootstrap',
                                container='skia-activation-test-fixture-pg',
                                query=lambda sql:['SECURITY_PASS'])
        self.docker=SimpleNamespace(daemon=lambda:'fixture')
        self.admission=SimpleNamespace(identity=lambda:{'id':'nginx'},base_hash=lambda:'b'*64,
                                       probe=lambda state:'c'*64)
        self.closed=dict(window='window',state='CLOSED',observed_at=int(time.time()),
                         identity={'id':'nginx'},base_sha256='b'*64,artifact_sha256=a.sha(a.CLOSED),
                         measurement_sha256='c'*64)
        self.observed=dict(identity={'database':'skia_prod','cluster':'test'},ledger_count=31,
                           raw=p.b.SCHEMA,structure='s',baseline=[{'count':1,'hash':'test'}])
        self.u0=dict(identity=self.observed['identity'],window='window',daemon_id='fixture',
                     baseline=self.observed['baseline'])
        self.isolation={'window':'window'}
    def call(self):
        return p.assemble(self.db,self.docker,'window',self.u0,self.isolation,
                          self.closed,self.admission,'disposable')
    def mocks(self):
        observed=patch.object(p.u,'observe',return_value=self.observed)
        contract=patch.object(p.u,'contract',return_value={'migrations':[]})
        session=patch.object(p.u,'Session',return_value=MagicMock())
        quiet=patch.object(p.u,'quiescence')
        for mock in (observed,contract,session,quiet):self.addCleanup(mock.stop)
        return [mock.start() for mock in (observed,contract,session,quiet)]
    def test_success_derives_facts(self):
        _,_,_,quiet=self.mocks();result=self.call()
        self.assertEqual(result['ledger_count'],31)
        self.assertEqual(result['migration_counts']['040'],0)
        self.assertTrue(result['security_pass']);self.assertEqual(quiet.call_count,2)
        self.assertNotIn('password',a.canonical(result).decode())
    def test_admission_negative_matrix(self):
        self.mocks()
        for key,value in [('window','other'),('state','OPEN'),('observed_at',0),
                          ('identity',{}),('base_sha256','bad'),('artifact_sha256','bad'),
                          ('measurement_sha256','bad')]:
            with self.subTest(key=key):
                old=self.closed[key];self.closed[key]=value
                with self.assertRaises(a.Rejected):self.call()
                self.closed[key]=old
    def test_u0_mismatch_rejected(self):
        self.mocks();self.u0['baseline']=[]
        with self.assertRaisesRegex(a.Rejected,'TENANT_PRESERVATION'):self.call()
    def test_security_failure_rejected(self):
        self.mocks();self.db.query=lambda sql:[]
        with self.assertRaisesRegex(a.Rejected,'SECURITY_VALIDATOR'):self.call()
    def test_quiescence_failure_rejected(self):
        _,_,_,quiet=self.mocks();quiet.side_effect=ValueError('OTHER_DATABASE_CLIENTS')
        with self.assertRaises(ValueError):self.call()
    def test_db_change_rejected(self):
        observe,_,_,_=self.mocks();changed=copy.deepcopy(self.observed);changed['baseline']=[]
        observe.side_effect=[self.observed,changed]
        with self.assertRaisesRegex(a.Rejected,'DATABASE_CHANGED'):self.call()


if __name__=='__main__':unittest.main()
