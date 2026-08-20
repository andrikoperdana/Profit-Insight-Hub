---
name: Scoped pnpm transitive overrides
description: Keep security pins limited to the dependency parents that need them.
---

Prefer `parent>child` overrides over a broad `child@range` override when several
parents declare an old-compatible range but only some resolve to a vulnerable
version.

**Why:** A generic override can cause pnpm to re-resolve unrelated, already-safe
consumers to the pinned version, needlessly changing their dependency graph.

**How to apply:** Identify every vulnerable parent with `pnpm why <package>`,
then add a scoped override for each affected parent. Preserve known-safe
resolutions with separate scoped pins only when the lockfile otherwise changes
them during a forced re-resolution.