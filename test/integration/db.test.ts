import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/database.js";
import { SessionRepository, ToolCallRepository, GitCommitRepository, KvCacheRepository } from "../../src/db/repositories.js";
import type { SessionRecord, ToolCallRecord, GitCommitRecord } from "../../src/types/domain.js";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-atlas-db-test-"));
  db = new Database(path.join(dir, "test.sqlite3"));
  migrate(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s1",
    project: "demo",
    cwd: null,
    sourceFile: "f.jsonl",
    startedAt: 1000,
    endedAt: 2000,
    durationMs: 1000,
    turnCount: 1,
    userTurnCount: 1,
    assistantTurnCount: 1,
    messageCount: 2,
    toolCallCount: 0,
    errorCount: 0,
    model: "claude-sonnet-5",
    subagentCount: 0,
    thinkingBlockCount: 0,
    compactionCount: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    maxContextTokens: 0,
    sourceLabel: "you",
    ...overrides,
  };
}

describe("SessionRepository", () => {
  it("upserts a session and reads it back", () => {
    const repo = new SessionRepository(db);
    repo.upsert(session({}));
    const all = repo.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("s1");
    expect(repo.count()).toBe(1);
  });

  it("updates in place on conflict rather than duplicating", () => {
    const repo = new SessionRepository(db);
    repo.upsert(session({ turnCount: 1 }));
    repo.upsert(session({ turnCount: 5 }));
    expect(repo.count()).toBe(1);
    expect(repo.all()[0]!.turnCount).toBe(5);
  });

  it("filters by sinceTs", () => {
    const repo = new SessionRepository(db);
    repo.upsert(session({ id: "old", startedAt: 100 }));
    repo.upsert(session({ id: "new", startedAt: 5000 }));
    expect(repo.all(1000).map((s) => s.id)).toEqual(["new"]);
  });
});

describe("ToolCallRepository", () => {
  it("inserts many rows in a transaction and reads them back ordered by ts", () => {
    new SessionRepository(db).upsert(session({}));
    const repo = new ToolCallRepository(db);
    const calls: ToolCallRecord[] = [
      { sessionId: "s1", toolName: "Bash", ts: 200, status: "success", turnIndex: 1, inputPreview: null, category: "execute", filePath: null, command: "ls", sizeDelta: null },
      { sessionId: "s1", toolName: "Read", ts: 100, status: "success", turnIndex: 0, inputPreview: null, category: "read", filePath: "/a", command: null, sizeDelta: null },
    ];
    repo.insertMany(calls);
    const all = repo.all();
    expect(all.map((c) => c.toolName)).toEqual(["Read", "Bash"]);
  });
});

describe("GitCommitRepository", () => {
  it("ignores duplicate (repo, hash) inserts", () => {
    const repo = new GitCommitRepository(db);
    const commit: GitCommitRecord = {
      hash: "abc",
      repo: "/tmp/r",
      author: "A",
      authorEmail: null,
      ts: 100,
      message: "fix",
      insertions: 1,
      deletions: 0,
      filesChanged: 1,
      isAiAttributed: false,
    };
    repo.insertMany([commit]);
    repo.insertMany([commit]);
    expect(repo.all()).toHaveLength(1);
  });
});

describe("KvCacheRepository", () => {
  it("round-trips arbitrary JSON values", () => {
    const repo = new KvCacheRepository(db);
    repo.set("key", { a: 1, b: [1, 2, 3] });
    expect(repo.get("key")).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("returns undefined for a missing key", () => {
    const repo = new KvCacheRepository(db);
    expect(repo.get("missing")).toBeUndefined();
  });
});
