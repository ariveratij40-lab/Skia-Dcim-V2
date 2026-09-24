# P0 remediation — design and disposable validation only

Base c8504f21e24d9bf898ed675c6aac9128db9942ff. Production execution is not authorized.
Fixture A stays post035: reproduce exact historical eight-owner/ACL drift,
repair in one transaction, validate canonical structural hash and preservation.
Fixture B independently bootstraps post035 then applies only036–039, ledger31,
and exercises exact API3ee4da51 with synthetic configuration. No040/041.

Repair authority is eight exact pg_proc identities and the full observed drift
hash. Reject any other source, owner/ACL/body/overload/ledger/catalog/raw change.
Take a transaction-scoped advisory lock; operator exclusivity remains required.
Change owners and explicitly restore canonical ACLs as skia_migrator. Validate
the complete structural/security payload inside the same transaction, before
COMMIT. Any exception rolls back; no automatic retry or restore. Production
execution is intentionally disabled in this candidate; separately reviewed
execution authorization is required. No function body or migration changes.

Recommended configuration model B: derive URLs in memory from the existing
three password component names and independently inspected Docker topology.
Use the fixed canonical PostgreSQL container hostname; verify postgres alias
and canonical hostname identify the same container on the approved network.
Do not add duplicate complete URL secrets or accept arbitrary active-container
environment as authority. Percent-encode password components, require exact
three roles/database/port/sslmode. No URL/password in argv, stdout, stderr,
journals or reports; pass generated environment only via Docker stdin.
This gate prototypes the model in disposable fixtures; it does not modify the
production executor's accepted configuration contract or secrets.

Publication conditional on all required matrices passing. No production repair,
login, checkpoint, admission, isolation, deployment or container replacement.

## Seven-file review package

| Path | Classification |
|---|---|
| ops/phase010/p0_security_repair.py | Structural remediation tooling; disposable execution only |
| ops/phase010/p0_config_model.py | Configuration-generation tooling; production disabled |
| ops/phase010/test_p0_remediation.py | Fresh fixture A validation harness |
| ops/phase010/test_p0_fixture_b.py | Independent fresh fixture B validation harness |
| ops/phase010/test_p0_security_matrix.py | Routine/security/negative integration tests |
| ops/phase010/test_p0_config_model.py | Configuration and secret-hygiene unit tests |
| docs/phases/active/PHASE_1_2F_P0_REMEDIATION.md | Active specification, authority manifest, evidence |

The ledger precondition compares the exact first 27 path/checksum pairs of the
reviewed bounded manifest: 035 occurs once; 036–040 cannot be present. Structural
hashes bind every routine signature, full pg_get_functiondef, owner and ACL.
The following SHA256 values additionally identify each UTF-8 pg_get_functiondef
on PostgreSQL16.14 (identity order matches the manifest below):

```text
assert_canonical_asset_housing(uuid)=7271d6bac8ce2179d4abe2e7477ef1ea70ec0576efd60833115ce9bdc71ff6d1
enforce_canonical_backbone()=1176a2b881f04a9abcc2d433ff9e37ca81019186688f2711f6934d8beaf0f36d
enforce_canonical_hierarchy_final_state()=c85574fd12b25455225939a5912960451f7a2216de31ba2396cee203fc17ea1e
enforce_canonical_hierarchy_lifecycle()=1568120c2d04e2366e900e42b98809ba526026f166c704ce0cb9a5fb2e0f70e3
enforce_canonical_housing_final_state()=e3273b0a83a813f8eb28eadd1f69a583a9f8123894455af055dd09ec95c906b4
enforce_mdf_idf_physical_identity_final_state()=de88fdb71b330aed90f7357788741b7203c3184e67c6895b1c4688682f978035
enforce_mdf_idf_physical_identity_lifecycle()=5c312b300deab10ddbd038a0be4c560cdb672210ee8c08dbb5d1ac9f7625b102
provision_canonical_zone_naming_rules()=412af54572a73247033e5d472751ab5febf35d5ee7e0500a75a884082ce58698
```

P0 startup is NOT APPLICABLE. Candidate startup is applicable only to post039 B.
The negative ledger test inserts a synthetic 036 ledger marker inside rollback;
it does not execute migration036 on A. All historical fixtures remain intact.

## Exact routine security manifest

All identities are in schema `public`, `prokind=f`. Live-like owner is
`skia_bootstrap`; canonical owner is `skia_migrator`. All eight have fixed
`search_path=pg_catalog, pg_temp`; PUBLIC and onboarding have no direct EXECUTE.
ACL A is `{skia_bootstrap=X/skia_bootstrap,skia_runtime=X/skia_bootstrap}` before
and `{skia_migrator=X/skia_migrator,skia_runtime=X/skia_migrator}` after.
ACL B is `{skia_bootstrap=X/skia_bootstrap}` before and
`{skia_migrator=X/skia_migrator}` after. Bootstrap retains administrative
superuser access, not an additional canonical ACL grant.

