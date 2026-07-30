---
name: Bulk-extending Prisma where filters via sed
description: Why sed-extended filters need a runtime smoke test, not just tsc
---
Rule: after bulk-extending a Prisma filter (e.g. adding `archivedAt: null` next to every `deletedAt: null`), grep for var-assigned wheres (`const xWhere: any = {`) and confirm each targets the intended model, then smoke-test hot endpoints at runtime.

**Why:** typecheck misses two classes: (1) `: any`-typed where objects, (2) object literals assigned to a variable first — no excess-property check — so a Project-only field applied to a User query only fails at runtime with PrismaClientValidationError (this bit dashboard/overview and capacity).

**How to apply:** any sed/mass-edit of shared filter fragments across the api-server: run tsc AND curl the dashboard/report endpoints (or run the testing agent) before declaring done.
