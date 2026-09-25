"""Synthetic inventory attacks: no production connections or isolation."""
import copy
import json
from pathlib import Path
import unittest
import operational_writer_inventory as w


class WriterInventoryTests(unittest.TestCase):
    def test_versioned_observation(self):
        inventory=json.loads(Path(w.__file__).with_suffix('.json').read_text())
        result=w.validate(inventory,copy.deepcopy(inventory))
        self.assertEqual(result['mapped_client_count'],4)
        self.assertEqual(len(inventory['container_identities']),33)
        self.assertFalse(result['window_authorized'])

    def setUp(self):
        self.reviewed = dict(surfaces=sorted(w.SURFACES), unreadable_surfaces=[],
            unknown_authorities=[], unknown_scheduled_mutators=[], unknown_nginx_mutators=[],
            actions=dict(w.ACTIONS), quiescence_sql=w.QUIESCENCE_SQL,
            container_identities=['reviewed-api'], db_clients=[dict(container_id='reviewed-api',
                role='skia_runtime', authority='api_pools_and_inprocess_workers', count=2)])

    def test_known_clients_do_not_authorize_window(self):
        result=w.validate(self.reviewed, copy.deepcopy(self.reviewed))
        self.assertEqual(result['mapped_client_count'], 2)
        self.assertFalse(result['window_authorized'])
        self.assertFalse(result['isolation_performed'])
        fresh=copy.deepcopy(self.reviewed);fresh['observation_utc']='later observation'
        self.assertFalse(w.validate(self.reviewed,fresh)['window_authorized'])

    def test_unknown_authority_matrix(self):
        for field in ('unknown_authorities','unknown_scheduled_mutators','unknown_nginx_mutators',
                      'unreadable_surfaces'):
            with self.subTest(field=field):
                fresh=copy.deepcopy(self.reviewed);fresh[field]=['new-entry']
                with self.assertRaises(ValueError):w.validate(self.reviewed,fresh)

    def test_unmapped_role_container_and_writer(self):
        for field in ('container_id','role','authority'):
            with self.subTest(field=field):
                fresh=copy.deepcopy(self.reviewed);fresh['db_clients'][0][field]='unknown'
                with self.assertRaises(ValueError):w.validate(self.reviewed,fresh)

    def test_missing_surfaces_actions_and_new_container(self):
        for case in ('surface','action','new_container','changed_count','sql'):
            with self.subTest(case=case):
                fresh=copy.deepcopy(self.reviewed)
                if case=='surface':fresh['surfaces'].pop()
                elif case=='action':fresh['actions'].pop('operator_root_docker_access')
                elif case=='new_container':fresh['container_identities'].append('unreviewed')
                elif case=='changed_count':fresh['db_clients'][0]['count']=3
                else:fresh['quiescence_sql']='SELECT 0;'
                with self.assertRaises(ValueError):w.validate(self.reviewed,fresh)

    def test_empty_clients_never_exempts_administrators(self):
        fresh=copy.deepcopy(self.reviewed);fresh['db_clients']=[]
        fresh['actions'].pop('bootstrap_psql_authority')
        with self.assertRaises(ValueError):w.validate(fresh,fresh)

    def test_zero_other_clients_only(self):
        w.require_quiescence(0)
        for count in (1,4,-1,None,'0',False):
            with self.assertRaises(ValueError):w.require_quiescence(count)
