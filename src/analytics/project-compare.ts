import type { SessionRecord, ToolCallRecord } from "../types/domain.js";
import { mean, ratio, sum } from "../utils/numbers.js";

/** Not derived from any yurukusa package — every one of them reports a
 * single project's numbers. This puts two side by side so you can actually
 * see which one gets more autonomous work, higher error rates, or longer
 * sessions, instead of eyeballing two separate screens. */
export interface ProjectSummary {
  project: string;
  sessions: number;
  hours: number;
  avgSessionMinutes: number;
  avgTurnsPerSession: number;
  fireAndForgetRate: number;
  toolCalls: number;
  errorRate: number;
  avgDistinctToolsPerSession: number;
  topTool: string | null;
}

export interface ProjectComparison {
  a: ProjectSummary;
  b: ProjectSummary;
  /** Plain-language callouts about the more notable deltas between the two. */
  highlights: string[];
}

export function computeProjectSummary(
  project: string,
  sessions: SessionRecord[],
  toolCalls: ToolCallRecord[]
): ProjectSummary {
  const projectSessions = sessions.filter((s) => s.project === project);
  const sessionIds = new Set(projectSessions.map((s) => s.id));
  const projectCalls = toolCalls.filter((c) => sessionIds.has(c.sessionId));

  const hours = sum(projectSessions.map((s) => s.durationMs)) / 3_600_000;
  const fireAndForget = projectSessions.filter((s) => s.userTurnCount <= 1).length;
  const errors = projectCalls.filter((c) => c.status === "error").length;

  const byTool = new Map<string, number>();
  for (const c of projectCalls) byTool.set(c.toolName, (byTool.get(c.toolName) ?? 0) + 1);
  const topTool = [...byTool.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const bySessionDistinct = new Map<string, Set<string>>();
  for (const c of projectCalls) {
    const set = bySessionDistinct.get(c.sessionId) ?? new Set<string>();
    set.add(c.toolName);
    bySessionDistinct.set(c.sessionId, set);
  }

  return {
    project,
    sessions: projectSessions.length,
    hours,
    avgSessionMinutes: mean(projectSessions.map((s) => s.durationMs / 60_000)),
    avgTurnsPerSession: mean(projectSessions.map((s) => s.turnCount)),
    fireAndForgetRate: ratio(fireAndForget, projectSessions.length),
    toolCalls: projectCalls.length,
    errorRate: ratio(errors, projectCalls.length),
    avgDistinctToolsPerSession: mean([...bySessionDistinct.values()].map((s) => s.size)),
    topTool,
  };
}

export function compareProjects(
  sessions: SessionRecord[],
  toolCalls: ToolCallRecord[],
  projectA: string,
  projectB: string
): ProjectComparison {
  const a = computeProjectSummary(projectA, sessions, toolCalls);
  const b = computeProjectSummary(projectB, sessions, toolCalls);

  const highlights: string[] = [];

  if (a.hours > 0 || b.hours > 0) {
    const [more, less] = a.hours >= b.hours ? [a, b] : [b, a];
    if (more.hours > less.hours * 1.2) {
      highlights.push(`${more.project} has absorbed ${more.hours.toFixed(1)}h vs ${less.project}'s ${less.hours.toFixed(1)}h.`);
    }
  }

  if (a.fireAndForgetRate > 0 || b.fireAndForgetRate > 0) {
    const [more, less] = a.fireAndForgetRate >= b.fireAndForgetRate ? [a, b] : [b, a];
    if (more.fireAndForgetRate > less.fireAndForgetRate + 0.15) {
      highlights.push(
        `${more.project} gets more autonomous, hands-off work (${(more.fireAndForgetRate * 100).toFixed(0)}% fire-and-forget vs ${(less.fireAndForgetRate * 100).toFixed(0)}%).`
      );
    }
  }

  if (a.toolCalls > 20 && b.toolCalls > 20) {
    const [worse, better] = a.errorRate >= b.errorRate ? [a, b] : [b, a];
    if (worse.errorRate > better.errorRate * 1.5 && worse.errorRate > 0.03) {
      highlights.push(
        `${worse.project} runs hotter on errors (${(worse.errorRate * 100).toFixed(1)}% vs ${(better.errorRate * 100).toFixed(1)}%).`
      );
    }
  }

  if (a.avgSessionMinutes > 0 || b.avgSessionMinutes > 0) {
    const [longer, shorter] = a.avgSessionMinutes >= b.avgSessionMinutes ? [a, b] : [b, a];
    if (longer.avgSessionMinutes > shorter.avgSessionMinutes * 1.5 && shorter.avgSessionMinutes > 0) {
      highlights.push(
        `Sessions on ${longer.project} run ${(longer.avgSessionMinutes / shorter.avgSessionMinutes).toFixed(1)}x longer on average than ${shorter.project}.`
      );
    }
  }

  if (highlights.length === 0) {
    highlights.push("These two projects look fairly similar across the metrics tracked here.");
  }

  return { a, b, highlights };
}
