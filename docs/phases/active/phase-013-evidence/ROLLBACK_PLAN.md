# PHASE-013 — Prepared traffic rollback plan

No rollback was executed because no cutover mutation occurred.

For a future authorized cutover, preserve the observed pre-cutover state:

- restore `skia.mx A` to `50.63.7.248` if DNS was changed;
- preserve `www.skia.mx CNAME skia.mx`;
- restore/remove only the new production Nginx server-block file from its exact
  pre-cutover backup/hash;
- validate with `docker exec global_nginx nginx -t` and gracefully reload;
- disconnect `global_nginx` from `skia_prod_internal` only if that connection was
  created by the failed cutover;
- recheck dark production and STAGING health.

Rollback scope is traffic only. No PostgreSQL, Redis, RLS, secret or image
rollback applies because those resources are outside PHASE-013 mutation scope.
