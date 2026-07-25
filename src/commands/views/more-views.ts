import fs from "node:fs";
import path from "node:path";
import type { Db } from "../../db/database.js";
import type { ToolkitConfig } from "../../core/config.js";
import { updateConfig } from "../../core/config.js";
import { REPORTS_DIR } from "../../core/paths.js";
import { SessionRepository, ToolCallRepository, GitCommitRepository } from "../../db/repositories.js";
import { compareProjects } from "../../analytics/project-compare.js";
import { buildSessionTimeline } from "../../analytics/session-replay.js";
import { computeTeamReport } from "../../analytics/team.js";
import { computeAnomalies } from "../../analytics/anomalies.js";
import { computeGoalProgress } from "../../analytics/goals.js";
import { computeSessionStats } from "../../analytics/session-stats.js";
import { answerQuery } from "../../services/nlq.js";
import { buildReportData } from "../../reports/data.js";
import { renderPrometheusExport } from "../../reports/prometheus.js";
import { renderJsonExport } from "../../reports/json-export.js";
import { renderTable, renderKeyValueTable } from "../../ui/table.js";
import { renderBox } from "../../ui/banner.js";
import { selectMenu, input } from "../../ui/prompts.js";
import { heading, good, warn, bad, subtle, accent, scoreBar } from "../../ui/theme.js";

function loadCore(db: Db) {
  const sessions = new SessionRepository(db).all();
  const toolCalls = new ToolCallRepository(db).all();
  const commits = new GitCommitRepository(db).all();
  return { sessions, toolCalls, commits };
}

function emptyStateNotice(sessionCount: number): boolean {
  if (sessionCount === 0) {
    console.log(warn("No session data yet. Run “Sync data” from the main menu first."));
    return true;
  }
  return false;
}

// ── Cross-project comparison ──────────────────────────────────────────

export async function showProjectComparison(db: Db): Promise<void> {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const stats = computeSessionStats(sessions);
  if (stats.byProject.length < 2) {
    console.log(warn("Need at least two projects with recorded sessions to compare."));
    return;
  }

  const projectA = await selectMenu(
    "First project",
    stats.byProject.map((p) => ({ name: `${p.project} (${p.sessions} sessions)`, value: p.project }))
  );
  const projectB = await selectMenu(
    "Second project",
    stats.byProject.filter((p) => p.project !== projectA).map((p) => ({ name: `${p.project} (${p.sessions} sessions)`, value: p.project }))
  );

  const cmp = compareProjects(sessions, toolCalls, projectA, projectB);

  console.log(heading(`\n🆚 ${cmp.a.project} vs ${cmp.b.project}`));
  console.log(
    renderTable(
      ["Metric", cmp.a.project, cmp.b.project],
      [
        ["Sessions", cmp.a.sessions, cmp.b.sessions],
        ["Hours", cmp.a.hours.toFixed(1), cmp.b.hours.toFixed(1)],
        ["Avg session length", `${cmp.a.avgSessionMinutes.toFixed(0)}m`, `${cmp.b.avgSessionMinutes.toFixed(0)}m`],
        ["Avg turns/session", cmp.a.avgTurnsPerSession.toFixed(1), cmp.b.avgTurnsPerSession.toFixed(1)],
        ["Fire-and-forget rate", `${(cmp.a.fireAndForgetRate * 100).toFixed(0)}%`, `${(cmp.b.fireAndForgetRate * 100).toFixed(0)}%`],
        ["Tool calls", cmp.a.toolCalls, cmp.b.toolCalls],
        ["Error rate", `${(cmp.a.errorRate * 100).toFixed(1)}%`, `${(cmp.b.errorRate * 100).toFixed(1)}%`],
        ["Avg distinct tools/session", cmp.a.avgDistinctToolsPerSession.toFixed(1), cmp.b.avgDistinctToolsPerSession.toFixed(1)],
        ["Top tool", cmp.a.topTool ?? "—", cmp.b.topTool ?? "—"],
      ]
    )
  );

  console.log(heading("\nHighlights"));
  for (const line of cmp.highlights) console.log(`  ${accent("◆")} ${line}`);
}

// ── Session replay ────────────────────────────────────────────────────

export async function showSessionReplay(db: Db): Promise<void> {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 25);
  const sessionId = await selectMenu(
    "Pick a session to replay",
    recent.map((s) => ({
      name: `${new Date(s.startedAt).toLocaleString()} · ${s.project} · ${(s.durationMs / 60_000).toFixed(0)}m · ${s.toolCallCount} calls${s.errorCount > 0 ? ` · ${s.errorCount} error(s)` : ""}`,
      value: s.id,
    }))
  );

  const session = sessions.find((s) => s.id === sessionId)!;
  const timeline = buildSessionTimeline(session, toolCalls);

  console.log(
    renderBox(
      renderKeyValueTable([
        ["Project", session.project],
        ["Started", new Date(session.startedAt).toLocaleString()],
        ["Duration", `${(session.durationMs / 60_000).toFixed(0)}m`],
        ["Tool calls", timeline.steps.length],
        ["Errors", timeline.errorCount > 0 ? warn(String(timeline.errorCount)) : good("0")],
        ["Self-recovered", timeline.recoveredErrorCount],
      ]),
      { title: "🎬 Session Replay", color: "cyan" }
    )
  );

  console.log(heading("\nTimeline"));
  const lines: string[] = [];
  let line = "  ";
  for (const step of timeline.steps) {
    const label = step.status === "error" ? bad(`${step.toolName}(fail)`) : good(step.toolName);
    const segment = lines.length === 0 && line === "  " ? label : ` → ${label}`;
    if (line.length + segment.length > 100) {
      lines.push(line);
      line = "  " + label;
    } else {
      line += segment;
    }
  }
  if (line.trim().length) lines.push(line);
  console.log(lines.join("\n"));
}

