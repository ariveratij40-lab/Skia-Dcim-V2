# PHASE-010 — Import Jobs Schema Decision

## Status

**IMPLEMENTED FOR CLEAN BOOTSTRAP**

Every job has mandatory tenant, branch and user attribution. Branch ownership
uses a composite FK; `user_id` has exactly one restrictive FK. Detail rows
inherit mandatory tenant/branch context, reference the scoped parent, and
cascade only with deletion of that parent.

This defines empty-database state only and does not reconcile STAGING FKs.
