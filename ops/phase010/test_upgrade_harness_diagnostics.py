"""Pure observability/redaction regression tests; no Docker required."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from upgrade_harness_diagnostics import Diagnostics, redact
import b3b_release as b
import upgrade_036_039 as u


class DiagnosticsTests(unittest.TestCase):
    def test_secret_streams_fail_closed(self):
        sentinels = ['sentinel-password', 'unlabeled-sentinel', 'sentinel-token',
                     'sentinel-jwt', 'sentinel-key']
        lines = ['postgresql://user:sentinel-password@localhost/db',
                 'DATABASE_URL=unlabeled-sentinel', 'Cookie: session_token=sentinel-token',
                 'Authorization: Bearer sentinel-jwt', 'API_KEY=sentinel-key',
                 'unlabeled-sentinel', 'ERROR:  division by zero sentinel-token']
        output = redact('\n'.join(lines))
        for secret in sentinels:
            self.assertNotIn(secret, output)
        self.assertEqual(redact('ERROR:  division by zero'), 'ERROR:  division by zero')

    def test_nonzero_exit_and_redacted_streams(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Diagnostics('skia-upgrade-matrix-unit', tmp)
            d.stage = 'NEGATIVE_TEST'
            result = subprocess.CompletedProcess(['docker'], 3,
                b'sentinel-unlabeled', b'ERROR:  division by zero\npassword=sentinel-password')
            with patch('subprocess.run', return_value=result):
                with self.assertRaises(ValueError):
                    d.run(['docker'])
            item = d.failures[0]
            self.assertEqual(item['exit_code'], 3)
            self.assertEqual(item['stderr_classification'], 'INJECTED_DIVISION_BY_ZERO')
            self.assertEqual(item['stage'], 'NEGATIVE_TEST')
            self.assertNotIn('sentinel', json.dumps(item))
            d.write('failure.json', item)
            with self.assertRaises(FileExistsError):
                d.write('failure.json', {})

    def test_disposable_only(self):
        with self.assertRaises(ValueError):
            Diagnostics('skia_postgres_prod', '/tmp/unused')

    def test_observation_does_not_replace_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Diagnostics('skia-upgrade-matrix-unit', tmp)
            db = b.DB(d.container, 'prefix_28', 'skia_bootstrap')
            d.database = db.database
            entry = {'path': 'migrations/037_test.sql'}
            marker = object()
            with patch.object(u, 'apply_one', return_value=marker) as apply:
                with patch.object(b, 'structure', return_value={'hash': 'unchanged'}) as structure:
                    with d:
                        self.assertIs(u.apply_one(marker, entry), marker)
                        self.assertEqual(b.structure(db), {'hash': 'unchanged'})
                    apply.assert_called_once_with(marker, entry)
                    structure.assert_called_once_with(db)
                    self.assertEqual(d.stage, 'STRUCTURE_VERIFICATION_AFTER_037')

    def test_unavailable_diagnostics_still_persist(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Diagnostics('skia-upgrade-matrix-unit', tmp)
            result = subprocess.CompletedProcess(['docker'], 1, b'', b'No such container: secret')
            with patch('subprocess.run', return_value=result):
                bundle = d.snapshot('unavailable')
            self.assertEqual(bundle['container_state'], 'UNAVAILABLE')
            self.assertEqual(bundle['ledger']['status'], 'UNAVAILABLE')
            self.assertNotIn('secret', (Path(tmp)/'unavailable.json').read_text())


if __name__ == '__main__':
    unittest.main()
