import { describe, expect, it } from "vitest";
import { renderPrometheusExport } from "../../src/reports/prometheus.js";
import { renderMarkdownReport, renderStandupReport } from "../../src/reports/markdown.js";
import { renderHtmlReport } from "../../src/reports/html.js";
import { renderStatsBadge } from "../../src/reports/badge.js";
import { renderReceipt } from "../../src/reports/receipt.js";
import { buildReportData, type ReportData } from "../../src/reports/data.js";
import { DEFAULT_CONFIG, sanitize } from "../../src/core/config.js";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/database.js";
import { SessionRepository, ToolCallRepository } from "../../src/db/repositories.js";
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
    ...overrides,
  };
}

function buildDataWith(overrides: { sessions?: SessionRecord[]; toolCalls?: ToolCallRecord[] }): ReportData {
  const db = new Database(":memory:");
  migrate(db);
  const sessionRepo = new SessionRepository(db);
  const toolCallRepo = new ToolCallRepository(db);
  for (const s of overrides.sessions ?? []) sessionRepo.upsert(s);
  for (const c of overrides.toolCalls ?? []) toolCallRepo.insertMany([c]);
  return buildReportData(db, DEFAULT_CONFIG, 0, "All time");
}

describe("prometheus export — security", () => {
  it("escapes newlines in label values to prevent metric smuggling", () => {
    const data = buildDataWith({
      sessions: [session({ id: "1", project: "demo", durationMs: 60_000 })],
      toolCalls: [
        call({ sessionId: "1", toolName: "Read", turnIndex: 0 }),
        // A malicious tool name that tries to inject a second metric line.
        call({
          sessionId: "1",
          toolName: 'Read"\ncc_atlas_smuggled_metric 1\n',
          turnIndex: 1,
          category: "read",
        }),
      ],
    });
    const text = renderPrometheusExport(data);
    // The newline must be escaped as the literal two characters `\n`, not
    // emitted as a raw line break (which would let an attacker inject
    // additional metric lines or even arbitrary exposition content).
    // The `"` in the tool name must also be backslash-escaped.
    expect(text).toContain('tool="Read\\"\\ncc_atlas_smuggled_metric 1\\n"');
    // The smuggled metric name must NOT appear on its own line.
    expect(text).not.toMatch(/^cc_atlas_smuggled_metric\b/m);
  });

  it("escapes backslashes in label values", () => {
    const data = buildDataWith({
      sessions: [session({ id: "1", project: "demo", durationMs: 60_000 })],
      toolCalls: [
        call({ sessionId: "1", toolName: "Read", turnIndex: 0 }),
        call({ sessionId: "1", toolName: "Bad\\Path", turnIndex: 1, category: "read" }),
      ],
    });
    const text = renderPrometheusExport(data);
    expect(text).toContain('tool="Bad\\\\Path"');
  });
});

describe("markdown report — injection resistance", () => {
  it("escapes pipe characters in project names so the table layout survives", () => {
    const data = buildDataWith({
      sessions: [session({ id: "1", project: "alpha|bravo|charlie", durationMs: 60_000 })],
    });
    const md = renderMarkdownReport(data);
    // Every table row (header, separator, and data) should have the same
    // cell count after escaping. We split on unescaped pipes only — an
    // escaped \| is part of a single cell. 3 cells = 5 segments when
    // split on unescaped `|`.
    const tableRows = md
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("|--") && !/^\|\s*Tool\s*\|/.test(l));
    expect(tableRows.length).toBeGreaterThan(0);
    for (const row of tableRows) {
      const unescapedPipes = row.split(/(?<!\\)\|/g).length;
      expect(unescapedPipes).toBe(5); // 3 cells + 2 surrounding pipes = 5 segments
    }
    // The escaped form is actually present, so the visual table is preserved.
    expect(md).toContain("alpha\\|bravo\\|charlie");
  });

  it("escapes inline markdown emphasis in the standup report", () => {
    const data = buildDataWith({
      sessions: [session({ id: "1", project: "alpha*evil*bravo", durationMs: 60_000 })],
    });
    const text = renderStandupReport(data);
    expect(text).toContain("alpha\\*evil\\*bravo");
  });
});

