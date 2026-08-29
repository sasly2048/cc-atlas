import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH } from "../core/paths.js";
import { MIGRATIONS } from "./schema.js";

export type Db = Database.Database;

/** Keyed singleton: one Db per *absolute* database path. Re-opening the
 * same path returns the cached connection. Asking for a different path
 * while another is open throws — silent cross-DB access is what the old
 * unkeyed singleton let happen, and the resulting bugs (tests operating on
 * the wrong DB, two consumers stepping on each other) were not recoverable
 * from the call site. */
let instance: Db | null = null;
let instanceKey: string | null = null;

function canonicalKey(dbPath: string): string {
  // resolve() normalizes separators and ".." segments; symlinks are NOT
  // followed here on purpose — if a user has two symlinks to the same
  // file, they're operating them as one logical database.
  return path.resolve(dbPath);
}

export function openDatabase(dbPath: string = DB_PATH): Db {
  const key = canonicalKey(dbPath);
  if (instance && instanceKey === key) return instance;
  if (instance && instanceKey !== key) {
    throw new Error(
      `Cannot open ${dbPath}: a different database (${instanceKey}) is ` +
        `already open. Call closeDatabase() first, or open a new process.`
    );
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  instance = db;
  instanceKey = key;
  return db;
}

export function migrate(db: Db): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const runMigrations = db.transaction(() => {
    MIGRATIONS.forEach((sql, index) => {
      const version = index + 1;
      if (applied.has(version)) return;
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        version,
        Date.now()
      );
    });
  });
  runMigrations();
}

export function closeDatabase(): void {
  instance?.close();
  instance = null;
  instanceKey = null;
}

/** Test-only: clear the singleton without going through closeDatabase so
 * tests can swap the underlying file path between cases without leaks. */
export function _resetDatabaseSingletonForTests(): void {
  instance = null;
  instanceKey = null;
}
