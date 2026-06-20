---
name: ProjectBaseline single-current invariant
description: How "exactly one current baseline per project" is guaranteed without a partial unique index.
---

# One current baseline per project

There is no partial unique index like `WHERE isCurrent`. The single-current
invariant is upheld by `@@unique([projectId, version])` plus how each create path
allocates the version:

- **ChangeRequest-driven baselines** (applied SCHEDULE/COST CR): the whole thing
  runs in one `$transaction` — claim the CR atomically first
  (`updateMany({where:{id,status:"APPROVED"}})`; if `count===0` → 409), then
  `max(version)+1`, flip the prior current row to `isCurrent=false`, and create
  the new current row. Two concurrent applies can't both proceed.
- **ACTIVATION baseline** (first ACTIVE transition): NOT wrapped in a
  `$transaction`. It counts existing baselines and, if zero, creates `version:1,
  isCurrent:true`. This is not check-then-act safe on its own, but the unique
  constraint makes it correct: two concurrent activations both try `version:1`,
  the second collides and 500s — you still end with exactly ONE baseline, never
  two currents.

**Why no partial index:** two concurrent baseline creates both compute the same
next `version`, so the second INSERT collides on `@@unique([projectId, version])`
and its whole transaction (including the isCurrent flip) rolls back. You can
never commit two rows with the same version, and the serializer picks "current"
deterministically via `findFirst orderBy version desc`. A partial index would be
redundant.

**How to apply:** if you ever stop versioning monotonically, or move the
isCurrent flip outside the create transaction, this guarantee breaks — then add
the partial unique index. Until then, keep create+flip in one transaction.
