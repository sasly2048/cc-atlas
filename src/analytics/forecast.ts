import type { SessionRecord } from "../types/domain.js";
import { dayKey, dayBefore, dayAfter } from "../utils/dates.js";
import { sum } from "../utils/numbers.js";

/** Consolidates: cc-predict (hours/streak half; cost half lives in cost.ts). */
export interface UsageForecast {
  hoursSoFarThisMonth: number;
  projectedMonthEndHours: number;
  currentDailyStreak: number;
  daysInMonth: number;
  dayOfMonth: number;
}

export function computeUsageForecast(sessions: SessionRecord[], now = Date.now()): UsageForecast {
  const date = new Date(now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate();
  const monthPrefix = dayKey(now).slice(0, 7);

  const thisMonthSessions = sessions.filter((s) => dayKey(s.startedAt).startsWith(monthPrefix));
  const hoursSoFarThisMonth = sum(thisMonthSessions.map((s) => s.durationMs)) / 3_600_000;
  const dailyAverage = dayOfMonth > 0 ? hoursSoFarThisMonth / dayOfMonth : 0;

  return {
    hoursSoFarThisMonth,
    projectedMonthEndHours: dailyAverage * daysInMonth,
    currentDailyStreak: computeCurrentStreak(sessions, now),
    daysInMonth,
    dayOfMonth,
  };
}

/** Consecutive local-calendar days (ending today or yesterday) with at
 * least one session — the "how many days in a row" number used for
 * streak alerts. We move the cursor by *local calendar date* (via
 * dayBefore), not by subtracting 24 hours, so daylight-saving
 * transitions don't cause off-by-one skips. */
export function computeCurrentStreak(sessions: SessionRecord[], now = Date.now()): number {
  if (sessions.length === 0) return 0;
  const activeDays = new Set(sessions.map((s) => dayKey(s.startedAt)));

  let streak = 0;
  let cursor: number = now;
  // If there's no session yet today, the streak still counts through
  // yesterday — it isn't broken until a full day passes with no session.
  if (!activeDays.has(dayKey(cursor))) {
    cursor = dayBefore(cursor);
  }
  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export function hoursSinceLastSession(sessions: SessionRecord[], now = Date.now()): number | null {
  if (sessions.length === 0) return null;
  const last = Math.max(...sessions.map((s) => s.endedAt));
  return (now - last) / 3_600_000;
}

// Re-export so the streak unit test can verify the DST-safe day arithmetic.
export { dayAfter };
