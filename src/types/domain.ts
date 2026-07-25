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

export interface GitCommitRecord {
  hash: string;
  repo: string;
  author: string;
  authorEmail: string | null;
  ts: number;
  message: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
  isAiAttributed: boolean;
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
  mtimeMs: number;
  size: number;
  sessionId: string | null;
}
