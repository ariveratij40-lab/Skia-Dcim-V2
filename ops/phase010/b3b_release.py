#!/usr/bin/env python3
"""B3b local tooling. No migration executor, SSH, acceptance or repair path.

Database reads use an explicit Docker container, PostgreSQL administrative user,
database and read-only transaction. Credentials belong in the existing container
authentication mechanism, never command output/evidence. JSON evidence is local
operator evidence, not a cryptographic authorization token.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

APP = "0c01d79ae714465ab95aac896e4100d0be893185"
MIN_API = "ab1e730e12807c57f19a14dfefbefca0210522c2"
OLD_API = "c5b90598d0d9ab52482e09ea0bcdb582cb4fad07"
OLD_WEB = "658cfa35becaf75f851a27d44180fef20ea0f2ce"
SCHEMA = "e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6"
MIGRATION = "migrations/040_nomenclature_v2_initial_preset_catalog.sql"
MIG_HASH = "773811a472b08eaa44c114bb7af00b4479c27c3fd4242d726bc355c554a69bd6"
CATALOG = "docs/phase1_2f/B3_DEFINITION_CATALOG_CANONICAL.json"
CAT_HASH = "2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45"
MANIFEST = "ops/phase010/bootstrap.manifest"
RUNNER = "ops/phase011/run_database_bootstrap.sh"
SPEC = "docs/phases/active/PHASE_1_2F_B3B_RELEASE_ALIGNMENT.md"
RUNBOOK = "docs/phase1_2f/PHASE_1_2F_B3B_RELEASE_ALIGNMENT.md"
TOOL = "ops/phase010/b3b_release.py"
TOOL_PATHS = (SPEC, RUNBOOK, TOOL, "ops/phase010/test_b3b_release.py",
              "ops/phase010/test_b3b_release.sh", "ops/phase010/b3b_structure.sql",
              "ops/phase010/b3b_recovery.py", "ops/phase010/test_b3b_recovery.py",
              "ops/phase010/test_b3b_recovery.sh",
              "docs/phase1_2f/B3B_RECOVERY_SECURITY_AUTHORITY.md")
FIELDS = ("preset_code asset_type_code preset_version prefix separator include_branch "
          "include_building include_floor include_zone include_distribution include_housing "
          "include_placement context_mode sequence_scope seq_digits custom_segment_1 "
          "custom_segment_1_label custom_segment_2 custom_segment_2_label description active").split()
REQUIRED_TABLES = set("naming_rules assets nomenclature_branch_counters nomenclature_counters "
                      "audit_logs buildings floors zones internal_areas locations mdf_idf racks".split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    # Do not echo SQL, credentials, DSNs or arbitrary server error detail.
    require(result.returncode == 0, "SUBPROCESS_FAILED:" + Path(args[0]).name)
    return result.stdout


def git(repo, *args):
    return run(["git", "-C", str(repo), *args])


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"),
                       sort_keys=True, allow_nan=False) + "\n").encode()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def file_hash(path):
    return digest(Path(path).read_bytes())


# Only the exact PostgreSQL 16 constant-array rewrite observed in R4. No
# arbitrary casts/parentheses/whitespace removal, no routine-body rewriting.
VARCHAR_ARRAY = re.compile(r"\(ARRAY\[((?:'[A-Za-z0-9_]+'::character varying)(?:, '[A-Za-z0-9_]+'::character varying)*)\]\)::text\[\]")


def expression(value):
    if value is None:
        return None
    return VARCHAR_ARRAY.sub(lambda m: "ARRAY[" + ", ".join("(" + x + ")::text"
                              for x in m.group(1).split(", ")) + "]", value)


def normalized_raw(raw):
    lines = []
    for line in raw.decode().splitlines(keepends=True):
        if line.startswith(("\\restrict ", "\\unrestrict ")):
            continue
        # Raw classification only. Structural routine definitions remain exact.
        if line.lstrip().startswith(("CONSTRAINT ", "ADD CONSTRAINT ", "CREATE UNIQUE INDEX ")):
            line = expression(line)
        lines.append(line)
    return "".join(lines).encode()


def structure(db):
    sql = Path(__file__).with_name("b3b_structure.sql").read_text()
    records = db.query(sql)[0]
    # Field-local normalization of deparsed expressions only. All other fields,
    # especially pg_get_functiondef and ACL/owner/security, remain byte-exact.
    positions = {"column": [15], "constraint": [9], "index": [16, 17, 18],
                 "policy": [7, 8], "type": [9, 10]}
    for record in records:
        for index in positions.get(record[0], []):
            record[index] = expression(record[index])
    records.sort(key=canonical)
    return {"contract": "B3B_STRUCTURAL_V1", "payload": records, "hash": digest(canonical(records))}


def catalog(rows, expected):
    require(all(isinstance(r, list) and len(r) == 21 for r in rows), "INVALID_CATALOG_SHAPE")
    rows = sorted(rows, key=lambda r: (r[1].encode("utf-8"), r[2], r[0]))
    expected = sorted(expected, key=lambda r: r[1].encode("utf-8"))
    identities = {(r[0], r[1], r[2]) for r in expected}
    if not rows:
        state = "EMPTY"
    elif any((r[0], r[1], r[2]) not in identities for r in rows):
        # A collision with an approved code/type-version is a conflict, not an extra.
        collision = any((r[0], r[1], r[2]) not in identities and
                        any(r[0] == e[0] or r[1:3] == e[1:3] for e in expected) for r in rows)
        state = "CONFLICTING" if collision else "UNEXPECTED_ADDITIONAL_ROWS"
    elif len({(r[0], r[1], r[2]) for r in rows}) != len(rows) or any(r not in expected for r in rows):
        state = "CONFLICTING"
    else:
        state = "EXACT_IDENTICAL_ALREADY_PRESENT" if rows == expected else "PARTIAL_IDENTICAL"
    return {"classification": state, "count": len(rows), "field_match": rows == expected,
            "hash": digest(canonical(rows))}


def manifest(root):
    paths = (Path(root) / MANIFEST).read_text().splitlines()
    require(len(paths) == 32 and len(set(paths)) == 32 and paths[-1] == MIGRATION
            and paths[-2].startswith("migrations/039_"), "MANIFEST_CONTRACT")
    return {p: file_hash(Path(root) / p) for p in paths}


def package(repo, revision, root, selected=None):
    require(re.fullmatch(r"[0-9a-f]{40}", revision), "EXACT_COMMIT_REQUIRED")
    require(git(repo, "rev-parse", revision + "^{commit}").decode().strip() == revision,
            "COMMIT_MISMATCH")
    entries = {}
    for record in git(repo, "ls-tree", "-rz", revision).split(b"\0"):
        if not record:
            continue
        metadata, name = record.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        path = name.decode()
        if selected is None or path in selected:
            require(kind == "blob", "UNSUPPORTED_GIT_ENTRY")
            entries[path] = (mode, oid)
    if selected:
        require(set(entries) == set(selected), "TOOLING_PATH_MISSING_IN_COMMIT")
    root = Path(root)
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() or p.is_symlink()}
    require(actual == set(entries), "PACKAGE_PATH_DRIFT")
    require(not any(p.name == ".git" for p in root.rglob("*")), "PACKAGE_GIT_METADATA")
    hashes = {}
    for path, (mode, oid) in entries.items():
        p = root / path
        require(mode in ("100644", "100755", "120000"), "PACKAGE_MODE_UNSUPPORTED")
        require(p.is_symlink() == (mode == "120000"), "PACKAGE_TYPE_DRIFT")
        data = os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
        require(data == git(repo, "cat-file", "blob", oid), "PACKAGE_CONTENT_DRIFT:" + path)
        if not p.is_symlink():
            require(bool(p.stat().st_mode & 0o111) == (mode == "100755"), "PACKAGE_MODE_DRIFT")
        hashes[path] = digest(data)
    return {"source_sha": revision, "files": hashes, "tree_hash": digest(canonical(hashes))}


def r1(repo, app, tooling=None, tooling_sha=None):
    a = package(repo, APP, app)
    require(a["files"][MIGRATION] == MIG_HASH and a["files"][CATALOG] == CAT_HASH, "RELEASE_HASH")
    require(not any(re.match(r"migrations/0(?:4[1-9]|[5-9][0-9])_", p) for p in a["files"]),
            "MIGRATION_AFTER_040")
    manifest(app)
    runner = (Path(app) / RUNNER).read_text()
    require('[[ "$ledger" == 32 ]]' in runner and SCHEMA in runner, "RUNNER_EXPECTATION")
    changed = git(repo, "diff", "--name-only", OLD_API, APP, "--", "backend").decode().splitlines()
    api = [p for p in changed if not p.endswith("_test.go")]
    web = git(repo, "diff", "--name-only", OLD_WEB, APP, "--", "frontend").decode().splitlines()
    out = {"R1A": "PASS", "application": a, "api_runtime_delta": api,
           "web_runtime_delta": web, "deployed_provenance": "NOT_VERIFIED",
           "migration_source_sha": APP, "release_runner_source_sha": APP,
           "release_runner_sha256": a["files"][RUNNER], "R1B": "NOT_VERIFIED"}
    if tooling is not None:
        require(Path(app).resolve() != Path(tooling).resolve() and
                Path(app).resolve() not in Path(tooling).resolve().parents and
                Path(tooling).resolve() not in Path(app).resolve().parents, "PACKAGE_OVERLAY")
        out["tooling"] = package(repo, tooling_sha, tooling, TOOL_PATHS)
        out["R1B"] = "PASS"
    out["R1"] = "PASS" if out["R1B"] == "PASS" else "INCOMPLETE"
    return out


class DB:
    def __init__(self, container, database, user):
        for value in (container, database, user):
            require(re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", value), "INVALID_DB_TARGET")
        self.container, self.database, self.user = container, database, user

    def command(self, *args, data=None):
        return run(["docker", "exec", "-i", self.container, *args], data)

    def query(self, sql):
        statement = ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; "
                     "SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO, YMD'; "
                     "SET LOCAL extra_float_digits=3; SET LOCAL statement_timeout='60s'; "
                     + sql + "; ROLLBACK;")
        raw = self.command("psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", self.user,
                           "-d", self.database, data=statement.encode())
        return [json.loads(line) for line in raw.splitlines() if line]

    def schema_dump(self):
        return self.command("pg_dump", "-U", self.user, "-d", self.database,
                            "--schema-only", "--no-owner", "--no-privileges")

    def fingerprint(self):
        raw = self.schema_dump()
        return digest(b"".join(line for line in raw.splitlines(keepends=True)
                               if not line.startswith((b"\\restrict ", b"\\unrestrict "))))


def snapshot(db, app):
    validator = (Path(app) / "ops/phase011/validate_runtime_auth_role.sql").read_bytes()
    require(digest(validator) == "ba8b4c7852315745418a24ea7a2740d8ae458cb0a80369609941a9c6c4a25abe",
            "SECURITY_VALIDATOR_NOT_CANONICAL")
    # The pinned release validator consists of catalog-only assertions in DO,
    # not operational write probes. Enforce read-only at the DB transaction too.
    assertions = validator.decode().split("DO $$", 1)[1].rsplit("END $$;", 1)[0]
    db.query("DO $$" + assertions + "END $$; SELECT to_jsonb('SECURITY_PASS'::text)")
    # One read-only snapshot for ledger, catalog, security and all tenant tables.
    tables = db.query("SELECT coalesce(jsonb_agg(tablename ORDER BY tablename), '[]') "
                      "FROM pg_tables WHERE schemaname='public'")[0]
    require(REQUIRED_TABLES <= set(tables), "BASELINE_REQUIRED_TABLE_MISSING")
    tables = sorted(set(tables) - {"system_naming_presets", "production_bootstrap_migrations"})
    require(all(re.fullmatch(r"[a-z_][a-z0-9_]*", t) for t in tables), "UNSUPPORTED_TABLE_NAME")
    statements = [
        "SELECT jsonb_build_object('database',current_database(),'user',current_user,"
        "'version',current_setting('server_version'),'superuser',(SELECT rolsuper FROM pg_roles "
        "WHERE rolname=current_user),'cluster',(SELECT system_identifier::text FROM pg_control_system()),"
        "'database_oid',(SELECT oid FROM pg_database WHERE datname=current_database()))",
        "SELECT coalesce(jsonb_agg(jsonb_build_array(path,sha256) ORDER BY path), '[]') "
        "FROM public.production_bootstrap_migrations",
        "SELECT coalesce(jsonb_agg(jsonb_build_array(" + ",".join(FIELDS) + ") "
        "ORDER BY asset_type_code COLLATE \"C\",preset_version), '[]') FROM public.system_naming_presets",
        "SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,"
        "rolbypassrls,rolcreatedb,rolcreaterole) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'skia_%'),"
        "'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity,"
        "pg_get_userbyid(c.relowner),COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' "
        "THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner))::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n "
        "ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S')),"
        "'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,"
        "pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl::text) ORDER BY p.oid::regprocedure::text) "
        "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),"
        "'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p "
        "WHERE schemaname='public'),'memberships',(SELECT jsonb_agg(jsonb_build_array("
        "pg_get_userbyid(roleid),pg_get_userbyid(member),admin_option) ORDER BY roleid,member) FROM pg_auth_members),"
        "'direct_preset_select',has_table_privilege('skia_runtime','public.system_naming_presets','SELECT'))"
    ]
    for table in tables:
        statements.append("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE \"C\"),"
                          " '[]') FROM public.\"" + table + "\" t")
    data = db.query(";".join(statements))
    identity, ledger, rows, security = data[:4]
    require(identity["superuser"] is True, "ADMIN_VISIBILITY_REQUIRED")
    require(identity["version"].startswith("16.14"), "POSTGRES_16_14_REQUIRED")
    expected = manifest(app)
    actual = dict(ledger)
    exact = len(actual) == len(ledger) and all(expected.get(p) == h for p, h in ledger)
    pending = [p for p in expected if p not in actual]
    baseline = {table: {"count": len(values), "hash": digest(canonical(values))}
                for table, values in zip(tables, data[4:])}
    require(len(data[4:]) == len(tables), "BASELINE_INCOMPLETE")
    cat = catalog(rows, json.loads((Path(app) / CATALOG).read_bytes()))
    raw = db.schema_dump()
    fingerprint = digest(b"".join(line for line in raw.splitlines(keepends=True)
                                  if not line.startswith((b"\\restrict ", b"\\unrestrict "))))
    structural = structure(db)
    pre = exact and len(ledger) == 31 and pending == [MIGRATION]
    post = exact and len(ledger) == 32 and not pending and cat["field_match"] and cat["hash"] == CAT_HASH
    state = "PRE040_CHAIN_INCOMPLETE"
    if MIGRATION in actual:
        state = "ALREADY_APPLIED_VERIFIED" if post and fingerprint == SCHEMA else "INCIDENT"
    elif pre:
        state = "PRE040_ELIGIBLE_DB" if cat["classification"] == "EMPTY" and fingerprint == SCHEMA else "BLOCK_PROVENANCE_OR_SCHEMA"
    runtime = next((r for r in security["roles"] if r[0] == "skia_runtime"), None)
    secure = bool(runtime and runtime[1:] == [False, False, False, False] and
                  security["direct_preset_select"] is False)
    require(secure, "RUNTIME_SECURITY_DRIFT")
    return {"observed_at": stamp(), "application_release_sha": APP, "identity": identity,
            "ledger": ledger, "ledger_count": len(ledger), "ledger_checksums_exact": exact,
            "pending": pending, "040_count": sum(p == MIGRATION for p, _ in ledger),
            "pre040_chain_complete": pre, "schema": fingerprint, "catalog": cat,
            "classification": state, "baseline": baseline,
            "baseline_hash": digest(canonical(baseline)), "security": security,
            "security_hash": digest(canonical(security)), "runtime_security": "PASS",
            "structural": structural, "raw_reserialization_hash": digest(normalized_raw(raw))}


def stable(a, b):
    return (a["identity"] == b["identity"] and
            all(a[k] == b[k] for k in ("baseline", "ledger", "catalog", "schema", "security")))


def checkpoint(db, before, path):
    require(before["classification"] == "PRE040_ELIGIBLE_DB", "CHECKPOINT_NOT_PRE040")
    target = Path(path)
    require(not target.exists(), "CHECKPOINT_MUST_BE_NEW")
    data = db.command("pg_dump", "-U", db.user, "-d", db.database, "-Fc")
    require(data.startswith(b"PGDMP") and len(data) > 100, "INVALID_DUMP")
    listing = db.command("pg_restore", "--list", data=data)
    require(b"TABLE DATA" in listing, "CHECKPOINT_NOT_READABLE")
    with target.open("xb") as handle:
        os.chmod(target, 0o600)
        handle.write(data)
    return {"created_at": stamp(), "path": str(target.resolve()), "size": len(data),
            "sha256": digest(data), "source": before, "restore_verified": False}


def verify_restore(cp, restored):
    source = cp["source"]
    require(restored["identity"]["cluster"] != source["identity"]["cluster"] or
            restored["identity"]["database_oid"] != source["identity"]["database_oid"], "RESTORE_NOT_ISOLATED")
    require(file_hash(cp["path"]) == cp["sha256"], "CHECKPOINT_HASH_CHANGED")
    for key in ("ledger", "catalog", "baseline", "structural", "security"):
        require(source[key] == restored[key], "RESTORE_MISMATCH:" + key)
    require(source["schema"] == SCHEMA and restored["ledger_count"] == 31
            and restored["ledger_checksums_exact"], "RESTORE_CONTRACT")
    require(source["raw_reserialization_hash"] == restored["raw_reserialization_hash"],
            "UNCLASSIFIED_RAW_SCHEMA_DIFFERENCE")
    identities = list(cp.get('verified_restore_identities', []))
    if restored['identity'] not in identities:
        identities.append(restored['identity'])
    return dict(cp, restore_verified=len(identities) >= 2,
                verified_restore_identities=identities,
                restored_identity=restored["identity"], verified_at=stamp(),
                restored_raw_hash=restored["schema"], structural_hash=restored["structural"]["hash"],
                raw_difference="POSTGRESQL_CANONICAL_EXPRESSION_RESERIALIZATION"
                if source["schema"] != restored["schema"] else "NONE")


def components(repo, api_container, web_container, api_sha, web_sha):
    result = {"observed_at": stamp(), "application_release_sha": APP}
    for name, container, sha in (("api", api_container, api_sha), ("web", web_container, web_sha)):
        require(re.fullmatch(r"[0-9a-f]{40}", sha), "COMPONENT_SHA_REQUIRED")
        raw = json.loads(run(["docker", "inspect", container]))[0]
        image = raw["Config"]["Image"]
        image_id = raw["Image"]
        image_info = json.loads(run(["docker", "image", "inspect", image_id]))[0]
        # An image tag alone is not build provenance. Require OCI revision label.
        labels = image_info["Config"].get("Labels") or {}
        require(labels.get("org.opencontainers.image.revision") == sha, "IMAGE_BUILD_PROVENANCE_UNVERIFIED")
        require(raw["State"].get("Health", {}).get("Status") == "healthy", "COMPONENT_UNHEALTHY")
        compatible = False
        if name == "api":
            compatible = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", MIN_API, sha],
                                        capture_output=True).returncode == 0
        result[name] = {"source_sha": sha, "image": image, "image_id": image_id,
                        "digests": image_info.get("RepoDigests", []), "health": "healthy",
                        "restart_count": raw["RestartCount"], "compatible": compatible}
    return result


def guard(pre, stability, cp, component, r1_evidence):
    require(r1_evidence["R1"] == "PASS", "R1_REQUIRED")
    for observation in (pre, component):
        age = (datetime.datetime.now(datetime.timezone.utc) -
               datetime.datetime.fromisoformat(observation["observed_at"])).total_seconds()
        require(0 <= age <= 300, "STALE_EVIDENCE")
    require(pre["classification"] == "PRE040_ELIGIBLE_DB", "PRE040_DB_REQUIRED")
    require(pre["pre040_chain_complete"] and pre["ledger_count"] == 31 and
            pre["040_count"] == 0 and pre["pending"] == [MIGRATION] and
            pre["ledger_checksums_exact"], "PENDING_MIGRATIONS_NOT_EXACT_040")
    require(pre["schema"] == SCHEMA and pre["catalog"]["classification"] == "EMPTY", "PRE040_STATE")
    require(stability["status"] == "STABLE_OBSERVED" and stable(stability["last"], pre), "WRITE_STABILITY")
    require(cp["restore_verified"] is True and stable(cp["source"], pre), "CHECKPOINT_REQUIRED")
    require(file_hash(cp["path"]) == cp["sha256"], "CHECKPOINT_CHANGED")
    require(component["application_release_sha"] == APP and component["api"]["compatible"] is True
            and component["api"]["health"] == "healthy" and component["web"]["health"] == "healthy", "API_ALIGNMENT")
    return {"R5_ELIGIBLE": "YES", "pending": [MIGRATION], "EXECUTION_PERFORMED": "NO",
            "scope": "PRECONDITION_EVIDENCE_ONLY_NOT_AUTHORIZATION", "checked_at": stamp()}


def post040(db, before, after, expected):
    require(after["classification"] == "ALREADY_APPLIED_VERIFIED", "POST040_CONTRACT")
    for key in ("identity", "baseline", "security", "schema"):
        require(before[key] == after[key], "POST040_DELTA:" + key)
    codes = "ARRAY[" + ",".join("'" + r[1] + "'" for r in expected) + "]::text[]"
    result = db.query("SET LOCAL ROLE skia_runtime; SELECT jsonb_build_array("
                      "(SELECT count(*) FROM public.read_active_system_naming_presets(" + codes + ")),"
                      "(SELECT count(*) FROM public.read_active_system_naming_presets_v2(" + codes + ")),"
                      "(SELECT count(*) FROM unnest(" + codes + ") c CROSS JOIN LATERAL "
                      "public.read_system_naming_preset_v2(c,1) r WHERE r.lookup_status='FOUND_ACTIVE'))")[0]
    require(result == [0, 12, 12], "READER_CONTRACT")
    return {"R6": "PASS", "readers": result, "tenant_delta": "ZERO", "privilege_delta": "NONE",
            "FIRST_V2_ACCEPTANCE_AUTHORIZED": "NO", "DO_NOT_REEXECUTE": True}


def load(path):
    return json.loads(Path(path).read_text())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=["r1", "snapshot", "stability", "checkpoint", "verify-restore", "components", "guard", "r6"])
    p.add_argument("--repo")
    p.add_argument("--application")
    p.add_argument("--tooling")
    p.add_argument("--tooling-sha")
    p.add_argument("--container")
    p.add_argument("--database")
    p.add_argument("--user")
    p.add_argument("--interval", type=float, default=2)
    for name in ("before", "after", "checkpoint", "stability", "components", "r1", "dump", "api-container", "web-container", "api-sha", "web-sha"):
        p.add_argument("--" + name)
    a = p.parse_args()
    if a.action == "r1":
        value = r1(a.repo, a.application, a.tooling, a.tooling_sha)
    elif a.action == "components":
        value = components(a.repo, a.api_container, a.web_container, a.api_sha, a.web_sha)
    elif a.action == "verify-restore":
        value = verify_restore(load(a.checkpoint), load(a.after))
    elif a.action == "guard":
        value = guard(load(a.before), load(a.stability), load(a.checkpoint), load(a.components), load(a.r1))
    else:
        db = DB(a.container, a.database, a.user)
        if a.action == "snapshot":
            value = snapshot(db, a.application)
        elif a.action == "stability":
            require(0.1 <= a.interval <= 30, "INTERVAL_RANGE")
            first = snapshot(db, a.application)
            time.sleep(a.interval)
            last = snapshot(db, a.application)
            value = {"status": "STABLE_OBSERVED" if stable(first, last) else "UNSTABLE",
                     "last": last, "interval_seconds": a.interval, "global_quiescence_guaranteed": False}
        elif a.action == "checkpoint":
            provenance = r1(a.repo, a.application, a.tooling, a.tooling_sha)
            require(provenance['R1'] == 'PASS', 'CHECKPOINT_TOOLING_PROVENANCE_REQUIRED')
            before = snapshot(db, a.application)
            value = checkpoint(db, before, a.dump)
            value['recovery_contract'] = {
                'tooling_source_sha': a.tooling_sha,
                'application_sha': APP,
                'artifacts': provenance['tooling']['files'],
                'contract': 'HF3_PRECREATE_RESTORE_ACL_VERIFY_TWO_TARGETS'}
            require(stable(before, snapshot(db, a.application)), "CHECKPOINT_CONCURRENT_CHANGE")
        else:
            value = post040(db, load(a.before), snapshot(db, a.application),
                            load(Path(a.application) / CATALOG))
    sys.stdout.buffer.write(canonical(value))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        # Only our bounded labels, never raw backend/subprocess diagnostics.
        label = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Za-z0-9_:./-]+", str(error)) else "INVALID_INPUT_OR_IO"
        print(json.dumps({"status": "BLOCKED", "reason": label}))
        sys.exit(1)
