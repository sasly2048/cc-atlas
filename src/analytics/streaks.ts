import type { ToolCallRecord } from "../types/domain.js";
import { groupBy, mean, ratio, topEntries } from "../utils/numbers.js";

/** Consolidates: cc-streak, cc-recovery, cc-error/@yurukusa/cc-error (duplicate). */
export interface StreakStats {
  totalErrors: number;
  errorRate: number;
  medianStreak: number;
  longestStreak: number;
  streaksByBreakingTool: Array<[string, number]>; // which tool most often ends a clean streak
  selfRecoveryRate: number; // fraction of errors followed by a successful call on the same tool within 3 calls
  failureRateByTool: Array<{ tool: string; calls: number; errors: number; rate: number }>;
  sessionsWithAnyError: number;
  sessionErrorRate: number;
}

export function computeStreakStats(toolCalls: ToolCallRecord[]): StreakStats {
  if (toolCalls.length === 0) {
    return {
      totalErrors: 0,
      errorRate: 0,
      medianStreak: 0,
      longestStreak: 0,
      streaksByBreakingTool: [],
      selfRecoveryRate: 0,
      failureRateByTool: [],
      sessionsWithAnyError: 0,
      sessionErrorRate: 0,
    };
  }

  const bySession = groupBy(toolCalls, (t) => t.sessionId);
  const streakLengths: number[] = [];
  const breakingTool = new Map<string, number>();
  let recoveredErrors = 0;
  let totalErrors = 0;

  for (const calls of bySession.values()) {
    const ordered = [...calls].sort((a, b) => a.turnIndex - b.turnIndex || a.ts - b.ts);
    let streak = 0;

    ordered.forEach((call, index) => {
      if (call.status === "error") {
        totalErrors += 1;
        streakLengths.push(streak);
        breakingTool.set(call.toolName, (breakingTool.get(call.toolName) ?? 0) + 1);
        streak = 0;

        const lookahead = ordered.slice(index + 1, index + 4);
        if (lookahead.some((c) => c.toolName === call.toolName && c.status === "success")) {
          recoveredErrors += 1;
        }
      } else {
        streak += 1;
      }
    });
    streakLengths.push(streak);
  }

  const nonZero = streakLengths.filter((s) => s > 0);
  const sorted = [...nonZero].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const longest = sorted.length ? sorted[sorted.length - 1]! : 0;

  const byTool = groupBy(toolCalls, (t) => t.toolName);
  const failureRateByTool = [...byTool.entries()]
    .map(([tool, calls]) => {
      const errors = calls.filter((c) => c.status === "error").length;
      return { tool, calls: calls.length, errors, rate: ratio(errors, calls.length) };
    })
    .filter((row) => row.errors > 0)
    .sort((a, b) => b.rate - a.rate);

  const sessionsWithAnyError = [...bySession.values()].filter((calls) =>
    calls.some((c) => c.status === "error")
  ).length;

  return {
    totalErrors,
    errorRate: ratio(totalErrors, toolCalls.length),
    medianStreak: median,
    longestStreak: longest,
    streaksByBreakingTool: topEntries(breakingTool, 10),
    selfRecoveryRate: ratio(recoveredErrors, totalErrors),
    failureRateByTool,
    sessionsWithAnyError,
    sessionErrorRate: ratio(sessionsWithAnyError, bySession.size),
  };
}

export function averageStreak(streaks: number[]): number {
  return mean(streaks);
}
