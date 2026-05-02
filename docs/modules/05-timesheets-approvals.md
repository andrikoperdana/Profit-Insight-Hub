# 5. Timesheets & Approvals

Labor tracking with a multi-stage approval workflow that feeds the cost engine.

## Purpose

Timesheets are the source of truth for actual labor cost. Consultants and Technical Writers log hours per project per day; PMs (and Management as fallback) approve or reject. Only `APPROVED` rows enter cost calculations.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/timesheets` | `TimesheetsList` — own entries, weekly grid + table |
| `/approvals` | `ApprovalInbox` — queue for approvers, with bulk actions |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/timesheets` | List for the current user (or all, for approvers) |
| POST | `/timesheets` | Create draft entry |
| PATCH | `/timesheets/:id` | Edit while in DRAFT |
| POST | `/timesheets/:id/submit` | DRAFT → SUBMITTED |
| POST | `/timesheets/:id/approve` | SUBMITTED → APPROVED |
| POST | `/timesheets/:id/reject` | SUBMITTED → REJECTED (requires note) |
| POST | `/timesheets/bulk-approve` | Approve many in one call |

## States

```
DRAFT → SUBMITTED → APPROVED
                 ↘ REJECTED → (back to DRAFT after edit)
```

Edits are blocked once `SUBMITTED`. Rejection comments are stored on the row for audit.

## Components

| Component | Notes |
|-----------|-------|
| `TimesheetsList` | Weekly grid: day × project, totals per row/column |
| `TimesheetEntryDialog` | Create/edit a single row |
| `ApprovalInbox` | Filters by project / submitter; checkbox bulk actions |
| `ApprovalDecisionDialog` | Confirm approve / capture reject reason |

## Data model

| Field | Notes |
|-------|-------|
| `Timesheet.id` | UUID |
| `Timesheet.userId` | Submitter |
| `Timesheet.projectId` | Target project |
| `Timesheet.date` | Day worked |
| `Timesheet.hours` | Decimal hours, server-validated 0 < h ≤ 24 |
| `Timesheet.note` | Free-text |
| `Timesheet.status` | DRAFT / SUBMITTED / APPROVED / REJECTED |
| `Timesheet.approvedById` | FK User |
| `Timesheet.decisionAt` | Timestamp of approve/reject |
| `Timesheet.rejectionReason` | Required if REJECTED |

## RBAC

| Action | Roles |
|--------|-------|
| Create / submit own | Consultant, TW (any role with assignments) |
| Approve / reject | PM (for own projects), Management (any project), Admin Project (any project) |
| View own | All authenticated |
| View any | Management, Admin Project |
| Bulk approve | Management, PM (own projects only — server filters) |

## Primary flow (week of work)

1. Consultant opens `/timesheets`, fills weekly grid (Mon–Fri), saves DRAFT rows.
2. Hits **Submit Week** → batch transitions all DRAFTs to SUBMITTED.
3. PM opens `/approvals`, filters by their project, selects rows, clicks **Approve Selected**.
4. POST `/timesheets/bulk-approve` updates rows; cost engine immediately includes them next time `/projects/:id/financials` is hit.
5. Rejected rows return to the consultant with a reason note.
