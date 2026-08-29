import type { Db } from "../../db/database.js";
import type { ToolkitConfig } from "../../core/config.js";
import { GitCommitRepository, SessionRepository, ToolCallRepository } from "../../db/repositories.js";
import { computeSessionStats } from "../../analytics/session-stats.js";
import { computeToolUsageStats } from "../../analytics/tool-usage.js";
import { computeStreakStats } from "../../analytics/streaks.js";
import { computeBurnoutReport } from "../../analytics/burnout.js";
import { computeGitActivityReport } from "../../analytics/git-activity.js";
import { computeCostReport } from "../../analytics/cost.js";
import { computeUsageForecast } from "../../analytics/forecast.js";
import { computeContentReport } from "../../analytics/content.js";
import { computeContextReport } from "../../analytics/context.js";
import { computeCollaborationReport } from "../../analytics/collaboration.js";
import { computePersonalitySummary } from "../../analytics/personality.js";
import { computeModelUsageReport } from "../../analytics/model-usage.js";
import { buildDailyRollups } from "../../analytics/heatmap.js";
import { renderTable, renderKeyValueTable } from "../../ui/table.js";
import { renderBox } from "../../ui/banner.js";
import { renderHeatmap } from "../../ui/heatmap-render.js";
import {
  heading,
  good,
  warn,
  bad,
  subtle,
  accent,
  num,
  gold,
  premiumTitle,
  categoryBadge,
  scoreBar,
  divider,
  bullet,
} from "../../ui/theme.js";

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

export function showDashboard(db: Db, config: ToolkitConfig): void {
  const { sessions, toolCalls, commits } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const sessionStats = computeSessionStats(sessions);
  const burnout = computeBurnoutReport(sessions, config.burnout);
  const gitActivity = computeGitActivityReport(commits, sessions);
  const forecast = computeUsageForecast(sessions);
  const cost = computeCostReport(sessions);

  console.log(
    renderBox(
      renderKeyValueTable([
        ["Sessions", num(sessionStats.totalSessions)],
        ["Total hours", num(sessionStats.totalHours.toFixed(1))],
        ["Current streak", accent(`${forecast.currentDailyStreak} day(s)`)],
        ["Projected month-end", `${num(forecast.projectedMonthEndHours.toFixed(1))}h`],
        ["Commits", num(gitActivity.totalCommits)],
        ["Ghost days", gitActivity.ghostDays.length > 0 ? warn(String(gitActivity.ghostDays.length)) : good("0")],
        ["Burnout risk", riskColor(burnout.riskLevel)],
        ["Estimated cost", gold(`$${cost.actualCostUsd.toFixed(2)}`)],
        ["Tool calls", num(toolCalls.length)],
      ]),
      { title: "📊 Dashboard", color: "magenta" }
    )
  );
}

function riskColor(level: string): string {
  if (level === "severe" || level === "high") return bad(level);
  if (level === "moderate") return warn(level);
  return good(level);
}

export function showSessionStats(db: Db): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const stats = computeSessionStats(sessions);

  console.log(heading("\nSession Overview"));
  console.log(
    renderKeyValueTable([
      ["Total sessions", stats.totalSessions],
      ["Total hours", stats.totalHours.toFixed(1)],
      ["Avg session length", `${stats.avgSessionMinutes.toFixed(0)}m`],
      ["Median session length", `${stats.medianSessionMinutes.toFixed(0)}m`],
      ["90th percentile length", `${stats.p90SessionMinutes.toFixed(0)}m`],
      ["Avg turns/session", stats.avgTurnsPerSession.toFixed(1)],
      ["Fire-and-forget rate", `${(stats.fireAndForgetRate * 100).toFixed(0)}%`],
    ])
  );

  console.log(heading("\nBy Weekday"));
  console.log(renderTable(["Day", "Sessions", "Hours"], stats.byWeekday.map((d) => [d.day, d.sessions, d.hours.toFixed(1)])));

  console.log(heading("\nBy Project"));
  console.log(
    renderTable(
      ["Project", "Sessions", "Hours"],
      stats.byProject.slice(0, 10).map((p) => [p.project, p.sessions, p.hours.toFixed(1)])
    )
  );

  if (stats.healthWarnings.length > 0) {
    console.log(heading("\nHealth Warnings"));
    for (const w of stats.healthWarnings) console.log(warn(`  ⚠ ${w}`));
  }
}

