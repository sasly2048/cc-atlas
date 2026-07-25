import type { SessionRecord } from "../types/domain.js";
import { mean, ratio, sum } from "../utils/numbers.js";

/** Consolidates: cc-context-check, @yurukusa/cc-context (duplicate),
 * cc-compact, cc-think, @yurukusa/cc-think (duplicate), cc-size. */
export interface ContextReport {
  avgMaxContextTokens: number;
  p90MaxContextTokens: number;
  sizeTierCounts: Record<"small" | "medium" | "large" | "near-limit", number>;
  compactionRate: number; // fraction of sessions that hit at least one compaction
  avgCompactionsPerSession: number;
  thinkingBlockRate: number; // fraction of sessions using extended thinking at all
  avgThinkingBlocksPerSession: number;
  totalTranscriptTokens: number; // input+output+cache, a proxy for total disk/history size
}

const CONTEXT_WINDOW_ASSUMED = 200_000; // Claude's standard context window, used only for tiering

export function computeContextReport(sessions: SessionRecord[]): ContextReport {
  if (sessions.length === 0) {
    return {
      avgMaxContextTokens: 0,
      p90MaxContextTokens: 0,
      sizeTierCounts: { small: 0, medium: 0, large: 0, "near-limit": 0 },
      compactionRate: 0,
      avgCompactionsPerSession: 0,
      thinkingBlockRate: 0,
      avgThinkingBlocksPerSession: 0,
      totalTranscriptTokens: 0,
    };
  }

  const maxContexts = sessions.map((s) => s.maxContextTokens);
  const sorted = [...maxContexts].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 0;

  const sizeTierCounts = { small: 0, medium: 0, large: 0, "near-limit": 0 };
  for (const tokens of maxContexts) {
    const fraction = tokens / CONTEXT_WINDOW_ASSUMED;
    if (fraction < 0.25) sizeTierCounts.small += 1;
    else if (fraction < 0.5) sizeTierCounts.medium += 1;
    else if (fraction < 0.85) sizeTierCounts.large += 1;
    else sizeTierCounts["near-limit"] += 1;
  }

  const compactedSessions = sessions.filter((s) => s.compactionCount > 0);
  const thinkingSessions = sessions.filter((s) => s.thinkingBlockCount > 0);

  return {
    avgMaxContextTokens: mean(maxContexts),
    p90MaxContextTokens: p90,
    sizeTierCounts,
    compactionRate: ratio(compactedSessions.length, sessions.length),
    avgCompactionsPerSession: mean(sessions.map((s) => s.compactionCount)),
    thinkingBlockRate: ratio(thinkingSessions.length, sessions.length),
    avgThinkingBlocksPerSession: mean(sessions.map((s) => s.thinkingBlockCount)),
    totalTranscriptTokens: sum(sessions.map((s) => s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreationTokens)),
  };
}
