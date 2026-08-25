# Runtime release provenance

## Problem

The production Compose contract previously tagged both application images with
one `SOURCE_SHA`. That value becomes ambiguous as soon as an API-only or
web-only release is deployed: one Git commit cannot truthfully identify both
containers when their source revisions differ.

`SOURCE_SHA` is therefore retired as a release authority. It is not accepted by
the canonical Compose file and must not be exported by current procedures. An
existing operational `runtime/SOURCE_SHA` is a legacy, non-authoritative
artifact; remove or archive it during the next separately authorized runtime
rollout. Its presence must never be used to identify either active service.

## Authorities and derived artifacts

- `ops/phase011/docker-compose.production.yml` is the canonical, versioned
  production Compose contract.
- `ops/phase011/RELEASE.env.example` is the versioned shape of the release
  manifest; its zero values are placeholders and are not a deployable release.
- `/opt/apps/skia/prod/runtime/docker-compose.production.yml` is the deployed
  copy of the canonical contract.
- `/opt/apps/skia/prod/runtime/RELEASE.env` is the operator-maintained manifest
  for the selected API and web image tags. It contains no secrets.
- `/opt/apps/skia/prod/secrets/production.env` remains the separate secret
  source and must never be committed or copied into `RELEASE.env`.

The database schema is deliberately absent from `RELEASE.env`.
`production_bootstrap_migrations`, populated by the deterministic PHASE-010
bootstrap, remains the canonical migration ledger. No reliable, independent
`DB_SCHEMA_HEAD` authority exists, so adding one would create drift.

## Manifest contract

Create `runtime/RELEASE.env` with exact lowercase 40-character Git SHAs:

```dotenv
API_SOURCE_SHA=<commit used to build skia-api-prod>
WEB_SOURCE_SHA=<commit used to build skia-web-prod>
```

Neither variable has a fallback. Compose fails before resolving the model if
either value is absent. Validate the manifest and Compose interpolation with:

```sh
ops/phase011/validate_release_provenance.sh \
  runtime/RELEASE.env runtime/docker-compose.production.yml
```

## Provenance chain and inspection

The traceable chain is:

```text
Git commit
  -> image built and tagged skia-api-prod:<API_SOURCE_SHA>
     or skia-web-prod:<WEB_SOURCE_SHA>
  -> exact tag recorded in runtime/RELEASE.env
  -> Compose resolves the service image
  -> container runs that immutable selected image
```

Before an authorized deployment, inspect the resolved contract without starting
containers:

```sh
docker compose --env-file runtime/RELEASE.env \
  -f runtime/docker-compose.production.yml config --images
```

After deployment, compare the manifest with `docker inspect` image references
and digests. `RELEASE.env` records intended source commits and selected tags; it
does **not** prove build reproducibility, record image digests, describe database
schema state, contain secrets, or prove which containers are currently active.

## Partial releases

For a frontend-only release, retain the active `API_SOURCE_SHA` and update only
`WEB_SOURCE_SHA`. Build/tag and recreate only the frontend service under a
separately authorized deployment procedure. Backend rebuilding or retagging is
not required.

For a backend-only release, retain the active `WEB_SOURCE_SHA` and update only
`API_SOURCE_SHA`; build/tag and recreate only backend. Account for the existing
frontend dependency/health relationship during the authorized rollout, but do
not change the web image tag.

Every manifest edit must be atomic and validated before Compose is allowed to
act. Record the previous pair before changing it.

## Independent rollback

- API rollback: restore the previous `API_SOURCE_SHA`, retain the current
  `WEB_SOURCE_SHA`, validate, then recreate only backend.
- Web rollback: restore the previous `WEB_SOURCE_SHA`, retain the current
  `API_SOURCE_SHA`, validate, then recreate only frontend.

A rollback changes the selected image tag; it does not roll back database
migrations. Database rollback remains governed by the bootstrap migration
ledger and its own explicit procedure.
