const DAY_MS = 24 * 60 * 60 * 1000;

/** Two-digit zero-pad. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local-timezone calendar-day key (YYYY-MM-DD). Matches the wall-clock
 * day the user is on, so it agrees with `hourOfDay` and `dayOfWeek` (which
 * also use local time). Used for streaks, heatmap rows, cost "this month",
 * and ghost-day detection — every one of those is a local-calendar concept,
 * not a UTC one. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function hourOfDay(ts: number): number {
  return new Date(ts).getHours();
}

export function dayOfWeek(ts: number): number {
  return new Date(ts).getDay(); // 0 = Sunday
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isoWeekKey(ts: number): string {
  const date = new Date(ts);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY_MS - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Return the ISO week key for the week immediately preceding the one
 * containing `ts`. Used to walk back through a session history to
 * zero-fill weekly momentum with the actual elapsed calendar weeks.
 * Handles the year boundary (week 1 of the previous year is week 52 or
 * 53 of the calendar year before). */
export function previousIsoWeekKey(weekKey: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error(`Invalid ISO week key: ${weekKey}`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week > 1) {
    return `${year}-W${String(week - 1).padStart(2, "0")}`;
  }
  // Walking back from W01 lands in the previous year's last week. ISO
  // week numbering: a year has 52 or 53 weeks; the previous year's
  // W52/W53 contains Jan 1 of the current year. Find it by looking up
  // Dec 28 of the previous year (always in the last ISO week, per
  // ISO 8601).
  const lastWeek = isoWeekKey(Date.UTC(year - 1, 11, 28));
  return lastWeek;
}

/** Local-timezone month key (YYYY-MM). Aligns with `dayKey` so cost/forecast
 * "this month" and heatmap month rollups can't disagree across timezones. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / DAY_MS;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && seconds) parts.push(`${seconds}s`);
  return parts.length ? parts.join(" ") : "0s";
}

export function formatHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function daysAgo(n: number, from = Date.now()): number {
  return from - n * DAY_MS;
}

/** Move a timestamp back by one local calendar day. Used for DST-safe
 * streak calculation: subtracting 24h × N around a DST transition lands
 * on the wrong local date, but constructing `new Date(year, month,
 * day - 1)` lets the Date object normalize back into the right calendar
 * day for the local timezone. */
export function dayBefore(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
}

/** Mirror of dayBefore — advance by one local calendar day. */
export function dayAfter(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}