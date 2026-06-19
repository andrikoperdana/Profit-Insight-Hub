---
name: Bundled seed entrypoint guard + shared prisma
description: Why DB-touching modules must use the shared prisma client and why naive "run as main" guards fire at boot when esbuild-bundled.
---

# Bundled seed entrypoint guard + shared prisma client

Two related, non-obvious rules for any module under `lib/db/src/` that both
(a) exports a boot-time `ensure*` seed function AND (b) has a standalone CLI
entrypoint block.

## Rule 1 — never `new PrismaClient()` outside the shared client
Every DB-touching module must `import { prisma } from "./index.js"` (the shared
client). A raw `new PrismaClient()` has **no datasource override**, so it
bypasses the pooler transform (`buildDatasourceUrl`/`applyNeonPgBouncer`), the
pool params, and the idempotent retry layer — it connects to the **direct** Neon
endpoint. On a cold Neon compute at deploy time that direct connect fails with
`PrismaClientInitializationError` and crash-loops the boot.

**Why:** the prod runtime must go through the pooled `-pooler` endpoint;
anything that opens its own client silently defeats that.

## Rule 2 — entrypoint guards must check the filename, not just argv1
The api-server is bundled by esbuild into a single `dist/index.mjs`. Inside the
bundle, **every** module's `import.meta.url` and `process.argv[1]` both resolve
to `.../dist/index.mjs`. So a naive guard like
`import.meta.url === \`file://${process.argv[1]}\`` evaluates **true** at boot and
auto-runs the standalone seed block — redundantly with the explicit `index.ts`
boot calls, and (combined with Rule 1's raw client) crashes prod.

Harden it to also require the real filename:
```ts
const __argv1 = process.argv[1] ?? "";
if (
  import.meta.url === `file://${__argv1}` &&
  (__argv1.endsWith("sample-foo.ts") || __argv1.endsWith("sample-foo.js"))
) { /* run standalone */ }
```
`sample-project-templates.ts` already used this pattern; `sample-task-templates.ts`
did not and was the one that crashed.

## Circular import is fine in this shape
`index.ts` re-exports the `ensure*` fns; those modules import `prisma` from
`index.ts`. This cycle is safe **only because** `prisma` is dereferenced solely
*inside* the async `ensure*` functions (called at runtime, after init), never at
module top-level. The standalone block must NOT run at load (see Rule 2) or it
touches the still-undefined circular binding → `Cannot read properties of
undefined (reading 'user')`.

**How to apply:** when adding a new `lib/db/src/sample-*.ts` seed module, copy
the shared-prisma import + filename-guarded entrypoint from an existing one;
never paste a `new PrismaClient()` or a bare `import.meta.url === argv1` guard.
