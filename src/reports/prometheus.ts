import type { ReportData } from "./data.js";

/** Not derived from any yurukusa package — all of them are terminal/browser
 * output only. This emits the standard Prometheus text exposition format
 * (https://prometheus.io/docs/instrumenting/exposition_formats/) so
 * `cc-atlas export --format prometheus` can feed an existing Grafana/
 * Prometheus stack via a file-based textfile collector, instead of forcing
 * you into yet another dashboard. */
export function renderPrometheusExport(data: ReportData): string {
  const lines: string[] = [];
  const metric = (name: string, help: string, type: "gauge" | "counter", value: number, labels = ""): void => {
    lines.push(`# HELP cc_atlas_${name} ${help}`);
    lines.push(`# TYPE cc_atlas_${name} ${type}`);
    lines.push(`cc_atlas_${name}${labels} ${value}`);
  };

  metric("sessions_total", "Total Claude Code sessions recorded", "counter", data.sessionStats.totalSessions);
  metric("hours_total", "Total hours of recorded session time", "counter", round(data.sessionStats.totalHours));
  metric("session_duration_minutes_avg", "Average session duration in minutes", "gauge", round(data.sessionStats.avgSessionMinutes));
  metric("session_duration_minutes_p90", "90th percentile session duration in minutes", "gauge", round(data.sessionStats.p90SessionMinutes));
  metric("fire_and_forget_ratio", "Fraction of sessions with minimal user check-ins", "gauge", round(data.sessionStats.fireAndForgetRate, 4));

  metric("tool_calls_total", "Total tool calls recorded", "counter", data.toolUsage.totalCalls);
  metric("tool_error_rate", "Fraction of tool calls that errored", "gauge", round(data.streaks.errorRate, 4));
  metric("tool_self_recovery_rate", "Fraction of errors followed by a successful retry", "gauge", round(data.streaks.selfRecoveryRate, 4));

  metric("burnout_score", "Burnout risk score, 0-100", "gauge", data.burnout.score);
  metric("late_night_session_ratio", "Fraction of sessions starting late at night", "gauge", round(data.burnout.lateNightSessionRate, 4));

  metric("git_commits_total", "Total git commits observed across configured repos", "counter", data.gitActivity.totalCommits);
  metric("git_ai_attributed_commits_total", "Commits attributed to AI activity", "counter", data.gitActivity.aiAttributedCommits);
  metric("ghost_days_total", "Days with AI git activity but no recorded session", "counter", data.gitActivity.ghostDays.length);

  metric("cost_usd", "Estimated illustrative API cost in USD for the period", "gauge", round(data.cost.actualCostUsd, 4));
  metric("cache_hit_ratio", "Prompt cache hit ratio", "gauge", round(data.cost.cacheHitRatio, 4));

  for (const [tool, count] of data.toolUsage.byTool.slice(0, 10)) {
    metric("tool_calls_by_tool", "Tool calls broken down by tool name", "counter", count, `{tool="${escapeLabel(tool)}"}`);
  }

  return lines.join("\n") + "\n";
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
