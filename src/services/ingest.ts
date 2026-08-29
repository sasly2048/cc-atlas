import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Db } from "../db/database.js";
import {
  IngestStateRepository,
  SessionRepository,
  ToolCallRepository,
} from "../db/repositories.js";
import { parseTranscript, type ParsedTranscript } from "./transcript-parser.js";
import { logger } from "../core/logger.js";
import type { IngestResult } from "../types/domain.js";

export interface IngestOptions {
  projectsDir: string;
  maxAgeDays?: number;
  onProgress?: (done: number, total: number) => void;
  /** Tags every session ingested in this run — 'you' by default, or a team
   * member's name when pulling in someone else's ~/.claude history (see
   * config.team.members and analytics/team.ts). */
  sourceLabel?: string;
  /** When true (default), detect source files that have been deleted from
   * disk since the last sync and remove their previously-ingested
   * sessions + tool calls + ingest state. Set to false for read-only runs
   * that only want to ingest new files. */
  reconcile?: boolean;
}

function walkJsonlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // permission errors etc. — skip this branch, keep going
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
    }
  }
  return out;
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

interface FileDecision {
  state: "unchanged" | "changed" | "new" | "stale";
  reason: string;
  previous?: { mtimeMs: number; size: number; contentHash: string };
}

/** Decide whether a file needs re-ingestion. Uses content hash as the
 * source of truth: mtime+size are checked first as a fast path, but if
 * they match the previous values the hash is still recomputed for any
 * ambiguous case (e.g. mtime granularity coarser than the modification,
 * copy/extract operations that preserve mtime+size, etc.). */
function classifyFile(
  stat: fs.Stats,
  content: string,
  previous: { mtimeMs: number; size: number; contentHash: string } | undefined
): FileDecision {
  if (!previous) {
    return { state: "new", reason: "no prior ingest record" };
  }
  // Fast path: mtime+size match → assume unchanged, but verify with hash
  // (cheap) so a copy/restore that preserved metadata still gets caught.
  if (previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
    const hash = sha256(content);
    if (hash === previous.contentHash) {
      return { state: "unchanged", reason: "mtime+size+hash match" };
    }
    return {
      state: "changed",
      reason: "mtime+size match but content hash differs (mtime-preserving rewrite)",
      previous,
    };
  }
  return {
    state: "changed",
    reason: `mtime or size changed (was ${previous.mtimeMs}/${previous.size}B, now ${stat.mtimeMs}/${stat.size}B)`,
    previous,
  };
}

/** Incrementally ingests Claude Code transcripts into SQLite. The
 * per-file operation is wrapped in one SQLite transaction (BUG #2): a
 * failure mid-ingest leaves the database in its pre-ingest state instead
 * of a half-written session. The reconciliation pass removes sessions
 * whose source files have disappeared since the last sync (BUG #6), so
 * analytics don't keep reporting data the user has deleted. */
