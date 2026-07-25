import type { SessionRecord } from "../types/domain.js";
import { dayKey } from "../utils/dates.js";
import { sum } from "../utils/numbers.js";

/** Consolidates: cc-save, cc-cache, cc-cost-forecast, cc-predict (cost half).
 *
 * Pricing is illustrative, not billing-accurate: Anthropic's published
 * per-model rates change over time and aren't embedded in session
 * transcripts, so this uses a single representative blended rate. Treat
 * dollar figures as directional, not an invoice. */
const ILLUSTRATIVE_RATES_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

export interface CostReport {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  cacheHitRatio: number; // cacheRead / (cacheRead + input)
  actualCostUsd: number;
  costWithoutCacheUsd: number;
  cacheSavingsUsd: number;
  projectedMonthEndCostUsd: number;
  ratesNote: string;
}

export function computeCostReport(sessions: SessionRecord[], now = Date.now()): CostReport {
  const totalInputTokens = sum(sessions.map((s) => s.inputTokens));
  const totalOutputTokens = sum(sessions.map((s) => s.outputTokens));
  const totalCacheReadTokens = sum(sessions.map((s) => s.cacheReadTokens));
  const totalCacheCreationTokens = sum(sessions.map((s) => s.cacheCreationTokens));

  const toMtok = (tokens: number) => tokens / 1_000_000;
  const actualCostUsd =
    toMtok(totalInputTokens) * ILLUSTRATIVE_RATES_PER_MTOK.input +
    toMtok(totalOutputTokens) * ILLUSTRATIVE_RATES_PER_MTOK.output +
    toMtok(totalCacheCreationTokens) * ILLUSTRATIVE_RATES_PER_MTOK.cacheWrite +
    toMtok(totalCacheReadTokens) * ILLUSTRATIVE_RATES_PER_MTOK.cacheRead;

  const costWithoutCacheUsd =
    toMtok(totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens) *
      ILLUSTRATIVE_RATES_PER_MTOK.input +
    toMtok(totalOutputTokens) * ILLUSTRATIVE_RATES_PER_MTOK.output;

  const cacheHitRatio =
    totalCacheReadTokens + totalInputTokens === 0
      ? 0
      : totalCacheReadTokens / (totalCacheReadTokens + totalInputTokens);

  const projectedMonthEndCostUsd = projectMonthEnd(sessions, actualCostUsd, now);

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    cacheHitRatio,
    actualCostUsd,
    costWithoutCacheUsd,
    cacheSavingsUsd: Math.max(0, costWithoutCacheUsd - actualCostUsd),
    projectedMonthEndCostUsd,
    ratesNote:
      "Illustrative blended rate (not model- or date-specific); see docs for how to override.",
  };
}

function projectMonthEnd(sessions: SessionRecord[], costSoFarThisRun: number, now: number): number {
  const date = new Date(now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate();
  const monthPrefix = dayKey(now).slice(0, 7);

  const thisMonthSessions = sessions.filter((s) => dayKey(s.startedAt).startsWith(monthPrefix));
  if (thisMonthSessions.length === 0 || dayOfMonth === 0) return 0;

  const costSoFar = costForSessions(thisMonthSessions);
  const dailyAverage = costSoFar / dayOfMonth;
  return dailyAverage * daysInMonth;
}

function costForSessions(sessions: SessionRecord[]): number {
  const toMtok = (tokens: number) => tokens / 1_000_000;
  return sum(
    sessions.map(
      (s) =>
        toMtok(s.inputTokens) * ILLUSTRATIVE_RATES_PER_MTOK.input +
        toMtok(s.outputTokens) * ILLUSTRATIVE_RATES_PER_MTOK.output +
        toMtok(s.cacheCreationTokens) * ILLUSTRATIVE_RATES_PER_MTOK.cacheWrite +
        toMtok(s.cacheReadTokens) * ILLUSTRATIVE_RATES_PER_MTOK.cacheRead
    )
  );
}
