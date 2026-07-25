import type { SessionRecord, ToolCallRecord } from "../types/domain.js";
import { groupBy, mean, ratio } from "../utils/numbers.js";

/** Consolidates: cc-human, cc-checkin, cc-ask, cc-subagent, cc-tasks,
 * cc-todo, cc-plan, cc-web, cc-search, cc-fetch. (cc-denied is not
 * included — see AUDIT.md: transcripts don't reliably distinguish a
 * user-denied tool call from any other failed call.) */
export interface CollaborationReport {
  autonomyRate: number; // assistant turns / total turns, higher = more autonomous
  pureAutonomousSessionRate: number; // sessions with <= 1 user turn
  avgUserCheckinsPerSession: number;
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

  const bySession = groupBy(toolCalls, (t) => t.sessionId);
  const checkinGapsMinutes: number[] = [];
  // User check-in cadence isn't directly visible from tool_calls (those are
  // assistant-side), but sessions with more user turns spaced across a
  // longer duration imply more frequent check-ins; approximate the gap as
  // session duration / user turns.
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

  const planCyclesPerSession = [...bySession.entries()].map(
    ([, calls]) => calls.filter((c) => c.toolName === "ExitPlanMode").length
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
