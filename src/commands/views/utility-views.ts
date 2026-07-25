import fs from "node:fs";
import path from "node:path";
import type { Db } from "../../db/database.js";
import { updateConfig, type ToolkitConfig } from "../../core/config.js";
import { REPORTS_DIR, CLAUDE_PROJECTS_DIR } from "../../core/paths.js";
import { buildReportData } from "../../reports/data.js";
import { renderMarkdownReport, renderStandupReport, renderCompareReport } from "../../reports/markdown.js";
import { renderHtmlReport } from "../../reports/html.js";
import { renderReceipt } from "../../reports/receipt.js";
import { renderStatsBadge } from "../../reports/badge.js";
import { computeCollaborationReport } from "../../analytics/collaboration.js";
import { SessionRepository, ToolCallRepository } from "../../db/repositories.js";
import { computeUsageForecast, hoursSinceLastSession } from "../../analytics/forecast.js";
import { recommendModel, type TaskComplexity } from "../../analytics/model-usage.js";
import { renderKeyValueTable } from "../../ui/table.js";
import { good, warn, bad, heading, subtle } from "../../ui/theme.js";
import { input, selectMenu, confirm } from "../../ui/prompts.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function periodSince(period: "day" | "week" | "month"): number {
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  return Date.now() - days * DAY_MS;
}

