import type { ReportData } from "./data.js";

/** Machine-readable summary for `cc-atlas export --format json` — the
 * computed stats only, not the raw session/tool-call/commit rows (those
 * stay in the SQLite database at ~/.cc-atlas/toolkit.sqlite3 for anyone who
 * wants to query them directly). Useful for feeding a custom dashboard,
 * a cron job that posts to Slack, or any tool this toolkit doesn't
 * natively integrate with. */
export function renderJsonExport(data: ReportData): string {
  return JSON.stringify(
    {
      periodLabel: data.periodLabel,
      sinceTs: data.sinceTs,
      generatedAt: Date.now(),
      sessionStats: data.sessionStats,
      toolUsage: {
        totalCalls: data.toolUsage.totalCalls,
        byTool: data.toolUsage.byTool,
        byCategory: data.toolUsage.byCategory,
        ratios: data.toolUsage.ratios,
      },
      streaks: data.streaks,
      burnout: {
        score: data.burnout.score,
        riskLevel: data.burnout.riskLevel,
        factors: data.burnout.factors,
        lateNightSessionRate: data.burnout.lateNightSessionRate,
        momentumTrend: data.burnout.momentumTrend,
      },
      gitActivity: {
        totalCommits: data.gitActivity.totalCommits,
        aiAttributedCommits: data.gitActivity.aiAttributedCommits,
        ghostDays: data.gitActivity.ghostDays.length,
      },
      cost: data.cost,
    },
    null,
    2
  );
}
