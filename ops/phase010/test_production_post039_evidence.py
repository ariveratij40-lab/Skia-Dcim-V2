"""Full-file admission evidence fail-closed matrix; no Docker/production IO."""
import copy
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import admission_control as a
import production_post039_evidence as p

REAL_OBSERVE=p.u.observe


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        now=int(time.time())
        self.db=SimpleNamespace(database='skia_prod',user='skia_bootstrap',
            container='skia-activation-test-fixture-pg',
            query=lambda sql:[0] if 'pg_stat_activity' in sql else ['PASS'])
        self.docker=SimpleNamespace(daemon=lambda:'fixture',inspect=lambda *x:{'Id':'api','State':{'Running':False}})
        self.topology={'environment':'disposable','network':'skia-activation-test-fixture','api':'api'}
        self.closed=dict(window='w',state='CLOSED',observed_at=now,identity={'nginx':'fixture'},
            base_sha256='a'*64,artifact_sha256='b'*64,measurement_sha256='c'*64,graph_sha256='d'*64)
        self.adapter=SimpleNamespace(verify=lambda *x:copy.deepcopy(self.closed))
        self.observed=dict(identity={'database':'fixture'},ledger_count=31,raw=p.e.POST039,
                           baseline=[{'count':1}],structure='test')
        self.u0=dict(window='w',observed_at=now,daemon_id='fixture',identity=self.observed['identity'],
                     baseline=self.observed['baseline'])
        self.isolation=dict(window='w',observed_at=now,daemon_id='fixture',
                            identity=self.observed['identity'],stopped_api_id='api')
        self.observe=patch.object(p.u,'observe',return_value=self.observed)
        self.contract=patch.object(p.u,'contract',return_value={'migrations':[]})
        self.om=self.observe.start();self.contract.start()
        self.addCleanup(self.observe.stop);self.addCleanup(self.contract.stop)
    def call(self):
        return p.collect(self.db,self.docker,self.adapter,self.topology,'w',self.u0,self.isolation,self.closed)
    def test_independent_success(self):
        result=self.call();self.assertTrue(result['security_pass'])
        self.assertEqual(result['admission_evidence_sha256'],a.sha(a.canonical(self.closed)))
        self.assertEqual(result['migration_counts']['040'],0)
        self.assertEqual(self.om.call_count,2)
    def test_closed_matrix(self):
        for key,value in [('window','other'),('state','OPEN'),('observed_at',0),('extra',True)]:
            with self.subTest(key=key):
                original=copy.deepcopy(self.closed);self.closed[key]=value
                with self.assertRaises(a.Rejected):self.call()
                self.closed=original
    def test_live_admission_mismatch(self):
        observed=copy.deepcopy(self.closed);observed['artifact_sha256']='wrong'
        self.adapter.verify=lambda *x:observed
        with self.assertRaisesRegex(a.Rejected,'ADMISSION_BINDING'):self.call()
    def test_u0_matrix(self):
        for key,value in [('window','other'),('observed_at',0),('daemon_id','other'),
                          ('identity',{}),('baseline',[]),('extra',True)]:
            with self.subTest(key=key):
                old=copy.deepcopy(self.u0);self.u0[key]=value
                with self.assertRaises(a.Rejected):self.call()
                self.u0=old
    def test_isolation_matrix(self):
        for key,value in [('window','other'),('observed_at',0),('daemon_id','other'),
                          ('identity',{}),('stopped_api_id','other')]:
            with self.subTest(key=key):
                old=copy.deepcopy(self.isolation);self.isolation[key]=value
                with self.assertRaises(a.Rejected):self.call()
                self.isolation=old
    def test_actual_running_writer(self):
        self.docker.inspect=lambda *x:{'Id':'api','State':{'Running':True}}
        with self.assertRaisesRegex(a.Rejected,'WRITER_NOT_ISOLATED'):self.call()
    def test_clients_or_security_failure(self):
        for result in ([1],[]):
            self.db.query=lambda sql:result
            with self.assertRaises(a.Rejected):self.call()
    def test_security_validator_failure(self):
        self.db.query=lambda sql:[0] if 'pg_stat_activity' in sql else []
        with self.assertRaisesRegex(a.Rejected,'SECURITY_VALIDATION'):self.call()
    def test_database_drift(self):
        changed=copy.deepcopy(self.observed);changed['baseline']=[]
        self.om.side_effect=[self.observed,changed]
        with self.assertRaisesRegex(a.Rejected,'DATABASE_DRIFT'):self.call()
    def test_wrong_database_or_role(self):
        for key in ('database','container','user'):
            old=getattr(self.db,key);setattr(self.db,key,'wrong')
            with self.assertRaises(a.Rejected):self.call()
            setattr(self.db,key,old)
    def test_real_database_observer_negative_matrix(self):
        contract=json.loads(p.u.CONTRACT.read_bytes())
        ledger=sorted([[x['path'],x['sha256']] for x in contract['migrations']])
        state={'ledger':ledger,'catalog':0,'raw':p.e.POST039,
               'structure':contract['prefixes']['31']['structure']}
        def query(sql):
            if 'production_bootstrap_migrations' in sql:return [state['ledger']]
            if 'system_naming_presets' in sql:return [state['catalog']]
            raise AssertionError('Unexpected query')
        db=SimpleNamespace(query=query,fingerprint=lambda:state['raw'])
        with patch.object(p.u,'identity',return_value={'version':'16.14'}), \
             patch.object(p.b,'structure',side_effect=lambda db:{'hash':state['structure']}), \
             patch.object(p.u,'baseline',return_value=[]):
            self.assertEqual(REAL_OBSERVE(db,contract)['ledger_count'],31)
            negatives=[('catalog',1),('raw','wrong'),('structure','wrong'),
                       ('ledger',ledger+[['migrations/040_unexpected.sql','wrong']])]
            for migration in ('036','037','038','039'):
                negatives.append(('ledger',[x for x in ledger if not x[0].startswith('migrations/'+migration+'_')]))
            tampered=copy.deepcopy(ledger);tampered[-1][1]='wrong';negatives.append(('ledger',tampered))
            for key,value in negatives:
                with self.subTest(key=key,value=value):
                    old=state[key];state[key]=value
                    with self.assertRaises(ValueError):REAL_OBSERVE(db,contract)
                    state[key]=old


if __name__=='__main__':unittest.main()
