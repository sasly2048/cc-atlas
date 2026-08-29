import path from "node:path";
import type { SessionRecord, ToolCallRecord, ToolCategory, ToolStatus } from "../types/domain.js";

/**
 * Parses Claude Code's on-disk session transcript format: JSONL files under
 * ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl, one JSON object per
 * line describing a turn (user message, assistant message, tool result,
 * thinking block, or a "summary" line marking a context-compaction boundary).
 *
 * The format isn't formally documented, so this parser is deliberately
 * defensive: unknown/missing fields are tolerated and never abort ingestion
 * of the rest of the file. Each malformed line is counted and reported via
 * `warnings` rather than silently dropped.
 */

export interface ParsedTranscript {
  session: SessionRecord;
  toolCalls: ToolCallRecord[];
  /** Parser-level warnings (malformed lines, mismatched tool_use/tool_result
   * pairs, etc.). Surfaced in the IngestResult so the user can see data
   * was lost instead of receiving a clean-looking "0 errors" report. */
  warnings: string[];
}

interface RawLine {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  isSidechain?: boolean;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  Read: "read",
  NotebookRead: "read",
  Write: "write",
  NotebookEdit: "write",
  Edit: "edit",
  MultiEdit: "edit",
  Grep: "search",
  Glob: "search",
  Bash: "execute",
  BashOutput: "execute",
  KillShell: "execute",
  WebFetch: "web",
  WebSearch: "web",
  Task: "task",
  TodoWrite: "task",
  TaskCreate: "task",
  TaskUpdate: "task",
};

export function categorizeTool(toolName: string): ToolCategory {
  if (TOOL_CATEGORY[toolName]) return TOOL_CATEGORY[toolName]!;
  if (/git/i.test(toolName)) return "git";
  if (/^mcp__/i.test(toolName)) return "other";
  return "other";
}

function toEpochMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function contentBlocks(content: unknown): any[] {
  if (Array.isArray(content)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return [];
}

function extractFilePath(input: Record<string, unknown>): string | null {
  const candidate = input.file_path ?? input.path ?? input.notebook_path;
  return typeof candidate === "string" ? candidate : null;
}

/** "Command" is a loose slot reused across tool types for their primary free-text
 * argument: shell command (Bash), search pattern (Grep/Glob), or query/url
 * (WebSearch/WebFetch) — whichever a given tool actually sends. */
function extractCommand(toolName: string, input: Record<string, unknown>): string | null {
  const value =
    input.command ?? input.pattern ?? input.query ?? input.url ?? (toolName === "Glob" ? input.pattern : undefined);
  return typeof value === "string" ? value.slice(0, 300) : null;
}

function extractSizeDelta(input: Record<string, unknown>): number | null {
  const oldStr = typeof input.old_string === "string" ? input.old_string.length : null;
  const newStr = typeof input.new_string === "string" ? input.new_string.length : null;
  if (oldStr !== null && newStr !== null) return newStr - oldStr;
  const content = typeof input.content === "string" ? input.content.length : null;
  if (content !== null) return content; // Write: whole file is "added"
  return null;
}

/** Decode Claude Code's dash-encoded project directory name. Used only as
 * a fallback when the transcript's own `cwd` field is missing or
 * unparseable — prefer the cwd when available, because the dash-decoding
 * is lossy (a cwd like "/data/proj-1/inner" cannot be unambiguously
 * reconstructed from "-data-proj-1-inner"). */
export function deriveProjectName(filePath: string): string {
  const dir = path.basename(path.dirname(filePath));
  const decoded = dir.replace(/^-/, "").replace(/-/g, "/");
  return decoded || dir;
}

function deriveProjectFromCwd(cwd: string | null, filePath: string): string {
  if (cwd && cwd.trim()) {
    // The last non-empty path segment is the most stable project identity:
    // /Users/alice/code/my-app → "my-app". Falls back to the basename
    // alone when the cwd has no separators.
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return deriveProjectName(filePath);
}

/** Parse a Claude Code transcript. Returns null if the file produces no
 * usable session (no sessionId, no timestamps). Lines that fail to parse
 * are counted and reported via `warnings` rather than silently dropped. */
export function parseTranscript(filePath: string, lines: string[]): ParsedTranscript | null {
  const warnings: string[] = [];
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let model: string | null = null;
  let startedAt: number | null = null;
  let endedAt: number | null = null;

  let turnCount = 0;
  let userTurnCount = 0;
  let assistantTurnCount = 0;
  let messageCount = 0;
  let errorCount = 0;
  let thinkingBlockCount = 0;
  let compactionCount = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let maxContextTokens = 0;

  const toolCalls: ToolCallRecord[] = [];
  // Map of tool_use_id -> pending tool call. When the matching tool_result
  // arrives, we finalize the tool call. Pending entries that never see
  // a tool_result are emitted as "unknown" status at the end of the file
  // (transcript was cut off mid-call, or tool_result was lost).
  const pendingToolUse = new Map<
    string,
    {
      name: string;
      ts: number;
      turnIndex: number;
      filePath: string | null;
      command: string | null;
      sizeDelta: number | null;
    }
  >();
  // Subagent counting is two-pass: first we record every sidechain uuid
  // and the parent chain, then we derive a deduplicated count from the
  // graph. The previous implementation counted inline, which could
  // double-count when a transcript interleaved parent and child lines
  // in a way that exposed the same parent uuid twice.
  const sidechainUuids = new Set<string>();
  const sidechainParentUuids = new Set<string>();
  let malformedLineCount = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: RawLine;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      malformedLineCount += 1;
      continue;
    }

    if (raw.sessionId && !sessionId) sessionId = raw.sessionId;
    if (raw.cwd && !cwd) cwd = raw.cwd;

    const ts = toEpochMs(raw.timestamp);
    if (ts !== null) {
      startedAt = startedAt === null ? ts : Math.min(startedAt, ts);
      endedAt = endedAt === null ? ts : Math.max(endedAt, ts);
    }

    if (raw.type === "summary") {
      compactionCount += 1;
      continue;
    }

    if (raw.isSidechain) {
      if (raw.uuid) sidechainUuids.add(raw.uuid);
      if (raw.parentUuid) sidechainParentUuids.add(raw.parentUuid);
      continue;
    }

    const role = raw.message?.role;
    if (!role) continue;

    messageCount += 1;
    turnCount += 1;
    if (role === "user") userTurnCount += 1;
    if (role === "assistant") assistantTurnCount += 1;

    if (raw.message?.model) model = raw.message.model;

    const usage = raw.message?.usage;
    if (usage) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;

      const turnContext =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      maxContextTokens = Math.max(maxContextTokens, turnContext);
    }

    const blocks = contentBlocks(raw.message?.content);
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;

      if (block.type === "thinking") {
        thinkingBlockCount += 1;
      }

      if (block.type === "tool_use" && typeof block.name === "string") {
        const toolId = typeof block.id === "string" ? block.id : null;
        const input = block.input && typeof block.input === "object" ? block.input : {};
        if (!toolId) {
          // No tool_use_id means we can't correlate this call with its
          // result. Emit a synthetic, stable id derived from the line
          // so re-ingest doesn't duplicate the row.
          const synthetic = `synthetic:${lineIndex}:${turnCount}:${block.name}`;
          pendingToolUse.set(synthetic, {
            name: block.name,
            ts: ts ?? endedAt ?? Date.now(),
            turnIndex: turnCount,
            filePath: extractFilePath(input),
            command: extractCommand(block.name, input),
            sizeDelta: extractSizeDelta(input),
          });
          continue;
        }
        pendingToolUse.set(toolId, {
          name: block.name,
          ts: ts ?? endedAt ?? Date.now(),
          turnIndex: turnCount,
          filePath: extractFilePath(input),
          command: extractCommand(block.name, input),
          sizeDelta: extractSizeDelta(input),
        });
      }

      if (block.type === "tool_result") {
        const toolId = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
        const pending = toolId ? pendingToolUse.get(toolId) : undefined;
        const isError = block.is_error === true;
        if (isError) errorCount += 1;

        const status: ToolStatus = isError ? "error" : "success";
        const toolName = pending?.name ?? "unknown";
        const previewSource =
          typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c?.text ?? "").join(" ")
              : "";

        toolCalls.push({
          sessionId: sessionId ?? "unknown",
          toolName,
          ts: pending?.ts ?? ts ?? Date.now(),
          status,
          turnIndex: pending?.turnIndex ?? turnCount,
          inputPreview: previewSource ? previewSource.slice(0, 200) : null,
          category: categorizeTool(toolName),
          filePath: pending?.filePath ?? null,
          command: pending?.command ?? null,
          sizeDelta: pending?.sizeDelta ?? null,
          // Only record a toolUseId when this tool_result had a matching
          // tool_use. An orphan (no matching tool_use) gets null so the
          // database uniqueness index treats it as a transient record
          // and re-ingest can replace it without conflict.
          toolUseId: pending ? toolId : null,
          orphaned: !pending,
        });

        if (toolId) pendingToolUse.delete(toolId);
      }
    }
  }

  if (malformedLineCount > 0) {
    warnings.push(`${malformedLineCount} malformed line(s) skipped`);
  }

  // A tool_use with no matching tool_result means the transcript was cut
  // off mid-call (session killed, crash, truncated write) — still worth
  // counting, and we use a synthetic id so re-ingest is idempotent.
  for (const [toolUseId, pending] of pendingToolUse) {
    toolCalls.push({
      sessionId: sessionId ?? "unknown",
      toolName: pending.name,
      ts: pending.ts,
      status: "unknown",
      turnIndex: pending.turnIndex,
      inputPreview: null,
      category: categorizeTool(pending.name),
      filePath: pending.filePath,
      command: pending.command,
      sizeDelta: pending.sizeDelta,
      toolUseId,
      orphaned: false,
    });
  }

  if (!sessionId || startedAt === null || endedAt === null) {
    return null;
  }

  // Backfill sessionId on any tool calls recorded before it was first seen.
  for (const call of toolCalls) {
    if (call.sessionId === "unknown") call.sessionId = sessionId;
  }

  // Subagent count: number of sidechain leaf nodes (uuids that are
  // themselves sidechain turns but never appear as a parent of any
  // other sidechain line). This is "how many subagents did Claude
  // spawn" — the root dispatcher doesn't count, only the leaves.
  // Two-pass graph derivation, so the count is independent of the
  // order lines happened to appear in the transcript.
  const subagentLeaves = [...sidechainUuids].filter(
    (u) => !sidechainParentUuids.has(u)
  );
  const subagentCount = subagentLeaves.length;

  const session: SessionRecord = {
    id: sessionId,
    project: deriveProjectFromCwd(cwd, filePath),
    cwd,
    sourceFile: filePath,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    turnCount,
    userTurnCount,
    assistantTurnCount,
    messageCount,
    toolCallCount: toolCalls.length,
    errorCount,
    model,
    subagentCount,
    thinkingBlockCount,
    compactionCount,
    cacheReadTokens,
    cacheCreationTokens,
    inputTokens,
    outputTokens,
    maxContextTokens,
    sourceLabel: "you",
  };

  return { session, toolCalls, warnings };
}
