import type { GitCommitRecord, SessionRecord, ToolCallRecord } from "../types/domain.js";
import type { ToolkitConfig } from "../core/config.js";
import { computeCurrentStreak } from "../analytics/forecast.js";
import { computeBurnoutReport } from "../analytics/burnout.js";
import { computeCostReport } from "../analytics/cost.js";
import { sum, ratio } from "../utils/numbers.js";

/** Not derived from any yurukusa package, and not a real LLM integration —
 * deliberately so: this is pattern matching over a fixed set of question
 * shapes against locally computed stats, with zero network calls. It
 * understands a specific, documented vocabulary (hours/sessions/errors/
 * streak/burnout/cost/commits/tools, optionally scoped to a project and a
 * time period) rather than pretending to be general natural-language
 * understanding. See `cc-atlas ask --help` / the README for the supported
 * phrasings. */
export interface NlqContext {
  sessions: SessionRecord[];
  toolCalls: ToolCallRecord[];
  commits: GitCommitRecord[];
  burnoutConfig: ToolkitConfig["burnout"];
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface Period {
  label: string;
  sinceTs: number;
}

function detectPeriod(q: string, now: number): Period {
  if (/\btoday\b/.test(q)) return { label: "today", sinceTs: now - DAY_MS };
  if (/\byesterday\b/.test(q)) return { label: "the last 2 days", sinceTs: now - 2 * DAY_MS };
  if (/\b(this week|past week|last 7 days|weekly)\b/.test(q)) return { label: "this week", sinceTs: now - 7 * DAY_MS };
  if (/\b(this month|past month|last 30 days|monthly)\b/.test(q)) return { label: "this month", sinceTs: now - 30 * DAY_MS };
  return { label: "all time", sinceTs: 0 };
}

function detectProject(q: string, sessions: SessionRecord[]): string | null {
  const projects = [...new Set(sessions.map((s) => s.project))].sort((a, b) => b.length - a.length);
  for (const project of projects) {
    if (q.includes(project.toLowerCase())) return project;
  }
  return null;
}

/** Answers a fixed vocabulary of questions about locally computed stats.
 * Returns a plain-English answer string, or an explanation of what it does
 * understand if the question doesn't match a known shape. */
export function answerQuery(question: string, ctx: NlqContext, now = Date.now()): string {
  const q = question.toLowerCase().trim();
  const period = detectPeriod(q, now);
  const project = detectProject(q, ctx.sessions);

  let sessions = ctx.sessions.filter((s) => s.startedAt >= period.sinceTs);
  if (project) sessions = sessions.filter((s) => s.project === project);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const toolCalls = ctx.toolCalls.filter((c) => sessionIds.has(c.sessionId));
  const scope = project ? ` on ${project}` : "";

  if (/\bstreak\b/.test(q)) {
    const streak = computeCurrentStreak(ctx.sessions, now);
    return streak > 0
      ? `You're on a ${streak}-day streak.`
      : "No active streak right now — your last session wasn't today or yesterday.";
  }

  if (/\b(burnout|risk)\b/.test(q)) {
    const report = computeBurnoutReport(ctx.sessions, ctx.burnoutConfig);
    return `Burnout risk is ${report.riskLevel} (score ${report.score}/100).${
      report.factors.length ? " Factors: " + report.factors.join(" ") : " No specific risk factors detected."
    }`;
  }

  if (/\bghost day/.test(q)) {
    return "Ghost days need git history — ask from the Git Activity screen or a report, which has commit data this view doesn't.";
  }

  if (/\b(error|fail)/.test(q)) {
    if (toolCalls.length === 0) return `No tool calls recorded${scope} for ${period.label}.`;
    const errors = toolCalls.filter((c) => c.status === "error").length;
    return `Error rate${scope} for ${period.label}: ${(ratio(errors, toolCalls.length) * 100).toFixed(1)}% (${errors} of ${toolCalls.length} tool calls).`;
  }

  if (/\b(most used|favorite|top) tool|which tool/.test(q)) {
    if (toolCalls.length === 0) return `No tool calls recorded${scope} for ${period.label}.`;
    const counts = new Map<string, number>();
    for (const c of toolCalls) counts.set(c.toolName, (counts.get(c.toolName) ?? 0) + 1);
    const [tool, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    return `Most-used tool${scope} for ${period.label}: ${tool} (${count} calls).`;
  }

  if (/\b(cost|spend|spent|money|\$)/.test(q)) {
    const cost = computeCostReport(sessions, now);
    return `Estimated cost${scope} for ${period.label}: $${cost.actualCostUsd.toFixed(2)} (illustrative rate; cache saved ~$${cost.cacheSavingsUsd.toFixed(2)}).`;
  }

  if (/\bcommit/.test(q)) {
    const commits = ctx.commits.filter((c) => c.ts >= period.sinceTs);
    return `${commits.length} commit(s) recorded for ${period.label}${project ? " (commit data isn't project-scoped, showing all repos)" : ""}.`;
  }

  if (/\bhours?\b|time spent|how long/.test(q)) {
    const hours = sum(sessions.map((s) => s.durationMs)) / 3_600_000;
    return `${hours.toFixed(1)} hour(s)${scope} for ${period.label}, across ${sessions.length} session(s).`;
  }

  if (/\bsession/.test(q)) {
    return `${sessions.length} session(s)${scope} for ${period.label}.`;
  }

  return (
    "I didn't recognize that one. Try asking about: hours, sessions, error rate, streak, burnout, " +
    "most-used tool, cost, or commits — optionally with a project name and a period " +
    "(today / this week / this month / all time). Example: \"how many hours on cc-atlas this week\"."
  );
}