| Routine | Identity arguments | SECURITY DEFINER | ACL |
|---|---|---|---|
| assert_canonical_asset_housing | p_asset_id uuid | false | A |
| enforce_canonical_backbone | empty | false | B |
| enforce_canonical_hierarchy_final_state | empty | false | B |
| enforce_canonical_hierarchy_lifecycle | empty | false | B |
| enforce_canonical_housing_final_state | empty | false | B |
| enforce_mdf_idf_physical_identity_final_state | empty | false | B |
| enforce_mdf_idf_physical_identity_lifecycle | empty | false | B |
| provision_canonical_zone_naming_rules | empty | true | B |

The SECURITY DEFINER trigger is not directly callable by runtime/onboarding.
Its existing tenant AFTER INSERT attachment invokes the unchanged body, which
checks session_user, derives NEW.id, sets/restores transaction-local tenant
context and inserts only missing MDF/IDF naming rules. Repair lowers ownership
from bootstrap superuser to restricted migrator; it adds no caller privileges.
Onboarding-trigger execution was exercised with SET SESSION AUTHORIZATION and
two expected rules, with the entire fixture transaction rolled back.

## Disposable evidence

Fixture A `skia-p0-278f3a43e1c3-a`: exact drift
`19d3ecd3062980f27efbb8b0101d1342a8b1824b8fc58a3a3d58412ed4866854`, repaired
`7d6bfb8e958bc13700c2bbcd11fce71bcaa1489cc1e01accaddba3b87f5805be`;
raw `8712fcae88f98f7c75605772ab88cbeb52d06e022c07a8782b045e33caec0c10`.
Ledger27/catalog0 preserved. Injected failures after owners 1/4/8 fully rolled
back. Shared source guard rejected ledger, structural, missing routine, owner,
ACL, overload, partial repair, target-role escalation and body mutations;
each injection itself was also rolled back. Raw mismatch/reentry rejected.
32 direct EXECUTE checks passed: trigger invocation by privileged roles reaches
the PostgreSQL trigger-only guard (0A000), unauthorized callers receive 42501.

Fixture B `skia-p0-6af953492bf7-b` independently bootstrapped canonical post035.
Reviewed bounded migration implementation processed 036/037/038/039 only;
each prefix passed the reviewed raw/structural contract, ledger27→28→29→30→31.
040 count0, catalog0. Final raw
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Exact API image `sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507`
and WEB `sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03`
passed health, unauthenticated guards and authenticated representative GETs.
V1/V2/exact readers passed, three DB identities observed, direct preset SELECT
and audit CRUD denied, runtime NOBYPASSRLS. Generated DSNs/passwords absent from
candidate logs. Synthetic reads preserved the full business baseline.

## Network and configuration decision

Read-only host IPv4 routes/LAN/interfaces/VPN inventory and Docker IPAM showed
no allocated 10/8 range; LAN is 192.168.100/24. No kubectl contexts were present.
Selected/probed internal 10.0.0.0/29 (six usable addresses): gateway + PG + API +
WEB + optional client + spare. Probe was removed; no historical fixture retired,
no volume/image removed, daemon unchanged. Fixture harness requires an explicit
reviewed subnet argument rather than automatic pool allocation.

Model B is the recommended supply design. Existing Compose constructs URLs for
skia_runtime/skia_migrator/skia_onboarding from SKIA_RUNTIME_DB_PASSWORD,
SKIA_MIGRATOR_DB_PASSWORD and SKIA_ONBOARDING_DB_PASSWORD. Database skia_prod,
port5432, sslmode=disable; service DNS postgres. The executor's fixed canonical
hostname skia_postgres_prod is a topology contract, not a separate database.
Both names resolved to the same PG fixture address. Unresolvable hostname was
rejected (EAI_AGAIN on the isolated internal network). Production topology must
be freshly verified again before any future execution.

Model A would make Compose evaluation/active environment an additional secret
authority. Model C duplicates complete secrets and requires persistent edits.
Model B requires future reviewed assembly integration but no new secret names,
no secret-component changes and no Compose change. Candidate container replacement
remains a separately authorized activation step AFTER post039 validation and
authorization, not part of P0 repair. This prototype deliberately rejects all
production invocation. Existing activation tests reject post035/missing evidence
or authorization before container actions. No production activation readiness
is asserted by this local rehearsal.

## Fresh pre-publication regression

Fresh A `skia-p0-340e3abd1940-a` reproduced the exact drift and canonical hashes;
three failure boundaries, full negative matrix including synthetic 036 ledger,
32 EXECUTE checks and rollback-only onboarding trigger passed.
Fresh B `skia-p0-be305d5c8d3b-b` used independent reviewed subnet10.0.0.8/29,
without retiring or reusing the prior network. Prefix checks 28/29/30/31, exact
candidate API/WEB health, authenticated reads, V1/V2/exact readers, three DB
identities, privileges, DNS negatives and secret-log scans passed.
The reviewed activation authorization/evidence guard executes before candidate
creation and rejects post035 fingerprints/ledgers, security failure and missing
authorization. No production executor authority is added.
Complete Python tooling suite: 127 tests, 126 PASS, one explicitly gated skip.
Migration036–040 and backend/frontend unchanged; migration041 absent.
These are technical validation results for review, not approval to execute in
production. Production repair and model-B production invocation stay disabled.
