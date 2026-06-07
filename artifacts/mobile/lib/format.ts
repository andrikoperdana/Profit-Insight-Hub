/**
 * Small formatting + date helpers shared across mobile screens.
 * No timezone libraries — everything operates in the device's local time,
 * which matches how a consultant thinks about "today" when logging hours.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Seconds -> "HH:MM:SS" for the live timer display. */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/** A number of hours -> "8.0h". */
export function formatHours(hours: number): string {
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 2)}h`;
}

/** Local Date -> "YYYY-MM-DD". */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today as "YYYY-MM-DD" (local). */
export function todayYMD(): string {
  return ymd(new Date());
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The last `n` days (most recent first) as {ymd, label} for quick chips. */
export function lastNDays(n: number): { ymd: string; label: string }[] {
  const out: { ymd: string; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    let label: string;
    if (i === 0) label = "Today";
    else if (i === 1) label = "Yesterday";
    else label = `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
    out.push({ ymd: ymd(d), label });
  }
  return out;
}

/** ISO date string -> "Jun 7". */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** ISO timestamp -> compact relative-ish label for notifications. */
export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Local start-of-week (Monday) at 00:00. */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  x.setDate(x.getDate() - diff);
  return x;
}

/** True when an ISO date falls in the current local week (Mon-Sun). */
export function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}
