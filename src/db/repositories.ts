import type { Db } from "./database.js";
import type {
  GitCommitRecord,
  IngestFileState,
  SessionRecord,
  ToolCallRecord,
} from "../types/domain.js";

export class SessionRepository {
  constructor(private db: Db) {}

  upsert(session: SessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
          id, project, cwd, source_file, started_at, ended_at, duration_ms,
          turn_count, user_turn_count, assistant_turn_count, message_count,
          tool_call_count, error_count, model, subagent_count,
          thinking_block_count, compaction_count, cache_read_tokens,
          cache_creation_tokens, input_tokens, output_tokens, max_context_tokens,
          source_label
        ) VALUES (
          @id, @project, @cwd, @sourceFile, @startedAt, @endedAt, @durationMs,
          @turnCount, @userTurnCount, @assistantTurnCount, @messageCount,
          @toolCallCount, @errorCount, @model, @subagentCount,
          @thinkingBlockCount, @compactionCount, @cacheReadTokens,
          @cacheCreationTokens, @inputTokens, @outputTokens, @maxContextTokens,
          @sourceLabel
        )
        ON CONFLICT(id) DO UPDATE SET
          project=excluded.project, cwd=excluded.cwd, source_file=excluded.source_file,
          started_at=excluded.started_at, ended_at=excluded.ended_at, duration_ms=excluded.duration_ms,
          turn_count=excluded.turn_count, user_turn_count=excluded.user_turn_count,
          assistant_turn_count=excluded.assistant_turn_count, message_count=excluded.message_count,
          tool_call_count=excluded.tool_call_count, error_count=excluded.error_count,
          model=excluded.model, subagent_count=excluded.subagent_count,
          thinking_block_count=excluded.thinking_block_count, compaction_count=excluded.compaction_count,
          cache_read_tokens=excluded.cache_read_tokens, cache_creation_tokens=excluded.cache_creation_tokens,
          input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
          max_context_tokens=excluded.max_context_tokens, source_label=excluded.source_label`
      )
      .run(session);
  }

  deleteToolCalls(sessionId: string): void {
    this.db.prepare(`DELETE FROM tool_calls WHERE session_id = ?`).run(sessionId);
  }

  /** Only 'you' sessions — every existing analytics screen stays scoped to
   * the local user even after config.team.members is populated. */
  all(sinceTs = 0): SessionRecord[] {
    return this.db
      .prepare(`SELECT * FROM sessions WHERE started_at >= ? AND source_label = 'you' ORDER BY started_at ASC`)
      .all(sinceTs)
      .map(rowToSession);
  }

  /** Every session regardless of source_label — used only by the Team
   * Activity screen (see analytics/team.ts) to aggregate across people. */
  allSources(sinceTs = 0): SessionRecord[] {
    return this.db
      .prepare(`SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at ASC`)
      .all(sinceTs)
      .map(rowToSession);
  }

  count(): number {
    return (this.db.prepare(`SELECT COUNT(*) as c FROM sessions`).get() as { c: number }).c;
  }
}

function rowToSession(row: any): SessionRecord {
  return {
    id: row.id,
    project: row.project,
    cwd: row.cwd,
    sourceFile: row.source_file,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    turnCount: row.turn_count,
    userTurnCount: row.user_turn_count,
    assistantTurnCount: row.assistant_turn_count,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
    errorCount: row.error_count,
    model: row.model,
    subagentCount: row.subagent_count,
    thinkingBlockCount: row.thinking_block_count,
    compactionCount: row.compaction_count,
    cacheReadTokens: row.cache_read_tokens,
    cacheCreationTokens: row.cache_creation_tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    maxContextTokens: row.max_context_tokens,
    sourceLabel: row.source_label ?? "you",
  };
}

export class ToolCallRepository {
  constructor(private db: Db) {}

  insertMany(calls: ToolCallRecord[]): void {
    if (calls.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO tool_calls (session_id, tool_name, ts, status, turn_index, input_preview, category, file_path, command, size_delta)
       VALUES (@sessionId, @toolName, @ts, @status, @turnIndex, @inputPreview, @category, @filePath, @command, @sizeDelta)`
    );
    const insertAll = this.db.transaction((rows: ToolCallRecord[]) => {
      for (const row of rows) stmt.run(row);
    });
    insertAll(calls);
  }

  /** Only tool calls belonging to 'you' sessions — kept in sync with
   * SessionRepository.all() so combining the two never leaks a team
   * member's tool activity into the local user's screens. */
  all(sinceTs = 0): ToolCallRecord[] {
    return this.db
      .prepare(
        `SELECT tool_calls.* FROM tool_calls
         JOIN sessions ON sessions.id = tool_calls.session_id
         WHERE tool_calls.ts >= ? AND sessions.source_label = 'you'
         ORDER BY tool_calls.ts ASC`
      )
      .all(sinceTs)
      .map(rowToToolCall);
  }
}

