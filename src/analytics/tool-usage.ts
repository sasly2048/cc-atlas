import type { ToolCallRecord } from "../types/domain.js";
import { countBy, groupBy, mean, ratio, topEntries } from "../utils/numbers.js";

/** Consolidates: cc-tool-mix, cc-toolbox, cc-mix, cc-pair, cc-ratio,
 * cc-first, cc-last, cc-when, cc-flow, cc-sequence, cc-burst. All of these
 * are different projections of the same "tool call event stream", so they
 * share one computation pass over tool_calls here. */
export interface ToolUsageStats {
  totalCalls: number;
  byTool: Array<[string, number]>;
  byCategory: Array<[string, number]>;
  avgToolsPerSession: number;
  avgDistinctToolsPerSession: number;
  firstToolCounts: Array<[string, number]>;
  lastToolCounts: Array<[string, number]>;
  topPairs: Array<[string, number]>; // "ToolA -> ToolB" adjacent-call pairs
  topTrigrams: Array<[string, number]>; // "ToolA -> ToolB -> ToolC"
  ratios: {
    readToEdit: number;
    writeToEdit: number;
    bashToGrep: number;
  };
  avgBurstLength: Record<string, number>; // avg consecutive-repeat length per tool
  positionBias: Array<{ tool: string; avgRelativePosition: number }>; // 0=start, 1=end
}

export function computeToolUsageStats(toolCalls: ToolCallRecord[]): ToolUsageStats {
  if (toolCalls.length === 0) {
    return {
      totalCalls: 0,
      byTool: [],
      byCategory: [],
      avgToolsPerSession: 0,
      avgDistinctToolsPerSession: 0,
      firstToolCounts: [],
      lastToolCounts: [],
      topPairs: [],
      topTrigrams: [],
      ratios: { readToEdit: 0, writeToEdit: 0, bashToGrep: 0 },
      avgBurstLength: {},
      positionBias: [],
    };
  }

  const byTool = topEntries(countBy(toolCalls, (t) => t.toolName), 20);
  const byCategory = topEntries(countBy(toolCalls, (t) => t.category), 20);

  const bySession = groupBy(toolCalls, (t) => t.sessionId);
  const perSessionCounts = [...bySession.values()].map((calls) => calls.length);
  const perSessionDistinct = [...bySession.values()].map(
    (calls) => new Set(calls.map((c) => c.toolName)).size
  );

  const firstTool = new Map<string, number>();
  const lastTool = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();
  const burstLengths = new Map<string, number[]>();
  const relativePositions = new Map<string, number[]>();

  for (const calls of bySession.values()) {
    const ordered = [...calls].sort((a, b) => a.turnIndex - b.turnIndex || a.ts - b.ts);
    if (ordered.length === 0) continue;

    const first = ordered[0]!.toolName;
    const last = ordered[ordered.length - 1]!.toolName;
    firstTool.set(first, (firstTool.get(first) ?? 0) + 1);
    lastTool.set(last, (lastTool.get(last) ?? 0) + 1);

    ordered.forEach((call, index) => {
      const relPos = ordered.length === 1 ? 0.5 : index / (ordered.length - 1);
      const arr = relativePositions.get(call.toolName) ?? [];
      arr.push(relPos);
      relativePositions.set(call.toolName, arr);
    });

    for (let i = 0; i < ordered.length - 1; i++) {
      const pairKey = `${ordered[i]!.toolName} -> ${ordered[i + 1]!.toolName}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }
    for (let i = 0; i < ordered.length - 2; i++) {
      const triKey = `${ordered[i]!.toolName} -> ${ordered[i + 1]!.toolName} -> ${ordered[i + 2]!.toolName}`;
      trigramCounts.set(triKey, (trigramCounts.get(triKey) ?? 0) + 1);
    }

    let runTool: string | null = null;
    let runLength = 0;
    for (const call of ordered) {
      if (call.toolName === runTool) {
        runLength += 1;
      } else {
        if (runTool) burstLengths.set(runTool, [...(burstLengths.get(runTool) ?? []), runLength]);
        runTool = call.toolName;
        runLength = 1;
      }
    }
    if (runTool) burstLengths.set(runTool, [...(burstLengths.get(runTool) ?? []), runLength]);
  }

  const countOf = (name: string) => toolCalls.filter((t) => t.toolName === name).length;
  const readCount = countOf("Read");
  const editCount = countOf("Edit") + countOf("MultiEdit");
  const writeCount = countOf("Write");
  const bashCount = countOf("Bash");
  const grepCount = countOf("Grep");

  const avgBurstLength: Record<string, number> = {};
  for (const [tool, lengths] of burstLengths) avgBurstLength[tool] = mean(lengths);

  const positionBias = [...relativePositions.entries()]
    .map(([tool, positions]) => ({ tool, avgRelativePosition: mean(positions) }))
    .sort((a, b) => a.avgRelativePosition - b.avgRelativePosition);

  return {
    totalCalls: toolCalls.length,
    byTool,
    byCategory,
    avgToolsPerSession: mean(perSessionCounts),
    avgDistinctToolsPerSession: mean(perSessionDistinct),
    firstToolCounts: topEntries(firstTool, 10),
    lastToolCounts: topEntries(lastTool, 10),
    topPairs: topEntries(pairCounts, 15),
    topTrigrams: topEntries(trigramCounts, 15),
    ratios: {
      readToEdit: ratio(readCount, editCount),
      writeToEdit: ratio(writeCount, editCount),
      bashToGrep: ratio(bashCount, grepCount),
    },
    avgBurstLength,
    positionBias,
  };
}
