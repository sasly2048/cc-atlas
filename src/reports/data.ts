import type { Db } from "../db/database.js";
import { GitCommitRepository, SessionRepository, ToolCallRepository } from "../db/repositories.js";
import type { ToolkitConfig } from "../core/config.js";
import { computeSessionStats, type SessionStats } from "../analytics/session-stats.js";
import { computeToolUsageStats, type ToolUsageStats } from "../analytics/tool-usage.js";
import { computeStreakStats, type StreakStats } from "../analytics/streaks.js";
import { computeBurnoutReport, type BurnoutReport } from "../analytics/burnout.js";
import { computeGitActivityReport, type GitActivityReport } from "../analytics/git-activity.js";
import { computeCostReport, type CostReport } from "../analytics/cost.js";
import type { SessionRecord, GitCommitRecord, ToolCallRecord } from "../types/domain.js";

export interface ReportData {
  periodLabel: string;
  sinceTs: number;
  sessions: SessionRecord[];
  commits: GitCommitRecord[];
  toolCalls: ToolCallRecord[];
  sessionStats: SessionStats;
  toolUsage: ToolUsageStats;
  streaks: StreakStats;
  burnout: BurnoutReport;
  gitActivity: GitActivityReport;
  cost: CostReport;
}

export function buildReportData(db: Db, config: ToolkitConfig, sinceTs: number, periodLabel: string): ReportData {
  const sessions = new SessionRepository(db).all(sinceTs);
  const commits = new GitCommitRepository(db).all(sinceTs);
  const toolCalls = new ToolCallRepository(db).all(sinceTs);

  return {
    periodLabel,
    sinceTs,
    sessions,
    commits,
    toolCalls,
    sessionStats: computeSessionStats(sessions),
    toolUsage: computeToolUsageStats(toolCalls),
    streaks: computeStreakStats(toolCalls),
    burnout: computeBurnoutReport(sessions, config.burnout),
    gitActivity: computeGitActivityReport(commits, sessions),
    cost: computeCostReport(sessions),
  };
}
