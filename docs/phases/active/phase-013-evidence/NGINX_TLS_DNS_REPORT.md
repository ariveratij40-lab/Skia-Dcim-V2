# PHASE-013 — Nginx, TLS and DNS report

## Intended hostname

`skia.mx` (with existing `www.skia.mx` CNAME to `skia.mx`).

## DNS observed

- Authoritative nameservers: `ns65.domaincontrol.com`, `ns66.domaincontrol.com`.
- `skia.mx A`: `50.63.7.248`.
- `skia.mx AAAA`: absent.
- `skia.mx CNAME`: absent.
- `www.skia.mx CNAME`: `skia.mx`, TTL 3600.
- Authorized VPS: `108.175.9.162`.

DNS therefore points to an existing external Apache/PHP host, not to the SKIA
VPS. HTTP returns 301 to HTTPS and HTTPS returns 302 to `/v7`.

The available browser reached GoDaddy authentication but had no active session.
No DNS connector/API/authorized CLI was available. Credentials were neither
sought nor recovered. No record was changed.

## Current external TLS

- Subject: `CN=skia.mx`.
- SAN: `skia.mx`, `www.skia.mx`.
- Issuer: Let's Encrypt `YR1`.
- Valid: 2026-08-12 through 2026-11-10.

This certificate is served by the current external host and is not present on
the SKIA VPS.

## VPS Nginx

- `global_nginx`: healthy; public listeners 80/443.
- Effective `nginx -t`: successful, with inherited deprecation warnings only.
- Existing SKIA staging server blocks remain bound to `skia.iamet.mx` and
  `mvp.skia.iamet.mx`, targeting `skia_api_staging`/`skia_web_staging`.
- No effective `skia.mx` server block exists.
- No `/etc/letsencrypt/live/skia.mx` certificate exists on the VPS.
- Global Nginx is not connected to `skia_prod_internal`; production container
  names are not currently resolvable from it.
- The PHASE-011 dark template is not enabled and its loopback upstreams are not
  usable from the Nginx container. It was not installed or altered.

Effective hashes preserved in evidence:

- global `nginx.conf`: `4a049de93d6ded4dd6a549770f73e9c3072422a0aa1fc36817690d1d307c7ecd`;
- SKIA staging config: `39a7d62c7e5671e37dbba4a50516ef2c4c76c9d2de87ab6b096a09252039e7e5`;
- dark template: `7634bd1c6d8b56f7f94f59dcc08a3d7fb4ec986600e64e048ace2461f3ab6e27`.

Server-side activation remains pending DNS access, certificate issuance and a
reviewed production server block using Docker-network upstreams.