export function showToolUsage(db: Db): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const stats = computeToolUsageStats(toolCalls);

  console.log(heading("\nTool Usage"));
  console.log(
    renderKeyValueTable([
      ["Total calls", stats.totalCalls],
      ["Avg tools/session", stats.avgToolsPerSession.toFixed(1)],
      ["Avg distinct tools/session", stats.avgDistinctToolsPerSession.toFixed(1)],
      ["Read:Edit ratio", stats.ratios.readToEdit.toFixed(2)],
      ["Write:Edit ratio", stats.ratios.writeToEdit.toFixed(2)],
      ["Bash:Grep ratio", stats.ratios.bashToGrep.toFixed(2)],
    ])
  );

  console.log(heading("\nTop Tools"));
  console.log(renderTable(["Tool", "Calls"], stats.byTool.slice(0, 12)));

  console.log(heading("\nFirst Tool Called (session openers)"));
  console.log(renderTable(["Tool", "Sessions"], stats.firstToolCounts.slice(0, 8)));

  console.log(heading("\nTop Tool Pairs (A → B)"));
  console.log(renderTable(["Sequence", "Count"], stats.topPairs.slice(0, 10)));

  console.log(heading("\nTop 3-Tool Sequences"));
  console.log(renderTable(["Sequence", "Count"], stats.topTrigrams.slice(0, 10)));
}

export function showStreaks(db: Db): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const stats = computeStreakStats(toolCalls);

  console.log(heading("\n🔥 Reliability & Streaks"));
  console.log(
    renderKeyValueTable([
      ["Total errors", stats.totalErrors > 0 ? warn(String(stats.totalErrors)) : good("0")],
      ["Error rate", errorRateColor(stats.errorRate)],
      ["Median clean streak", `${num(stats.medianStreak)} calls`],
      ["Longest clean streak", `${num(stats.longestStreak)} calls`],
      ["Self-recovery rate", recoveryColor(stats.selfRecoveryRate)],
      ["Sessions with ≥1 error", `${stats.sessionsWithAnyError} (${(stats.sessionErrorRate * 100).toFixed(0)}%)`],
    ])
  );

  if (stats.streaksByBreakingTool.length > 0) {
    console.log(heading("\nWhat Breaks the Streak"));
    console.log(
      subtle("The tools most often responsible for ending a clean run:")
    );
    console.log(renderTable(["Tool", "Times it broke a streak"], stats.streaksByBreakingTool.slice(0, 8)));
  }
}

function errorRateColor(rate: number): string {
  const pct = `${(rate * 100).toFixed(2)}%`;
  if (rate < 0.02) return good(pct);
  if (rate < 0.1) return warn(pct);
  return bad(pct);
}

function recoveryColor(rate: number): string {
  const pct = `${(rate * 100).toFixed(0)}%`;
  if (rate >= 0.7) return good(pct);
  if (rate >= 0.4) return warn(pct);
  return bad(pct);
}

export function showBurnout(db: Db, config: ToolkitConfig): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeBurnoutReport(sessions, config.burnout);

  console.log(heading("\nBurnout & Wellness"));
  console.log(renderBox(`Risk level: ${riskColor(report.riskLevel)}   Score: ${report.score}/100`, { color: "magenta" }));

  if (report.factors.length > 0) {
    for (const f of report.factors) console.log(warn(`  ⚠ ${f}`));
  } else {
    console.log(good("  No burnout risk factors detected."));
  }

  console.log(heading("\nRhythm"));
  console.log(
    renderKeyValueTable([
      ["Late-night session rate", `${(report.lateNightSessionRate * 100).toFixed(0)}%`],
      ["Best focus window", report.bestWindow ? `${report.bestWindow.startHour}:00–${report.bestWindow.endHour}:00` : "n/a"],
      ["Median rest between sessions", `${report.gapHoursBetweenSessions.median.toFixed(1)}h`],
      ["Weekly momentum", report.momentumTrend],
    ])
  );

  console.log(heading("\nHours by Weekday"));
  console.log(renderTable(["Day", "Hours"], report.weekdayBreakdown.map((d) => [d.day, d.hours.toFixed(1)])));
}

