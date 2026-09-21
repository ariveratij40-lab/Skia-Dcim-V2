# 036–039 harness observability and prospective stability

## Authority and immutable historical incident

Authorized runtime/canonical base: `3ee4da51fcd7c5f026fda389158b5e13df6e0c64`.
Scope: test harness, diagnostic tooling and evidence only. No runtime, migration,
runner or manifest changes; no VPS, production, build, lockstep or Migration 040.
Publication is authorized after validation; merge is not authorized.

The original incident remains **UNRESOLVED_HISTORICAL_FAILURE**:

- Stage: `RESUME_STRUCTURE_VERIFICATION_AFTER_037`.
- Starting prefix: `POST036_LEDGER28`.
- Original stderr and exit code: `NOT_RETAINED`.
- Failed container: `skia-upgrade-matrix-57755`, removed by the original EXIT trap.
- Actual failed DB state: unavailable; ledger29 is inferred from control flow,
  not a measurement of the lost database.
- Original log: `/tmp/skia-recert.89DCY4/upgrade.log`, SHA256
  `c88f82e03f7f069e4bf5b8431754ba77f415875bdfe970e4f09fbb6dba5dd9de`.
- Contemporaneous containerd deadlines and health-check timeouts were retained,
  but no causal link to the failed command was proven.

Subsequent diagnostic reproductions passed; they do not resolve that cause.
One diagnostic-only print failed after a successful resume; separate direct
verification confirmed that result. This is not rewritten as an end-to-end
diagnostic-script PASS.

**HARNESS_OBSERVABILITY_DEFECT=YES** is a separate conclusion: the old wrapper
discarded child stderr/exit codes and cleanup removed the failed fixture before
diagnosis. It does not establish that the harness caused the migration failure.

## Test-only implementation

`upgrade_harness_diagnostics.py` is imported only by the disposable test harness.
The bounded runner and shared B3b modules remain byte-identical. Opt-in wrappers
retain failed subprocess metadata and drain session stderr without changing SQL,
locks, quiescence, deadlines, fingerprints or prefix classification.

Bundles use a versioned JSON schema, sorted keys and exclusive file creation.
Timestamps/container identities naturally differ between runs. They contain
projected inspect state, image identity, redacted stdout/stderr, target-filtered
events, daemon availability, and independent read-only DB probes. A failed probe
is recorded as unavailable, not replaced with inferred PASS. No arbitrary SQL,
argv, inspect environment values, business rows, dumps or structural bodies are
included in diagnostic bundles. Environment variable names only are retained.

Secret hygiene is fail-closed: only exact non-secret operational error lines
survive; every unrecognized line is entirely redacted, including unlabeled
secrets. PostgreSQL DETAIL/STATEMENT and Docker attribute payloads are not exposed.
Structured DB evidence is limited to ledger/counts and schema/structure hashes.
This intentionally trades free-form error detail for secret safety.

Failure captures evidence before any cleanup and preserves the failed local
container/database. Successful runs remove only their uniquely named containers
and associated anonymous volumes; evidence/checkpoints remain locally. No old
containers, historical evidence or untracked repository documents are cleaned.
The shell fallback captures failures during fixture setup as well.

## Prospective validation contract

Run `bash ops/phase010/test_upgrade_036_039_stability.sh` on local Docker with
PostgreSQL `16.14-alpine`. Each invocation constructs a fresh historical post035
canonical bootstrap, independent container/anonymous volume and no published
port. Cycles do not reuse mutable fixtures. Within a prefix matrix, each prefix
is independently cloned from its untouched post035 source.

1. Controlled division-by-zero read-only failure at post036; assert retained
   exit code, classification, identity/state, ledger28, raw/structural hashes,
   empty catalog, timestamp and stage.
2. Ten independent post036→post039 cases, with idempotent second execution.
3. Three complete independent five-prefix matrices (15 results).
4. Direct structural validation for every result, exact live fingerprints,
   ledger31, each036–039 once, zero040 and empty catalog.
5. Original negative runner matrix and governed checkpoint/two-restore tests.
   `regression` mode stops before the historical API-image test; it explicitly
   reports tooling-only coverage, never a new runtime recertification.
6. Pure observability/redaction and B3b guard/classifier tests; shell/Python
   syntax and diff checks. Full B3b seeded rehearsal is not run: this gate
   prohibits executing040. Product Go tests need not repeat for harness-only
   changes; previously established runtime evidence remains separate.

