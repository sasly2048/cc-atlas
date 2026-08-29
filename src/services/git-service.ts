import path from "node:path";
import { simpleGit } from "simple-git";
import type { GitCommitRecord, AttributionSource, SessionRecord } from "../types/domain.js";
import { logger } from "../core/logger.js";
import { dayKey } from "../utils/dates.js";

const CLAUDE_TRAILER = /co-authored-by:\s*claude/i;
const CLAUDE_GENERATED = /generated (with|by) \[?claude code/i;

/** A commit is "explicitly AI-attributed" if its message carries Claude
 * Code's conventional trailers (Co-Authored-By / Generated with). The
 * 1.0 confidence reflects that this is a direct user/tool signal. */
export function isAiAttributedMessage(message: string): boolean {
  return CLAUDE_TRAILER.test(message) || CLAUDE_GENERATED.test(message);
}

export interface RepoCommitsOptions {
  repoPath: string;
  since?: Date;
}

/** Normalize a configured repo path to its canonical absolute form. We
 * resolve to defeat ".." segments and inconsistent trailing slashes; we
 * do NOT follow symlinks (intentional: two symlinks pointing to the same
 * repo are the same logical database entry, but a symlink to a different
 * repo is a different one). */
export function canonicalRepoPath(repoPath: string): string {
  return path.resolve(repoPath);
}

export async function collectRepoCommits(options: RepoCommitsOptions): Promise<GitCommitRecord[]> {
  const canonical = canonicalRepoPath(options.repoPath);
  const git = simpleGit(canonical);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    logger.warn(`${options.repoPath} is not a git repository, skipping.`);
    return [];
  }

  const args = ["log", "--all", "--no-merges", "--pretty=format:%H%x1f%an%x1f%ae%x1f%at%x1f%s", "--numstat"];
  if (options.since) args.push(`--since=${options.since.toISOString()}`);

  const raw = await git.raw(args);
  return parseGitLog(raw, options.repoPath, canonical);
}

/** Parses `git log --numstat` output with a unit-separator (\x1f) header
 * line per commit, followed by zero or more numstat rows until the next
 * header or EOF. Exported for unit testing without shelling out to git.
 * Two commits are considered "the same" iff they hash to the same value
 * AND belong to the same canonical repo path — so a /project symlink and
 * /project itself can't both insert the same commit twice. */
export function parseGitLog(
  raw: string,
  repoPath: string,
  repoCanonical: string
): GitCommitRecord[] {
  const lines = raw.split("\n");
  const commits: GitCommitRecord[] = [];
  let current: GitCommitRecord | null = null;

  for (const line of lines) {
    if (line.includes("\x1f")) {
      if (current) commits.push(current);
      const [hash, author, email, tsRaw, ...messageParts] = line.split("\x1f");
      const message = messageParts.join("\x1f");
      const explicit = isAiAttributedMessage(message);
      current = {
        hash: hash ?? "",
        repo: repoPath,
        repoCanonical,
        author: author ?? "unknown",
        authorEmail: email || null,
        ts: (Number(tsRaw) || 0) * 1000,
        message,
        insertions: 0,
        deletions: 0,
        filesChanged: 0,
        isAiAttributed: explicit,
        attributionSource: (explicit ? "explicit" : "none") as AttributionSource,
        attributionConfidence: explicit ? 1 : 0,
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

/** Promote a commit's attribution to "correlated" if it lands inside any
 * session window. Idempotent and O(commits + sessions) via a two-pointer
 * sweep across the (sorted) session windows — far better than the old
 * per-commit `.some()` scan. The boolean isAiAttributed and the
 * attributionSource/confidence are kept in sync; explicit attribution
 * (already 1.0 confidence) is not overridden. */
export function correlateCommitsWithSessions(
  commits: GitCommitRecord[],
  sessions: SessionRecord[],
  bufferMs = 15 * 60 * 1000
): GitCommitRecord[] {
  if (sessions.length === 0) return commits;
  const windows = sessions
    .map((s) => [s.startedAt, s.endedAt + bufferMs] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  return commits.map((c) => {
    if (c.attributionSource === "explicit") return c; // never demote
    const correlated = isWithinAnyWindow(c.ts, windows);
    if (!correlated) return c;
    return {
      ...c,
      isAiAttributed: true,
      attributionSource: "correlated",
      // 0.6 — lower than explicit (1.0) so a future pass that finds
      // a stronger signal can still upgrade cleanly.
      attributionConfidence: 0.6,
    };
  });
}

function isWithinAnyWindow(ts: number, windows: [number, number][]): boolean {
  for (const [start, end] of windows) {
    if (ts < start) return false;
    if (ts <= end) return true;
  }
  return false;
}

/** A "ghost day" is a calendar day with AI-attributed commits but no
 * recorded interactive session — i.e. Claude Code ran autonomously
 * (e.g. via a hook or scheduled task) while the human was away.
 *
 * Attribution is split by source: explicit-attribution ghost days are
 * the most trustworthy signal (Claude wrote a trailer / the "Generated
 * with Claude Code" boilerplate). Correlated ghost days (commit landed
 * inside a session window) need a session to be present, so they can't
 * themselves be ghost days; we count only explicit here. */
export function findGhostDays(
  commits: GitCommitRecord[],
  sessions: SessionRecord[]
): string[] {
  const sessionDays = new Set(sessions.map((s) => dayKey(s.startedAt)));
  const ghostDays = new Set<string>();
  for (const commit of commits) {
    if (commit.attributionSource !== "explicit") continue;
    const day = dayKey(commit.ts);
    if (!sessionDays.has(day)) ghostDays.add(day);
  }
  return [...ghostDays].sort();
}
