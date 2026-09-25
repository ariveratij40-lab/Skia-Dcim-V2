# Post035 disposable baseline — separate build authority

Purpose: `POST035_DISPOSABLE_BASELINE_ONLY`. No production deployment authority.
Tooling base: `e42f9b757c884aabc8770df83fb83b93e2ba36df`.
Historical source: `c5b90598d0d9ab52482e09ea0bcdb582cb4fad07`.
Historical tree: `3d3bc885447114dfd57f1084608454f893d58f33`.

## Historical image boundary

Image `sha256:12bd6c00ac0171e9ade2283ca459f584e368ea39f2d0cdc141c2f26e96afc4d1`
must never start in these tests. The existing image contains a compiled database
credential fallback. Its protected archive is forensic evidence only; neither it
nor extracted binaries are build inputs. Quarantine is an execution prohibition,
not a claim that Docker provides an immutable quarantine mechanism. No credential
validity test or rotation is authorized. Separate rotation review remains required.

Source/runtime correlation is historical release evidence plus Git and the exact
source string found in the historical binary. It is not source-to-binary build
attestation for that historical image. No secret value appears in this contract.

## Independent versioned authority

`ops/phase010/post035_baseline_policy.json` binds all 418 historical tracked paths,
Git modes and blob identities, exact commit/tree, exclusions and output inventories.
The immutable source archive must match that full inventory before transformation.
The sanitized projection contains only historical compilation/build inputs, nested
under backend/. Excluded backups and credential-bearing binaries are not copied
into the sanitized projection. The flat Docker context contains the same bytes.
No historical source is vendored into the current product tree.

`post035_baseline_transform.py` independently defines transformation version 1.
Only derived backend/database_roles.go changes: remove the compiled fallback;
require DATABASE_URL; validate nonempty DSNs using the existing lib/pq parser
without connecting. Restricted mode retains three explicit distinct identities.
Nonrestricted mode preserves legitimate migrator/onboarding inheritance from the
explicit runtime DSN. Whitespace-only and malformed values reject without echoing
input. SQL/RLS and everything after the configuration function remain byte-identical.
No dependency, route, migration, tenant/branch or product behavior is backported.

The transformation removes the old declaration structurally only after exact input
hash validation. It never contains or emits the removed secret. Applying it twice
or to changed input rejects. Output hashes are independently pinned in the policy;
runtime derivation cannot regenerate its own authority.

The existing 3ee4da51 build policy/generator are unchanged. These are different
authorities, not alternative source arguments to the production derivation tool.

## Exact evidence, 2026-09-25 UTC

| Artifact | SHA256 |
| --- | --- |
| Transformation | `631a3ef0ac064ba1ec482cbf75b3d571f0ce5ca51bfefbb3cd3ae079d54af0ca` |
| Separate policy | `6175345360376493edccd12d2aadfc8677f6a71d091377be3b173ed1b3adf237` |
| Sanitized source, both independent runs | `7d578e783531839a4ee6a33c5c6148b850f9021a010ae0c2499513a1b2d33ccc` |
| Build context, both independent runs | `62e37bd99b455207f704d31ccf8efea227fb43f292a77f7df5b57e5864eadc39` |
| Historical Dockerfile, unchanged | `fd288cc55fe8320604020527ad9717a7c2d9a7b10a2fb717ae9b0249cd84c23f` |

Hash encoding: sorted JSON keys, compact separators, UTF-8, trailing LF. Inventory
records sorted by path bind SHA256 and executable/nonexecutable Git modes. Source
authority additionally uses Git blob IDs and full tree. Context output normalizes
modes to 0644/0755 and timestamps to epoch zero. Source/context hashes refer to
inventories, not transport tar serialization.

No build arguments, secret mounts or supplied build environment are permitted.
Unknown files, changed files, symlinks, special files and mode drift reject.
Historical backups/binaries, image.tar, forensic/transfer artifacts, .env, dumps
and sessions are excluded by exact inventory, not merely filename heuristics.
The scanner additionally rejects explicit credential patterns; it is not proof
against all possible encoded/obfuscated secrets. Protected/quiescent local source
directories are a prerequisite, not an adversarial concurrent-writer sandbox.

Historical Dockerfile is used unchanged. Its mutable golang/alpine references,
apk/pip repositories and Go module download/tidy mean this gate certifies source
and context reproducibility, **not bitwise image reproducibility**. No dependency
files are edited; future dependency-resolution drift can fail a new build and must
not silently change the reviewed image identity.

