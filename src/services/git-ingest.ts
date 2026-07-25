import type { Db } from "../db/database.js";
import { GitCommitRepository, SessionRepository } from "../db/repositories.js";
import { collectRepoCommits, correlateCommitsWithSessions } from "./git-service.js";
import { logger } from "../core/logger.js";

export interface GitIngestResult {
  reposScanned: number;
  commitsInserted: number;
}

export async function ingestGitActivity(db: Db, repoPaths: string[]): Promise<GitIngestResult> {
  const commitRepo = new GitCommitRepository(db);
  const sessionRepo = new SessionRepository(db);
  const sessions = sessionRepo.all();

  let commitsInserted = 0;
  for (const repoPath of repoPaths) {
    try {
      const commits = await collectRepoCommits({ repoPath });
      const correlated = correlateCommitsWithSessions(commits, sessions);
      commitRepo.insertMany(correlated);
      commitsInserted += correlated.length;
    } catch (err) {
      logger.warn(`Failed to read git history for ${repoPath}: ${(err as Error).message}`);
    }
  }

  return { reposScanned: repoPaths.length, commitsInserted };
}
