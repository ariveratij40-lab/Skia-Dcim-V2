# Phase 1.2D test matrix

| Gate | Required evidence |
|---|---|
| Tenant isolation | foreign Zone/Location/MDF/Housing invisible and rejected |
| Branch isolation | same-tenant other-Branch references rejected; GUC and asset Branch agree |
| Zone scope | direct Branch, optional Building, optional Floor; mismatched parents rejected |
| Building/Floor optional | initial readiness and Zone creation pass without them |
| MDF/IDF without Rack | operational distribution creation succeeds with Zone only |
| RACK/CABINET Housing | identical scope validation, distinct DTO type |
| Housing-required asset | missing/foreign Housing blocked before sequence reservation |
| Housing-not-required asset | Zone placement succeeds without fabricated Rack |
| UPS policy | default ZONE; metadata-required HOUSING; legacy JSON never becomes write authority |
| Cross-tenant Housing | 404/422 fail-closed and no sequence consumed |
| Cross-branch Zone | rejected by resolver/FK/RLS |
| Preview purity | counter/rule `last_seq` unchanged; no asset rows/locks |
| Apply recommended | second call unchanged; used/custom conflict preserved; zero sequences |
| Readiness derivation | data changes change response; no persisted readiness flag |
| Readiness decomposition | physical, onboarding and per-type states differ correctly |
| V1 dual-read | existing InternalArea Location remains readable; new writes use Zone |
| RLS/FORCE | restricted runtime, no BYPASSRLS, exact grants |
| Transaction rollback | failure after reservation leaves no asset/satellite/audit and no consumed sequence |
| HTTP authority | body/query/header Tenant/Branch spoofing cannot alter session scope |
| Concurrency | 12+ creates per scope produce unique codes; distinct scopes independent |
| Placement vocabulary | all six 023 values handled; NULL/unknown fail closed; no `UNPLACED_ALLOWED` |
| FREE_PLACEMENT | only structured Zone/Housing target; arbitrary strings and cross-scope targets rejected |
| Relationship endpoints | same-Branch authorized; dual membership required inter-Branch; cross-Tenant, missing and non-MDF/IDF rejected |
| Relationship context | `backbone_links.branch_id` and client Branch fields never authorize endpoints |
| UPS spoofing | request subtype/legacy JSON cannot change default ZONE; authoritative persisted metadata can require HOUSING |

Run `go test ./...`, `go vet ./...`, frontend typecheck/build for touched UI, PostgreSQL 16 ephemeral bootstrap, exact-role validators and `git diff --check`.
