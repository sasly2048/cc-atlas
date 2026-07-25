/** Schema versions are applied in order by Database#migrate(). Add new
 * numbered entries rather than editing old ones — SQLite files already on
 * disk have run the earlier migrations and must not see them change. */
export const MIGRATIONS: string[] = [
  // v1: base schema
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
];
