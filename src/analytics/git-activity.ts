import type { GitCommitRecord, SessionRecord } from "../types/domain.js";
import { findGhostDays } from "../services/git-service.js";
import { isoWeekKey } from "../utils/dates.js";
import { groupBy, ratio, sum } from "../utils/numbers.js";

/** Consolidates: cc-impact, cc-collab, cc-project-stats, cc-focus,
 * cc-ghost-log, cc-agent-load. */
export interface GitActivityReport {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  aiAttributedCommits: number;
  ghostDays: string[];
  weeklyCollabTrend: { week: string; commits: number; ccHours: number; commitsPerHour: number }[];
  weeklyProjectSpread: { week: string; distinctProjects: number }[];
}

export function computeGitActivityReport(
  commits: GitCommitRecord[],
  sessions: SessionRecord[]
): GitActivityReport {
  const byWeekCommits = groupBy(commits, (c) => isoWeekKey(c.ts));
  const byWeekSessions = groupBy(sessions, (s) => isoWeekKey(s.startedAt));

  const weeks = new Set([...byWeekCommits.keys(), ...byWeekSessions.keys()]);
  const weeklyCollabTrend = [...weeks]
    .sort()
    .map((week) => {
      const weekCommits = byWeekCommits.get(week) ?? [];
      const weekSessions = byWeekSessions.get(week) ?? [];
      const ccHours = sum(weekSessions.map((s) => s.durationMs)) / 3_600_000;
      return {
        week,
        commits: weekCommits.length,
        ccHours,
        commitsPerHour: ratio(weekCommits.length, ccHours),
      };
    });

  const weeklyProjectSpread = [...byWeekSessions.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, bucket]) => ({
      week,
      distinctProjects: new Set(bucket.map((s) => s.project)).size,
    }));

  return {
    totalCommits: commits.length,
    totalInsertions: sum(commits.map((c) => c.insertions)),
    totalDeletions: sum(commits.map((c) => c.deletions)),
    totalFilesChanged: sum(commits.map((c) => c.filesChanged)),
    aiAttributedCommits: commits.filter((c) => c.isAiAttributed).length,
    ghostDays: findGhostDays(commits, sessions),
    weeklyCollabTrend,
    weeklyProjectSpread,
  };
}
