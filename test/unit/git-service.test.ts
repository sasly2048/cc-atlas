import { describe, expect, it } from "vitest";
import {
  parseGitLog,
  isAiAttributedMessage,
  correlateCommitsWithSessions,
  findGhostDays,
} from "../../src/services/git-service.js";
import type { GitCommitRecord, SessionRecord } from "../../src/types/domain.js";

const US = "\x1f";

function fakeSession(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s1",
    project: "demo",
    cwd: "/tmp/demo",
    sourceFile: "f.jsonl",
    startedAt: 0,
    endedAt: 1000,
    durationMs: 1000,
    turnCount: 1,
    userTurnCount: 1,
    assistantTurnCount: 1,
    messageCount: 1,
    toolCallCount: 0,
    errorCount: 0,
    model: null,
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

function fakeCommit(overrides: Partial<GitCommitRecord>): GitCommitRecord {
  return {
    hash: "abc123",
    repo: "/tmp/repo",
    author: "Alice",
    authorEmail: "alice@example.com",
    ts: 0,
    message: "fix bug",
    insertions: 0,
    deletions: 0,
    filesChanged: 0,
    isAiAttributed: false,
    ...overrides,
  };
}

describe("isAiAttributedMessage", () => {
  it("detects Claude Code's conventional trailer", () => {
    expect(isAiAttributedMessage("fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>")).toBe(true);
  });

  it("detects the generated-with-claude-code phrasing", () => {
    expect(isAiAttributedMessage("Generated with [Claude Code](https://claude.ai/code)")).toBe(true);
  });

  it("returns false for an unrelated commit message", () => {
    expect(isAiAttributedMessage("bump dependency versions")).toBe(false);
  });
});

describe("parseGitLog", () => {
  it("parses a header+numstat block into a commit record", () => {
    const raw = [`abc123${US}Alice${US}alice@example.com${US}1700000000${US}fix bug`, "5\t2\tsrc/index.ts", "1\t0\tREADME.md", ""].join(
      "\n"
    );

    const commits = parseGitLog(raw, "/tmp/repo");
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      hash: "abc123",
      author: "Alice",
      insertions: 6,
      deletions: 2,
      filesChanged: 2,
    });
    expect(commits[0]!.ts).toBe(1700000000 * 1000);
  });

  it("handles binary files (numstat shows - -) without crashing", () => {
    const raw = [`abc${US}Bob${US}bob@x.com${US}1700000000${US}add image`, "-\t-\tassets/photo.png"].join("\n");
    const commits = parseGitLog(raw, "/tmp/repo");
    expect(commits[0]!.insertions).toBe(0);
    expect(commits[0]!.filesChanged).toBe(1);
  });

  it("parses multiple commits in one log", () => {
    const raw = [
      `c1${US}A${US}a@x.com${US}1000${US}first`,
      "1\t1\tfile.ts",
      `c2${US}B${US}b@x.com${US}2000${US}second`,
      "2\t2\tfile.ts",
    ].join("\n");
    const commits = parseGitLog(raw, "/tmp/repo");
    expect(commits.map((c) => c.hash)).toEqual(["c1", "c2"]);
  });
});

describe("correlateCommitsWithSessions", () => {
  it("marks a commit AI-attributed if it falls within a session window", () => {
    const sessions = [fakeSession({ startedAt: 1000, endedAt: 2000 })];
    const commits = [fakeCommit({ ts: 1500, isAiAttributed: false })];
    const result = correlateCommitsWithSessions(commits, sessions);
    expect(result[0]!.isAiAttributed).toBe(true);
  });

  it("leaves a commit outside any session window and without trailer as not attributed", () => {
    const sessions = [fakeSession({ startedAt: 1000, endedAt: 2000 })];
    const commits = [fakeCommit({ ts: 999_999, isAiAttributed: false })];
    const result = correlateCommitsWithSessions(commits, sessions);
    expect(result[0]!.isAiAttributed).toBe(false);
  });

  it("preserves message-based attribution even outside any session window", () => {
    const sessions: SessionRecord[] = [];
    const commits = [fakeCommit({ ts: 5000, isAiAttributed: true })];
    const result = correlateCommitsWithSessions(commits, sessions);
    expect(result[0]!.isAiAttributed).toBe(true);
  });
});

describe("findGhostDays", () => {
  it("flags a day with an AI-attributed commit but no session that day", () => {
    const day = new Date("2026-02-01T12:00:00.000Z").getTime();
    const commits = [fakeCommit({ ts: day, isAiAttributed: true })];
    const sessions: SessionRecord[] = [];
    expect(findGhostDays(commits, sessions)).toEqual(["2026-02-01"]);
  });

  it("does not flag a day that also has a recorded session", () => {
    const day = new Date("2026-02-01T12:00:00.000Z").getTime();
    const commits = [fakeCommit({ ts: day, isAiAttributed: true })];
    const sessions = [fakeSession({ startedAt: day - 1000, endedAt: day + 1000 })];
    expect(findGhostDays(commits, sessions)).toEqual([]);
  });

  it("ignores commits that aren't AI-attributed", () => {
    const day = new Date("2026-02-01T12:00:00.000Z").getTime();
    const commits = [fakeCommit({ ts: day, isAiAttributed: false })];
    expect(findGhostDays(commits, [])).toEqual([]);
  });
});
