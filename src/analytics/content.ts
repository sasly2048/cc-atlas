import path from "node:path";
import type { ToolCallRecord } from "../types/domain.js";
import { countBy, ratio, sum, topEntries } from "../utils/numbers.js";

/** Consolidates: cc-edit, cc-read, cc-write, cc-grep, cc-cmds, cc-python,
 * cc-bash-type, cc-lang, cc-file-churn, cc-reread, cc-delta. All read the
 * file_path/command captured on each Read/Edit/Write/Bash/Grep call. */
export interface ContentReport {
  topEditedFiles: Array<[string, number]>;
  topReadFiles: Array<[string, number]>;
  topWrittenFiles: Array<[string, number]>;
  mostRereadFiles: Array<[string, number]>; // read >= 3 times
  fileChurn: Array<[string, number]>; // Read + Edit + Write combined, all files
  languageBreakdown: Array<[string, number]>; // by file extension across edit/write
  topBashCommands: Array<[string, number]>;
  bashCommandTypes: Array<[string, number]>; // inspect/execute/git/package/network
  topGrepPatterns: Array<[string, number]>;
  editSizeStats: { surgicalCount: number; massiveCount: number; avgDelta: number; totalCharsAdded: number };
}

const BASH_TYPE_RULES: Array<[RegExp, string]> = [
  [/^(cat|ls|head|tail|less|more|find|wc|file|stat|pwd)\b/, "inspect"],
  [/^git\b/, "git"],
  [/^(npm|yarn|pnpm|pip|pip3|cargo|go get|gem|composer|bundle)\b/, "package"],
  [/^(curl|wget|ping|nc|nslookup|dig|ssh|scp)\b/, "network"],
  [/^(rm|mv|cp|mkdir|touch|chmod|chown|kill|pkill)\b/, "mutate"],
];

function classifyBashCommand(command: string): string {
  const trimmed = command.trim();
  for (const [pattern, type] of BASH_TYPE_RULES) {
    if (pattern.test(trimmed)) return type;
  }
  return "execute";
}

function extOf(filePath: string): string {
  const ext = path.extname(filePath);
  return ext || "(no extension)";
}

export function computeContentReport(toolCalls: ToolCallRecord[]): ContentReport {
  const reads = toolCalls.filter((t) => t.category === "read" && t.filePath);
  const edits = toolCalls.filter((t) => t.category === "edit" && t.filePath);
  const writes = toolCalls.filter((t) => t.toolName === "Write" && t.filePath);
  const bashCalls = toolCalls.filter((t) => t.toolName === "Bash" && t.command);
  const grepCalls = toolCalls.filter((t) => t.toolName === "Grep" && t.command);

  const readCounts = countBy(reads, (t) => t.filePath!);
  const editCounts = countBy(edits, (t) => t.filePath!);
  const writeCounts = countBy(writes, (t) => t.filePath!);

  const churn = new Map<string, number>();
  for (const bucket of [readCounts, editCounts, writeCounts]) {
    for (const [file, count] of bucket) churn.set(file, (churn.get(file) ?? 0) + count);
  }

  const rereadFiles = [...readCounts.entries()].filter(([, count]) => count >= 3);

  const langCounts = countBy([...edits, ...writes], (t) => extOf(t.filePath!));

  const bashCommandCounts = countBy(bashCalls, (t) => t.command!.split(/\s+/)[0] ?? t.command!);
  const bashTypeCounts = countBy(bashCalls, (t) => classifyBashCommand(t.command!));

  const grepPatternCounts = countBy(grepCalls, (t) => t.command!);

  const editDeltas = [...edits, ...writes]
    .map((t) => t.sizeDelta)
    .filter((d): d is number => typeof d === "number");
  const surgicalCount = editDeltas.filter((d) => Math.abs(d) < 200).length;
  const massiveCount = editDeltas.filter((d) => Math.abs(d) >= 200).length;

  return {
    topEditedFiles: topEntries(editCounts, 15),
    topReadFiles: topEntries(readCounts, 15),
    topWrittenFiles: topEntries(writeCounts, 15),
    mostRereadFiles: rereadFiles.sort((a, b) => b[1] - a[1]).slice(0, 15),
    fileChurn: topEntries(churn, 20),
    languageBreakdown: topEntries(langCounts, 20),
    topBashCommands: topEntries(bashCommandCounts, 20),
    bashCommandTypes: topEntries(bashTypeCounts, 10),
    topGrepPatterns: topEntries(grepPatternCounts, 15),
    editSizeStats: {
      surgicalCount,
      massiveCount,
      avgDelta: ratio(sum(editDeltas), editDeltas.length),
      totalCharsAdded: sum(editDeltas.filter((d) => d > 0)),
    },
  };
}
