---
name: Zod body validation middleware
description: How validateBody(schema) interacts with Express overloads and what the generated zod schemas do/don't enforce.
---

# Zod request-body validation on mutation routes

`middlewares/validate.ts` exposes `validateBody(schema)` which `safeParse`s `req.body`, returns `400 {error: "<path>: <message>"}` on the first issue, and does NOT mutate `req.body`. Applied to the core mutation routes (projects/leads/clients/timesheets/expenses/billing-milestones/tasks).

## Generated zod schemas are structural-only
The schemas in `@workspace/api-zod` (from OpenAPI codegen) enforce **presence + type only** — no `.min(1)`, no trim, no `.strict()`, no cross-field/semantic rules. So `clientId: ""`, `workDate: ""`, `name: "   "` all PASS zod.

**Rule:** keep semantic guards in the handler AFTER `validateBody` — non-empty/whitespace checks, numeric ranges, date-parse validity, enum membership, email format, length caps, role-based field gates. Do NOT delete a presence check assuming zod replaces it; an empty string slips through to Prisma and becomes a 500 (FK violation / Invalid Date) instead of a clean 400.
**Why:** an architect review caught exactly this — removing `if(!code||!name||!clientId)` after adding `validateBody` let empty strings reach `prisma.create`.

## Adding a 2nd handler widens req.params typing
Express's typed router overload infers `RouteParameters<Path>` for `req.params` only for the **single-handler** form. Adding any extra middleware (e.g. `validateBody`) switches to the variadic overload where `req.params.x` widens to `string | string[]`. That widened value, passed into a Prisma `where`, makes Prisma's result type **degrade and lose `include` inference** (e.g. `before.project` disappears) — a confusing cascade of errors far from the real cause.
**How to apply:** on any multi-handler route, wrap params as `String(req.params.x)` (the rest of the codebase already does this on its `requireRole`-guarded routes). The fix for the param error also clears the bogus missing-`include` errors.