export function showGitActivity(db: Db): void {
  const { sessions, commits } = loadCore(db);
  if (commits.length === 0) {
    console.log(warn("No git commits synced yet. Configure repos in Settings, then Sync data."));
    return;
  }
  const report = computeGitActivityReport(commits, sessions);

  console.log(heading("\nGit Activity"));
  console.log(
    renderKeyValueTable([
      ["Total commits", report.totalCommits],
      ["AI-attributed commits", report.aiAttributedCommits],
      ["  (explicit: trailer / generated-with)", report.explicitlyAiAttributedCommits],
      ["  (correlated: in session window)", report.correlatedAiAttributedCommits],
      ["Lines added", `+${report.totalInsertions}`],
      ["Lines removed", `-${report.totalDeletions}`],
      ["Files changed", report.totalFilesChanged],
      ["Ghost days", report.ghostDays.length],
    ])
  );

  console.log(heading("\nWeekly Collaboration Trend"));
  console.log(
    renderTable(
      ["Week", "Commits", "CC Hours", "Commits/Hour"],
      report.weeklyCollabTrend.slice(-8).map((w) => [w.week, w.commits, w.ccHours.toFixed(1), w.commitsPerHour.toFixed(2)])
    )
  );

  if (report.ghostDays.length > 0) {
    console.log(heading("\nRecent Ghost Days"));
    for (const day of report.ghostDays.slice(-10)) console.log(accent(`  👻 ${day}`));
  }
}

export function showHeatmap(db: Db): void {
  const { sessions, commits } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const rollups = buildDailyRollups(sessions, commits, 180);
  console.log(heading("\nActivity Heatmap (last ~180 days)"));
  console.log(renderHeatmap(rollups));
}

export function showCost(db: Db): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeCostReport(sessions);

  console.log(heading("\nCost & Cache Savings"));
  console.log(subtle(report.ratesNote));
  console.log(
    renderKeyValueTable([
      ["Estimated cost", `$${report.actualCostUsd.toFixed(2)}`],
      ["Cost without cache", `$${report.costWithoutCacheUsd.toFixed(2)}`],
      ["Cache savings", `$${report.cacheSavingsUsd.toFixed(2)}`],
      ["Cache hit ratio", `${(report.cacheHitRatio * 100).toFixed(1)}%`],
      ["Projected month-end cost", `$${report.projectedMonthEndCostUsd.toFixed(2)}`],
      ["Input tokens", report.totalInputTokens.toLocaleString()],
      ["Output tokens", report.totalOutputTokens.toLocaleString()],
      ["Cache read tokens", report.totalCacheReadTokens.toLocaleString()],
    ])
  );
}

export function showContent(db: Db): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeContentReport(toolCalls);

  console.log(heading("\nMost Edited Files"));
  console.log(renderTable(["File", "Edits"], report.topEditedFiles.slice(0, 10)));

  console.log(heading("\nMost Read Files"));
  console.log(renderTable(["File", "Reads"], report.topReadFiles.slice(0, 10)));

  console.log(heading("\nLanguage Breakdown (by extension)"));
  console.log(renderTable(["Extension", "Edits/Writes"], report.languageBreakdown.slice(0, 12)));

  console.log(heading("\nTop Bash Commands"));
  console.log(renderTable(["Command", "Calls"], report.topBashCommands.slice(0, 10)));

  console.log(heading("\nBash Command Types"));
  console.log(renderTable(["Type", "Calls"], report.bashCommandTypes));

  console.log(heading("\nEdit Sizes"));
  console.log(
    renderKeyValueTable([
      ["Surgical edits (<200 chars)", report.editSizeStats.surgicalCount],
      ["Massive edits (≥200 chars)", report.editSizeStats.massiveCount],
      ["Avg delta", report.editSizeStats.avgDelta.toFixed(0)],
    ])
  );
}

export function showContext(db: Db): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeContextReport(sessions);

  console.log(heading("\nContext & Thinking"));
  console.log(
    renderKeyValueTable([
      ["Avg peak context (tokens)", Math.round(report.avgMaxContextTokens).toLocaleString()],
      ["P90 peak context (tokens)", Math.round(report.p90MaxContextTokens).toLocaleString()],
      ["Compaction rate", `${(report.compactionRate * 100).toFixed(0)}%`],
      ["Avg compactions/session", report.avgCompactionsPerSession.toFixed(2)],
      ["Thinking block rate", `${(report.thinkingBlockRate * 100).toFixed(0)}%`],
      ["Avg thinking blocks/session", report.avgThinkingBlocksPerSession.toFixed(1)],
      ["Total transcript tokens", report.totalTranscriptTokens.toLocaleString()],
    ])
  );

  console.log(heading("\nContext Size Tiers"));
  console.log(
    renderTable(
      ["Tier", "Sessions"],
      Object.entries(report.sizeTierCounts).map(([tier, count]) => [tier, count])
    )
  );
}

