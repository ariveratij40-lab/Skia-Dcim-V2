import json
import unittest
import prewindow_activation as p


class ActivationTests(unittest.TestCase):
    def test_versioned_spec(self):
        self.assertTrue(p.validate(json.loads(p.SPEC.read_text())))

    def test_negative_matrix(self):
        cases = {
            '18081': ('published_ports', {'8080/tcp': [{'HostPort': '18081'}]}),
            '13001': ('published_ports', {'3000/tcp': [{'HostPort': '13001'}]}),
            'uploads': ('uploads_volume', ''), 'dns': ('container_name', 'wrong'),
            'network': ('network', 'bridge'), 'image': ('image_id', 'wrong'),
            'health': ('healthcheck', {}), 'aliases': ('aliases', ['wrong']),
        }
        for label, (key, value) in cases.items():
            with self.subTest(label=label):
                spec = p.expected(); spec[key] = value
                with self.assertRaises(ValueError):
                    p.disposable_plan(spec, 'skia-prewindow-test-12345678', 'a' * 40)
        for key in ('SKIA_REQUIRE_RESTRICTED_RUNTIME_DB', 'FRONTEND_URL', 'APP_BASE_URL', 'GOOGLE_REDIRECT_URL'):
            spec = p.expected(); spec['public_environment'][key] = 'wrong'
            with self.assertRaises(ValueError):
                p.disposable_plan(spec, 'skia-prewindow-test-12345678', 'a' * 40)
        spec = p.expected(); del spec['public_environment']['SKIA_REQUIRE_RESTRICTED_RUNTIME_DB']
        with self.assertRaises(ValueError):
            p.disposable_plan(spec, 'skia-prewindow-test-12345678', 'a' * 40)

    def test_no_production_namespace(self):
        for prefix in ('skia_prod', 'skia_api_prod', 'skia_prod_internal', '../escape'):
            with self.assertRaises(ValueError):
                p.disposable_plan(p.expected(), prefix, 'a' * 40)

    def test_plan(self):
        plan = p.disposable_plan(p.expected(), 'skia-prewindow-test-12345678', 'a' * 40)
        self.assertEqual(plan['HostConfig']['PortBindings'], {})
        self.assertEqual(plan['Healthcheck'], p.HEALTH)
        self.assertNotIn('skia_prod_internal', json.dumps(plan))
        self.assertNotIn('skia_prod_uploads', json.dumps(plan))
        # Canonical SQL hardcodes the database name; isolation is by a new
        # internal Docker network and a new PostgreSQL container, not its name.
        for env in plan['Env']:
            if '_DATABASE_URL=' in env or env.startswith('DATABASE_URL='):
                self.assertIn('@skia-prewindow-test-12345678-pg/skia_prod?', env)
        self.assertEqual(plan['Image'], p.IMAGE)

    def test_redaction(self):
        spec = p.expected(); spec['unexpected'] = 'SENTINEL_NOT_A_REAL_SECRET'
        with self.assertRaises(ValueError) as error:
            p.validate(spec)
        self.assertNotIn('SENTINEL', str(error.exception))


if __name__ == '__main__':
    unittest.main(verbosity=2)
