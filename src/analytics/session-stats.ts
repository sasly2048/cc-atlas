import type { SessionRecord } from "../types/domain.js";
import { dayKey, WEEKDAY_NAMES, dayOfWeek } from "../utils/dates.js";
import { groupBy, mean, median, percentile, sum } from "../utils/numbers.js";

/** Consolidates: cc-session-stats, @yurukusa/cc-session-stats (duplicate),
 * cc-session-length, cc-depth, cc-turns. */
export interface SessionStats {
  totalSessions: number;
  totalHours: number;
  avgSessionMinutes: number;
  medianSessionMinutes: number;
  p90SessionMinutes: number;
  avgTurnsPerSession: number;
  medianTurnsPerSession: number;
  avgUserTurns: number;
  fireAndForgetRate: number; // sessions with <= 1 user turn after the opener
  byWeekday: { day: string; sessions: number; hours: number }[];
  byProject: { project: string; sessions: number; hours: number }[];
  healthWarnings: string[];
}

export function computeSessionStats(sessions: SessionRecord[]): SessionStats {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalHours: 0,
      avgSessionMinutes: 0,
      medianSessionMinutes: 0,
      p90SessionMinutes: 0,
      avgTurnsPerSession: 0,
      medianTurnsPerSession: 0,
      avgUserTurns: 0,
      fireAndForgetRate: 0,
      byWeekday: [],
      byProject: [],
      healthWarnings: [],
    };
  }

  const durationsMin = sessions.map((s) => s.durationMs / 60_000);
  const turns = sessions.map((s) => s.turnCount);
  const totalHours = sum(sessions.map((s) => s.durationMs)) / 3_600_000;
  const fireAndForget = sessions.filter((s) => s.userTurnCount <= 1).length;

  const byWeekdayMap = groupBy(sessions, (s) => String(dayOfWeek(s.startedAt)));
  const byWeekday = WEEKDAY_NAMES.map((day, index) => {
    const bucket = byWeekdayMap.get(String(index)) ?? [];
    return { day, sessions: bucket.length, hours: sum(bucket.map((s) => s.durationMs)) / 3_600_000 };
  });

  const byProjectMap = groupBy(sessions, (s) => s.project);
  const byProject = [...byProjectMap.entries()]
    .map(([project, bucket]) => ({
      project,
      sessions: bucket.length,
      hours: sum(bucket.map((s) => s.durationMs)) / 3_600_000,
    }))
    .sort((a, b) => b.hours - a.hours);

  const healthWarnings: string[] = [];
  const longSessions = sessions.filter((s) => s.durationMs > 4 * 3_600_000).length;
  if (longSessions > 0) {
    healthWarnings.push(`${longSessions} session(s) ran longer than 4 hours without a break.`);
  }
  const dailyHours = new Map<string, number>();
  for (const s of sessions) {
    dailyHours.set(dayKey(s.startedAt), (dailyHours.get(dayKey(s.startedAt)) ?? 0) + s.durationMs / 3_600_000);
  }
  const marathonDays = [...dailyHours.values()].filter((h) => h > 10).length;
  if (marathonDays > 0) {
    healthWarnings.push(`${marathonDays} day(s) exceeded 10 total hours of session time.`);
  }

  return {
    totalSessions: sessions.length,
    totalHours,
    avgSessionMinutes: mean(durationsMin),
    medianSessionMinutes: median(durationsMin),
    p90SessionMinutes: percentile(durationsMin, 90),
    avgTurnsPerSession: mean(turns),
    medianTurnsPerSession: median(turns),
    avgUserTurns: mean(sessions.map((s) => s.userTurnCount)),
    fireAndForgetRate: fireAndForget / sessions.length,
    byWeekday,
    byProject,
    healthWarnings,
  };
}
