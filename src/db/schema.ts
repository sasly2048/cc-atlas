/** Schema versions are applied in order by Database#migrate(). Add new
 * numbered entries rather than editing old ones — SQLite files already on
 * disk have run the earlier migrations and must not see them change. */
export const MIGRATIONS: string[] = [
  // v1: base schema (original)
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    cwd TEXT,
    source_file TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    turn_count INTEGER NOT NULL DEFAULT 0,
    user_turn_count INTEGER NOT NULL DEFAULT 0,
    assistant_turn_count INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    model TEXT,
    subagent_count INTEGER NOT NULL DEFAULT 0,
    thinking_block_count INTEGER NOT NULL DEFAULT 0,
    compaction_count INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    max_context_tokens INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);

  CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    ts INTEGER NOT NULL,
    status TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    input_preview TEXT,
    category TEXT NOT NULL,
    file_path TEXT,
    command TEXT,
    size_delta INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_ts ON tool_calls(ts);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);

  CREATE TABLE IF NOT EXISTS git_commits (
    hash TEXT NOT NULL,
    repo TEXT NOT NULL,
    author TEXT NOT NULL,
    author_email TEXT,
    ts INTEGER NOT NULL,
    message TEXT NOT NULL,
    insertions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    is_ai_attributed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (repo, hash)
  );

  CREATE INDEX IF NOT EXISTS idx_git_commits_ts ON git_commits(ts);

  CREATE TABLE IF NOT EXISTS ingest_files (
    path TEXT PRIMARY KEY,
    mtime_ms REAL NOT NULL,
    size INTEGER NOT NULL,
    session_id TEXT
  );

  CREATE TABLE IF NOT EXISTS kv_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  // v2: tag sessions with who they came from, so a single database can hold
  // more than one person's ~/.claude history (see analytics/team.ts).
  `
  ALTER TABLE sessions ADD COLUMN source_label TEXT NOT NULL DEFAULT 'you';
  CREATE INDEX IF NOT EXISTS idx_sessions_source_label ON sessions(source_label);
  `,
  // v3: attribution confidence + repo canonicalization (hard-critic audit).
  // Hard-critic BUG #5, #29, #30: split is_ai_attributed into source + confidence,
  // and key git_commits on a canonical repo path so /project and /project/ are
  // merged. The schema change is destructive (PRIMARY KEY changes), so we
  // migrate data on existing DBs before adding the new constraint.
  `
  ALTER TABLE git_commits ADD COLUMN repo_canonical TEXT NOT NULL DEFAULT '';
  ALTER TABLE git_commits ADD COLUMN attribution_source TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE git_commits ADD COLUMN attribution_confidence REAL NOT NULL DEFAULT 0;
  UPDATE git_commits SET repo_canonical = repo WHERE repo_canonical = '';
  -- Replace the old (repo, hash) PK with (repo_canonical, hash). SQLite
  -- doesn't support ALTER on PRIMARY KEY, so rebuild via rename + copy.
  -- The v1 PK is preserved in the old table name, but only as a fallback.
  CREATE TABLE IF NOT EXISTS git_commits_v3 (
    hash TEXT NOT NULL,
    repo TEXT NOT NULL,
    repo_canonical TEXT NOT NULL,
    author TEXT NOT NULL,
    author_email TEXT,
    ts INTEGER NOT NULL,
    message TEXT NOT NULL,
    insertions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    is_ai_attributed INTEGER NOT NULL DEFAULT 0,
    attribution_source TEXT NOT NULL DEFAULT 'none',
    attribution_confidence REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (repo_canonical, hash)
  );
  INSERT OR IGNORE INTO git_commits_v3
    SELECT hash, repo, repo_canonical, author, author_email, ts, message,
           insertions, deletions, files_changed, is_ai_attributed,
           attribution_source, attribution_confidence
    FROM git_commits;
  DROP TABLE git_commits;
  ALTER TABLE git_commits_v3 RENAME TO git_commits;
  CREATE INDEX IF NOT EXISTS idx_git_commits_ts ON git_commits(ts);
  CREATE INDEX IF NOT EXISTS idx_git_commits_canonical
    ON git_commits(repo_canonical, ts);
  CREATE INDEX IF NOT EXISTS idx_git_commits_attribution
    ON git_commits(attribution_source);
  `,
  // v4: content-hash ingestion + tool-call identity (hard-critic audit
  // BUG #3, #18, #19). Two parts:
  //   1) ingest_files: source_label added to the PK so the same path
  //      ingested for two team members doesn't collide. The old single-
  //      column PK is replaced with (source_label, path).
  //   2) tool_calls: tool_use_id added and made the idempotency key.
  `
  ALTER TABLE tool_calls ADD COLUMN tool_use_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_calls_session_use
    ON tool_calls(session_id, tool_use_id) WHERE tool_use_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS ingest_files_v4 (
    source_label TEXT NOT NULL DEFAULT 'you',
    path TEXT NOT NULL,
    mtime_ms REAL NOT NULL,
    size INTEGER NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    session_id TEXT,
    PRIMARY KEY (source_label, path)
  );
  INSERT OR IGNORE INTO ingest_files_v4 (source_label, path, mtime_ms, size, content_hash, session_id)
    SELECT 'you', path, mtime_ms, size, '', session_id FROM ingest_files;
  DROP TABLE ingest_files;
  ALTER TABLE ingest_files_v4 RENAME TO ingest_files;
  `,
];
