# PHASE-011 — VPS Production Preflight Report

## Result

**APPROVED — STAGE A**

- Host/operator: `ubuntu` / `alvaro`.
- Baseline: `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.
- VPS time observed: `2026-08-22T15:08:21Z`.
- Docker Server: `29.5.0`.
- Root filesystem: 232 GiB total, 45 GiB available (81% used).
- Memory: 7.8 GiB total, 5.3 GiB available; swap present.
- `/opt/apps/skia/prod`: absent before provisioning.
- Planned loopback ports 13001/18081 and resource names: free.
- No pre-existing SKIA production container, network or volume detected.

STAGING was observed read-only and remained untouched. Its checkout is a dirty,
historically evolved tree at a different repository/SHA, reinforcing use of the
exact canonical main archive. Reverse proxy is containerized as `global_nginx`;
no DNS/TLS change was attempted.
