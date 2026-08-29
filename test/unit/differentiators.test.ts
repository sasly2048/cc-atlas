import { describe, expect, it } from "vitest";
import { compareProjects, computeProjectSummary } from "../../src/analytics/project-compare.js";
import { buildSessionTimeline, renderTimelineText } from "../../src/analytics/session-replay.js";
import { computeTeamReport } from "../../src/analytics/team.js";
import { computeAnomalies } from "../../src/analytics/anomalies.js";
import { computeGoalProgress } from "../../src/analytics/goals.js";
import { answerQuery } from "../../src/services/nlq.js";
import { renderPrometheusExport } from "../../src/reports/prometheus.js";
import { renderJsonExport } from "../../src/reports/json-export.js";
import { buildReportData, type ReportData } from "../../src/reports/data.js";
import type { GitCommitRecord, SessionRecord, ToolCallRecord } from "../../src/types/domain.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/database.js";
import { SessionRepository, ToolCallRepository } from "../../src/db/repositories.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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

describe("computeProjectSummary / compareProjects", () => {
  const sessions = [
    session({ id: "a1", project: "alpha", durationMs: 3_600_000, turnCount: 10, userTurnCount: 1 }),
    session({ id: "a2", project: "alpha", durationMs: 1_800_000, turnCount: 8, userTurnCount: 3 }),
    session({ id: "b1", project: "beta", durationMs: 600_000, turnCount: 4, userTurnCount: 4 }),
  ];
  const toolCalls = [
    call({ sessionId: "a1", toolName: "Read", status: "success" }),
    call({ sessionId: "a1", toolName: "Edit", status: "error" }),
    call({ sessionId: "a2", toolName: "Read", status: "success" }),
    call({ sessionId: "b1", toolName: "Bash", status: "success" }),
  ];

  it("scopes calls and hours to the given project only", () => {
    const alpha = computeProjectSummary("alpha", sessions, toolCalls);
    expect(alpha.sessions).toBe(2);
    expect(alpha.toolCalls).toBe(3);
    expect(alpha.errorRate).toBeCloseTo(1 / 3);

    const beta = computeProjectSummary("beta", sessions, toolCalls);
    expect(beta.sessions).toBe(1);
    expect(beta.toolCalls).toBe(1);
  });

  it("produces at least one highlight when projects differ notably", () => {
    const cmp = compareProjects(sessions, toolCalls, "alpha", "beta");
    expect(cmp.a.project).toBe("alpha");
    expect(cmp.b.project).toBe("beta");
    expect(cmp.highlights.length).toBeGreaterThan(0);
  });
});

describe("buildSessionTimeline / renderTimelineText", () => {
  it("orders steps by turn and flags self-recovered errors", () => {
    const s = session({ id: "s1" });
    const calls = [
      call({ sessionId: "s1", turnIndex: 0, toolName: "Read", status: "success" }),
      call({ sessionId: "s1", turnIndex: 1, toolName: "Bash", status: "error" }),
      call({ sessionId: "s1", turnIndex: 2, toolName: "Bash", status: "success" }),
    ];
    const timeline = buildSessionTimeline(s, calls);
    expect(timeline.steps.map((st) => st.toolName)).toEqual(["Read", "Bash", "Bash"]);
    expect(timeline.errorCount).toBe(1);
    expect(timeline.recoveredErrorCount).toBe(1);

    const text = renderTimelineText(timeline);
    expect(text).toContain("Bash(fail)");
  });
});

describe("computeTeamReport", () => {
  it("aggregates per source_label", () => {
    const sessions = [
      session({ id: "1", sourceLabel: "you", durationMs: 3_600_000 }),
      session({ id: "2", sourceLabel: "you", durationMs: 3_600_000 }),
      session({ id: "3", sourceLabel: "alice", durationMs: 1_800_000 }),
    ];
    const report = computeTeamReport(sessions);
    expect(report.members.map((m) => m.name).sort()).toEqual(["alice", "you"]);
    const you = report.members.find((m) => m.name === "you")!;
    expect(you.sessions).toBe(2);
    expect(you.hours).toBeCloseTo(2);
  });
});

describe("computeAnomalies", () => {
  it("returns nothing for too little history", () => {
    const sessions = [session({ id: "1" }), session({ id: "2" })];
    expect(computeAnomalies(sessions, [])).toEqual([]);
  });

  it("flags a session far longer than the norm", () => {
    const now = Date.now();
    const sessions = Array.from({ length: 10 }, (_, i) =>
      session({ id: `n${i}`, startedAt: now - i * DAY_MS, durationMs: 30 * 60_000 })
    );
    sessions.push(session({ id: "marathon", startedAt: now - 20 * DAY_MS, durationMs: 8 * 3_600_000 }));
    const anomalies = computeAnomalies(sessions, []);
    expect(anomalies.some((a) => a.kind === "marathon-session")).toBe(true);
  });
});

