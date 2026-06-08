---
name: PM timesheet auto-approval & submit state guard
description: Why a PM's own timesheet never needs approval, and the submit-transition invariant that protects it.
---

# PM timesheet auto-approval

A PROJECT_MANAGER's own timesheet is auto-approved (status APPROVED, approvedById/approvedAt = self) on **any** project, the same as MANAGEMENT — not just on projects they manage.

**Why:** PMs are themselves approvers; making their own hours wait on another PM's approval is wrong. The user explicitly asked for this ("PM tidak perlu approval"). Earlier logic only auto-approved a PM on projects where `pmId === self`, leaving their hours on other PMs' projects stuck in SUBMITTED.

**How to apply:** auto-approve decision lives in both the single-create and bulk-create timesheet paths. Keep MGMT/SUPER_ADMIN/PROJECT_MANAGER in the auto-approve set. Project pmId is still fetched in bulk, but only to notify the project PM about *other* users' submitted entries — it must not gate PM approval.

# /submit state-transition invariant

`POST /api/timesheets/:id/submit` must only allow DRAFT/REJECTED → SUBMITTED, and must clear approvedById/approvedAt on transition.

**Why:** without the guard, an owner (incl. a PM) could re-submit an already-APPROVED entry, dragging approved hours back into the approval flow and re-firing awaiting-approval notifications — silently undoing PM auto-approval. Financial roll-ups count only APPROVED, so a revert also flips an entry out of cost/margin until re-approved.

**How to apply:** never let APPROVED revert to SUBMITTED. In practice timesheets are created directly as APPROVED or SUBMITTED (DRAFT default is unreachable via normal create paths), so /submit is mostly a resubmit-after-reject path.
