#!/usr/bin/env python3
"""Pure failure matrix and opt-in disposable rehearsal. Never uses a default DB."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("b3b", Path(__file__).with_name("b3b_release.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
REPO = Path(__file__).resolve().parents[2]


class PureTests(unittest.TestCase):
    def setUp(self):
        self.rows = json.loads((REPO / b.CATALOG).read_bytes())

    def test_catalog_all_states_and_null(self):
        self.assertEqual(b.catalog([], self.rows)["classification"], "EMPTY")
        exact = b.catalog(list(reversed(self.rows)), self.rows)
        self.assertEqual(exact["hash"], b.CAT_HASH)
        self.assertTrue(exact["field_match"])
        self.assertEqual(b.catalog(self.rows[:1], self.rows)["classification"], "PARTIAL_IDENTICAL")
        conflict = copy.deepcopy(self.rows)
        conflict[0][-2] = ""
        self.assertEqual(b.catalog(conflict, self.rows)["classification"], "CONFLICTING")
        extra = copy.deepcopy(self.rows[0])
        extra[0:3] = ["UNKNOWN_V1", "UNKNOWN", 1]
        self.assertEqual(b.catalog(self.rows + [extra], self.rows)["classification"], "UNEXPECTED_ADDITIONAL_ROWS")
        duplicate = self.rows + [self.rows[0]]
        self.assertEqual(b.catalog(duplicate, self.rows)["classification"], "CONFLICTING")
        collision = copy.deepcopy(self.rows[0]); collision[0] = "OTHER"
        self.assertEqual(b.catalog([collision], self.rows)["classification"], "CONFLICTING")
        with self.assertRaises(ValueError):
            b.catalog([[1]], self.rows)

    def test_read_only_envelope(self):
        class Recording(b.DB):
            def command(self, *args, data=None):
                self.statement = data.decode()
                return b'{}\n'
        db = Recording("fixture", "fixture", "postgres")
        db.query("SELECT '{}'::json")
        self.assertIn("REPEATABLE READ READ ONLY", db.statement)
        self.assertTrue(db.statement.endswith("ROLLBACK;"))

    def test_guard_negative_matrix(self):
        with tempfile.TemporaryDirectory() as td:
            dump = Path(td) / "test.dump"
            dump.write_bytes(b"unit-test-checkpoint")
            pre = {"observed_at": b.stamp(), "identity": {"database": "fixture"},
                   "classification": "PRE040_ELIGIBLE_DB", "pre040_chain_complete": True,
                   "ledger_count": 31, "040_count": 0, "pending": [b.MIGRATION],
                   "ledger_checksums_exact": True, "schema": b.SCHEMA,
                   "catalog": {"classification": "EMPTY"}, "baseline": {}, "ledger": [], "security": {}}
            stable = {"status": "STABLE_OBSERVED", "last": copy.deepcopy(pre)}
            cp = {"restore_verified": True, "source": copy.deepcopy(pre), "path": str(dump),
                  "sha256": b.file_hash(dump)}
            components = {"observed_at": b.stamp(), "application_release_sha": b.APP,
                          "api": {"compatible": True, "health": "healthy"}, "web": {"health": "healthy"}}
            args = [pre, stable, cp, components, {"R1": "PASS"}]
            self.assertEqual(b.guard(*args)["R5_ELIGIBLE"], "YES")
            cases = [(0, "classification", "ALREADY_APPLIED_VERIFIED"),
                     (0, "pre040_chain_complete", False), (0, "ledger_count", 30),
                     (0, "040_count", 1), (0, "pending", ["036.sql", b.MIGRATION]),
                     (0, "pending", []), (0, "ledger_checksums_exact", False),
                     (0, "schema", "bad"), (0, "catalog", {"classification": "PARTIAL_IDENTICAL"}),
                     (0, "observed_at", "2000-01-01T00:00:00+00:00"),
                     (1, "status", "UNSTABLE"), (2, "restore_verified", False),
                     (3, "api", {"compatible": False, "health": "healthy"}),
                     (3, "application_release_sha", "wrong"), (4, "R1", "INCOMPLETE")]
            for index, key, value in cases:
                with self.subTest(key=key, value=value):
                    modified = copy.deepcopy(args); modified[index][key] = value
                    with self.assertRaises(ValueError):
                        b.guard(*modified)
            dump.write_bytes(b"tampered")
            with self.assertRaises(ValueError):
                b.guard(*args)

    def test_unknown_target_rejected(self):
        with self.assertRaises(ValueError):
            b.DB("--privileged", "db", "user")


@unittest.skipUnless(os.environ.get("B3B_DISPOSABLE") == "YES", "explicit disposable fixture required")
class DisposableTests(unittest.TestCase):
    def test_full_rehearsal(self):
        # Governed HF3 supersedes the historical failing restore procedure.
        from test_b3b_recovery import main
        main()

if __name__ == "__main__":
    unittest.main(verbosity=2)
