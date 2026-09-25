"""Redis infrastructure preservation; no application Redis consumer implied."""
import copy
import json
import unittest
from unittest.mock import Mock

import execute_prewindow_activation as e


class RuntimeEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.values = {'REDIS_PASSWORD': 'synthetic-test-only', **e.REDIS_TOPOLOGY_ENV}
        self.redis = {
            'NetworkSettings': {'Networks': {'skia_prod_internal': {
                'NetworkID': 'network-id', 'Aliases': ['redis', 'skia_redis_prod']}}},
            'Config': {'ExposedPorts': {'6379/tcp': {}}},
            'HostConfig': {'PortBindings': {}}}
        self.network = {'Id': 'network-id', 'Internal': True, 'Driver': 'bridge'}
        self.docker = Mock()
        self.docker.inspect.side_effect = lambda kind, name: self.network if kind == 'network' else self.redis

    def test_governed_assembly_and_redaction(self):
        source = {'REDIS_PASSWORD': self.values['REDIS_PASSWORD']}
        result = e.assemble_runtime_environment(self.docker, e.topology(), source)
        self.assertEqual(dict(result), self.values)
        self.assertEqual(source, {'REDIS_PASSWORD': self.values['REDIS_PASSWORD']})
        self.assertNotIn(source['REDIS_PASSWORD'], repr(result))
        with self.assertRaises(TypeError): json.dumps(result)

    def test_required_environment_negative_matrix(self):
        for key in self.values:
            for bad in (None, '', 'wrong.invalid' if key == 'REDIS_HOST' else ' '):
                with self.subTest(key=key, bad=bad):
                    values = dict(self.values)
                    if bad is None: values.pop(key)
                    else: values[key] = bad
                    with self.assertRaises(e.Rejected): e.validate_runtime_environment(values)
        for port in ('6380', 'not-a-port'):
            with self.assertRaises(e.Rejected):
                e.validate_runtime_environment({**self.values, 'REDIS_PORT': port})

    def test_topology_negative_matrix(self):
        original = copy.deepcopy(self.redis)
        for field in ('alias', 'network', 'exposed', 'published'):
            self.redis = copy.deepcopy(original)
            if field == 'alias': self.redis['NetworkSettings']['Networks']['skia_prod_internal']['Aliases'] = ['redis']
            if field == 'network': self.redis['NetworkSettings']['Networks']['skia_prod_internal']['NetworkID'] = 'other'
            if field == 'exposed': self.redis['Config']['ExposedPorts'] = {}
            if field == 'published': self.redis['HostConfig']['PortBindings'] = {'6379/tcp': [{'HostPort': '6379'}]}
            with self.subTest(field=field), self.assertRaises(e.Rejected):
                e.assemble_runtime_environment(self.docker, e.topology(), self.values)

    def test_conflicting_source_rejected(self):
        for key in e.REDIS_TOPOLOGY_ENV:
            with self.assertRaises(e.Rejected):
                e.assemble_runtime_environment(self.docker, e.topology(), {**self.values, key: 'wrong'})

    def test_model_b_and_oauth_do_not_replace_redis_contract(self):
        components = {v[1]: 'opaque-component' for v in e.model.MAPPING.values()}
        components.update({k: 'opaque-oauth' for k in e.contract.OAUTH_NAMES})
        raw = '\n'.join(k + '=' + v for k, v in components.items()).encode()
        parsed = e.parse_secrets(raw, True, 'skia_postgres_prod', aliases=['postgres', 'skia_postgres_prod'])
        with self.assertRaises(e.Rejected):
            e.assemble_runtime_environment(self.docker, e.topology(), parsed)


if __name__ == '__main__':
    unittest.main()
