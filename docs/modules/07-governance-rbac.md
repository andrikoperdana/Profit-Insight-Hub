# 7. Governance & RBAC

User management, application settings, and the immutable audit log.

## Purpose

Governance is the administrative spine of the platform: who can sign in, what role they hold, what their cost rate is, what the system did and when. The audit log is append-only and is used for both compliance and forensic debugging.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/users` | `UsersList` — create, edit, deactivate users; assign roles |
| `/settings` | `Settings` — system-wide configuration (working hours, currency, branding) |
| `/audit-logs` | `AuditLogPage` — paginated, filterable audit log viewer |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users` | List users (filter by role, status) |
| POST | `/users` | Create user (sends invite or sets initial password) |
| PATCH | `/users/:id` | Update profile, role, cost rate, status |
| DELETE | `/users/:id` | Soft-deactivate (cannot hard-delete if referenced) |
| GET | `/audit-logs` | Paginated log query: actor, action, target, date range |
| GET | `/audit-logs/actions` | Distinct action codes (for filter dropdown) |

## Components

| Component | Notes |
|-----------|-------|
| `UsersList` | Table + create/edit dialog + role badge using `RoleLabels` |
| `Settings` | Tabbed form for org-wide preferences |
| `AuditLogPage` | Time-ordered list with filters; readonly |

## Data model

| Model | Fields |
|-------|--------|
| `User` | `id`, `email`, `name`, `role`, `costRate`, `defaultDailyCapacityHours`, `status`, `passwordHash` |
| `AuditLog` | `id`, `actorId`, `action` (e.g. `PROJECT_CREATE`), `targetType`, `targetId`, `metadata` (JSON), `createdAt` |

The audit log is **append-only**: there is no UPDATE or DELETE endpoint, and the table has no ON DELETE CASCADE references.

## RBAC

| Action | Roles |
|--------|-------|
| Manage users | Management |
| Edit org settings | Management |
| View audit log | Management |
| View own profile | All authenticated |
| Modify project-related settings | Admin Project (limited subset) |

## Audit coverage

The following actions are written to `AuditLog` automatically by the relevant route handlers:

- `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`
- `USER_CREATE`, `USER_UPDATE`, `USER_DEACTIVATE`
- `PROJECT_CREATE`, `PROJECT_UPDATE`, `PROJECT_STATUS_CHANGE`, `PROJECT_DELETE`
- `RESOURCE_ADD`, `RESOURCE_REMOVE`
- `TIMESHEET_SUBMIT`, `TIMESHEET_APPROVE`, `TIMESHEET_REJECT`
- `DOCUMENT_UPLOAD`
- `SURVEY_TEMPLATE_UPDATE`, `SURVEY_SUBMITTED`
- `SETTINGS_UPDATE`

Each entry stores the actor, the target, and a metadata snapshot sufficient to reconstruct what changed.

## Primary flow (onboarding a new consultant)

1. Manager opens `/users` → **Add User**.
2. Fills name, email, role (`CONSULTANT`), cost rate, capacity.
3. Server creates the user, hashes the initial password, writes `USER_CREATE` to the audit log.
4. New user signs in → can immediately be assigned to projects via the Resources module.
5. Any later role change is captured as a new `USER_UPDATE` audit row.
