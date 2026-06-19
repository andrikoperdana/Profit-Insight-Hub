---
name: Safe production data purge pattern
description: How to delete records (esp. Users) from the live prod DB without leaving dangling FK references or corrupting real data.
---

# Safe destructive purge on the prod DB

Used to hard-delete fake projects + 27 fake user accounts on prod with zero
errors. The methodology, not the one-off:

1. **Map every FK that points at the target table** via `information_schema`
   (`constraint_column_usage.table_name = '<Target>'`). For User this was 37
   columns across many tables — guessing the list will miss some and fail.
2. **Classify each FK column by nullability** (`information_schema.columns`):
   - nullable → `UPDATE ... SET col = NULL` (keeps the real row; e.g. null
     `AuditLog.userId` to preserve the audit trail, null `Project.adminProjectId`
     on real projects).
   - NOT NULL → `DELETE` the referencing rows (can't be nulled).
3. **Delete owned aggregate roots first** so their children cascade (verify the
   child FKs are `ON DELETE CASCADE` in the migration SQL first). Deleting the 6
   fake projects cascaded their timesheets/tasks/etc. and cleared most refs.
4. **One transaction, dry-run first:** wrap the whole thing in
   `BEGIN; \i body.sql; ROLLBACK;` with `ON_ERROR_STOP=1`. Check exit 0 and the
   printed row counts / before-after verification SELECTs, THEN re-run the
   identical body with `COMMIT`.
5. Order self-referential nulls (e.g. `User.managerId/principalId`) BEFORE
   deleting the users, or the final delete hits a self-FK.

**Why:** the dry-run proves no FK violation and shows exactly what each statement
touches; nullability-driven null-vs-delete guarantees no dangling references and
preserves real rows that merely *pointed at* the deleted records.

**Future risk / preference:** hard-deleting users and timesheets is
ledger-destructive and irreversible. Only do it when the env is explicitly
disposable (user said "semuanya masih uji coba"). Otherwise prefer
soft-delete/deactivate for users and financial records. Avoid broad
`LIKE 'f-%'` selectors for the real run — ideally materialize and eyeball the
exact target IDs first.
