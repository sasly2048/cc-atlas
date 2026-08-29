import type { ReportData } from "./data.js";
import { formatDuration } from "../utils/dates.js";

/** Consolidates: cc-daily-report, cc-weekly-report, cc-monthly. All three
 * are the same report shape at a different window, so one renderer covers
 * them all — call it with a day/week/month-scoped ReportData. */
export function renderMarkdownReport(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`# Claude Code Activity Report — ${data.periodLabel}`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Sessions:** ${data.sessionStats.totalSessions}`);
  lines.push(`- **Total time:** ${data.sessionStats.totalHours.toFixed(1)}h`);
  lines.push(`- **Commits:** ${data.gitActivity.totalCommits} (${data.gitActivity.aiAttributedCommits} AI-attributed)`);
  lines.push(`- **Lines changed:** +${data.gitActivity.totalInsertions} / -${data.gitActivity.totalDeletions}`);
  lines.push(`- **Ghost days:** ${data.gitActivity.ghostDays.length}`);
  lines.push(`- **Burnout risk:** ${data.burnout.riskLevel} (score ${data.burnout.score}/100)`);
  lines.push(`- **Tool error rate:** ${(data.streaks.errorRate * 100).toFixed(1)}%`);
  lines.push("");

  if (data.burnout.factors.length > 0) {
    lines.push("## Burnout Factors");
    lines.push("");
    for (const factor of data.burnout.factors) lines.push(`- ${factor}`);
    lines.push("");
  }

  lines.push("## Top Projects");
  lines.push("");
  lines.push("| Project | Sessions | Hours |");
  lines.push("|---|---|---|");
  for (const p of data.sessionStats.byProject.slice(0, 10)) {
    lines.push(`| ${escapeMarkdownCell(p.project)} | ${p.sessions} | ${p.hours.toFixed(1)} |`);
  }
  lines.push("");

  lines.push("## Tool Usage");
  lines.push("");
  lines.push("| Tool | Calls |");
  lines.push("|---|---|");
  for (const [tool, count] of data.toolUsage.byTool.slice(0, 10)) {
    lines.push(`| ${escapeMarkdownCell(tool)} | ${count} |`);
  }
  lines.push("");

  if (data.gitActivity.ghostDays.length > 0) {
    lines.push("## Ghost Days");
    lines.push("");
    lines.push("Days Claude Code committed autonomously with no recorded interactive session:");
    lines.push("");
    for (const day of data.gitActivity.ghostDays) lines.push(`- ${day}`);
    lines.push("");
  }

  lines.push("## Cost & Cache");
  lines.push("");
  lines.push(`- Estimated cost: $${data.cost.actualCostUsd.toFixed(2)} (${data.cost.ratesNote})`);
  lines.push(`- Estimated cache savings: $${data.cost.cacheSavingsUsd.toFixed(2)}`);
  lines.push(`- Cache hit ratio: ${(data.cost.cacheHitRatio * 100).toFixed(1)}%`);
  lines.push("");

  return lines.join("\n");
}

/** Consolidates: cc-standup — a terse "what did the AI do" bulleted digest,
 * meant to be pasted into a standup channel. */
export function renderStandupReport(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`**Claude Code standup — ${data.periodLabel}**`);
  lines.push("");
  lines.push(`- ${data.sessionStats.totalSessions} session(s), ${formatDuration(data.sessionStats.totalHours * 3_600_000)}`);
  lines.push(`- ${data.gitActivity.totalCommits} commit(s), +${data.gitActivity.totalInsertions}/-${data.gitActivity.totalDeletions}`);
  const topProject = data.sessionStats.byProject[0];
  if (topProject) lines.push(`- Focused mostly on **${escapeInlineMarkdown(topProject.project)}** (${topProject.hours.toFixed(1)}h)`);
  if (data.gitActivity.ghostDays.length > 0) {
    lines.push(`- ${data.gitActivity.ghostDays.length} autonomous ghost day(s)`);
  }
  if (data.streaks.totalErrors > 0) {
    lines.push(`- ${data.streaks.totalErrors} tool error(s), ${(data.streaks.selfRecoveryRate * 100).toFixed(0)}% self-recovered`);
  }
  return lines.join("\n");
}

/** Consolidates: cc-compare — week-over-week / month-over-month diff. */
export function renderCompareReport(current: ReportData, previous: ReportData): string {
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? "+∞%" : "0%") : `${(((a - b) / b) * 100).toFixed(1)}%`);

  const lines: string[] = [];
  lines.push(`# Comparison: ${current.periodLabel} vs ${previous.periodLabel}`);
  lines.push("");
  lines.push("| Metric | Previous | Current | Change |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| Sessions | ${previous.sessionStats.totalSessions} | ${current.sessionStats.totalSessions} | ${delta(current.sessionStats.totalSessions, previous.sessionStats.totalSessions)} |`
  );
  lines.push(
    `| Hours | ${previous.sessionStats.totalHours.toFixed(1)} | ${current.sessionStats.totalHours.toFixed(1)} | ${delta(current.sessionStats.totalHours, previous.sessionStats.totalHours)} |`
  );
  lines.push(
    `| Commits | ${previous.gitActivity.totalCommits} | ${current.gitActivity.totalCommits} | ${delta(current.gitActivity.totalCommits, previous.gitActivity.totalCommits)} |`
  );
  lines.push(
    `| Error rate | ${(previous.streaks.errorRate * 100).toFixed(1)}% | ${(current.streaks.errorRate * 100).toFixed(1)}% | ${delta(current.streaks.errorRate, previous.streaks.errorRate)} |`
  );
  lines.push(
    `| Burnout score | ${previous.burnout.score} | ${current.burnout.score} | ${delta(current.burnout.score, previous.burnout.score)} |`
  );
  return lines.join("\n");
}

/** Escapes `|` and newlines so a project name like "alpha|bravo" or one
 * containing a newline can't break the column layout or inject extra rows. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Escapes inline markdown emphasis so a project name with embedded `*` or
 * `_` can't change the rendered emphasis of the surrounding line. */
function escapeInlineMarkdown(value: string): string {
  return value.replace(/([*_`])/g, "\\$1").replace(/\r?\n/g, " ");
}
