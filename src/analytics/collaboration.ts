import type { SessionRecord, ToolCallRecord } from "../types/domain.js";
import { groupBy, mean, ratio } from "../utils/numbers.js";

/** Consolidates: cc-human, cc-checkin, cc-ask, cc-subagent, cc-tasks,
 * cc-todo, cc-plan, cc-web, cc-search, cc-fetch. (cc-denied is not
 * included — see AUDIT.md: transcripts don't reliably distinguish a
 * user-denied tool call from any other failed call.)
 *
 * Honest-methodology note: most of these "autonomy" / "check-in cadence"
 * metrics are not what the yurukusa packages claim. The original
 * implementation approximated check-in cadence as
 * `sessionDuration / (userTurns - 1)` — that assumes user turns are
 * evenly distributed within a session, which they are not. We've kept
 * the same shape so the dashboards don't go blank for users who already
 * have a workflow, but added a clearly-labeled note (the
 * `autonomyRate` field name is a soft stand-in; treat as "assistant
 * share of turns", not "autonomy"). The medianMinutesBetweenCheckins
 * approximation is documented as such. A future pass can wire in
 * actual user-message timestamps (read from the JSONL, kept on the
 * session record) and replace both with real values. */
export interface CollaborationReport {
  /** Assistant share of total turns. NOT a real autonomy score — see
   * note above. Kept for backwards compatibility with the menu screens. */
  autonomyRate: number;
  /** Fraction of sessions with at most 1 user turn. */
  pureAutonomousSessionRate: number;
  /** Average user turn count per session. */
  avgUserCheckinsPerSession: number;
  /** Approximated: sessionDuration / (userTurns - 1). Units are
   * "minutes between turns" but it's an average over an assumed-uniform
   * distribution. */
  medianMinutesBetweenCheckins: number;
  subagentAdoptionRate: number;
  avgSubagentsPerSession: number;
  taskToolUsageRate: number; // sessions using TodoWrite/Task* at all
  planModeAdoptionRate: number; // sessions using ExitPlanMode at all
  avgPlanCyclesPerSession: number;
  webSearchSessionRate: number;
  webFetchSessionRate: number;
}

export function computeCollaborationReport(
  sessions: SessionRecord[],
  toolCalls: ToolCallRecord[]
): CollaborationReport {
  if (sessions.length === 0) {
    return {
      autonomyRate: 0,
      pureAutonomousSessionRate: 0,
      avgUserCheckinsPerSession: 0,
      medianMinutesBetweenCheckins: 0,
      subagentAdoptionRate: 0,
      avgSubagentsPerSession: 0,
      taskToolUsageRate: 0,
      planModeAdoptionRate: 0,
      avgPlanCyclesPerSession: 0,
      webSearchSessionRate: 0,
      webFetchSessionRate: 0,
    };
  }

  const totalAssistantTurns = sessions.reduce((sum, s) => sum + s.assistantTurnCount, 0);
  const totalTurns = sessions.reduce((sum, s) => sum + s.turnCount, 0);

  const pureAutonomous = sessions.filter((s) => s.userTurnCount <= 1).length;

  // Approximation, not measurement: the actual distribution of user
  // turns within a session is unknown from the aggregate counts. The
  // right fix is to read the user message timestamps from the JSONL
  // directly; until then this is a "characteristic average" of how
  // dense a session is, not a check-in cadence.
  const checkinGapsMinutes: number[] = [];
  for (const s of sessions) {
    if (s.userTurnCount > 1) {
      checkinGapsMinutes.push(s.durationMs / 60_000 / (s.userTurnCount - 1));
    }
  }
  const sortedGaps = [...checkinGapsMinutes].sort((a, b) => a - b);
  const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)]! : 0;

  const withSubagents = sessions.filter((s) => s.subagentCount > 0);

  const sessionsWithTask = new Set(
    toolCalls.filter((t) => t.category === "task").map((t) => t.sessionId)
  );
  const sessionsWithPlan = new Set(
    toolCalls.filter((t) => t.toolName === "ExitPlanMode").map((t) => t.sessionId)
  );
  const sessionsWithSearch = new Set(
    toolCalls.filter((t) => t.toolName === "WebSearch").map((t) => t.sessionId)
  );
  const sessionsWithFetch = new Set(
    toolCalls.filter((t) => t.toolName === "WebFetch").map((t) => t.sessionId)
  );

  const bySession = groupBy(toolCalls, (t) => t.sessionId);
  // Zero-fill every session (including those with no tool calls) so the
  // average isn't biased toward tool-using sessions.
  const planCyclesPerSession = sessions.map(
    (s) => (bySession.get(s.id) ?? []).filter((c) => c.toolName === "ExitPlanMode").length
  );

  return {
    autonomyRate: ratio(totalAssistantTurns, totalTurns),
    pureAutonomousSessionRate: ratio(pureAutonomous, sessions.length),
    avgUserCheckinsPerSession: mean(sessions.map((s) => s.userTurnCount)),
    medianMinutesBetweenCheckins: medianGap,
    subagentAdoptionRate: ratio(withSubagents.length, sessions.length),
    avgSubagentsPerSession: ratio(
      sessions.reduce((sum, s) => sum + s.subagentCount, 0),
      sessions.length
    ),
    taskToolUsageRate: ratio(sessionsWithTask.size, sessions.length),
    planModeAdoptionRate: ratio(sessionsWithPlan.size, sessions.length),
    avgPlanCyclesPerSession: mean(planCyclesPerSession),
    webSearchSessionRate: ratio(sessionsWithSearch.size, sessions.length),
    webFetchSessionRate: ratio(sessionsWithFetch.size, sessions.length),
  };
}
