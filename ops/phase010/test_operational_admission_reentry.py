"""Reuse the existing synthetic adapter fixture; no production admission."""
import unittest
import test_production_admission_adapter as fixtures


class OperationalAdmissionReentryTests(unittest.TestCase):
    def test_same_close_authority_cannot_be_reused(self):
        fixture=fixtures.AdapterTests();fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        auth=fixture.authority()
        fixture.adapter.transition('CLOSED','window',auth)
        before=fixture.target.read_bytes();reloads=fixture.observer.reloads
        with self.assertRaises(fixtures.a.Rejected):
            fixture.adapter.transition('CLOSED','window',auth)
        self.assertEqual(fixture.target.read_bytes(),before)
        self.assertEqual(fixture.observer.reloads,reloads)
