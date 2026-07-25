import type { SessionRecord, ToolCallRecord } from "../types/domain.js";

/** Not derived from any yurukusa package. Compresses a session's tool-call
 * stream into a short, scannable timeline — "Read -> Edit -> Bash(fail) ->
 * Edit -> Bash(pass)" — instead of scrolling the raw transcript to
 * understand what actually happened in a session. */
export interface TimelineStep {
  turnIndex: number;
  toolName: string;
  status: string;
  detail: string | null;
}

export interface SessionTimeline {
  session: SessionRecord;
  steps: TimelineStep[];
  errorCount: number;
  recoveredErrorCount: number;
}

export function buildSessionTimeline(session: SessionRecord, toolCalls: ToolCallRecord[]): SessionTimeline {
  const ordered = [...toolCalls]
    .filter((c) => c.sessionId === session.id)
    .sort((a, b) => a.turnIndex - b.turnIndex || a.ts - b.ts);

  const steps: TimelineStep[] = ordered.map((c) => ({
    turnIndex: c.turnIndex,
    toolName: c.toolName,
    status: c.status,
    detail: c.filePath ?? c.command ?? null,
  }));

  let errorCount = 0;
  let recoveredErrorCount = 0;
  ordered.forEach((call, index) => {
    if (call.status !== "error") return;
    errorCount += 1;
    const lookahead = ordered.slice(index + 1, index + 4);
    if (lookahead.some((c) => c.toolName === call.toolName && c.status === "success")) {
      recoveredErrorCount += 1;
    }
  });

  return { session, steps, errorCount, recoveredErrorCount };
}

/** Renders steps as a compact arrow chain, e.g. "Read -> Edit -> Bash(fail)".
 * Kept as plain text (no color codes) so it's reusable in both the terminal
 * view and any future non-TTY export. */
export function renderTimelineText(timeline: SessionTimeline, maxSteps = 60): string {
  const shown = timeline.steps.slice(0, maxSteps);
  const parts = shown.map((s) => (s.status === "error" ? `${s.toolName}(fail)` : s.toolName));
  const chain = parts.join(" -> ");
  const truncated = timeline.steps.length > maxSteps ? ` -> … (+${timeline.steps.length - maxSteps} more)` : "";
  return chain + truncated;
}
