// Work-hours compliance computation. Required roles must log a full 40h work
// week (8h per business day, Mon-Fri). Recorded leave reduces the target by
// 8h per business day of leave. See `routes/work-hours.ts`.

export const HOURS_PER_DAY = 8;

export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type WorkHoursEntry = {
  workDate: Date;
  hours: number;
  status: string;
};

export type WorkHoursLeave = {
  startDate: Date;
  endDate: Date;
};

export type WorkHoursStatus = "MET" | "ON_TRACK" | "BEHIND" | "AT_RISK";

export type WorkHoursPeriod = {
  loggedHours: number;
  pendingHours: number;
  approvedHours: number;
  targetHours: number;
  expectedToDateHours: number;
  remainingHours: number;
  leaveDays: number;
  status: WorkHoursStatus;
};

export type WorkHoursSummaryCore = {
  week: WorkHoursPeriod;
  month: WorkHoursPeriod;
  year: WorkHoursPeriod;
};

function atMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Count Mon-Fri days in the inclusive range [start, end]. Returns 0 if end < start.
function businessDays(start: Date, end: Date): number {
  const s = atMidnight(start);
  const e = atMidnight(end);
  if (e < s) return 0;
  let count = 0;
  for (let cur = new Date(s); cur <= e; cur = addDays(cur, 1)) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

// Count of distinct leave business days (Mon-Fri) that fall inside
// [periodStart, periodEnd]. Uses a union of dates so overlapping leave rows
// never reduce the target by more than 8h for the same calendar day.
function leaveBusinessDays(leaves: WorkHoursLeave[], periodStart: Date, periodEnd: Date): number {
  const days = new Set<number>();
  for (const lv of leaves) {
    const s = maxDate(atMidnight(lv.startDate), periodStart);
    const e = minDate(atMidnight(lv.endDate), periodEnd);
    if (e < s) continue;
    for (let cur = new Date(s); cur <= e; cur = addDays(cur, 1)) {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= 5) days.add(cur.getTime());
    }
  }
  return days.size;
}

export function startOfWeek(now: Date): Date {
  const d = atMidnight(now);
  const dow = d.getDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow; // back to Monday
  return addDays(d, diff);
}
export function endOfWeek(now: Date): Date {
  return addDays(startOfWeek(now), 6);
}
export function startOfMonth(now: Date): Date {
  return atMidnight(new Date(now.getFullYear(), now.getMonth(), 1));
}
export function endOfMonth(now: Date): Date {
  return atMidnight(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}
export function startOfYear(now: Date): Date {
  return atMidnight(new Date(now.getFullYear(), 0, 1));
}
export function endOfYear(now: Date): Date {
  return atMidnight(new Date(now.getFullYear(), 11, 31));
}

function classify(
  logged: number,
  target: number,
  expectedToDate: number,
): WorkHoursStatus {
  if (target <= 0) return "MET";
  if (logged >= target) return "MET";
  if (logged >= expectedToDate) return "ON_TRACK";
  if (expectedToDate > 0 && logged >= expectedToDate * 0.8) return "BEHIND";
  return "AT_RISK";
}

function computePeriod(
  periodStart: Date,
  periodEnd: Date,
  now: Date,
  entries: WorkHoursEntry[],
  leaves: WorkHoursLeave[],
  required: boolean,
): WorkHoursPeriod {
  const start = atMidnight(periodStart);
  const end = atMidnight(periodEnd);

  let logged = 0;
  let pending = 0;
  let approved = 0;
  for (const e of entries) {
    const wd = atMidnight(e.workDate);
    if (wd < start || wd > end) continue;
    if (e.status === "REJECTED") continue;
    logged += e.hours;
    if (e.status === "SUBMITTED") pending += e.hours;
    if (e.status === "APPROVED") approved += e.hours;
  }

  const periodBiz = businessDays(start, end);
  const leaveBiz = Math.min(leaveBusinessDays(leaves, start, end), periodBiz);
  const target = required ? Math.max(0, (periodBiz - leaveBiz)) * HOURS_PER_DAY : 0;

  // Expected-to-date: business days elapsed through today (clamped to period),
  // minus elapsed leave. Drives the on-track / behind status mid-period.
  let expectedToDate = 0;
  const elapsedEnd = minDate(atMidnight(now), end);
  if (required && elapsedEnd >= start) {
    const bizElapsed = businessDays(start, elapsedEnd);
    const leaveElapsed = Math.min(leaveBusinessDays(leaves, start, elapsedEnd), bizElapsed);
    expectedToDate = Math.max(0, bizElapsed - leaveElapsed) * HOURS_PER_DAY;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    loggedHours: round1(logged),
    pendingHours: round1(pending),
    approvedHours: round1(approved),
    targetHours: round1(target),
    expectedToDateHours: round1(expectedToDate),
    remainingHours: round1(Math.max(0, target - logged)),
    leaveDays: leaveBiz,
    status: required ? classify(logged, target, expectedToDate) : "MET",
  };
}

export function computeWorkHoursSummary(
  entries: WorkHoursEntry[],
  leaves: WorkHoursLeave[],
  now: Date,
  required: boolean,
): WorkHoursSummaryCore {
  return {
    week: computePeriod(startOfWeek(now), endOfWeek(now), now, entries, leaves, required),
    month: computePeriod(startOfMonth(now), endOfMonth(now), now, entries, leaves, required),
    year: computePeriod(startOfYear(now), endOfYear(now), now, entries, leaves, required),
  };
}

// Widest date range covering all three periods, used to bound DB queries. The
// current week can spill into the previous year in early January, so take the
// min start across all periods.
export function overallRange(now: Date): { start: Date; end: Date } {
  const starts = [startOfWeek(now), startOfMonth(now), startOfYear(now)];
  const ends = [endOfWeek(now), endOfMonth(now), endOfYear(now)];
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end: ends.reduce((a, b) => (a > b ? a : b)),
  };
}
