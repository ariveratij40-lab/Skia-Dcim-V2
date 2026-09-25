# Phase 1.2F — runtime environment preservation HF

Authorized base: `8aee9bf1709f1083de062eb3320a5541e9e372aa`.
Scope: activation tooling, disposable tests, documentation. No production changes.

## Ratified authority and rollback boundary

Redis is infrastructure preservation, NOT a candidate application dependency.
The exact Go source `3ee4da51fcd7c5f026fda389158b5e13df6e0c64` does not consume
REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/JWT_SECRET and has no Redis client dependency.
`REDIS_APPLICATION_SMOKE=NOT_APPLICABLE` is explicitly ratified by the operator.
Disposable Redis authentication/connectivity tests remain mandatory.

Live read-only Compose/topology establishes `REDIS_HOST=redis`,
`REDIS_PORT=6379`, aliases `redis` and `skia_redis_prod` on `skia_prod_internal`,
no published Redis port. Never infer a host IP. REDIS_PASSWORD remains sourced
once from the existing protected secret authority; no secret duplication.
Assembly adds only the two governed nonsecret names after topology verification.
Conflicting configured host/port, incomplete assembly, missing password or aliases
fail closed. Production preflight also compares the reviewed preserved names to
the current API, without copying its environment or outputting values.

No runtime is changed by this HF. Rollback is not executed; discard/unmerge a
review candidate only through separate authorization. Existing post039 evidence,
short-lived activation authorization and old-writer isolation remain mandatory.

## Environment inventory at the exact candidate source

Active API names by category (values omitted except governed public topology):

- DATABASE: DATABASE_URL, MIGRATOR_DATABASE_URL, ONBOARDING_DATABASE_URL,
  SKIA_REQUIRE_RESTRICTED_RUNTIME_DB.
- REDIS: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (infrastructure compatibility).
- JWT/AUTH: JWT_SECRET (preserved compatibility, not consumed by candidate).
- OAUTH: GOOGLE_REDIRECT_URL. Candidate assembly additionally has governed
  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- PUBLIC_URL/HOST: FRONTEND_URL; candidate assembly additionally has APP_BASE_URL.
- UPLOADS: UPLOADS_DIR.
- APPLICATION_MODE: APP_ENV, PORT.
- OPTIONAL image-provided runtime: PATH (not copied from the old container).
- OTHER_REQUIRED_RUNTIME: none found. No additional stale name removed.

Candidate source environment requirements:

- REQUIRED for restricted operation: DATABASE_URL, MIGRATOR_DATABASE_URL,
  ONBOARDING_DATABASE_URL; SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true is the governed
  deployment gate (source otherwise defaults false).
- CONDITIONAL OAuth: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET; GOOGLE_REDIRECT_URL
  and FRONTEND_URL are defaulted in source but explicitly governed in deployment.
- DEFAULTED and explicitly assembled: PORT, UPLOADS_DIR, APP_BASE_URL, APP_ENV.
- CONDITIONAL outside this release's core contract: GROQ_API_KEY, OPENAI_API_KEY
  (AI providers), ADMIN_PASSWORD (inventory clear), RESEND_API_KEY (email delivery).
  None present in the active API inventory; no new authority is introduced here.
- OPTIONAL/DEFAULTED provider settings: OLLAMA_URL, AI_MODEL, OPENAI_API_BASE.
- CONDITIONAL non-production cookie override: SESSION_COOKIE_SECURE; APP_ENV=
  production bypasses this override and enforces secure cookies.
- Not consumed: Redis names and JWT_SECRET. They are preserved as infrastructure
  compatibility, not mislabeled as application requirements.

The name diff is exactly REDIS_HOST/REDIS_PORT for infrastructure preservation.
No other missing core required runtime name was found. No HTTP/frontend/database
change or new Redis application path is authorized.

## Local validation evidence

Fresh disposable fixture `skia-p0-49740752f107-b`, isolated internal network
`skia-activation-test-e8db1bb51bea` (`10.0.0.24/29`, reviewed against local
Docker allocations and host routes): canonical post035 PASS, migrations036–039
PASS, ledger31,040excluded, catalog0. Post039 raw fingerprint:
`e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
Exact existing API/WEB candidate images started healthy without rebuild.
Authenticated reads, unchanged tenant baseline, distinct three DB identities,
runtime privilege checks and V1/V2/exact readers PASS.

Redis infrastructure AUTH/PING succeeded using disposable random credentials;
wrong-password AUTH and unauthenticated PING were denied. No host port published.
Application Redis smoke is NOT_APPLICABLE. The fixture does not add a Redis
application client. Fixtures remain isolated; no unrelated fixture cleanup.

Tooling suite:144 tests,143 PASS,1 explicitly gated skip. Negative cases cover
missing/empty/wrong host, missing/empty/malformed/wrong port, missing password,
alias/network/port topology mismatch, conflicting source configuration and valid
MODEL B/OAuth with incomplete Redis authority. Transition authorization remains
independent and fail-closed. No production access or fresh production/session
recertification is included in this local test run; prior observations are not
represented as fresh certification. No push, PR, activation or deployment.
