"""HF3 disposable recovery only. No post-restore ownership repair."""
import json
import re
import subprocess
from pathlib import Path
import b3b_release as b

FUNCTIONS = [
    ["public", name, args, "uuid", "skia_bootstrap"]
    for name, args in (
        ("uuid_generate_v1", ""), ("uuid_generate_v1mc", ""),
        ("uuid_generate_v3", "uuid, text"), ("uuid_generate_v4", ""),
        ("uuid_generate_v5", "uuid, text"), ("uuid_nil", ""),
        ("uuid_ns_dns", ""), ("uuid_ns_oid", ""),
        ("uuid_ns_url", ""), ("uuid_ns_x500", ""))]
ROLES = [
    ["skia_bootstrap", True, True, True, True, True, True, True],
    ["skia_migrator", True, False, False, False, False, False, False],
    ["skia_onboarding", True, False, False, False, False, False, False],
    ["skia_runtime", True, False, False, False, True, False, False]]


def name(value):
    b.require(isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value),
              "INVALID_DATABASE_TARGET")
    return value


def execute(db, sql, variables=None):
    args = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", db.user,
            "-d", db.database]
    for key, value in (variables or {}).items():
        args += ["-v", key + "=" + str(value)]
    return db.command(*args, data=sql.encode())


def roles(db):
    actual = db.query("""SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,
      rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls)
      ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'skia_%';
      SELECT count(*) FROM pg_auth_members WHERE
      pg_get_userbyid(member) LIKE 'skia_%' OR pg_get_userbyid(roleid) LIKE 'skia_%';""")
    b.require(actual == [ROLES, 0], "ROLE_PRECONDITIONS")


def extensions(db, pre=False):
    actual = db.query("""SELECT jsonb_agg(jsonb_build_array(extname,nspname,
      pg_get_userbyid(extowner),extversion) ORDER BY extname)
      FROM pg_extension JOIN pg_namespace ON extnamespace=pg_namespace.oid;""")[0]
    expected = [["plpgsql", "pg_catalog", "skia_bootstrap", "1.0"]]
    if not pre:
        expected += [["uuid-ossp", "public", "skia_migrator", "1.1"]]
    b.require(actual == expected, "EXTENSION_MATRIX")
    if not pre:
        members = db.query("""SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,
          oidvectortypes(p.proargtypes),pg_get_function_result(p.oid),pg_get_userbyid(p.proowner))
          ORDER BY p.proname) FROM pg_extension e JOIN pg_depend d
          ON d.refclassid='pg_extension'::regclass AND d.refobjid=e.oid AND d.deptype='e'
          JOIN pg_proc p ON d.classid='pg_proc'::regclass AND p.oid=d.objid
          JOIN pg_namespace n ON n.oid=p.pronamespace WHERE e.extname='uuid-ossp';
          SELECT count(*) FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
          WHERE d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname='uuid-ossp';""")
        b.require(members == [FUNCTIONS, 10], "EXTENSION_FUNCTION_MATRIX")


def prepare(source, target):
    """Only a new isolated DB; preserve explicit source locale/owner/encoding."""
    name(target)
    b.require(source.user == 'skia_bootstrap', 'CANONICAL_ADMIN_REQUIRED')
    b.require(target != source.database, "TARGET_NOT_ISOLATED")
    roles(source)
    extensions(source)
    meta = source.query("""SELECT jsonb_build_object('owner',pg_get_userbyid(datdba),
      'encoding',pg_encoding_to_char(encoding),'collation',datcollate,'ctype',datctype,
      'provider',datlocprovider,'icu',daticulocale) FROM pg_database
      WHERE datname=current_database();""")[0]
    b.require(meta['owner'] == 'skia_migrator' and meta['provider'] == 'c'
              and meta['icu'] is None, "UNSUPPORTED_TARGET_LOCALE_CONTRACT")
    # CREATE DATABASE intentionally has no IF NOT EXISTS. Existing targets stop.
    execute(source, """SELECT format('CREATE DATABASE %I OWNER skia_migrator TEMPLATE template0 '
      'ENCODING %L LOCALE_PROVIDER libc LC_COLLATE %L LC_CTYPE %L',
      :'target', :'encoding', :'collation', :'ctype') \gexec
    """, dict(meta, target=target))
    db = b.DB(source.container, target, source.user)
    extensions(db, pre=True)
    b.require(db.query("SELECT count(*) FROM pg_class c JOIN pg_namespace n "
                       "ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' "
                       "AND n.nspname <> 'information_schema'") == [0],
              'TARGET_NOT_EMPTY')
    execute(db, """BEGIN;
      SET LOCAL ROLE skia_migrator;
      CREATE EXTENSION "uuid-ossp" WITH SCHEMA public VERSION '1.1';
      COMMIT;""")
    extensions(db)
    return db, dict(meta, name=target, template="template0")


def acl(db, requested):
    name(requested)
    b.require(db.user == 'skia_bootstrap', 'CANONICAL_ADMIN_REQUIRED')
    b.require(db.query("SELECT to_jsonb(pg_get_userbyid(datdba)) FROM pg_database "
                       "WHERE datname=current_database()") == ['skia_migrator'],
              'DATABASE_OWNER_PRECONDITION')
    roles(db)
    extensions(db)
    # psql literal quoting plus format %I; target assertion is inside transaction.
    execute(db, """BEGIN;
      SELECT set_config('b3b.recovery_target', :'target', true);
      DO $guard$ BEGIN
        IF current_setting('b3b.recovery_target') <> current_database() THEN
          RAISE EXCEPTION 'DATABASE_TARGET_MISMATCH';
        END IF;
      END $guard$;
      SELECT format('GRANT CONNECT ON DATABASE %I TO skia_runtime, skia_onboarding',
        current_database()) \gexec
      COMMIT;""", {"target": requested})


def restore(source, cp, target):
    b.require(b.file_hash(cp['path']) == cp['sha256'], "CHECKPOINT_HASH_CHANGED")
    db, contract = prepare(source, target)
    # Normal archive behavior; never clean/filter/suppress errors.
    result = subprocess.run(['docker', 'exec', '-i', db.container, 'pg_restore',
                             '-U', db.user, '-d', target, '--exit-on-error'],
                            input=Path(cp['path']).read_bytes(), capture_output=True)
    b.require(result.returncode == 0, 'PG_RESTORE_FAILED_RC_' + str(result.returncode))
    contract['pg_restore_exit_code'] = result.returncode
    contract['pg_restore_stderr'] = 'EMPTY' if not result.stderr else 'NONEMPTY_REQUIRES_REVIEW'
    b.require(not result.stderr, 'RESTORE_STDERR_REQUIRES_REVIEW')
    extensions(db)
    acl(db, target)
    return db, contract