function rowToToolCall(row: any): ToolCallRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    ts: row.ts,
    status: row.status,
    turnIndex: row.turn_index,
    inputPreview: row.input_preview,
    category: row.category,
    filePath: row.file_path,
    command: row.command,
    sizeDelta: row.size_delta,
  };
}

export class GitCommitRepository {
  constructor(private db: Db) {}

  insertMany(commits: GitCommitRecord[]): void {
    if (commits.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO git_commits (
        hash, repo, author, author_email, ts, message, insertions, deletions,
        files_changed, is_ai_attributed
      ) VALUES (@hash, @repo, @author, @authorEmail, @ts, @message, @insertions,
        @deletions, @filesChanged, @isAiAttributed)
      ON CONFLICT(repo, hash) DO UPDATE SET
        author=excluded.author,
        author_email=excluded.author_email,
        ts=excluded.ts,
        message=excluded.message,
        insertions=excluded.insertions,
        deletions=excluded.deletions,
        files_changed=excluded.files_changed,
        is_ai_attributed=MAX(git_commits.is_ai_attributed, excluded.is_ai_attributed)`
    );
    const insertAll = this.db.transaction((rows: GitCommitRecord[]) => {
      for (const row of rows) {
        stmt.run({ ...row, isAiAttributed: row.isAiAttributed ? 1 : 0 });
      }
    });
    insertAll(commits);
  }

  /** Re-runs the session-window refinement over every stored commit, flipping
   * is_ai_attributed from 0 → 1 for any commit that lands inside (or shortly
   * after) a recorded session. Safe to call repeatedly; monotonically
   * non-decreasing. Run this after sessions are ingested, so a git commit
   * that was message-only at first write can be promoted by a later session
   * landing in the same window. */
  recomputeAiAttribution(sessions: SessionRecord[], bufferMs = 15 * 60 * 1000): number {
    if (sessions.length === 0) return 0;
    const windows = sessions
      .map((s) => [s.startedAt, s.endedAt + bufferMs] as const)
      .sort((a, b) => a[0] - b[0]);
    const withinSession = (ts: number): boolean =>
      windows.some(([start, end]) => ts >= start && ts <= end);

    const rows = this.db
      .prepare(`SELECT hash, repo, ts, is_ai_attributed FROM git_commits WHERE is_ai_attributed = 0`)
      .all() as Array<{ hash: string; repo: string; ts: number; is_ai_attributed: number }>;
    if (rows.length === 0) return 0;

    const update = this.db.prepare(
      `UPDATE git_commits SET is_ai_attributed = 1 WHERE repo = ? AND hash = ?`
    );
    const tx = this.db.transaction((toUpdate: typeof rows) => {
      for (const r of toUpdate) {
        if (withinSession(r.ts)) update.run(r.repo, r.hash);
      }
    });
    tx(rows);
    return rows.filter((r) => withinSession(r.ts)).length;
  }

  all(sinceTs = 0): GitCommitRecord[] {
    return this.db
      .prepare(`SELECT * FROM git_commits WHERE ts >= ? ORDER BY ts ASC`)
      .all(sinceTs)
      .map((row: any) => ({ ...row, isAiAttributed: !!row.is_ai_attributed }))
      .map(rowToCommit);
  }
}

function rowToCommit(row: any): GitCommitRecord {
  return {
    hash: row.hash,
    repo: row.repo,
    author: row.author,
    authorEmail: row.author_email,
    ts: row.ts,
    message: row.message,
    insertions: row.insertions,
    deletions: row.deletions,
    filesChanged: row.files_changed,
    isAiAttributed: !!row.isAiAttributed,
  };
}

export class IngestStateRepository {
  constructor(private db: Db) {}

  get(filePath: string): IngestFileState | undefined {
    const row = this.db.prepare(`SELECT * FROM ingest_files WHERE path = ?`).get(filePath) as
      | any
      | undefined;
    if (!row) return undefined;
    return { path: row.path, mtimeMs: row.mtime_ms, size: row.size, sessionId: row.session_id };
  }

  set(state: IngestFileState): void {
    this.db
      .prepare(
        `INSERT INTO ingest_files (path, mtime_ms, size, session_id) VALUES (@path, @mtimeMs, @size, @sessionId)
         ON CONFLICT(path) DO UPDATE SET mtime_ms=excluded.mtime_ms, size=excluded.size, session_id=excluded.session_id`
      )
      .run(state);
  }
}

export class KvCacheRepository {
  constructor(private db: Db) {}

  get<T>(key: string): T | undefined {
    const row = this.db.prepare(`SELECT value FROM kv_cache WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO kv_cache (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      )
      .run(key, JSON.stringify(value), Date.now());
  }
}
