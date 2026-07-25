import type { SessionRecord } from "../types/domain.js";
import type { ToolkitConfig } from "../core/config.js";
import { computeCurrentStreak } from "./forecast.js";
import { isoWeekKey } from "../utils/dates.js";
import { clamp, sum } from "../utils/numbers.js";

/** Not derived from any yurukusa package. cc-alert (Streak risk alert) only
 * warns when a streak is about to lapse; this is a step further — set an
 * actual weekly-hours and streak target in config.goals and get ongoing
 * progress against it, not just a last-minute nudge. */
export interface GoalProgress {
  weeklyHoursTarget: number;
  weeklyHoursSoFar: number;
  weeklyHoursProgressPct: number;
  streakTargetDays: number;
  currentStreakDays: number;
  streakProgressPct: number;
  hasGoals: boolean;
}

export function computeGoalProgress(
  sessions: SessionRecord[],
  goals: ToolkitConfig["goals"],
  now = Date.now()
): GoalProgress {
  const thisWeek = isoWeekKey(now);
  const weeklyHoursSoFar =
    sum(sessions.filter((s) => isoWeekKey(s.startedAt) === thisWeek).map((s) => s.durationMs)) / 3_600_000;

  const currentStreakDays = computeCurrentStreak(sessions, now);

  return {
    weeklyHoursTarget: goals.weeklyHoursTarget,
    weeklyHoursSoFar,
    weeklyHoursProgressPct:
      goals.weeklyHoursTarget > 0 ? clamp((weeklyHoursSoFar / goals.weeklyHoursTarget) * 100, 0, 100) : 0,
    streakTargetDays: goals.streakTargetDays,
    currentStreakDays,
    streakProgressPct:
      goals.streakTargetDays > 0 ? clamp((currentStreakDays / goals.streakTargetDays) * 100, 0, 100) : 0,
    hasGoals: goals.weeklyHoursTarget > 0 || goals.streakTargetDays > 0,
  };
}
