---
name: Sample timesheet hours stacking
description: Why demo/sample generators produced impossible Work Hours totals and the invariant that prevents it.
---

# Sample timesheet hours stacking

The Work Hours Compliance feature once showed impossible totals (a consultant at
307h in one week vs a 40h target). The compute logic was correct — it sums
non-REJECTED `Timesheet.hours` per workDate per period. The bad numbers came
entirely from the **sample-data generators**, not the app.

**Root causes (compounding):**
- `sample-demo-enrichment.ts` stamped a whole week's hours on a single date and
  ran per-project, so a consultant staffed on N concurrent projects accrued ~N
  full weeks in one calendar week.
- Base `seed.ts` and `sample-report-data.ts` independently log the same users on
  overlapping days/projects, stacking further.

**Rule:** any sample/demo timesheet generator must keep each user under ~8h/day
(~40h/Mon-Fri week) across ALL generators combined, or Work Hours breaks.

**How it's enforced:** `capUserDailyHours()` (`lib/db/src/cap-daily-hours.ts`)
runs as the final step of both `seed.ts` and `sample-demo-enrichment.ts`. It
groups by (user, UTC calendar day) and scales any day over 8h down to exactly 8h
using an exact largest-remainder half-hour allocator (`allocateDailyHours` —
pure/testable). It is `syntheticOnly` by default: only rows tagged by a
generator (U+200B marker or `[sample]`) are reduced, and real human-entered
hours are reserved in the day budget — so it never mutates real data. Pass
`syntheticOnly:false` ONLY right after a full wipe-and-seed.

**Two non-obvious traps:**
- Week grouping must key on the **UTC calendar Monday** (`Date.UTC(y,m,d)`), not
  the raw Monday `Date`. `mondaysBetween` preserves each project start's
  time-of-day, so the same week from different projects had different
  `getTime()` and never collapsed into one weekly-cap bucket.
- Proportional scaling with `round()`/`Math.max(0.5,...)` does NOT guarantee
  ≤cap (rows that floor to 0.5 keep the day above cap forever). Use integer
  half-hour units + largest-remainder so the day sums to exactly the cap.

**Side-effect note:** project resourceCost/margin is derived from timesheets at
read time, so scaling synthetic hours also shifts demo financials — intended,
and it makes demo margins more realistic. Real data is untouched (syntheticOnly).

**Follow-up not done:** no test runner (vitest) is configured in the repo, so
the architect-suggested invariant tests (per-user/day ≤8, /week ≤40, idempotent
reseed, real rows unchanged) were not added. `allocateDailyHours` is a pure
export ready to unit-test if a harness is added.
