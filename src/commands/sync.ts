import type { Db } from "../db/database.js";
import type { ToolkitConfig } from "../core/config.js";
import { ingestTranscripts } from "../services/ingest.js";
import { ingestGitActivity } from "../services/git-ingest.js";
import { GitCommitRepository, SessionRepository } from "../db/repositories.js";
import { CLAUDE_PROJECTS_DIR } from "../core/paths.js";
import { withSpinner } from "../ui/spinner.js";
import { good, subtle, warn } from "../ui/theme.js";

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
  if (ingestResult.sessionsRemoved > 0) {
    console.log(good(`  ${ingestResult.sessionsRemoved} stale session(s) removed (source files gone)`));
  }
  if (ingestResult.filesUnreadable > 0 || ingestResult.filesMalformed > 0) {
    const parts: string[] = [];
    if (ingestResult.filesUnreadable > 0) parts.push(`${ingestResult.filesUnreadable} unreadable`);
    if (ingestResult.filesMalformed > 0) parts.push(`${ingestResult.filesMalformed} malformed`);
    console.log(warn(`  ${parts.join(", ")} file(s) skipped — see warnings below`));
    for (const warning of ingestResult.parseWarnings.slice(0, 5)) {
      console.log(warn(`    ${warning}`));
    }
    if (ingestResult.parseWarnings.length > 5) {
      console.log(subtle(`    …and ${ingestResult.parseWarnings.length - 5} more`));
    }
  }
  if (ingestResult.malformedLines > 0) {
    console.log(warn(`  ${ingestResult.malformedLines} JSON line(s) skipped due to parse errors`));
  }

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
          `${memberResult.sessionsUpserted} session(s)` +
          (memberResult.sessionsRemoved > 0 ? `, ${memberResult.sessionsRemoved} stale` : "")
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
  console.log(
    good(
      `  ${gitResult.commitsInserted} commit(s) synced across ${gitResult.reposScanned} repo(s)` +
        (gitResult.reposSkipped > 0 ? ` (${gitResult.reposSkipped} skipped)` : "")
    )
  );

  if (gitResult.commitsInserted === 0) {
    return;
  }

  // Re-run attribution now that both sessions and git commits are loaded.
  // Soft recompute: preserves explicit attributions, adds correlated ones
  // to anything still unattributed, and never demotes a stronger signal.
  const sessions = new SessionRepository(db).allSources();
  const result = new GitCommitRepository(db).recomputeAttribution(sessions);
  if (result.promoted > 0 || result.demoted > 0) {
    console.log(
      good(
        `  ${result.promoted} commit(s) re-attributed to AI (correlated with sessions); ` +
          `${result.demoted} demoted (only on forced recompute)`
      )
    );
  }
}
