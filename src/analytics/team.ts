import type { SessionRecord } from "../types/domain.js";
import { computeCurrentStreak } from "./forecast.js";
import { dayOfWeek } from "../utils/dates.js";
import { groupBy, mean, sum } from "../utils/numbers.js";
import { WEEKDAY_NAMES } from "../utils/dates.js";

/** Not derived from any yurukusa package — none of them are multi-user.
 * Aggregates sessions.source_label (see config.team.members and
 * services/ingest.ts) into a per-person leaderboard, entirely from local
 * data already ingested into this database — no network calls, no shared
 * server. */
export interface TeamMemberStats {
  name: string;
  sessions: number;
  hours: number;
  avgSessionMinutes: number;
  currentStreak: number;
  mostActiveDay: string | null;
  projects: number;
}

export interface TeamReport {
  members: TeamMemberStats[];
  totalHours: number;
}

export function computeTeamReport(sessions: SessionRecord[], now = Date.now()): TeamReport {
  const byMember = groupBy(sessions, (s) => s.sourceLabel || "you");

  const members = [...byMember.entries()]
    .map(([name, memberSessions]) => {
      const hours = sum(memberSessions.map((s) => s.durationMs)) / 3_600_000;
      const byWeekday = groupBy(memberSessions, (s) => String(dayOfWeek(s.startedAt)));
      const mostActiveEntry = [...byWeekday.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      const mostActiveDay = mostActiveEntry ? WEEKDAY_NAMES[Number(mostActiveEntry[0])]! : null;

      return {
        name,
        sessions: memberSessions.length,
        hours,
        avgSessionMinutes: mean(memberSessions.map((s) => s.durationMs / 60_000)),
        currentStreak: computeCurrentStreak(memberSessions, now),
        mostActiveDay,
        projects: new Set(memberSessions.map((s) => s.project)).size,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  return { members, totalHours: sum(members.map((m) => m.hours)) };
}
