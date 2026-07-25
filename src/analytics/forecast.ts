import type { SessionRecord } from "../types/domain.js";
import { dayKey } from "../utils/dates.js";
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

/** Consecutive calendar days (ending today or yesterday) with at least one
 * session — the "how many days in a row" number used for streak alerts. */
export function computeCurrentStreak(sessions: SessionRecord[], now = Date.now()): number {
  if (sessions.length === 0) return 0;
  const activeDays = new Set(sessions.map((s) => dayKey(s.startedAt)));

  let streak = 0;
  let cursor = new Date(now);
  // If there's no session yet today, the streak still counts through
  // yesterday — it isn't broken until a full day passes with no session.
  if (!activeDays.has(dayKey(cursor.getTime()))) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  while (activeDays.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

export function hoursSinceLastSession(sessions: SessionRecord[], now = Date.now()): number | null {
  if (sessions.length === 0) return null;
  const last = Math.max(...sessions.map((s) => s.endedAt));
  return (now - last) / 3_600_000;
}
