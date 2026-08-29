# Phase 1.2D-B3B2 — Migration 027 implementation

Candidate SHA-256 after final correction:
`72e973c30bb2267caf6198ad62830bd61ea32cdfc5a61578c8a7f24457566f59`.

Migration 027 adds the minimum durable import-row identity and canonical asset
linkage plus five narrowly scoped SECURITY DEFINER functions. Runtime retains
zero direct staging table/sequence privileges and receives exact EXECUTE only.

The existing `UNIQUE(import_id,row_number)` remains the sole row-identity
authority. `normalized_row_hash` is a content fingerprint, not a row-version
key; the redundant three-column unique index was removed. Claim requires the
server-supplied expected hash to equal the persisted non-null fingerprint.
COMMITTING/COMMITTED rows cannot change that fingerprint.

The authoritative row table remains `inventory_import_rows`; `import_items` is
unchanged legacy parser output. Existing rows retain NULL hashes and are not
rewritten. The canonical asset FK is `canonical_asset_id -> assets(id) ON
DELETE RESTRICT`; completion additionally verifies tenant and branch in the
function.

The interface supports scoped read/claim, atomic completion/failure and derived
header state. Functions are owned by `skia_migrator`, use
`search_path=pg_catalog,pg_temp`, schema-qualify objects, revoke PUBLIC and open
no transaction. Claim uses `FOR UPDATE` and completion participates in the
caller's domain transaction.

The canonical bootstrap ledger becomes 19. Migration 027 does not close an
application bypass: B3B handlers are intentionally unchanged and 23 bypasses
remain. No migration 028, frontend, RLS or production change is included.

## Validation evidence

- PostgreSQL 16.14 fresh bootstrap through 027: PASS.
- Second checksum-ledger bootstrap: PASS; ledger count 19.
- Runtime direct staging SELECT/UPDATE: DENIED.
- Runtime function EXECUTE and cross-scope non-disclosure: PASS.
- PUBLIC function EXECUTE: DENIED.
- Concurrent double claim: SERIALIZED.
- Second commit returns the existing asset: PASS.
- Outer transaction rollback restores state and attempt count: PASS.
- Legacy NULL hash rows and physical-model fixture: PASS.
- Runtime role validator: APPROVED.
- `go vet ./...` and `go build ./...`: PASS.
- `go test ./...`: only the accepted preexisting
  `TestGenerateInternalCodeUsesLockedSequence` mismatch remains; no new failure.
