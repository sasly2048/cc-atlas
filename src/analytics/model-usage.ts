import type { SessionRecord } from "../types/domain.js";
import { monthKey } from "../utils/dates.js";
import { countBy, groupBy, sum, topEntries } from "../utils/numbers.js";

/** Consolidates: cc-model, cc-model-selector. */
export interface ModelUsageReport {
  byModel: Array<[string, number]>; // session counts
  hoursByModel: Array<[string, number]>;
  timeline: Array<{ month: string; models: Record<string, number> }>;
}

export function computeModelUsageReport(sessions: SessionRecord[]): ModelUsageReport {
  const withModel = sessions.filter((s): s is SessionRecord & { model: string } => !!s.model);
  const byModel = topEntries(countBy(withModel, (s) => s.model), 10);

  const hoursMap = new Map<string, number>();
  for (const s of withModel) {
    hoursMap.set(s.model, (hoursMap.get(s.model) ?? 0) + s.durationMs / 3_600_000);
  }
  const hoursByModel = topEntries(hoursMap, 10);

  const byMonth = groupBy(withModel, (s) => monthKey(s.startedAt));
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, bucket]) => {
      const models: Record<string, number> = {};
      for (const s of bucket) models[s.model] = (models[s.model] ?? 0) + 1;
      return { month, models };
    });

  return { byModel, hoursByModel, timeline };
}

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "research";

const MODEL_RECOMMENDATIONS: Record<TaskComplexity, { model: string; reason: string }> = {
  trivial: {
    model: "claude-haiku-4-5",
    reason: "Fast, cheap, and accurate enough for lookups, formatting, or one-line edits.",
  },
  simple: {
    model: "claude-haiku-4-5",
    reason: "Well-scoped single-file changes rarely need a larger model.",
  },
  moderate: {
    model: "claude-sonnet-5",
    reason: "Multi-file changes and moderate reasoning benefit from Sonnet's balance of speed and depth.",
  },
  complex: {
    model: "claude-opus-5",
    reason: "Architectural decisions, ambiguous requirements, or large refactors reward Opus's deeper reasoning.",
  },
  research: {
    model: "claude-opus-5",
    reason: "Open-ended investigation and synthesis across many sources favor the strongest reasoning model.",
  },
};

/** cc-model-selector's core idea distilled: map a self-reported task
 * complexity to a model recommendation. Kept intentionally simple — this
 * is a heuristic starting point, not a scored classifier. */
export function recommendModel(complexity: TaskComplexity): { model: string; reason: string } {
  return MODEL_RECOMMENDATIONS[complexity];
}

export function totalDurationHours(sessions: SessionRecord[]): number {
  return sum(sessions.map((s) => s.durationMs)) / 3_600_000;
}