Built tag: `skia-post035-disposable-baseline:62e37bd99b455207`.
Built image: `sha256:e0cf4ae2c366d0511fd863637dcb89025e0e6f13a4f5f722726f6439b1d39966`.
Archive SHA256: `2897db571f9d9ca0a8e169334462d5f5ba5579c6f87503176b65f66ffee4201c`.
Build timestamp: `2026-09-25T04:36:14.102399+00:00`.
Provenance binds source/tree/transformation/source inventory/policy/context/
Dockerfile/image ID/time, with production_authorized=false. The harness re-audits
the archive and verifies provenance and loaded image before start.

## Executed validation

- Sixteen governance tests cover independent derivation, wrong source/tree,
  unexpected source, wrong transformer, repeated/nonapplicable transformation,
  unauthorized source change, sanitized/Dockerfile drift, forbidden artifacts,
  explicit secret patterns, unknown build arguments, context drift, SQL boundary,
  policy tampering, symlinks and unexpected empty directories.
- Go configuration tests passed missing/empty/whitespace/malformed inputs for all
  three required restricted-mode DSNs, positive synthetic configuration, optional
  inheritance and rejection of shared restricted identities. They perform no DB IO.
- All-layer/config/history audit: zero credential DSNs, zero historical fallback,
  no unresolved scanned token/private-key payloads, no application runtime data.
  Application layer contains only app/skia-api. Library key-marker constants are
  not private key payloads. Audit remains a bounded static scan.
- Exact sanitized image without config on network=none exits 1 with required-DSN
  rejection. Initial diagnostic incorrectly inspected stdout only; corrected
  stdout+stderr classification confirmed the expected failure, not an API regression.
- Fresh fixture `skia-activation-test-034df92d4c7e`, private 10.0.0.64/28,
  canonical post035 bootstrap and second bootstrap passed: ledger27/catalog0.
  API startup/health and baseline-appropriate authenticated and guarded reads passed.
  Full deterministic business baseline before/after startup and reads matched.
- The **same continuous fixture** completed CLOSE, baseline stop, zero-client
  quiescence, protected checkpoint, two restores, U0, exact 036/037/038/039 prefixes,
  post039 evidence, activation authority, exact reviewed API/WEB, descriptor update/
  verification and OPEN. Final integrated runtime and baseline preservation passed.
  Post039 uses reviewed API 1c373469..., never this disposable historical baseline.
  MODEL_B and Redis runtime environment assembly use synthetic authorities only.
- Nine persisted recovery-evidence negatives passed on cloned evidence from that
  same fixture; no target databases were created by rejected cases. Added explicit
  checkpoint consumption TOCTOU, reserved-authority reentry, descriptor TOCTOU,
  incomplete journal and post039 semantic-negative tests passed in the unit suite.
- A final suite run exposed a timing flaw in an existing local negative test:
  issued_at=now+1 could become valid before its assertion. The fixture now uses
  now+60; no production expiry logic was relaxed. Final regression after this
  test-only correction: 183 tests, 182 passed, one explicit B3B_DISPOSABLE-gated
  integration skip. The fresh continuous Docker rehearsal ran separately and passed.
  Python syntax and tracked/new-file whitespace checks passed.

The parent operational-closure final accounting is recorded in
OPERATIONAL_CLOSURE_FINAL_EVIDENCE.md. A successful baseline or continuous E2E
alone is not authorization to publish or execute a production window.
The subsequent final inventory used production read-only access. No production
mutation, login renewal, checkpoint, migration or deployment occurred.
Fresh authenticated session remains a separate prerequisite for future final V3.

## Usage and rollback boundary

From two independently extracted exact historical Git archives, use
`post035_baseline_build.py derive`, then `context`, then `verify-context`.
Only after governance/configuration tests pass may `post035_baseline_image.py`
build, save and audit locally. It never starts containers. The operational fixture
accepts the resulting evidence directory through `--baseline-evidence`, rechecks
authority/audit, and uses the image only before migration 036.

Stop on drift or audit failure. Do not retag as production, patch the historical
image, execute the contaminated binary, rotate credentials or deploy. Recovery
from a failed local derivation/build is to preserve evidence and stop; no automatic
production action or cleanup follows. Local commit remains conditional on the full
parent HF, and publication requires separate authorization.
