# Phase 1.2F — API build context governance

## Authorized contract and scope

Base: `b48a79c780a0ad2444b81ee6f4e12260ca2b4a4d`.
Branch: `phase/1.2f-api-build-context-governance`.
This tooling-only gate versions the reviewed derivation contract previously
available only as local evidence. It does not build an image, contact a VPS,
change application code, run migrations or authorize activation. The explicit
Product Owner authorization is the scope for this governance correction.

Application runtime authority remains
`3ee4da51fcd7c5f026fda389158b5e13df6e0c64`, not current main. The previously
reviewed upgrade tooling SHA `b4c6dea975871dde0238115cb06d9f44e6fde59c` is a
separate identity; this PR will have its own reviewed tooling identity.

## Versioned authority

- `ops/phase010/api_build_context_policy.json`: complete pinned source inventory,
  required build paths, content SHA256, Git modes and exclusion classifications.
- `ops/phase010/derive_api_build_context.py`: strict CLI and derivation rules.
- `ops/phase010/test_api_build_context.py`: golden, negative and redaction tests.

The policy is byte-identical to reviewed evidence. Governance metadata lives
in this document, not inside the hash-pinned JSON. Both POLICY_RULESET_HASH and
VERSIONED_POLICY_ARTIFACT_SHA256 are
`d65ea50d5c04fccdfe78317ecf8cd274bd282cf45e8243d1a0bafe80b351fed7`.
No local evidence path is required at execution time. Repository authority is
versioned; merge/review and remote reconstruction remain separate gates.

## Original generator audit and promotion

Original inputs were Git objects at the exact runtime commit. `git ls-tree -r`
ordering supplies the inventory order, separately retained for included and
excluded entries. Required inputs are all 55 non-test top-level backend Go
compilation units plus Dockerfile, go.mod and go.sum (58 total). The package has
no go:embed, go:generate or import-C directives requiring additional inputs.
The unchanged Dockerfile builds the main Go package; Go modules remain external
build dependencies. This is context reproducibility, not a claim of bitwise
image reproducibility with mutable base images/package repositories.

422 excluded entries retain deterministic precedence: the two historical
binaries; backups/.backup/.bak; test files; migration SQL; then files outside the
API package. The last category is a reviewed source-specific exclusion, not
permission to admit arbitrary new files. Any source/policy change requires a new
review. Historical SQL/code backups, runtime data and credential-bearing binaries
never enter the context. They are not removed from Git in this gate.

The original generator's absolute output directory was incidental, not hash
authority. Promotion replaces it with explicit CLI paths. Original Git blob
bytes are preserved without line-ending conversion. Original symlink handling
was implicit; the promoted contract explicitly rejects all symlinks, submodules,
special files and unexpected directories. No selected golden path is a symlink.
No secret value is needed for derivation or hashing.

## Hash and filesystem contract

Policy schema has exactly source_sha, included, excluded. Included records have
exactly source, target, mode, sha256, classification; excluded records have path
and classification. Unknown fields, duplicate JSON keys, duplicate source/target
paths, absolute/traversal paths and altered policy bytes fail closed.

Serialization is Python standard JSON with sort_keys=True, separators=(',', ':'),
default ensure_ascii=True, UTF-8 encoding and exactly one trailing LF. Lists retain
Git tree traversal order; keys are sorted. Paths are POSIX relative paths. The
context hash is SHA256 of this serialization of the included list, not a tar hash:

`a48c12ee67f604de833df5d5eb8f94d938f9b7d3a7e4e557c64075487cbc58c9`.

Each included record binds file bytes through SHA256 and Git mode 100644/100755.
Source provenance additionally checks every file against the exact Git blob OID
(Git SHA-1 repository), inventory and executable bit. Archive group-write/umask
differences do not change Git mode authority. Setuid/setgid/sticky bits are denied.
Output modes are normalized to 0644/0755; timestamps are set to epoch zero and
are not hashed. Directories are not hash records; only expected source ancestors
are allowed. Destination must not exist and cannot be inside source. Required
bytes are retained in memory after validation, before output is created.

Python 3.9+ standard library and Git are required. No Docker, PostgreSQL, network,
absolute runtime paths or temporary evidence dependency is needed. Source input
is an explicit clean extracted Git archive directory, separate from the tooling
checkout. The generator does not extract untrusted archives or assume checkout
HEAD is runtime authority. Keep source/output private and quiescent while running;
this CLI is not a sandbox against a concurrent malicious filesystem writer.

## Usage and provenance

From an authorized repository containing the exact runtime Git object, create a
new source directory from `git archive 3ee4da51fcd7c5f026fda389158b5e13df6e0c64`.
Then run (paths are operator-supplied, output must not exist):

```sh
python3 ops/phase010/derive_api_build_context.py \
  --repo "$REPOSITORY_PATH" \
  --source-dir "$CLEAN_RUNTIME_SOURCE" \
  --source-sha 3ee4da51fcd7c5f026fda389158b5e13df6e0c64 \
  --output "$NEW_CONTEXT_PATH"
```

Repeat with an independently extracted archive and separate output path.
The provenance chain is runtime SHA → Git tree/archive content → versioned policy
and generator commit → derived context hash → exact Dockerfile → future image
ID/digest. Dockerfile SHA256 is
`fd288cc55fe8320604020527ad9717a7c2d9a7b10a2fb717ae9b0249cd84c23f`.
Archive serialization hashes are separate transport identities. The failed SSH
transfer remains FAILED_NO_PROGRESS; this PR does not relabel or retry it.

## Hygiene and failure behavior

The fixed source inventory and hashes prevent unreviewed credential-bearing
content from being admitted. An additional bounded scanner rejects credential
DSNs, private-key markers, AWS access-key patterns and suspicious literal secret
assignments. It is not a universal secret detector. Errors expose only constant
codes, not matched values, source contents or Git stderr. Synthetic redaction
tests use non-live sentinels. Runtime environment variable names are not secrets.
Every validation occurs before output creation; IO failure can leave partial new
output, which must never be built and must not be overwritten on retry.

## Validation evidence and boundaries

Run `PYTHONDONTWRITEBYTECODE=1 python3 ops/phase010/test_api_build_context.py`.
Two fresh independent Git archives at distinct filesystem locations reproduce the
exact hash, with tooling executing from the newer governance checkout. Tests
recompute the output hash from actual bytes/modes and verify exact Dockerfile.
Negative matrix covers missing/modified/unexpected files, modes, escaping symlinks,
traversal/absolute/duplicate paths, excluded backups and both tracked binaries,
unknown policy fields, wrong runtime/policy SHA and existing output. Secret
rejection and CLI redaction are tested. Initial harness portability failures
(Python tar filter availability and Git archive group-write modes) were corrected
without changing the golden policy or context hash; final suite passes.

No backend/frontend/runtime or migration files change. Migrations 036–040 remain
byte-identical; 041 remains absent. The 13 historical untracked documents are
outside publication scope. No Go or DB rehearsal is needed for these Python-only
tools. No VPS, image build, deployment or lockstep occurs. Rollback is to stop
using the new tooling; no live state is changed. A revert, merge or deployment
requires its own authorization. Image build and remote reconstruction remain
blocked pending the separate review/authorization gates.
