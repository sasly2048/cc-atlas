import { simpleGit } from "simple-git";
import type { GitCommitRecord, SessionRecord } from "../types/domain.js";
import { logger } from "../core/logger.js";
import { dayKey } from "../utils/dates.js";

const CLAUDE_TRAILER = /co-authored-by:\s*claude/i;
const CLAUDE_GENERATED = /generated (with|by) \[?claude code/i;

/** A commit is "AI-attributed" if its message carries Claude Code's
 * conventional trailers, or if it lands inside (or shortly after) a
 * recorded session window â€” i.e. Claude was actively working around then. */
export function isAiAttributedMessage(message: string): boolean {
  return CLAUDE_TRAILER.test(message) || CLAUDE_GENERATED.test(message);
}

export interface RepoCommitsOptions {
  repoPath: string;
  since?: Date;
}

export async function collectRepoCommits(options: RepoCommitsOptions): Promise<GitCommitRecord[]> {
  const git = simpleGit(options.repoPath);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    logger.warn(`${options.repoPath} is not a git repository, skipping.`);
    return [];
  }

  const args = ["log", "--all", "--no-merges", "--pretty=format:%H%x1f%an%x1f%ae%x1f%at%x1f%s", "--numstat"];
  if (options.since) args.push(`--since=${options.since.toISOString()}`);

  const raw = await git.raw(args);
  return parseGitLog(raw, options.repoPath);
}

/** Parses `git log --numstat` output with a unit-separator (\x1f) header
 * line per commit, followed by zero or more numstat rows until the next
 * header or EOF. Exported for unit testing without shelling out to git. */
export function parseGitLog(raw: string, repoPath: string): GitCommitRecord[] {
  const lines = raw.split("\n");
  const commits: GitCommitRecord[] = [];
  let current: GitCommitRecord | null = null;

  for (const line of lines) {
    if (line.includes("\x1f")) {
      if (current) commits.push(current);
      const [hash, author, email, tsRaw, ...messageParts] = line.split("\x1f");
      current = {
        hash: hash ?? "",
        repo: repoPath,
        author: author ?? "unknown",
        authorEmail: email || null,
        ts: (Number(tsRaw) || 0) * 1000,
        message: messageParts.join("\x1f"),
        insertions: 0,
        deletions: 0,
        filesChanged: 0,
        isAiAttributed: isAiAttributedMessage(messageParts.join("\x1f")),
      };
      continue;
    }

    const numstatMatch = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (numstatMatch && current) {
      const [, insertions, deletions] = numstatMatch;
      current.insertions += insertions === "-" ? 0 : Number(insertions);
      current.deletions += deletions === "-" ? 0 : Number(deletions);
      current.filesChanged += 1;
    }
  }
  if (current) commits.push(current);
  return commits;
}

/** Refines the message-based AI-attribution heuristic using session
 * timestamps: any commit within [session.startedAt, session.endedAt + bufferMs]
 * for at least one recorded session is also considered AI-attributed. */
export function correlateCommitsWithSessions(
  commits: GitCommitRecord[],
  sessions: SessionRecord[],
  bufferMs = 15 * 60 * 1000
): GitCommitRecord[] {
  const windows = sessions
    .map((s) => [s.startedAt, s.endedAt + bufferMs] as const)
    .sort((a, b) => a[0] - b[0]);

  const withinSession = (ts: number): boolean => {
    // windows are sorted by start; a linear scan is fine at this data scale
    // (thousands of sessions), and keeps this dependency-free and testable.
    return windows.some(([start, end]) => ts >= start && ts <= end);
  };

  return commits.map((c) => ({ ...c, isAiAttributed: c.isAiAttributed || withinSession(c.ts) }));
}

/** A "ghost day" is a calendar day with AI-attributed commits but no
 * recorded interactive session â€” i.e. Claude Code ran autonomously
 * (e.g. via a hook or scheduled task) while the human was away. */
export function findGhostDays(commits: GitCommitRecord[], sessions: SessionRecord[]): string[] {
  const sessionDays = new Set(sessions.map((s) => dayKey(s.startedAt)));
  const ghostDays = new Set<string>();
  for (const commit of commits) {
    if (!commit.isAiAttributed) continue;
    const day = dayKey(commit.ts);
    if (!sessionDays.has(day)) ghostDays.add(day);
  }
  return [...ghostDays].sort();
}

