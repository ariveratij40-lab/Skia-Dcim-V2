"""Pure metadata and offline disposable-plan tests; no secret authority access."""
import copy
import unittest

import prewindow_activation as p


class OAuthActivationTests(unittest.TestCase):
    def setUp(self):
        self.spec = p.expected()
        self.spec['activation_authorized'] = True  # Mock authorization only.
        self.provider = {'authority': 'GOOGLE_PROVIDER',
                         'callback_status': 'VERIFIED_EXACT',
                         'callback': p.PUBLIC['GOOGLE_REDIRECT_URL'],
                         'client_authority_match': True}  # Mock external evidence.
        self.metadata = {
            name: {'name': name, 'source': self.spec['secret_authority'],
                   'classification': p.PRODUCTION_MODE, 'resolved': True,
                   'synthetic': False}
            for name in p.OAUTH_NAMES
        }

    def reject(self, spec=None, metadata=None, mode=p.PRODUCTION_MODE):
        with self.assertRaisesRegex(ValueError, '^PRODUCTION_ACTIVATION_REJECTED$'):
            p.validate_production_activation(
                self.spec if spec is None else spec, mode,
                self.metadata if metadata is None else metadata, self.provider)

    def test_positive_mock_resolver_metadata_only(self):
        self.assertEqual(p.validate_production_activation(
            self.spec, p.PRODUCTION_MODE, self.metadata, self.provider),
            'PRODUCTION_METADATA_CONTRACT_VALIDATED_EXTERNAL_GATES_STILL_REQUIRED')

    def test_independent_provider_evidence_required(self):
        for evidence in (None, {}, {'callback': p.PUBLIC['GOOGLE_REDIRECT_URL']}):
            with self.assertRaises(ValueError):
                p.validate_production_activation(self.spec, p.PRODUCTION_MODE,
                                                 self.metadata, evidence)
        for field, value in [('authority', 'APPLICATION_CONFIG'),
                             ('callback_status', 'UNVERIFIABLE'),
                             ('callback', 'https://skia.mx/api/auth/google/callback'),
                             ('client_authority_match', False),
                             ('client_authority_match', 1)]:
            evidence = dict(self.provider)
            evidence[field] = value
            with self.assertRaises(ValueError):
                p.validate_production_activation(self.spec, p.PRODUCTION_MODE,
                                                 self.metadata, evidence)

    def test_missing_references(self):
        for names in [(p.OAUTH_NAMES[0],), (p.OAUTH_NAMES[1],), p.OAUTH_NAMES]:
            with self.subTest(missing=names):
                spec = copy.deepcopy(self.spec)
                spec['oauth_prerequisite_names'] = [n for n in p.OAUTH_NAMES if n not in names]
                self.reject(spec=spec)
                self.reject(metadata={n: r for n, r in self.metadata.items() if n not in names})

    def test_unresolved_authorities(self):
        for name in p.OAUTH_NAMES:
            for value in (False, None, '', 'true', 1):
                with self.subTest(name=name, value=value):
                    meta = copy.deepcopy(self.metadata)
                    meta[name]['resolved'] = value
                    self.reject(metadata=meta)

    def test_synthetic_production_rejected(self):
        self.reject(mode=p.SYNTHETIC_MODE)
        for name in p.OAUTH_NAMES:
            for field, value in [('synthetic', True), ('synthetic', 0),
                                 ('classification', p.SYNTHETIC_MODE),
                                 ('value', 'synthetic-placeholder')]:
                meta = copy.deepcopy(self.metadata)
                meta[name][field] = value
                self.reject(metadata=meta)

    def test_source_and_name_binding(self):
        for name in p.OAUTH_NAMES:
            for key in ('source', 'name'):
                meta = copy.deepcopy(self.metadata)
                meta[name][key] = 'untrusted'
                self.reject(metadata=meta)

    def test_public_configuration_negative_matrix(self):
        for key in ('GOOGLE_REDIRECT_URL', 'FRONTEND_URL', 'APP_BASE_URL'):
            for value in (None, 'http://skia.iamet.mx/api/auth/google/callback',
                          'https://skia.mx/api/auth/google/callback',
                          'https://skia.iamet.mx/wrong',
                          'https://skia.iamet.mx/api/auth/google/callback/'):
                with self.subTest(key=key, value=value):
                    spec = copy.deepcopy(self.spec)
                    if value is None:
                        del spec['public_environment'][key]
                    else:
                        spec['public_environment'][key] = value
                    self.reject(spec=spec)

    def test_activation_authorization_required(self):
        for value in (False, None, 'true', 1):
            spec = copy.deepcopy(self.spec)
            spec['activation_authorized'] = value
            self.reject(spec=spec)
        spec = copy.deepcopy(self.spec)
        del spec['activation_authorized']
        self.reject(spec=spec)

    def test_disposable_configuration_rehearsal(self):
        plan = p.disposable_plan(p.expected(), 'skia-prewindow-test-12345678', 'a' * 40)
        env = dict(item.split('=', 1) for item in plan['Env'])
        self.assertEqual(p.validate_disposable_oauth(p.expected(), p.SYNTHETIC_MODE, env),
                         'NOT_PRODUCTION_READY')
        self.reject(metadata=env)
        for name in p.OAUTH_NAMES:
            missing = dict(env)
            del missing[name]
            with self.assertRaises(ValueError):
                p.validate_disposable_oauth(p.expected(), p.SYNTHETIC_MODE, missing)
        self.assertEqual(plan['Image'], p.IMAGE)
        self.assertEqual(plan['HostConfig']['PortBindings'], {})

    def test_errors_never_echo_input(self):
        meta = copy.deepcopy(self.metadata)
        meta['GOOGLE_CLIENT_SECRET']['value'] = 'SENTINEL_REDACTION_ONLY'
        with self.assertRaises(ValueError) as raised:
            p.validate_production_activation(self.spec, p.PRODUCTION_MODE, meta, self.provider)
        self.assertNotIn('SENTINEL', str(raised.exception))


if __name__ == '__main__':
    unittest.main(verbosity=2)
