---
name: SUPER_ADMIN god-mode role
description: How the top-privilege SUPER_ADMIN role is wired and why it is deliberately seed-only.
---

# SUPER_ADMIN (god-mode) role

A top-privilege role that can view AND edit/manage everything, above all other roles. Seed account `superadmin@itsecasia.com`.

## Wiring pattern
- `requireRole()` (middlewares/auth.ts) short-circuits to allow for `SUPER_ADMIN`. That covers every `requireRole`-guarded route automatically.
- For **custom gates** (routes that don't use `requireRole`, plus inline role checks, `Set`/array role lists, serializer visibility helpers like `canViewDailyRate`/`DAILY_RATE_ALLOWED_ROLES`), `SUPER_ADMIN` must be added explicitly — the `requireRole` bypass does NOT reach these. Convention: add to enable-checks (`|| role === "SUPER_ADMIN"`) and remove from deny-chains (`&& role !== "SUPER_ADMIN"`).

## Deliberate exclusions (do not "fix")
- **`users.ts` `ALL_ROLES` excludes `SUPER_ADMIN` on purpose** — keeps the god account seed-only and stops SITE_ADMIN/MGMT from creating or escalating anyone to `SUPER_ADMIN`.
  - **Why:** privilege-escalation guard. Creating a super admin must only happen via the seed.
  - **How to apply:** the user PATCH validates `role !== undefined && role !== before.role && !ALL_ROLES.includes(role)` → 400. The `role !== before.role` clause lets the seeded super-admin row stay editable (web form always resends `role`) while a regular target sent `role:"SUPER_ADMIN"` still 400s.
- **`principal.ts` `/principal/*` endpoints intentionally reject `SUPER_ADMIN`** — they map a Principal role to its single supervised role to show *that principal's* staffing gaps. A super admin has no supervised role, so the query would be meaningless; the same data is reachable via the global project/user endpoints. Not a capability gap.

## Frontend
- web `App.tsx` ProtectedRoute bypasses both allow- and deny-lists for `SUPER_ADMIN` (after the auth check).
- web `Sidebar.tsx`: a `sa` flag is OR'd into *include* conditions only — NOT into `isSiteAdmin/isFinance/isHr`, which are used as *exclude* conditions (keeping `sa` false there leaves those menu items visible).
- dashboard falls through to `ManagementDashboard`.
- mobile `roles.ts` uses a switch with `default` (not an exhaustive Record), so no typecheck change needed; `SUPER_ADMIN` just gets the fallback label.