export function showCollaboration(db: Db): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeCollaborationReport(sessions, toolCalls);

  console.log(heading("\nHuman / AI Collaboration"));
  console.log(
    renderKeyValueTable([
      ["Autonomy rate", `${(report.autonomyRate * 100).toFixed(0)}%`],
      ["Pure-autonomous sessions", `${(report.pureAutonomousSessionRate * 100).toFixed(0)}%`],
      ["Avg check-ins/session", report.avgUserCheckinsPerSession.toFixed(1)],
      ["Median minutes between check-ins", report.medianMinutesBetweenCheckins.toFixed(1)],
      ["Subagent adoption", `${(report.subagentAdoptionRate * 100).toFixed(0)}%`],
      ["Avg subagents/session", report.avgSubagentsPerSession.toFixed(2)],
      ["Task/Todo tool usage", `${(report.taskToolUsageRate * 100).toFixed(0)}%`],
      ["Plan mode adoption", `${(report.planModeAdoptionRate * 100).toFixed(0)}%`],
      ["Web search usage", `${(report.webSearchSessionRate * 100).toFixed(0)}%`],
      ["Web fetch usage", `${(report.webFetchSessionRate * 100).toFixed(0)}%`],
    ])
  );
}

export function showPersonality(db: Db, config: ToolkitConfig): void {
  const { sessions, toolCalls } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;

  const sessionStats = computeSessionStats(sessions);
  const toolUsage = computeToolUsageStats(toolCalls);
  const streaks = computeStreakStats(toolCalls);
  const burnout = computeBurnoutReport(sessions, config.burnout);
  const summary = computePersonalitySummary({ sessions, sessionStats, toolUsage, streaks, burnout });

  const isPremium = summary.archetypeCategory === "premium";
  const archetypeName = isPremium ? premiumTitle(summary.archetype) : accent(summary.archetype);

  const boxLines = [
    archetypeName,
    subtle(summary.archetypeTagline),
    "",
    categoryBadge(summary.archetypeCategory),
    "",
    summary.archetypeDescription,
  ];
  if (summary.runnerUp) {
    boxLines.push("", subtle(`Runner-up profile: ${summary.runnerUp.archetype} (${summary.runnerUp.category})`));
  }

  console.log(
    renderBox(boxLines.join("\n"), {
      title: "🎭 Your Claude Code Archetype",
      color: isPremium ? "yellow" : "magenta",
    })
  );

  console.log(heading("\n📈 What the Data Says"));
  for (const line of summary.insights) console.log(bullet(line));

  console.log(heading(`\n🏆 Productivity Score`));
  console.log(`  ${scoreBar(summary.productivityScore)}`);
  console.log("");
  console.log(
    renderTable(
      ["Factor", "Points (of 25)"],
      Object.entries(summary.scoreBreakdown).map(([k, v]) => [capitalize(k), scoreBar(v, 25, 14)])
    )
  );

  console.log(divider());
  const unlocked = summary.achievements.filter((a) => a.unlocked).length;
  console.log(heading(`\n🎖️  Achievements  ${subtle(`(${unlocked}/${summary.achievements.length} unlocked)`)}`));
  console.log(
    renderTable(
      ["", "Achievement", "Description"],
      summary.achievements.map((a) => [
        a.unlocked ? gold("✓") : subtle("·"),
        a.unlocked ? a.title : subtle(a.title),
        a.unlocked ? a.description : subtle(a.description),
      ])
    )
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function showModelUsage(db: Db): void {
  const { sessions } = loadCore(db);
  if (emptyStateNotice(sessions.length)) return;
  const report = computeModelUsageReport(sessions);

  console.log(heading("\nModel Usage"));
  console.log(renderTable(["Model", "Sessions"], report.byModel));
  console.log(heading("\nHours by Model"));
  console.log(renderTable(["Model", "Hours"], report.hoursByModel.map(([m, h]) => [m, h.toFixed(1)])));
}
