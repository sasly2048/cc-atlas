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

  /** Remove a session and (via the FK cascade) all its tool calls.
   * Used by the reconciliation pass when a transcript file is deleted. */
  remove(sessionId: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }

  /** Find sessions whose source file is gone from the filesystem.
   * Used by reconciliation. */
  findOrphans(knownPaths: Set<string>, sourceLabel = "you"): SessionRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE source_label = ?`)
      .all(sourceLabel) as any[];
    return rows
      .filter((r) => !knownPaths.has(r.source_file))
      .map(rowToSession);
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
}export class ToolCallRepository {
  constructor(private db: Db) {}

  /** Idempotent insert. The (session_id, tool_use_id) UNIQUE index makes
   * re-ingest of the same file a no-op: rows that already exist are kept
   * (preserving the auto-increment id so other tables referencing them
   * stay stable), missing rows are inserted. Orphan tool_results — those
   * with no matching tool_use — get a synthetic stable id so the same
   * re-ingest doesn't duplicate them either. */
  upsertMany(calls: ToolCallRecord[]): { inserted: number; kept: number } {
    if (calls.length === 0) return { inserted: 0, kept: 0 };
    const sessionId = calls[0]!.sessionId;

    const selectExisting = this.db.prepare(
      `SELECT id, tool_use_id FROM tool_calls WHERE session_id = ?`
    );
    const existing = new Map<string, number>();
    for (const row of selectExisting.all(sessionId) as Array<{ tool_use_id: string | null; id: number }>) {
      if (row.tool_use_id) existing.set(row.tool_use_id, row.id);
    }

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO tool_calls (session_id, tool_name, ts, status, turn_index, input_preview, category, file_path, command, size_delta, tool_use_id)
       VALUES (@sessionId, @toolName, @ts, @status, @turnIndex, @inputPreview, @category, @filePath, @command, @sizeDelta, @toolUseId)`
    );
    let inserted = 0;
    let kept = 0;
    const tx = this.db.transaction((rows: ToolCallRecord[]) => {
      for (const row of rows) {
        const id = row.toolUseId ? existing.get(row.toolUseId) : undefined;
        if (id !== undefined) {
          kept += 1;
          continue;
        }
        const result = insert.run({
          sessionId: row.sessionId,
          toolName: row.toolName,
          ts: row.ts,
          status: row.status,
          turnIndex: row.turnIndex,
          inputPreview: row.inputPreview,
          category: row.category,
          filePath: row.filePath,
          command: row.command,
          sizeDelta: row.sizeDelta,
          toolUseId: row.toolUseId,
        });
        if (result.changes > 0) inserted += 1;
      }
    });
    tx(calls);
    return { inserted, kept };
  }

  /** Wipe and replace — used for full re-ingest where we want to drop
   * tool calls that no longer exist in the transcript. Returns inserted
   * count. Prefer upsertMany for incremental re-ingest. */
  replaceForSession(sessionId: string, calls: ToolCallRecord[]): number {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM tool_calls WHERE session_id = ?`).run(sessionId);
      const insert = this.db.prepare(
        `INSERT INTO tool_calls (session_id, tool_name, ts, status, turn_index, input_preview, category, file_path, command, size_delta, tool_use_id)
         VALUES (@sessionId, @toolName, @ts, @status, @turnIndex, @inputPreview, @category, @filePath, @command, @sizeDelta, @toolUseId)`
      );
      for (const row of calls) {
        insert.run({
          sessionId: row.sessionId,
          toolName: row.toolName,
          ts: row.ts,
          status: row.status,
          turnIndex: row.turnIndex,
          inputPreview: row.inputPreview,
          category: row.category,
          filePath: row.filePath,
          command: row.command,
          sizeDelta: row.sizeDelta,
          toolUseId: row.toolUseId,
        });
      }
    });
    tx();
    return calls.length;
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
    toolUseId: row.tool_use_id ?? null,
    // Orphan detection: a tool_call with no tool_use_id is one that came
    // from a tool_result block with no preceding tool_use in this transcript.
    orphaned: row.tool_use_id == null,
  };
}

export class GitCommitRepository {
  constructor(private db: Db) {}

  insertMany(commits: GitCommitRecord[]): void {
    if (commits.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO git_commits (
        hash, repo, repo_canonical, author, author_email, ts, message,
        insertions, deletions, files_changed,
        is_ai_attributed, attribution_source, attribution_confidence
      ) VALUES (@hash, @repo, @repoCanonical, @author, @authorEmail, @ts, @message,
        @insertions, @deletions, @filesChanged,
        @isAiAttributed, @attributionSource, @attributionConfidence)
      ON CONFLICT(repo_canonical, hash) DO UPDATE SET
        author=excluded.author,
        author_email=excluded.author_email,
        ts=excluded.ts,
        message=excluded.message,
        insertions=excluded.insertions,
        deletions=excluded.deletions,
        files_changed=excluded.files_changed,
        -- Only ever promote attribution via insert/update; never demote.
        -- Use recomputeAttribution({ force: true }) for a clean reset.
        is_ai_attributed=MAX(git_commits.is_ai_attributed, excluded.is_ai_attributed),
        attribution_source=CASE
          WHEN excluded.attribution_confidence > git_commits.attribution_confidence
            THEN excluded.attribution_source
          ELSE git_commits.attribution_source
        END,
        attribution_confidence=MAX(git_commits.attribution_confidence, excluded.attribution_confidence)`
    );
    const insertAll = this.db.transaction((rows: GitCommitRecord[]) => {
      for (const row of rows) {
        stmt.run({
          ...row,
          isAiAttributed: row.isAiAttributed ? 1 : 0,
        });
      }
    });
    insertAll(commits);
  }

  /** Re-derive attribution for every commit based on its message + the
   * session windows. Defaults to a "soft" recompute that preserves
   * explicit attributions and adds correlated ones. With `force: true`
   * wipes everything first so a corrected heuristic can be applied
   * cleanly. */
  recomputeAttribution(
    sessions: SessionRecord[],
    options: { bufferMs?: number; force?: boolean } = {}
  ): { changed: number; promoted: number; demoted: number } {
    const { bufferMs = 15 * 60 * 1000, force = false } = options;
    let changed = 0;
    let promoted = 0;
    let demoted = 0;

    if (force) {
      const reset = this.db
        .prepare(
          `UPDATE git_commits SET is_ai_attributed=0, attribution_source='none', attribution_confidence=0`
        )
        .run();
      demoted = reset.changes;
      changed += demoted;
    }

    if (sessions.length === 0) return { changed, promoted, demoted };

    // Sort windows for two-pointer sweep: O(commits + sessions) instead of
    // the old O(commits * sessions) per-row `.some()` scan.
    const windows = sessions
      .map((s) => [s.startedAt, s.endedAt + bufferMs] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    const correlatedWithin = (ts: number): boolean => {
      for (const [start, end] of windows) {
        if (ts < start) return false;
        if (ts <= end) return true;
      }
      return false;
    };

    const rows = this.db
      .prepare(
        `SELECT repo_canonical, hash, ts, is_ai_attributed, attribution_source, attribution_confidence FROM git_commits`
      )
      .all() as Array<{
        repo_canonical: string;
        hash: string;
        ts: number;
        is_ai_attributed: number;
        attribution_source: string;
        attribution_confidence: number;
      }>;
    if (rows.length === 0) return { changed, promoted, demoted };

    const update = this.db.prepare(
      `UPDATE git_commits
       SET is_ai_attributed = ?, attribution_source = ?, attribution_confidence = ?
       WHERE repo_canonical = ? AND hash = ?`
    );
    const tx = this.db.transaction((toUpdate: typeof rows) => {
      for (const r of toUpdate) {
        const wasAttributed = r.is_ai_attributed === 1;
        const wasExplicit = r.attribution_source === "explicit";
        // Explicit attribution (Co-Authored-By / Generated-With) is
        // preserved across recompute; time-correlation is computed
        // fresh each call.
        const isCorrelated = !wasExplicit && correlatedWithin(r.ts);
        const nextAttributed = wasExplicit || isCorrelated;
        const nextSource = wasExplicit ? "explicit" : isCorrelated ? "correlated" : "none";
        const nextConfidence = wasExplicit ? 1 : isCorrelated ? 0.6 : 0;
        if (
          nextAttributed !== wasAttributed ||
          nextSource !== r.attribution_source ||
          nextConfidence !== r.attribution_confidence
        ) {
          update.run(
            nextAttributed ? 1 : 0,
            nextSource,
            nextConfidence,
            r.repo_canonical,
            r.hash
          );
          if (nextAttributed && !wasAttributed) promoted += 1;
          else if (!nextAttributed && wasAttributed) demoted += 1;
          changed += 1;
        }
      }
    });
    tx(rows);
    return { changed, promoted, demoted };
  }

  all(sinceTs = 0): GitCommitRecord[] {
    return this.db
      .prepare(
        `SELECT hash, repo, repo_canonical, author, author_email, ts, message,
                insertions, deletions, files_changed,
                is_ai_attributed, attribution_source, attribution_confidence
         FROM git_commits WHERE ts >= ? ORDER BY ts ASC`
      )
      .all(sinceTs)
      .map(rowToCommit);
  }
}

