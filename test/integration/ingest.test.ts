import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/database.js";
import { ingestTranscripts } from "../../src/services/ingest.js";
import { SessionRepository, ToolCallRepository } from "../../src/db/repositories.js";

let dir: string;
let projectsDir: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-atlas-ingest-test-"));
  projectsDir = path.join(dir, "projects", "-tmp-demo");
  fs.mkdirSync(projectsDir, { recursive: true });
  db = new Database(path.join(dir, "test.sqlite3"));
  migrate(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeTranscript(fileName: string, sessionId: string): string {
  const toolId = "tool-1";
  const lines = [
    JSON.stringify({
      type: "user",
      sessionId,
      cwd: "/tmp/demo",
      timestamp: "2026-01-01T10:00:00.000Z",
      message: { role: "user", content: "go" },
    }),
    JSON.stringify({
      type: "assistant",
      sessionId,
      timestamp: "2026-01-01T10:00:01.000Z",
      message: {
        role: "assistant",
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{ type: "tool_use", id: toolId, name: "Read", input: { file_path: "/tmp/demo/a.py" } }],
      },
    }),
    JSON.stringify({
      type: "user",
      sessionId,
      timestamp: "2026-01-01T10:00:02.000Z",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolId, content: "ok" }] },
    }),
  ];
  const filePath = path.join(projectsDir, fileName);
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return filePath;
}

describe("ingestTranscripts", () => {
  it("ingests a new transcript into sessions and tool_calls", () => {
    writeTranscript("session-a.jsonl", "session-a");
    const result = ingestTranscripts(db, { projectsDir: path.join(dir, "projects") });

    expect(result.filesIngested).toBe(1);
    expect(result.sessionsUpserted).toBe(1);
    expect(result.toolCallsInserted).toBe(1);
    expect(new SessionRepository(db).count()).toBe(1);
    expect(new ToolCallRepository(db).all()).toHaveLength(1);
  });

  it("skips unchanged files on a second run", () => {
    writeTranscript("session-a.jsonl", "session-a");
    ingestTranscripts(db, { projectsDir: path.join(dir, "projects") });
    const second = ingestTranscripts(db, { projectsDir: path.join(dir, "projects") });

    expect(second.filesIngested).toBe(0);
    expect(second.filesSkipped).toBe(1);
  });

  it("re-ingests a file after it's modified", () => {
    const filePath = writeTranscript("session-a.jsonl", "session-a");
    ingestTranscripts(db, { projectsDir: path.join(dir, "projects") });

    // Bump mtime so the ingest sees it as changed even if content-appended fast.
    fs.appendFileSync(filePath, "\n");
    fs.utimesSync(filePath, new Date(), new Date(Date.now() + 5000));

    const second = ingestTranscripts(db, { projectsDir: path.join(dir, "projects") });
    expect(second.filesIngested).toBe(1);
  });

  it("returns an empty result for a nonexistent projects directory", () => {
    const result = ingestTranscripts(db, { projectsDir: path.join(dir, "does-not-exist") });
    expect(result.filesScanned).toBe(0);
  });
});