describe("computeGoalProgress", () => {
  it("reports hasGoals=false when nothing is configured", () => {
    const progress = computeGoalProgress([], { weeklyHoursTarget: 0, streakTargetDays: 0 });
    expect(progress.hasGoals).toBe(false);
  });

  it("computes weekly-hours progress against a target", () => {
    const now = Date.now();
    const sessions = [session({ id: "1", startedAt: now, durationMs: 3_600_000 * 5 })];
    const progress = computeGoalProgress(sessions, { weeklyHoursTarget: 10, streakTargetDays: 0 }, now);
    expect(progress.hasGoals).toBe(true);
    expect(progress.weeklyHoursSoFar).toBeCloseTo(5);
    expect(progress.weeklyHoursProgressPct).toBeCloseTo(50);
  });
});

describe("answerQuery", () => {
  const now = Date.now();
  const sessions = [
    session({ id: "1", project: "atlas", startedAt: now, durationMs: 3_600_000 * 2 }),
    session({ id: "2", project: "atlas", startedAt: now - 40 * DAY_MS, durationMs: 3_600_000 }),
  ];
  const toolCalls = [
    call({ sessionId: "1", toolName: "Read", status: "success", ts: now }),
    call({ sessionId: "1", toolName: "Bash", status: "error", ts: now }),
  ];
  const commits: GitCommitRecord[] = [];
  const ctx = { sessions, toolCalls, commits, burnoutConfig: DEFAULT_CONFIG.burnout };

  it("answers hours questions scoped to a project and period", () => {
    const answer = answerQuery("how many hours on atlas this week", ctx, now);
    expect(answer).toContain("2.0 hour");
    expect(answer).toContain("atlas");
  });

  it("answers error-rate questions", () => {
    const answer = answerQuery("what's my error rate this week", ctx, now);
    expect(answer).toContain("50.0%");
  });

  it("falls back with guidance for unrecognized questions", () => {
    const answer = answerQuery("what is the meaning of life", ctx, now);
    expect(answer).toContain("didn't recognize");
  });
});

describe("export renderers", () => {
  function buildData(): ReportData {
    const db = new Database(":memory:");
    migrate(db);
    const sessionRepo = new SessionRepository(db);
    const toolCallRepo = new ToolCallRepository(db);
    sessionRepo.upsert(session({ id: "1", durationMs: 3_600_000 }));
    // Multiple tool names so the labeled 	ool_calls_by_tool family has
    // several distinct samples \u2014 that's the case that triggered the
    // duplicated # HELP / # TYPE bug before the fix (#7).
    toolCallRepo.upsertMany([
      call({ sessionId: "1", toolName: "Read", turnIndex: 0 }),
      call({ sessionId: "1", toolName: "Edit", turnIndex: 1, category: "edit" }),
      call({ sessionId: "1", toolName: "Bash", turnIndex: 2, category: "execute" }),
      call({ sessionId: "1", toolName: "Bash", turnIndex: 3, category: "execute" }),
    ]);
    return buildReportData(db, DEFAULT_CONFIG, 0, "All time");
  }

  it("renders valid Prometheus exposition text", () => {
    const text = renderPrometheusExport(buildData());
    expect(text).toContain("# HELP cc_atlas_sessions_total");
    expect(text).toContain("cc_atlas_sessions_total 1");
  });

  it("emits # HELP / # TYPE exactly once per metric name, even for labeled families (#7)", () => {
    const text = renderPrometheusExport(buildData());
    // tool_calls_by_tool is emitted in a loop with one sample per tool —
    // this is the family that previously repeated its preamble per sample.
    const helpMatches = text.match(/^# HELP cc_atlas_tool_calls_by_tool\b/gm) ?? [];
    const typeMatches = text.match(/^# TYPE cc_atlas_tool_calls_by_tool\b/gm) ?? [];
    expect(helpMatches).toHaveLength(1);
    expect(typeMatches).toHaveLength(1);
    // Sanity: the labeled samples themselves are still present, one per tool.
    expect(text).toMatch(/cc_atlas_tool_calls_by_tool\{tool="Read"\}/);
    expect(text).toMatch(/cc_atlas_tool_calls_by_tool\{tool="Edit"\}/);
    expect(text).toMatch(/cc_atlas_tool_calls_by_tool\{tool="Bash"\}/);
  });

  it("renders parseable JSON with the expected shape", () => {
    const text = renderJsonExport(buildData());
    const parsed = JSON.parse(text);
    expect(parsed.sessionStats.totalSessions).toBe(1);
    expect(parsed.periodLabel).toBe("All time");
  });
});
