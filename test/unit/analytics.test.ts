import { describe, expect, it } from "vitest";
import { computeSessionStats } from "../../src/analytics/session-stats.js";
import { computeToolUsageStats } from "../../src/analytics/tool-usage.js";
import { computeStreakStats } from "../../src/analytics/streaks.js";
import { computeCurrentStreak } from "../../src/analytics/forecast.js";
import { computeCostReport } from "../../src/analytics/cost.js";
import { dayKey, monthKey, hourOfDay, dayOfWeek } from "../../src/utils/dates.js";
import type { SessionRecord, ToolCallRecord } from "../../src/types/domain.js";

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s",
    project: "demo",
    cwd: null,
    sourceFile: "f.jsonl",
    startedAt: 0,
    endedAt: 0,
    durationMs: 0,
    turnCount: 0,
    userTurnCount: 0,
    assistantTurnCount: 0,
    messageCount: 0,
    toolCallCount: 0,
    errorCount: 0,
    model: null,
    subagentCount: 0,
    thinkingBlockCount: 0,
    compactionCount: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    maxContextTokens: 0,
    sourceLabel: "you",
    ...overrides,
  };
}

function call(overrides: Partial<ToolCallRecord>): ToolCallRecord {
  return {
    sessionId: "s",
    toolName: "Read",
    ts: 0,
    status: "success",
    turnIndex: 0,
    inputPreview: null,
    category: "read",
    filePath: null,
    command: null,
    sizeDelta: null,
    toolUseId: null,
    orphaned: false,
    ...overrides,
  };
}

describe("computeSessionStats", () => {
  it("returns zeroed stats for an empty session list", () => {
    const stats = computeSessionStats([]);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalHours).toBe(0);
  });

  it("computes totals, averages and fire-and-forget rate", () => {
    const sessions = [
      session({ id: "a", durationMs: 3_600_000, turnCount: 10, userTurnCount: 1 }),
      session({ id: "b", durationMs: 1_800_000, turnCount: 4, userTurnCount: 3 }),
    ];
    const stats = computeSessionStats(sessions);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalHours).toBeCloseTo(1.5);
    expect(stats.avgTurnsPerSession).toBe(7);
    expect(stats.fireAndForgetRate).toBe(0.5); // only session "a" has userTurnCount <= 1
  });

  it("flags a marathon session as a health warning", () => {
    const sessions = [session({ id: "a", durationMs: 5 * 3_600_000 })];
    const stats = computeSessionStats(sessions);
    expect(stats.healthWarnings.some((w) => w.includes("4 hours"))).toBe(true);
  });
});

describe("computeToolUsageStats", () => {
  it("computes tool frequency, ratios and first/last tool per session", () => {
    const calls = [
      call({ sessionId: "s1", toolName: "Read", turnIndex: 0 }),
      call({ sessionId: "s1", toolName: "Edit", turnIndex: 1, category: "edit" }),
      call({ sessionId: "s1", toolName: "Bash", turnIndex: 2, category: "execute" }),
    ];
    const stats = computeToolUsageStats(calls);

    expect(stats.totalCalls).toBe(3);
    expect(stats.firstToolCounts).toContainEqual(["Read", 1]);
    expect(stats.lastToolCounts).toContainEqual(["Bash", 1]);
    expect(stats.ratios.readToEdit).toBe(1);
    expect(stats.topPairs.some(([pair]) => pair === "Read -> Edit")).toBe(true);
  });

  it("returns empty-safe defaults with no tool calls", () => {
    const stats = computeToolUsageStats([]);
    expect(stats.totalCalls).toBe(0);
    expect(stats.byTool).toEqual([]);
  });
});

describe("computeStreakStats", () => {
  it("computes error rate and streak lengths across sessions", () => {
    const calls = [
      call({ sessionId: "s1", turnIndex: 0, status: "success" }),
      call({ sessionId: "s1", turnIndex: 1, status: "success" }),
      call({ sessionId: "s1", turnIndex: 2, status: "error", toolName: "Bash" }),
      call({ sessionId: "s1", turnIndex: 3, status: "success", toolName: "Bash" }),
    ];
    const stats = computeStreakStats(calls);
    expect(stats.totalErrors).toBe(1);
    expect(stats.errorRate).toBe(0.25);
    expect(stats.selfRecoveryRate).toBe(1); // the failing Bash call is retried successfully right after
  });

  it("reports zero error rate when nothing failed", () => {
    const calls = [call({ status: "success" }), call({ status: "success" })];
    const stats = computeStreakStats(calls);
    expect(stats.errorRate).toBe(0);
    expect(stats.failureRateByTool).toEqual([]);
  });
});

describe("computeCurrentStreak", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("counts consecutive active days ending today", () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    const sessions = [
      session({ startedAt: now }),
      session({ startedAt: now - DAY }),
      session({ startedAt: now - 2 * DAY }),
    ];
    expect(computeCurrentStreak(sessions, now)).toBe(3);
  });

  it("still counts the streak through yesterday if today has no session yet", () => {
    const now = Date.parse("2026-03-10T08:00:00.000Z");
    const sessions = [session({ startedAt: now - DAY })];
    expect(computeCurrentStreak(sessions, now)).toBe(1);
  });

  it("returns 0 once a full day gap breaks the streak", () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    const sessions = [session({ startedAt: now - 3 * DAY })];
    expect(computeCurrentStreak(sessions, now)).toBe(0);
  });
});

describe("computeCostReport", () => {
  it("computes cache savings as the delta between cached and uncached cost", () => {
    const sessions = [
      session({ inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 5_000_000, cacheCreationTokens: 0 }),
    ];
    const report = computeCostReport(sessions);
    expect(report.cacheSavingsUsd).toBeGreaterThan(0);
    expect(report.costWithoutCacheUsd).toBeGreaterThan(report.actualCostUsd);
  });
});

describe("dates (local-TZ consistency, #6)", () => {
  it("dayKey and monthKey are consistent with hourOfDay/dayOfWeek in the same TZ", () => {
    // Pick a fixed instant and verify the dayKey it produces, plus the
    // hour and weekday, all reflect the same local calendar moment.
    // The exact values are TZ-dependent, so we assert the cross-consistency
    // invariants rather than the specific numbers.
    const noonLocal = new Date();
    noonLocal.setHours(12, 0, 0, 0);
    const ts = noonLocal.getTime();

    // The dayKey must start with the same YYYY-MM as the monthKey.
    expect(monthKey(ts)).toBe(dayKey(ts).slice(0, 7));

    // The hour must be 12 and the weekday must match the same calendar day
    // the dayKey encodes — these all read local time.
    expect(hourOfDay(ts)).toBe(12);
    expect(dayOfWeek(ts)).toBe(noonLocal.getDay());
  });

  it("dayKey agrees with the local date (not UTC date)", () => {
    // 23:30 local on 2026-03-15 in any TZ: the local date is 2026-03-15
    // regardless of where on the globe the user is. Build that moment from
    // local components and verify dayKey reads it back as 2026-03-15.
    const local = new Date(2026, 2, 15, 23, 30, 0); // month is 0-indexed
    expect(dayKey(local.getTime())).toBe("2026-03-15");
    expect(monthKey(local.getTime())).toBe("2026-03");
  });
});
