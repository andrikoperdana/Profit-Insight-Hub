---
name: Timesheet scope=all default-deny
description: How to keep the global timesheet list endpoint safe from authorization bypass via ?scope=all.
---

When a list endpoint accepts a `scope` query param that can broaden visibility (`mine` vs `all`), the role-branching for the `all` branch must be **default-deny**, not default-allow.

**Why:** A previous version of `GET /api/timesheets` only narrowed `where` for an explicit denylist (`KONSULTAN/TECHNICAL_WRITER/SALES/ADMIN_PROJECT/PROJECT_MANAGER`). Any role outside that list — including all `PRINCIPAL_*`, `FINANCE`, and `SITE_ADMIN` — fell through with `where = {}` and could read every team's timesheet by passing `?scope=all`. A separate `router.use` only guarded HR. Architect review caught this only because the new "My Timesheet" page made the endpoint reachable from new roles.

**How to apply:**
- For any scope that broadens visibility, branch on the **allowlist** (`if role === MGMT … else if role === PM … else where.userId = self`).
- Never assume an `else` branch falls into a safer default — write the safe default explicitly so new roles inherit it.
- When you add a new endpoint or role that touches an existing list endpoint, re-run the same shape of test: log in as the new role, hit `?scope=all`, count `distinct_users` in the response, confirm it is 1 (or 0).
