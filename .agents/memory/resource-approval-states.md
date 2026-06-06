---
name: ProjectResource dual pending states
description: The two distinct "awaiting" states a ProjectResource row can be in, and which actor accepts each.
---

ProjectResource has TWO distinct not-yet-active states, both with `acceptedAt=null`, distinguished by `pendingPrincipalApproval`:

- **Principal-proposed** (`pendingPrincipalApproval=false`, `proposedById=<principal>`): a Principal proposed a supervisee onto an OBSERVATION/ACTIVE project; awaiting **PM/MGMT** accept.
- **PM-added-supervised** (`pendingPrincipalApproval=true`, `proposedById=<PM>`): a PROJECT_MANAGER added a KONSULTAN/TECHNICAL_WRITER who has a `principalId`; awaiting that resource's **Principal** (or MGMT) accept. MGMT-added rows skip this and auto-accept.

`/resources/:id/accept` branches authz on `pendingPrincipalApproval`. The PM/MGMT edit auto-accept path must guard `&& !pendingPrincipalApproval` or it silently approves a row that is supposed to be gated by the Principal.

**Why:** the approval gate is meaningless if any later PM edit re-accepts the row.

**How to apply:** when touching resource accept/upsert logic, always handle BOTH pending states; only PRINCIPAL_KONSULTAN/PRINCIPAL_TECHNICAL_WRITER participate (ADMIN_PROJECT staffing is single-pick on `Project.adminProjectId`, no resource-row approval).

**Active-assignment caveat:** project-visibility scoping (`routes/projects.ts` `resources.some({userId})`) and the financial rate map (`computeMetrics`) do NOT filter by `acceptedAt` — both pending states already grant visibility and provide rates. This is pre-existing for the propose flow; financials are timesheet-driven so a pending resource with no APPROVED timesheets is inert. Tightening this is a cross-cutting change affecting the propose flow, not just the new PM-approval flow.
