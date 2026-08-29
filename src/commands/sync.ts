import type { Db } from "../db/database.js";
import type { ToolkitConfig } from "../core/config.js";
import { ingestTranscripts } from "../services/ingest.js";
import { ingestGitActivity } from "../services/git-ingest.js";
import { GitCommitRepository, SessionRepository } from "../db/repositories.js";
import { CLAUDE_PROJECTS_DIR } from "../core/paths.js";
import { withSpinner } from "../ui/spinner.js";
import { good, subtle } from "../ui/theme.js";

export async function runSync(db: Db, config: ToolkitConfig): Promise<void> {
  const projectsDir = config.claudeProjectsDir || CLAUDE_PROJECTS_DIR;

  const ingestResult = await withSpinner("Scanning Claude Code session transcripts", () =>
    ingestTranscripts(db, { projectsDir, maxAgeDays: config.ingest.maxAgeDays, sourceLabel: "you" })
  );

  console.log(
    good(
      `  ${ingestResult.filesIngested} file(s) ingested, ${ingestResult.filesSkipped} unchanged, ` +
        `${ingestResult.sessionsUpserted} session(s), ${ingestResult.toolCallsInserted} tool call(s) ` +
        `(${ingestResult.durationMs}ms)`
    )
  );

  for (const member of config.team.members) {
    const memberResult = await withSpinner(`Scanning ${member.name}'s session transcripts`, () =>
      ingestTranscripts(db, {
        projectsDir: member.claudeProjectsDir,
        maxAgeDays: config.ingest.maxAgeDays,
        sourceLabel: member.name,
      })
    );
    console.log(
      good(
        `  ${member.name}: ${memberResult.filesIngested} file(s) ingested, ${memberResult.filesSkipped} unchanged, ` +
          `${memberResult.sessionsUpserted} session(s)`
      )
    );
  }

  if (config.gitRepos.length === 0) {
    console.log(subtle("  No git repos configured — add some in Settings to enable git activity analytics."));
    return;
  }

  const gitResult = await withSpinner(`Reading git history for ${config.gitRepos.length} repo(s)`, () =>
    ingestGitActivity(db, config.gitRepos)
  );
  console.log(good(`  ${gitResult.commitsInserted} commit(s) synced across ${gitResult.reposScanned} repo(s)`));

  if (gitResult.commitsInserted === 0) {
    // Nothing new to potentially re-attribute — skip the re-query of the
    // sessions table and the per-row update transaction. Recomputing on a
    // no-op commit set is harmless but wastes a session read.
    return;
  }

  // Re-run session-window AI attribution now that both sessions and git
  // commits are loaded. Any commit that was message-only at insert time can
  // now be promoted if it falls inside a recorded session. This makes
  // git-first or git-only sync runs produce the same attribution as
  // session-first runs, closing the stale-attribution gap (#5).
  const sessions = new SessionRepository(db).all();
  const upgraded = new GitCommitRepository(db).recomputeAiAttribution(sessions);
  if (upgraded > 0) {
    console.log(good(`  ${upgraded} commit(s) re-attributed to AI via session-window match`));
  }
}