The prospective policy permits `PASS_WITH_UNRESOLVED_HISTORICAL_FAILURE` only
after all required new evidence passes. It never changes the original incident
to environmental, fixture-related, resolved or PASS. Any new unexplained failure
blocks publication/readiness. No automatic retry converts a failed case to PASS.

Rollback of this test-only change is a reviewed Git revert; it does not require
database rollback. Failure fixtures remain for inspection until a separately
scoped cleanup decision. This gate performs no production recovery operation.

## Final validation record

Final series (2026-09-21): `/tmp/skia-upgrade-stability.HgpbkT`, exit0.
No harness/tooling file changed during this final series.

| Case | Result |
| --- | --- |
| Exact iteration01 | PASS |
| Exact iteration02 | PASS |
| Exact iteration03 | PASS |
| Exact iteration04 | PASS |
| Exact iteration05 | PASS |
| Exact iteration06 | PASS |
| Exact iteration07 | PASS |
| Exact iteration08 | PASS |
| Exact iteration09 | PASS |
| Exact iteration10 | PASS |
| Prefix cycle1 (27,28,29,30,31) | 5/5 PASS |
| Prefix cycle2 (27,28,29,30,31) | 5/5 PASS |
| Prefix cycle3 (27,28,29,30,31) | 5/5 PASS |

Every result has ledger31, each036–039 once, zero040, catalog0, direct structure
PASS and raw fingerprint
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Every starting prefix matches the unchanged manifest's live raw and structural
hashes. No restore-normalized hash substitutes for a live fingerprint.

- Controlled SQL failure retention PASS: exit3, division-by-zero classification,
  running container identity, ledger28, exact raw/structure, catalog0, timestamp
  and stage. Redacted stdout/stderr are retained before success cleanup.
- Additional intentional invalid-mode test exited1; both Python failure and
  shell-exit bundles retained ledger27/catalog0 and a running DB. Evidence:
  `/tmp/skia-upgrade-matrix.IuWBXv/diagnostics`. Container remains preserved.
  Its actual synthetic password was checked in memory and is absent from both
  bundles; no value was printed.
- Five pure observability/redaction tests PASS. Four B3b pure tests PASS; seeded
  disposable B3b test explicitly skipped because040 is prohibited here.
- Full tooling-only regression PASS, including rollback during each036–039,
  exactly one competing executor, advisory-lock denial, undrained-client denial,
  bad ledger/hash/checksum/catalog/manifest rejection, terminal post039 failure,
  two independent restores and governed checkpoint creation/recovery.
- Python AST, shell syntax and `git diff --check` PASS. Go suite not repeated:
  no runtime source/dependency changes. Prior API recertification is reused only
  under the explicit prospective governance decision.
- No unexpected Docker failures/OOM or unexplained new failure in the final
  series. Target events and redacted container diagnostics are retained per run;
  Docker's event retention is best-effort, not an exhaustive daemon audit trail.
- Original failure log remains byte-identical. The thirteen historical untracked
  documents are untouched and excluded from publication.

`PROSPECTIVE_TOOLING_STABILITY=PASS`.
`TOOLING_REGRESSION_GATE=PASS_WITH_UNRESOLVED_HISTORICAL_FAILURE`.
`ORIGINAL_FAILURE_CAUSE_RESOLVED=NO`.
Runtime candidate remains `3ee4da51fcd7c5f026fda389158b5e13df6e0c64`;
clean API build requires separate authorization; lockstep remains unauthorized.

Preliminary series `/tmp/skia-upgrade-stability.4oN0YO` completed ten exact
cases and three five-prefix cycles, but the orchestrator exited2 before the
negative regression phase. The implementation session changed the still-running
shell file to format iteration numbers, invalidating its read position and
causing `unexpected EOF while looking for matching quote`. The final on-disk
script passes `bash -n`. This agent-caused preliminary execution failure is
preserved, not counted as an overall PASS. The final series restarts from a
fresh fixture with no tooling edits during execution.

Unchanged bounded runner SHA256:
`09e6984f63cf1b5387a0ffdf42fbcc817c21068f919dad4e5bfc77be3077d7e0`.
Unchanged bounded manifest SHA256:
`f97244ec5c65b52c407653f090d061e8f3c6ee4a641a14fa93ffcf04256bae23`.
