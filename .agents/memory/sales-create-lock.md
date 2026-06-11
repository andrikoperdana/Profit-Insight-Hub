---
name: Sales project-creation lock
description: Why SALES stays in writeRoles even though Sales manual project creation is hard-blocked
---

Rule: Sales users create projects ONLY via the Sales Pipeline lead-convert route
(`POST /api/leads/:id/convert`). The manual `POST /api/projects` path is hard-blocked
for SALES with a 403 placed INSIDE the POST handler (after the `requireRole(...writeRoles)`
middleware, before `prisma.project.create`).

**Do NOT remove SALES from `writeRoles`** (`artifacts/api-server/src/lib/projectValidators.ts`)
to "tidy up the redundant permission." That list is shared by both `POST /projects` and
`PATCH /projects/:id`. Sales must keep editing their own DRAFT projects via PATCH, so
removing SALES there silently breaks Sales DRAFT editing (PATCH starts returning 403).

**Why:** Once create is blocked, SALES in writeRoles looks dead/redundant — a tempting
cleanup that has no visible effect on create but breaks the PATCH edit path.

**How to apply:** Keep the lock in the POST handler only. The convert route enforces
`plannedMandays > 0` itself, so the initial estimated cost still can't be bypassed.
Web side: `/projects/new` redirects SALES to `/leads` unless opened with `?leadId=`;
the leads page links there per eligible lead.

Unrelated but bit me here: the api-server bundles at startup (esbuild → node, no watch).
After editing server code you MUST restart the `artifacts/api-server: API Server` workflow
before curl-testing, or curl hits the stale build and your change appears to do nothing.
