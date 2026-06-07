import { prisma } from "./index.js";

const ZWSP = "\u200B";
const SAMPLE_TAG = "[sample]";

/**
 * A timesheet row is "synthetic" if it was produced by one of the demo/sample
 * generators: the demo enrichment tags rows with an invisible U+200B marker,
 * and sample-report-data tags them with a "[sample]" suffix. Real, human
 * entered rows carry neither and must never be modified.
 */
function isSynthetic(description: string | null | undefined): boolean {
  if (!description) return false;
  return description.includes(ZWSP) || description.includes(SAMPLE_TAG);
}

/**
 * Exact, pure half-hour allocator.
 *
 * Given a list of row hours and a `budget` (in hours), returns new hours — in
 * 0.5h steps — that sum to EXACTLY `min(sum(hours), budget)`, distributed
 * proportionally via the largest-remainder (Hamilton) method. When the rows
 * already fit within `budget` they are returned unchanged. When `budget <= 0`
 * every row becomes 0. Working in integer half-hour units guarantees the cap is
 * respected exactly with no floating-point drift. Some rows may legitimately
 * become 0 when a day is split across more rows than the budget allows.
 */
export function allocateDailyHours(hours: number[], budget: number): number[] {
  const total = hours.reduce((s, h) => s + h, 0);
  if (total <= budget) return hours.slice();
  if (budget <= 0) return hours.map(() => 0);

  // Floor to half-hour units (never inflate): rounding up could let the
  // allocation exceed a non-0.5 budget (e.g. 0.3h -> 0.5h). A tiny epsilon
  // absorbs floating-point noise on exact multiples (e.g. 5.7*2 = 11.3999...).
  const budgetUnits = Math.floor(budget * 2 + 1e-9); // half-hour units
  const raw = hours.map((h) => (h / total) * budgetUnits);
  const floors = raw.map((x) => Math.floor(x));
  const used = floors.reduce((s, x) => s + x, 0);
  let remainder = budgetUnits - used;

  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    floors[order[k]!.i] += 1;
    remainder--;
  }
  return floors.map((u) => u / 2);
}

/**
 * Enforce a realistic per-user daily ceiling on logged time.
 *
 * Several independent demo/sample generators (base seed, sample-report-data,
 * the demo enrichment) can log the SAME user on the SAME day across multiple
 * projects. Left unchecked, these stack into impossible totals (e.g. 300h in
 * one week) that break the Work Hours Compliance feature.
 *
 * This pass runs after generation and, for every (user, UTC day) whose combined
 * non-REJECTED hours exceed `dailyCap`, scales the hours down so the day totals
 * exactly `dailyCap`.
 *
 * With `syntheticOnly` (the default for runs against databases that may contain
 * real data), only generator-produced rows are ever modified: the day's real
 * hours are subtracted first and the remaining budget is distributed across the
 * synthetic rows only — real, human-entered timesheets are never touched. Pass
 * `syntheticOnly: false` only when the whole dataset is known to be synthetic
 * (e.g. immediately after a full wipe-and-seed).
 *
 * Returns the number of timesheet rows adjusted.
 */
export async function capUserDailyHours(
  opts: { dailyCap?: number; syntheticOnly?: boolean } = {},
): Promise<number> {
  const dailyCap = opts.dailyCap ?? 8;
  const syntheticOnly = opts.syntheticOnly ?? true;

  const rows = await prisma.timesheet.findMany({
    where: { status: { not: "REJECTED" } },
    select: { id: true, userId: true, workDate: true, hours: true, description: true },
  });

  const dayKey = (uid: string, d: Date) =>
    `${uid}|${Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())}`;

  type Row = { id: string; hours: number; synthetic: boolean };
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const k = dayKey(r.userId, r.workDate);
    const a = byDay.get(k) ?? [];
    a.push({ id: r.id, hours: r.hours, synthetic: isSynthetic(r.description) });
    byDay.set(k, a);
  }

  let updated = 0;
  for (const dayRows of byDay.values()) {
    const dayTotal = dayRows.reduce((s, r) => s + r.hours, 0);
    if (dayTotal <= dailyCap) continue;

    // Rows eligible to be reduced.
    const editable = syntheticOnly ? dayRows.filter((r) => r.synthetic) : dayRows;
    if (editable.length === 0) continue; // nothing we are allowed to touch

    // Budget left for the editable rows after reserving the rest of the day.
    const fixedHours = dayRows
      .filter((r) => !editable.includes(r))
      .reduce((s, r) => s + r.hours, 0);
    const budget = Math.max(0, dailyCap - fixedHours);

    const next = allocateDailyHours(editable.map((r) => r.hours), budget);
    for (let i = 0; i < editable.length; i++) {
      if (next[i] !== editable[i]!.hours) {
        await prisma.timesheet.update({
          where: { id: editable[i]!.id },
          data: { hours: next[i]! },
        });
        updated++;
      }
    }
  }
  return updated;
}
