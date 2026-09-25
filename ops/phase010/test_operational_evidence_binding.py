"""Pin reviewed E2E code; this unit test does not claim a new Docker E2E."""
import hashlib
import json
from pathlib import Path
import unittest


class EvidenceBindingTests(unittest.TestCase):
    def test_exact_core_bytes(self):
        root=Path(__file__).parent
        evidence=json.loads((root/'operational_closure_evidence.json').read_text())
        for name,expected in evidence['core_sha256'].items():
            with self.subTest(path=name):
                self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(),expected)
        self.assertEqual(evidence['progression'],[27,28,29,30,31])
        self.assertEqual(evidence['restore_count'],2)
        self.assertTrue(evidence['recovery_verified'])
        self.assertEqual(evidence['migration_040_count'],0)
