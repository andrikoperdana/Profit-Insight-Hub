---
name: Rate history baseline backfill
description: Denormalized "current value" + append-only history with fallback needs a baseline row on first insert, or history gets retroactively repriced.
---

# Rule
When a costing lookup resolves "newest history row with effectiveFrom <= date, else fall back to a denormalized current field", and writes re-sync that denormalized field to the newest in-effect row, then creating the FIRST history row must backfill a baseline row at the pre-change value (effectiveFrom = project start / record creation) inside the same transaction.

**Why:** Without the baseline, the first rate change re-syncs the fallback value, and every historical record dated before the only history row silently reprices at the new value — inflating actuals, margin, EVM, and dashboards. Unit tests that hand-construct an "unsynced" state (old fallback + new period) mask this because the write path can never produce that state.

**How to apply:** Any future per-period value on top of a denormalized current field (e.g. selling rates used in revenue, user base rates). Skip the baseline only when the new period's effectiveFrom is <= the baseline date. Test the actual write-path invariant: "raise value mid-project → old records keep old value".