function rowToCommit(row: any): GitCommitRecord {
  return {
    hash: row.hash,
    repo: row.repo,
    repoCanonical: row.repo_canonical || row.repo,
    author: row.author,
    authorEmail: row.author_email,
    ts: row.ts,
    message: row.message,
    insertions: row.insertions,
    deletions: row.deletions,
    filesChanged: row.files_changed,
    isAiAttributed: !!row.is_ai_attributed,
    attributionSource: (row.attribution_source ?? "none") as GitCommitRecord["attributionSource"],
    attributionConfidence:
      typeof row.attribution_confidence === "number" ? row.attribution_confidence : 0,
  };
}

export class IngestStateRepository {
  constructor(private db: Db) {}

  /** Look up by (source_label, path). sourceLabel defaults to "you" for
   * backwards compatibility with the single-user case. */
  get(filePath: string, sourceLabel = "you"): IngestFileState | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ingest_files WHERE path = ? AND source_label = ?`)
      .get(filePath, sourceLabel) as any | undefined;
    if (!row) return undefined;
    return {
      path: row.path,
      sourceLabel: row.source_label ?? "you",
      mtimeMs: row.mtime_ms,
      size: row.size,
      contentHash: row.content_hash ?? "",
      sessionId: row.session_id,
    };
  }

  set(state: IngestFileState): void {
    this.db
      .prepare(
        `INSERT INTO ingest_files (path, source_label, mtime_ms, size, content_hash, session_id)
         VALUES (@path, @sourceLabel, @mtimeMs, @size, @contentHash, @sessionId)
         ON CONFLICT(path, source_label) DO UPDATE SET
           mtime_ms=excluded.mtime_ms,
           size=excluded.size,
           content_hash=excluded.content_hash,
           session_id=excluded.session_id`
      )
      .run(state);
  }

  /** List every tracked path for a given source. Used by the
   * reconciliation pass to detect files that disappeared from disk. */
  listForSource(sourceLabel: string): IngestFileState[] {
    const rows = this.db
      .prepare(`SELECT * FROM ingest_files WHERE source_label = ?`)
      .all(sourceLabel) as any[];
    return rows.map((row) => ({
      path: row.path,
      sourceLabel: row.source_label ?? "you",
      mtimeMs: row.mtime_ms,
      size: row.size,
      contentHash: row.content_hash ?? "",
      sessionId: row.session_id,
    }));
  }

  /** Forget a tracked file. Used by the reconciliation pass when the
   * source file is gone. */
  forget(filePath: string, sourceLabel: string): void {
    this.db
      .prepare(`DELETE FROM ingest_files WHERE path = ? AND source_label = ?`)
      .run(filePath, sourceLabel);
  }
}

export class KvCacheRepository {
  constructor(private db: Db) {}

  get<T>(key: string): T | undefined {
    const row = this.db.prepare(`SELECT value FROM kv_cache WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      // Corrupted entry: a previous write was killed mid-serialization
      // (or the file was hand-edited). Drop the bad row so the next caller
      // doesn't keep crashing on it, and return undefined.
      try {
        this.db.prepare(`DELETE FROM kv_cache WHERE key = ?`).run(key);
      } catch {
        /* if the delete also fails, swallow it — get() must not throw */
      }
      return undefined;
    }
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