// ── Team activity ─────────────────────────────────────────────────────

export function showTeamActivity(db: Db, config: ToolkitConfig): void {
  const sessions = new SessionRepository(db).allSources();
  if (emptyStateNotice(sessions.length)) return;

  if (config.team.members.length === 0) {
    console.log(subtle("No team members configured — this shows only your own activity."));
    console.log(subtle("Add teammates in Settings → Team members to aggregate across people."));
  }

  const report = computeTeamReport(sessions);
  console.log(heading("\n👥 Team Activity"));
  console.log(
    renderTable(
      ["Member", "Sessions", "Hours", "Avg session", "Streak", "Most active day", "Projects"],
      report.members.map((m) => [
        m.name,
        m.sessions,
        m.hours.toFixed(1),
        `${m.avgSessionMinutes.toFixed(0)}m`,
        `${m.currentStreak}d`,
        m.mostActiveDay ?? "—",
        m.projects,
      ])
    )
  );
  console.log(subtle(`\nTotal across all members: ${report.totalHours.toFixed(1)}h`));
}

// ── Anomaly detection ──────────────────────────────────────────────────

export function showAnomalies(db: Db): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const anomalies = computeAnomalies(sessions, toolCalls);
  console.log(heading("\n🚨 Anomalies"));

  if (anomalies.length === 0) {
    console.log(good("Nothing unusual detected — recent activity looks consistent with your history."));
    return;
  }

  for (const a of anomalies.slice(0, 20)) {
    const marker = a.severity === "high" ? bad("●") : warn("●");
    console.log(`  ${marker} ${subtle(a.date)}  ${a.description}`);
  }
  if (anomalies.length > 20) console.log(subtle(`\n…and ${anomalies.length - 20} more.`));
}

// ── Goals ────────────────────────────────────────────────────────────

export function showGoals(db: Db, config: ToolkitConfig): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const progress = computeGoalProgress(sessions, config.goals);
  console.log(heading("\n🎯 Goals"));

  if (!progress.hasGoals) {
    console.log(subtle("No goals set yet. Set a weekly-hours or streak target in Settings → Goals."));
    return;
  }

  if (progress.weeklyHoursTarget > 0) {
    console.log(`  Weekly hours: ${scoreBar(progress.weeklyHoursSoFar, progress.weeklyHoursTarget, 24)}`);
    console.log(subtle(`    ${progress.weeklyHoursSoFar.toFixed(1)}h of ${progress.weeklyHoursTarget}h this week`));
  }
  if (progress.streakTargetDays > 0) {
    console.log(`  Streak:       ${scoreBar(progress.currentStreakDays, progress.streakTargetDays, 24)}`);
    console.log(subtle(`    ${progress.currentStreakDays} of ${progress.streakTargetDays} day(s)`));
  }
}

export async function runGoalsSettings(config: ToolkitConfig): Promise<ToolkitConfig> {
  const field = await selectMenu("Goal to set", [
    { name: `Weekly hours target (current: ${config.goals.weeklyHoursTarget || "off"})`, value: "weeklyHoursTarget" },
    { name: `Streak target in days (current: ${config.goals.streakTargetDays || "off"})`, value: "streakTargetDays" },
    { name: "Back", value: "back" },
  ]);
  if (field === "back") return config;

  if (field === "weeklyHoursTarget") {
    const value = await input("Weekly hours target (0 to disable)", String(config.goals.weeklyHoursTarget));
    return updateConfig({ goals: { ...config.goals, weeklyHoursTarget: Number(value) || 0 } });
  }
  const value = await input("Streak target in days (0 to disable)", String(config.goals.streakTargetDays));
  return updateConfig({ goals: { ...config.goals, streakTargetDays: Number(value) || 0 } });
}

// ── Ask (natural-language-ish query) ────────────────────────────────────

export async function runAsk(db: Db, config: ToolkitConfig): Promise<void> {
  const { sessions, toolCalls, commits } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const question = await input("Ask a question about your usage (e.g. \"how many hours this week\")");
  const answer = answerQuery(question, { sessions, toolCalls, commits, burnoutConfig: config.burnout });
  console.log(heading("\n💬 " + answer));
}

// ── Export ───────────────────────────────────────────────────────────

export async function runExport(db: Db, config: ToolkitConfig): Promise<void> {
  const format = await selectMenu("Export format", [
    { name: "Prometheus (metrics exposition, for Grafana/Prometheus textfile collectors)", value: "prometheus" },
    { name: "JSON (computed stats summary)", value: "json" },
  ]);
  const data = buildReportData(db, config, 0, "All time");
  const content = format === "prometheus" ? renderPrometheusExport(data) : renderJsonExport(data);

  const outputDir = config.reports.outputDir || REPORTS_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const ext = format === "prometheus" ? "prom" : "json";
  const filePath = path.join(outputDir, `export-${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(good(`\nExport written to ${filePath}`));
}
