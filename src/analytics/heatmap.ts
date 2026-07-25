import type { DailyRollup, GitCommitRecord, SessionRecord } from "../types/domain.js";
import { dayKey, daysAgo } from "../utils/dates.js";

/** Consolidates: cc-calendar, cc-ai-heatmap, cc-day-pattern (calendar view).
 * Produces one row per day for a GitHub-style contribution heatmap,
 * distinguishing interactive (you present) days from ghost (AI-only) days. */
export function buildDailyRollups(
  sessions: SessionRecord[],
  commits: GitCommitRecord[],
  days = 365
): DailyRollup[] {
  const since = daysAgo(days);
  const byDay = new Map<string, DailyRollup>();

  const ensure = (date: string): DailyRollup => {
    let row = byDay.get(date);
    if (!row) {
      row = { date, hours: 0, sessions: 0, commits: 0, toolCalls: 0, ghostDay: false };
      byDay.set(date, row);
    }
    return row;
  };

  for (const s of sessions) {
    if (s.startedAt < since) continue;
    const row = ensure(dayKey(s.startedAt));
    row.hours += s.durationMs / 3_600_000;
    row.sessions += 1;
    row.toolCalls += s.toolCallCount;
  }

  for (const c of commits) {
    if (c.ts < since) continue;
    const row = ensure(dayKey(c.ts));
    row.commits += 1;
  }

  for (const row of byDay.values()) {
    row.ghostDay = row.sessions === 0 && row.commits > 0;
  }

  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function intensityBucket(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 3) return 2;
  if (hours < 6) return 3;
  return 4;
}
