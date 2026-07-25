const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
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

export function monthKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 7);
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
