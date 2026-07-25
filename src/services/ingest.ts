import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db/database.js";
import { IngestStateRepository, SessionRepository, ToolCallRepository } from "../db/repositories.js";
import { parseTranscript } from "./transcript-parser.js";
import { logger } from "../core/logger.js";

export interface IngestOptions {
  projectsDir: string;
  maxAgeDays?: number;
  onProgress?: (done: number, total: number) => void;
  /** Tags every session ingested in this run — 'you' by default, or a team
   * member's name when pulling in someone else's ~/.claude history (see
   * config.team.members and analytics/team.ts). */
  sourceLabel?: string;
}

export interface IngestResult {
  filesScanned: number;
  filesIngested: number;
  filesSkipped: number;
  sessionsUpserted: number;
  toolCallsInserted: number;
  durationMs: number;
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

/** Incrementally ingests Claude Code transcripts into SQLite. Files whose
 * mtime/size haven't changed since the last run are skipped entirely, so
 * repeated runs over a large ~/.claude history stay fast. */
export function ingestTranscripts(db: Db, options: IngestOptions): IngestResult {
  const start = Date.now();
  const sessions = new SessionRepository(db);
  const toolCalls = new ToolCallRepository(db);
  const ingestState = new IngestStateRepository(db);

  const files = walkJsonlFiles(options.projectsDir);
  const cutoff =
    options.maxAgeDays && options.maxAgeDays > 0
      ? Date.now() - options.maxAgeDays * 24 * 60 * 60 * 1000
      : null;

  let filesIngested = 0;
  let filesSkipped = 0;
  let sessionsUpserted = 0;
  let toolCallsInserted = 0;

  files.forEach((filePath, index) => {
    options.onProgress?.(index + 1, files.length);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }
    if (cutoff && stat.mtimeMs < cutoff) return;

    const previous = ingestState.get(filePath);
    if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
      filesSkipped += 1;
      return;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      logger.debug(`Could not read ${filePath}: ${(err as Error).message}`);
      return;
    }

    const parsed = parseTranscript(filePath, content.split("\n"));
    if (!parsed) {
      filesSkipped += 1;
      return;
    }
    if (options.sourceLabel) parsed.session.sourceLabel = options.sourceLabel;

    sessions.upsert(parsed.session);
    sessions.deleteToolCalls(parsed.session.id);
    toolCalls.insertMany(parsed.toolCalls);

    ingestState.set({
      path: filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      sessionId: parsed.session.id,
    });

    filesIngested += 1;
    sessionsUpserted += 1;
    toolCallsInserted += parsed.toolCalls.length;
  });

  return {
    filesScanned: files.length,
    filesIngested,
    filesSkipped,
    sessionsUpserted,
    toolCallsInserted,
    durationMs: Date.now() - start,
  };
}