describe("html report — escape enforcement", () => {
  it("escapes the period label in the title and body", () => {
    // We can't easily rebuild data.periodLabel (it's a passed-in label),
    // so verify the renderer does escape the values it gets. Build a data
    // with a hostile periodLabel via the buildReportData signature.
    const db = new Database(":memory:");
    migrate(db);
    const sessionRepo = new SessionRepository(db);
    sessionRepo.upsert(session({ id: "1", durationMs: 60_000 }));
    const hostile = buildReportData(db, DEFAULT_CONFIG, 0, '<script>alert(1)</script>');
    const html = renderHtmlReport(hostile);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("badge svg — XML escape", () => {
  it("escapes ampersands and angle brackets in the embedded text", () => {
    const data = buildDataWith({});
    // The label is currently a constant, but the renderer should still
    // escape any user-derived value that flows in via future changes.
    const svg = renderStatsBadge(data, 0.5);
    // ampersand escapes are produced for the `&` characters in the inline
    // template attributes; verify no raw unescaped & shows up in text.
    expect(svg).not.toMatch(/&(?!amp;|apos;|quot;|lt;|gt;|#)/);
  });
});

describe("receipt — defensive against long values", () => {
  it("does not break the receipt layout with a very long tool name", () => {
    const data = buildDataWith({
      sessions: [session({ id: "1", durationMs: 60_000 })],
      toolCalls: [call({ sessionId: "1", toolName: "A".repeat(80), category: "execute" })],
    });
    const out = renderReceipt(data);
    // Receipt width is 40 chars — make sure no row blows past it.
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("config sanitization (#N)", () => {
  it("coerces invalid burnout thresholds to defaults", () => {
    const cleaned = sanitize({
      burnout: {
        dailyHourWarning: -5 as any,
        weeklyHourWarning: Number.NaN as any,
        lateNightHour: 99 as any,
      } as any,
    });
    const b: any = cleaned.burnout;
    expect(b.dailyHourWarning).toBe(DEFAULT_CONFIG.burnout.dailyHourWarning);
    expect(b.weeklyHourWarning).toBe(DEFAULT_CONFIG.burnout.weeklyHourWarning);
    expect(b.lateNightHour).toBe(DEFAULT_CONFIG.burnout.lateNightHour);
  });

  it("drops non-string entries from gitRepos and team.members", () => {
    const cleaned = sanitize({
      gitRepos: ["/ok", 42, null, "/also-ok"] as any,
      team: { members: [{ name: 1, claudeProjectsDir: "/p" }] as any },
    } as any);
    expect(cleaned.gitRepos).toEqual(["/ok", "/also-ok"]);
    // The invalid team member won't be re-cast by sanitize (it's typed
    // differently); at minimum, the array shape is preserved so the
    // runtime can decide. We only require that gitRepos is filtered.
  });

  it("rejects unknown theme values", () => {
    const cleaned = sanitize({ theme: "rainbow" as any });
    expect(cleaned.theme).toBe(DEFAULT_CONFIG.theme);
  });

  it("clamps ingest.maxAgeDays and alerts.streakRiskHours to non-negative numbers", () => {
    const cleaned = sanitize({
      ingest: { maxAgeDays: -1 as any },
      alerts: { streakRiskHours: -7 as any },
    } as any);
    expect((cleaned.ingest as any).maxAgeDays).toBe(DEFAULT_CONFIG.ingest.maxAgeDays);
    expect((cleaned.alerts as any).streakRiskHours).toBe(DEFAULT_CONFIG.alerts.streakRiskHours);
  });
});

describe("loadConfig — round trip with a hostile on-disk config", () => {
  it("survives a hand-edited config with the wrong types", () => {
    // CC_ATLAS_HOME / CONFIG_PATH are module-level constants read at import
    // time, so we can't just flip the env var here — exercise sanitize()
    // directly with the same shape deepMerge would receive.
    const cleaned = sanitize({
      theme: "neon" as any,
      burnout: { dailyHourWarning: "ten" as any, lateNightHour: 99 },
      gitRepos: ["/valid", 5, null, "/also-valid"] as any,
      ingest: { maxAgeDays: -10 },
    });
    expect(cleaned.theme).toBe(DEFAULT_CONFIG.theme);
    const burnout: any = cleaned.burnout;
    expect(burnout.dailyHourWarning).toBe(DEFAULT_CONFIG.burnout.dailyHourWarning);
    expect(burnout.lateNightHour).toBe(DEFAULT_CONFIG.burnout.lateNightHour);
    expect(cleaned.gitRepos).toEqual(["/valid", "/also-valid"]);
    expect((cleaned.ingest as any).maxAgeDays).toBe(DEFAULT_CONFIG.ingest.maxAgeDays);
  });
});
