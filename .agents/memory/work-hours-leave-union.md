---
name: Work-hours leave target reduction
description: Why leave business days must be a union of dates, not a sum of intervals
---

# Leave reduction must use a union of distinct dates

`computeWorkHoursSummary` (api-server `lib/work-hours.ts`) lowers the 40h/week
target by 8h per business day of recorded `UserLeave`. Count leave days as a
**Set of distinct calendar dates** intersected with the period, never as a sum
of `businessDays(start,end)` per leave row.

**Why:** leave rows can overlap (the leave-create endpoint does not reject
overlapping ranges). Summing per-interval double-counts the same day, reducing
the target by >8h/day and overstating compliance. The union makes the math
deterministic regardless of how leave is recorded — the defensive fix, so we do
not also need to forbid overlapping leave.

**How to apply:** any future "target reduced by X per leave/holiday day" logic
(capacity, resource planning, utilization) should dedupe by calendar date the
same way before multiplying by hours.
