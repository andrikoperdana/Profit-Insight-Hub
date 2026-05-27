---
name: My-view role gating consistency
description: Keep Sidebar visibility and App.tsx route allow/deny in sync via a single shared role constant.
---

Sidebar `canSee*` flags and `App.tsx` route `allowRoles`/`denyRoles` enforce the same product policy in two places. If they drift, users either see a menu they can't open (broken UX) or can deep-link past the menu into a page they shouldn't access.

**Why:** First pass at the "My Tasks / My Timesheet / My Expenses" pages used `allowRoles=[…broad list…]` on `/my-tasks` and `denyRoles=["HR","SITE_ADMIN"]` on `/my-expenses` while Sidebar showed the items only for delivery + principal + sales. Result: FINANCE/PM/MGMT could URL-bar into `/my-expenses` even though no menu link existed; sidebar and route policies disagreed.

**How to apply:**
- Define one exported constant (e.g. `MY_VIEW_ROLES` in `App.tsx`) and reference it from both `App.tsx` route gates and Sidebar's visibility check (or have Sidebar import it).
- Prefer `allowRoles` (positive list) over `denyRoles` for personal/sensitive views — it fails closed for any new role added later.
- When adding a new "My X" page, grep for the existing constant first and extend it; don't introduce a parallel role list.