export async function runReportsMenu(db: Db, config: ToolkitConfig): Promise<void> {
  const format = await selectMenu("Report format", [
    { name: "Markdown", value: "markdown" },
    { name: "HTML", value: "html" },
    { name: "Standup (short digest)", value: "standup" },
    { name: "Receipt (fun ASCII)", value: "receipt" },
    { name: "Compare two periods", value: "compare" },
  ]);

  if (format === "compare") {
    // ReportData only supports an open-ended "since" filter (no upper bound),
    // so "previous" here is deliberately a superset (last 14 days) rather
    // than an exact non-overlapping window — good enough for a trend read,
    // not a precise week-over-week diff.
    const currentData = buildReportData(db, config, periodSince("week"), "This week");
    const previousData = buildReportData(db, config, periodSince("week") - 7 * DAY_MS, "Last 14 days");
    console.log(renderCompareReport(currentData, previousData));
    return;
  }

  const period = await selectMenu("Period", [
    { name: "Today", value: "day" },
    { name: "This week", value: "week" },
    { name: "This month", value: "month" },
  ]);
  const data = buildReportData(db, config, periodSince(period as "day" | "week" | "month"), periodLabel(period as any));

  if (format === "standup") {
    console.log("\n" + renderStandupReport(data));
    return;
  }
  if (format === "receipt") {
    console.log("\n" + renderReceipt(data));
    return;
  }

  const content = format === "html" ? renderHtmlReport(data) : renderMarkdownReport(data);
  const outputDir = config.reports.outputDir || REPORTS_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const ext = format === "html" ? "html" : "md";
  const filePath = path.join(outputDir, `report-${period}-${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(good(`\nReport written to ${filePath}`));
}

function periodLabel(period: "day" | "week" | "month"): string {
  if (period === "day") return "Today";
  if (period === "week") return "This week";
  return "This month";
}

export function generateBadge(db: Db, config: ToolkitConfig): void {
  const sessions = new SessionRepository(db).all();
  const toolCalls = new ToolCallRepository(db).all();
  const data = buildReportData(db, config, 0, "All time");
  const collab = computeCollaborationReport(sessions, toolCalls);
  const svg = renderStatsBadge(data, collab.autonomyRate);

  const outputDir = config.reports.outputDir || REPORTS_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "badge.svg");
  fs.writeFileSync(filePath, svg, "utf8");
  console.log(good(`Badge written to ${filePath}`));
  console.log(subtle(`Embed it with: ![Claude Code stats](${filePath})`));
}

export function checkStreakAlert(db: Db, config: ToolkitConfig): boolean {
  const sessions = new SessionRepository(db).all();
  const forecast = computeUsageForecast(sessions);
  const idleHours = hoursSinceLastSession(sessions);

  if (idleHours === null) {
    console.log(warn("No sessions recorded yet."));
    return false;
  }

  const hoursUntilStreakLost = 24 - (idleHours % 24);
  const atRisk = forecast.currentDailyStreak > 0 && idleHours > 20 && hoursUntilStreakLost <= config.alerts.streakRiskHours;

  console.log(
    renderKeyValueTable([
      ["Current streak", `${forecast.currentDailyStreak} day(s)`],
      ["Hours since last session", idleHours.toFixed(1)],
    ])
  );

  if (atRisk) {
    console.log(bad(`\n⚠ Your ${forecast.currentDailyStreak}-day streak is at risk! Start a session soon.`));
  } else {
    console.log(good("\nStreak is safe for now."));
  }
  return atRisk;
}

export async function runModelSelector(): Promise<void> {
  const complexity = (await selectMenu("How complex is the task you're about to do?", [
    { name: "Trivial (lookup, formatting)", value: "trivial" },
    { name: "Simple (single-file, well-scoped)", value: "simple" },
    { name: "Moderate (multi-file change)", value: "moderate" },
    { name: "Complex (architecture, ambiguous requirements)", value: "complex" },
    { name: "Research (open-ended investigation)", value: "research" },
  ])) as TaskComplexity;

  const rec = recommendModel(complexity);
  console.log(heading(`\nRecommended: ${rec.model}`));
  console.log(subtle(rec.reason));
}

export function runDoctor(config: ToolkitConfig): void {
  console.log(heading("\nHealth Check"));
  const checks: Array<{ label: string; pass: boolean; detail?: string }> = [];

  const claudeDir = config.claudeProjectsDir || CLAUDE_PROJECTS_DIR;
  checks.push({ label: "Claude Code projects directory exists", pass: fs.existsSync(claudeDir), detail: claudeDir });

  let dirReadable = false;
  try {
    fs.readdirSync(claudeDir);
    dirReadable = true;
  } catch {
    dirReadable = false;
  }
  checks.push({ label: "Projects directory is readable", pass: dirReadable });

  checks.push({
    label: "At least one git repo configured",
    pass: config.gitRepos.length > 0,
    detail: config.gitRepos.length === 0 ? "add repos in Settings for git analytics" : `${config.gitRepos.length} configured`,
  });

  for (const repo of config.gitRepos) {
    checks.push({ label: `Repo exists: ${repo}`, pass: fs.existsSync(path.join(repo, ".git")) });
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({ label: "Node.js version >= 18", pass: nodeMajor >= 18, detail: process.version });

  for (const check of checks) {
    const icon = check.pass ? good("✓") : bad("✗");
    console.log(`  ${icon} ${check.label}${check.detail ? subtle(`  (${check.detail})`) : ""}`);
  }

  const failed = checks.filter((c) => !c.pass).length;
  console.log(failed === 0 ? good(`\nAll ${checks.length} checks passed.`) : warn(`\n${failed} of ${checks.length} checks need attention.`));
}

export async function runSettingsMenu(config: ToolkitConfig): Promise<ToolkitConfig> {
  const field = await selectMenu("Setting to change", [
    { name: `Claude projects directory (current: ${config.claudeProjectsDir || "(default)"})`, value: "claudeProjectsDir" },
    { name: `Git repos (current: ${config.gitRepos.length} configured)`, value: "gitRepos" },
    { name: `Theme (current: ${config.theme})`, value: "theme" },
    { name: `Daily hour warning (current: ${config.burnout.dailyHourWarning}h)`, value: "dailyHourWarning" },
    { name: `Reports output directory (current: ${config.reports.outputDir || "(default)"})`, value: "reportsDir" },
    { name: `Team members (current: ${config.team.members.length} configured)`, value: "teamMembers" },
    { name: "Back", value: "back" },
  ]);

  if (field === "back") return config;

  if (field === "claudeProjectsDir") {
    const value = await input("Path to ~/.claude/projects (blank for default)", config.claudeProjectsDir);
    return updateConfig({ claudeProjectsDir: value });
  }
  if (field === "gitRepos") {
    const addMore = await confirm("Add a repo path?", true);
    if (addMore) {
      const repoPath = await input("Absolute path to a git repo");
      return updateConfig({ gitRepos: [...config.gitRepos, repoPath] });
    }
    return config;
  }
  if (field === "theme") {
    const theme = await selectMenu("Theme", [
      { name: "Gradient (colorful)", value: "gradient" },
      { name: "Plain", value: "plain" },
    ]);
    return updateConfig({ theme: theme as "gradient" | "plain" });
  }
  if (field === "dailyHourWarning") {
    const value = await input("Daily hour warning threshold", String(config.burnout.dailyHourWarning));
    return updateConfig({ burnout: { ...config.burnout, dailyHourWarning: Number(value) || config.burnout.dailyHourWarning } });
  }
  if (field === "reportsDir") {
    const value = await input("Reports output directory (blank for default)", config.reports.outputDir);
    return updateConfig({ reports: { ...config.reports, outputDir: value } });
  }
  if (field === "teamMembers") {
    const addMore = await confirm("Add a team member?", true);
    if (addMore) {
      const name = await input("Member name (used as a label, not an identity check)");
      const claudeProjectsDir = await input("Path to their ~/.claude/projects directory");
      return updateConfig({ team: { members: [...config.team.members, { name, claudeProjectsDir }] } });
    }
    return config;
  }
  return config;
}
