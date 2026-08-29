import type { Db } from "../db/database.js";
import { GitCommitRepository, SessionRepository } from "../db/repositories.js";
import {
  collectRepoCommits,
  correlateCommitsWithSessions,
  canonicalRepoPath,
} from "./git-service.js";
import { logger } from "../core/logger.js";

export interface GitIngestResult {
  reposScanned: number;
  reposSkipped: number;
  commitsInserted: number;
  commitsCorrelated: number;
}

export async function ingestGitActivity(
  db: Db,
  repoPaths: string[]
): Promise<GitIngestResult> {
  const commitRepo = new GitCommitRepository(db);
  const sessionRepo = new SessionRepository(db);
  const sessions = sessionRepo.allSources(); // team + you, so attribution spans everyone

  let commitsInserted = 0;
  let commitsCorrelated = 0;
  let reposScanned = 0;
  let reposSkipped = 0;

  for (const repoPath of repoPaths) {
    try {
      const canonical = canonicalRepoPath(repoPath);
      const commits = await collectRepoCommits({ repoPath });
      reposScanned += 1;
      const correlated = correlateCommitsWithSessions(commits, sessions);
      commitsCorrelated += correlated.filter(
        (c) => c.attributionSource === "correlated"
      ).length;
      // Stamp every row with the canonical path so a /project and a
      // /project/ in config end up under the same primary key.
      const stamped = correlated.map((c) => ({ ...c, repoCanonical: canonical }));
      commitRepo.insertMany(stamped);
      commitsInserted += stamped.length;
    } catch (err) {
      reposSkipped += 1;
      logger.warn(`Failed to read git history for ${repoPath}: ${(err as Error).message}`);
    }
  }

  return { reposScanned, reposSkipped, commitsInserted, commitsCorrelated };
}
