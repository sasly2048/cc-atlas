import type { ToolkitConfig } from "../core/config.js";
import type { SessionRecord } from "../types/domain.js";
import { dayKey, hourOfDay, isoWeekKey, WEEKDAY_NAMES, dayOfWeek } from "../utils/dates.js";
import { groupBy, mean, sum } from "../utils/numbers.js";

/** Consolidates: cc-burnout, cc-peak, cc-night-owl, cc-day-pattern, cc-shift,
 * cc-gap, cc-momentum. All read the same started_at/duration series and
 * differ only in how they slice it, so they're computed together here. */
export interface BurnoutReport {
  score: number; // 0-100, higher = higher burnout risk
  riskLevel: "low" | "moderate" | "high" | "severe";
  factors: string[];
  peakHours: { hour: number; sessions: number }[];
  bestWindow: { startHour: number; endHour: number } | null;
  lateNightSessionRate: number;
  weekdayBreakdown: { day: string; hours: number }[];
  hourlyShift: number[]; // 24 buckets, hours of activity per hour-of-day
  gapHoursBetweenSessions: { median: number; min: number; max: number };
  weeklyMomentum: { week: string; hours: number }[];
  momentumTrend: "accelerating" | "steady" | "declining";
}

export function computeBurnoutReport(
  sessions: SessionRecord[],
  config: ToolkitConfig["burnout"]
): BurnoutReport {
  if (sessions.length === 0) {
    return {
      score: 0,
      riskLevel: "low",
      factors: [],
      peakHours: [],
      bestWindow: null,
      lateNightSessionRate: 0,
      weekdayBreakdown: [],
      hourlyShift: new Array(24).fill(0),
      gapHoursBetweenSessions: { median: 0, min: 0, max: 0 },
      weeklyMomentum: [],
      momentumTrend: "steady",
    };
  }

  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);

  const hourlyShift = new Array(24).fill(0) as number[];
  for (const s of sessions) {
    const hour = hourOfDay(s.startedAt);
    hourlyShift[hour] = (hourlyShift[hour] ?? 0) + s.durationMs / 3_600_000;
  }
  const peakHours = hourlyShift
    .map((hours, hour) => ({ hour, sessions: hours }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);

  const bestWindow = findBestWindow(hourlyShift);

  const lateNight = sessions.filter((s) => hourOfDay(s.startedAt) >= config.lateNightHour || hourOfDay(s.startedAt) < 5);
  const lateNightSessionRate = lateNight.length / sessions.length;

  const byWeekday = groupBy(sessions, (s) => String(dayOfWeek(s.startedAt)));
  const weekdayBreakdown = WEEKDAY_NAMES.map((day, index) => ({
    day,
    hours: sum((byWeekday.get(String(index)) ?? []).map((s) => s.durationMs)) / 3_600_000,
  }));

  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    gaps.push((ordered[i]!.startedAt - ordered[i - 1]!.endedAt) / 3_600_000);
  }
  const positiveGaps = gaps.filter((g) => g >= 0);
  const gapSorted = [...positiveGaps].sort((a, b) => a - b);
  const gapHoursBetweenSessions = {
    median: gapSorted.length ? gapSorted[Math.floor(gapSorted.length / 2)]! : 0,
    min: gapSorted.length ? gapSorted[0]! : 0,
    max: gapSorted.length ? gapSorted[gapSorted.length - 1]! : 0,
  };

  const byWeek = groupBy(sessions, (s) => isoWeekKey(s.startedAt));
  const weeklyMomentum = [...byWeek.entries()]
    .map(([week, bucket]) => ({ week, hours: sum(bucket.map((s) => s.durationMs)) / 3_600_000 }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
  const momentumTrend = classifyMomentum(weeklyMomentum.map((w) => w.hours));

  const dailyHours = new Map<string, number>();
  for (const s of sessions) {
    dailyHours.set(dayKey(s.startedAt), (dailyHours.get(dayKey(s.startedAt)) ?? 0) + s.durationMs / 3_600_000);
  }

  const { score, factors } = scoreBurnout({
    dailyHours: [...dailyHours.values()],
    weeklyHours: weeklyMomentum.map((w) => w.hours),
    lateNightSessionRate,
    medianGapHours: gapHoursBetweenSessions.median,
    config,
  });

  return {
    score,
    riskLevel: riskLevelFor(score),
    factors,
    peakHours,
    bestWindow,
    lateNightSessionRate,
    weekdayBreakdown,
    hourlyShift,
    gapHoursBetweenSessions,
    weeklyMomentum,
    momentumTrend,
  };
}

function findBestWindow(hourlyShift: number[]): { startHour: number; endHour: number } | null {
  let bestStart = 0;
  let bestSum = -Infinity;
  for (let start = 0; start < 24; start++) {
    let windowSum = 0;
    for (let offset = 0; offset < 3; offset++) windowSum += hourlyShift[(start + offset) % 24]!;
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }
  if (bestSum <= 0) return null;
  return { startHour: bestStart, endHour: (bestStart + 3) % 24 };
}

function classifyMomentum(weeklyHours: number[]): BurnoutReport["momentumTrend"] {
  if (weeklyHours.length < 3) return "steady";
  const recent = mean(weeklyHours.slice(-2));
  const prior = mean(weeklyHours.slice(0, -2));
  if (prior === 0) return "steady";
  const delta = (recent - prior) / prior;
  if (delta > 0.15) return "accelerating";
  if (delta < -0.15) return "declining";
  return "steady";
}

function scoreBurnout(input: {
  dailyHours: number[];
  weeklyHours: number[];
  lateNightSessionRate: number;
  medianGapHours: number;
  config: ToolkitConfig["burnout"];
}): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  const overDailyDays = input.dailyHours.filter((h) => h > input.config.dailyHourWarning).length;
  if (overDailyDays > 0) {
    const weight = Math.min(30, overDailyDays * 4);
    score += weight;
    factors.push(`${overDailyDays} day(s) exceeded your ${input.config.dailyHourWarning}h daily threshold.`);
  }

  const overWeeks = input.weeklyHours.filter((h) => h > input.config.weeklyHourWarning).length;
  if (overWeeks > 0) {
    const weight = Math.min(30, overWeeks * 8);
    score += weight;
    factors.push(`${overWeeks} week(s) exceeded your ${input.config.weeklyHourWarning}h weekly threshold.`);
  }

  if (input.lateNightSessionRate > 0.2) {
    const weight = Math.min(20, input.lateNightSessionRate * 40);
    score += weight;
    factors.push(`${Math.round(input.lateNightSessionRate * 100)}% of sessions start late at night.`);
  }

  if (input.medianGapHours > 0 && input.medianGapHours < 6) {
    const weight = Math.min(20, (6 - input.medianGapHours) * 4);
    score += weight;
    factors.push(`Median rest between sessions is only ${input.medianGapHours.toFixed(1)}h.`);
  }

  return { score: Math.round(Math.min(100, score)), factors };
}

function riskLevelFor(score: number): BurnoutReport["riskLevel"] {
  if (score >= 70) return "severe";
  if (score >= 45) return "high";
  if (score >= 20) return "moderate";
  return "low";
}