export function ingestTranscripts(db: Db, options: IngestOptions): IngestResult {
  const start = Date.now();
  const sourceLabel = options.sourceLabel ?? "you";
  const reconcile = options.reconcile !== false;
  const sessions = new SessionRepository(db);
  const toolCalls = new ToolCallRepository(db);
  const ingestState = new IngestStateRepository(db);

  const files = walkJsonlFiles(options.projectsDir);
  // Guard against integer overflow: maxAgeDays * DAY_MS can exceed 2^53 for
  // anything wildly large (and Date.now() - anything larger than 2^53 ms
  // produces Infinity, which silently disables the cutoff). Clamp the
  // product to Number.MAX_SAFE_INTEGER so the cutoff still works as "no
  // limit" when someone misconfigures it, instead of "every file looks old".
  const cutoff =
    options.maxAgeDays && options.maxAgeDays > 0
      ? Date.now() - Math.min(options.maxAgeDays * 24 * 60 * 60 * 1000, Number.MAX_SAFE_INTEGER)
      : null;

  let filesIngested = 0;
  let filesSkipped = 0;
  let filesUnreadable = 0;
  let filesMalformed = 0;
  let filesStale = 0;
  let sessionsUpserted = 0;
  let sessionsRemoved = 0;
  let toolCallsInserted = 0;
  let malformedLines = 0;
  const parseWarnings: string[] = [];

  // Phase 1: read + classify every file. Cheap, no DB writes.
  const filePlan: Array<
    | { kind: "skip" }
    | { kind: "ingest"; filePath: string; content: string; stat: fs.Stats; contentHash: string; decision: FileDecision }
    | { kind: "unreadable"; filePath: string; error: string }
    | { kind: "malformed"; filePath: string; result: ParsedTranscript; warning: string }
  > = [];

  for (let index = 0; index < files.length; index++) {
    const filePath = files[index]!;
    options.onProgress?.(index + 1, files.length);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      filesUnreadable += 1;
      filePlan.push({
        kind: "unreadable",
        filePath,
        error: (err as Error).message,
      });
      continue;
    }
    if (cutoff !== null && stat.mtimeMs < cutoff) {
      // mtime older than cutoff → assume already-ingested and out of
      // scope; don't even read the file.
      filesSkipped += 1;
      filePlan.push({ kind: "skip" });
      continue;
    }

    const previous = ingestState.get(filePath, sourceLabel);
    // Fast path: if mtime+size already match the previous record, we
    // can avoid reading the file at all. We only do this when we already
    // have a content hash stored (i.e. v4-schema databases). For older
    // databases we always read.
    if (
      previous?.contentHash &&
      previous.mtimeMs === stat.mtimeMs &&
      previous.size === stat.size
    ) {
      filesSkipped += 1;
      filePlan.push({ kind: "skip" });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      filesUnreadable += 1;
      logger.debug(`Could not read ${filePath}: ${(err as Error).message}`);
      filePlan.push({
        kind: "unreadable",
        filePath,
        error: (err as Error).message,
      });
      continue;
    }

    const decision = classifyFile(
      stat,
      content,
      previous
        ? {
            mtimeMs: previous.mtimeMs,
            size: previous.size,
            contentHash: previous.contentHash,
          }
        : undefined
    );

    if (decision.state === "unchanged") {
      filesSkipped += 1;
      filePlan.push({ kind: "skip" });
      continue;
    }

    const contentHash = sha256(content);
    const parsed = parseTranscript(filePath, content.split("\n"));
    if (!parsed) {
      filesMalformed += 1;
      malformedLines += 1;
      const warning = `No valid session lines in ${filePath}`;
      parseWarnings.push(warning);
      logger.debug(warning);
      // Still record the file as ingested (with no session) so we don't
      // re-parse it on every run. Use a stable synthetic sessionId of
      // "" to indicate "no session produced".
      ingestState.set({
        path: filePath,
        sourceLabel,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        contentHash,
        sessionId: null,
      });
      continue;
    }
    // Track malformed lines the parser reported.
    for (const w of parsed.warnings) {
      malformedLines += 1;
      parseWarnings.push(`${filePath}: ${w}`);
    }
    if (options.sourceLabel) parsed.session.sourceLabel = sourceLabel;

    filePlan.push({
      kind: "ingest",
      filePath,
      content,
      stat,
      contentHash,
      decision,
    });
  }

  // Phase 2: write each plan item in its own transaction. If one file
  // throws, the others still go through. Each transaction wraps the
  // session upsert + tool-call replacement + ingest-state update so a
  // mid-ingest failure leaves the database consistent.
  for (const item of filePlan) {
    if (item.kind === "skip") continue;

    if (item.kind === "unreadable") {
      // Already counted above; nothing to write.
      continue;
    }

    if (item.kind === "malformed") {
      // Already updated ingestState in phase 1 to record the parse result.
      continue;
    }

    const { filePath, stat, contentHash } = item;
    const parsed = parseTranscript(filePath, item.content.split("\n"));
    if (!parsed) {
      // Should be unreachable — phase 1 only pushes malformed/ingest items
      // after parseTranscript succeeded.
      filesMalformed += 1;
      continue;
    }

    try {
      const tx = db.transaction(() => {
        // Always re-upsert the session and replace its tool calls; this
        // is the simplest correct behavior. Idempotent: re-ingest of the
        // same file produces the same database state.
        sessions.upsert(parsed.session);
        toolCalls.replaceForSession(parsed.session.id, parsed.toolCalls);
        ingestState.set({
          path: filePath,
          sourceLabel,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          contentHash,
          sessionId: parsed.session.id,
        });
      });
      tx();

      filesIngested += 1;
      sessionsUpserted += 1;
      toolCallsInserted += parsed.toolCalls.length;
    } catch (err) {
      // The whole transaction rolled back. Surface this as a hard
      // failure so the user can see their data didn't silently disappear.
      filesMalformed += 1;
      const msg = `Ingest transaction failed for ${filePath}: ${(err as Error).message}`;
      parseWarnings.push(msg);
      logger.error(msg);
    }
  }

  // Phase 3: reconciliation. For every (sourceLabel, path) we have on
  // record, check whether the file still exists. If not, drop the
  // session + tool calls + ingest state for it. This makes analytics
  // honest about what's on disk right now.
  if (reconcile) {
    const knownPaths = new Set(files);
    const tracked = ingestState.listForSource(sourceLabel);
    for (const state of tracked) {
      if (knownPaths.has(state.path)) continue;
      try {
        const tx = db.transaction(() => {
          if (state.sessionId) sessions.remove(state.sessionId);
          ingestState.forget(state.path, sourceLabel);
        });
        tx();
        sessionsRemoved += 1;
        filesStale += 1;
      } catch (err) {
        logger.warn(
          `Reconciliation: failed to remove stale session for ${state.path}: ${(err as Error).message}`
        );
      }
    }
  }

  return {
    filesScanned: files.length,
    filesIngested,
    filesSkipped,
    filesUnreadable,
    filesMalformed,
    filesStale,
    sessionsUpserted,
    sessionsRemoved,
    toolCallsInserted,
    malformedLines,
    parseWarnings,
    durationMs: Date.now() - start,
  };
}
