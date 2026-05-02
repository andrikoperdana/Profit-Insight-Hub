# 6. Business Intelligence & CSAT

Cross-project analytics dashboard plus customer satisfaction surveys distributed via tokenized public links.

## Purpose

- **BI** — answer questions that span projects: revenue by client, win rate, average margin by project type, utilization by role.
- **CSAT** — collect structured client feedback at the end of a project; aggregate scores feed BI.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/business-intelligence` | `BusinessIntelligence` — multi-chart analytics workspace |
| `/settings/survey-template` | `SurveyTemplateEditor` — define questions, scales, language |
| `/survey/:token` | `PublicSurveyPage` — unauthenticated, single-use response form |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/bi/overview` | Aggregated metrics for charts (filterable by date range) |
| GET | `/survey/template` | Current published template |
| PUT | `/survey/template` | Update template (versioned) |
| GET | `/survey/summary` | Aggregate CSAT scores by project / period |
| GET | `/public/surveys/:token` | Fetch survey for a respondent (no auth) |
| POST | `/public/surveys/:token` | Submit survey response (no auth) |

## Components

| Component | Notes |
|-----------|-------|
| `BusinessIntelligence` | Dashboard with date filters, drill-down charts |
| `SurveyTemplateEditor` | Drag-orderable questions, multiple input types |
| `PublicSurveyPage` | Lightweight, brand-styled, mobile-first |
| `SurveyTab` (Project Detail) | Generates token link, shows responses |

## Data model

| Model | Fields |
|-------|--------|
| `SurveyTemplate` | `id`, `version`, `publishedAt`, `questions` (JSON) |
| `SurveyQuestion` | `id`, `templateId`, `order`, `prompt`, `type` (LIKERT/SCALE/TEXT), `required` |
| `SurveyResponse` | `id`, `projectId`, `token`, `submittedAt`, `answers` (JSON), `respondentEmail` |

Tokens are random 32-char strings; one-time use enforced by `submittedAt` being non-null.

## RBAC

| Action | Roles |
|--------|-------|
| View BI dashboard | Management |
| View CSAT for a project | Management, Admin Project, PM (owner) |
| Edit survey template | Management |
| Generate survey link | Management, Admin Project, PM (owner) |
| Submit survey | Public (token only) |

## Primary flows

### CSAT collection
1. PM goes to Project Detail → Survey tab → **Generate link**.
2. Backend creates `SurveyResponse` row with token + `submittedAt = null`.
3. PM emails the link to the client contact.
4. Client opens `/survey/:token` → sees brand-styled form → submits.
5. Token marked used; aggregated score visible on the project and in BI.

### BI exploration
1. Manager opens `/business-intelligence`.
2. Picks date range, optional client/role filters.
3. `/bi/overview` returns pre-aggregated metrics; charts render with Recharts.
