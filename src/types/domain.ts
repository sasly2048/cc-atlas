/** Shared domain types used across services, analytics, db and reports. */

export interface SessionRecord {
  id: string;
  project: string;
  cwd: string | null;
  sourceFile: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationMs: number;
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  messageCount: number;
  toolCallCount: number;
  errorCount: number;
  model: string | null;
  subagentCount: number;
  thinkingBlockCount: number;
  compactionCount: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Largest single-turn (input + cache_read + cache_creation) seen in the
   * session — the best available proxy for how full the context window got,
   * since transcripts don't record the model's actual context-window limit. */
  maxContextTokens: number;
  /** Who this session came from — 'you' by default, or a team member name
   * when ingested via config.team.members. Lets one database aggregate
   * more than one person's ~/.claude history (see analytics/team.ts). */
  sourceLabel: string;
}

export type ToolStatus = "success" | "error" | "denied" | "unknown";

export interface ToolCallRecord {
  id?: number;
  sessionId: string;
  toolName: string;
  ts: number; // epoch ms
  status: ToolStatus;
  turnIndex: number;
  inputPreview: string | null;
  category: ToolCategory;
  filePath: string | null;
  command: string | null;
  /** Net characters added for Edit/Write/MultiEdit calls (new - old length). */
  sizeDelta: number | null;
  /** Stable identity for idempotent inserts. tool_use_id from the transcript
   * when present, else derived from (ts, turnIndex, toolName) so a
   * re-ingest of the same file is a no-op. */
  toolUseId: string | null;
  /** True if this row was produced from a tool_result with no matching
   * tool_use — kept distinct from real tool calls so analytics can
   * exclude or report them separately. */
  orphaned: boolean;
}

export type ToolCategory =
  | "read"
  | "write"
  | "edit"
  | "search"
  | "execute"
  | "git"
  | "web"
  | "task"
  | "other";

/** Why a commit is or isn't considered AI-attributed. */
export type AttributionSource = "none" | "explicit" | "correlated";

export interface GitCommitRecord {
  hash: string;
  repo: string;
  /** Canonical absolute path of the repo (audit-grade: identical paths
   * configured as e.g. /project and /project/ are merged into one row). */
  repoCanonical: string;
  author: string;
  authorEmail: string | null;
  ts: number;
  message: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
  /** Boolean kept for fast SQL filtering. The reason lives in
   * attributionSource; the strength lives in attributionConfidence. */
  isAiAttributed: boolean;
  attributionSource: AttributionSource;
  /** 0..1 — how confident the attribution is. Explicit (Co-Authored-By /
   * Generated-With) is 1.0; time-correlation alone is at most ~0.6. */
  attributionConfidence: number;
}

export interface DailyRollup {
  date: string; // YYYY-MM-DD
  hours: number;
  sessions: number;
  commits: number;
  toolCalls: number;
  ghostDay: boolean;
}

export interface IngestFileState {
  path: string;
  sourceLabel: string;
  mtimeMs: number;
  size: number;
  /** Hex sha-256 of the file content. Used for change detection so a
   * modification that preserves mtime+size is still detected. */
  contentHash: string;
  sessionId: string | null;
}

/** Per-run aggregate over an ingest pass — distinguishes "nothing changed"
 * from "tried and failed" so the user can see data-quality problems. */
export interface IngestResult {
  filesScanned: number;
  filesIngested: number;
  filesSkipped: number;
  filesUnreadable: number;
  filesMalformed: number;
  filesStale: number;
  sessionsUpserted: number;
  sessionsRemoved: number;
  toolCallsInserted: number;
  malformedLines: number;
  parseWarnings: string[];
  durationMs: number;
}
