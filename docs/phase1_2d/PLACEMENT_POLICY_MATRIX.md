# Placement policy matrix

Canonical persisted policies from migration 023: `BRANCH`, `ZONE`, `MDF_IDF`, `HOUSING`, `FREE_PLACEMENT`, `RELATIONSHIP_ONLY`. `NULL` remains legacy/unclassified and fail-closed for V2 creation.

- `BRANCH`: structured session-authorized Branch scope; no lower physical object is universal.
- `ZONE`: active canonical Zone.
- `MDF_IDF`: active scoped distribution point and its canonical physical chain.
- `HOUSING`: active RACK/CABINET and its distribution/physical chain.
- `FREE_PLACEMENT`: one controlled structured mode selected by authoritative metadata; never free text or JSON authority.
- `RELATIONSHIP_ONLY`: physical meaning comes from independently resolved and authorized endpoints.

| Type | Class | Policy | Zone | MDF/IDF | Housing | RACK/CABINET | Creation gate |
|---|---|---|---:|---:|---:|---|---|
| MDF | PHYSICAL_CONTAINER | ZONE | yes | no | no | n/a | active Zone + rule |
| IDF | PHYSICAL_CONTAINER | ZONE | yes | no | no | n/a | active Zone + rule |
| RACK | PHYSICAL_CONTAINER | MDF_IDF | via parent | yes | no | RACK | active distribution + rule |
| Cabinet concept | PHYSICAL_CONTAINER | MDF_IDF | via parent | yes | no | CABINET | same storage path as Rack |
| SWITCH | ACTIVE_EQUIPMENT | HOUSING | via housing | yes | yes | either | valid housing + rule |
| SERVER | ACTIVE_EQUIPMENT | HOUSING | via housing | yes | yes | either | valid housing + rule |
| PDU | ACTIVE_EQUIPMENT | HOUSING | via housing | yes | yes | either | valid housing + rule |
| PATCH_PANEL | PASSIVE_INFRASTRUCTURE | HOUSING | via housing | yes | yes | either | valid housing + rule |
| UPS | ACTIVE_EQUIPMENT | ZONE by default; HOUSING when authoritative metadata requires it | yes | conditional | conditional | either | backend resolver decides; UI asks only if metadata insufficient |
| NODE | ENDPOINT | ZONE | yes | no | no | n/a | active Zone + rule |
| CCTV | ENDPOINT | ZONE | yes | no | no | n/a | active Zone + rule |
| AC_UNIT | ACTIVE_EQUIPMENT | ZONE | yes | no | no | n/a | active Zone + rule |
| FIREWALL | ACTIVE_EQUIPMENT | HOUSING | via housing | yes | yes | either | valid housing + rule |
| BACKBONE | RELATIONSHIP | RELATIONSHIP_ONLY | endpoints | no | no | n/a | valid MDF/IDF endpoints, each same-tenant and branch-authorized |

Access Point and passive cable are not canonical AssetTypes in migration 014. Do not synthesize policy rows until their storage/handler contract exists. PATCH_PANEL and backbone cover only part of those concepts.

Approved interpretation: ZONE never implies MDF/IDF; MDF_IDF requires a scoped distribution point; HOUSING requires scoped Housing and its valid distribution chain. Individual handlers may not invent different prerequisites.

UPS defaults to ZONE. A request subtype or legacy JSON cannot change that policy. Only authoritative catalog/subtype metadata may select another supported structured policy. Access Point and other future flexible types may use `FREE_PLACEMENT` only after that metadata contract exists.
