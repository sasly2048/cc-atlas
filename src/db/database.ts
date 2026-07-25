import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH } from "../core/paths.js";
import { MIGRATIONS } from "./schema.js";

export type Db = Database.Database;

let instance: Db | null = null;

export function openDatabase(dbPath: string = DB_PATH): Db {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  instance = db;
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
}
