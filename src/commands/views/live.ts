import fs from "node:fs";
import path from "node:path";
import type { ToolkitConfig } from "../../core/config.js";
import { CLAUDE_PROJECTS_DIR } from "../../core/paths.js";
import { parseTranscript } from "../../services/transcript-parser.js";
import { renderKeyValueTable } from "../../ui/table.js";
import { heading, subtle, warn } from "../../ui/theme.js";
import { logger } from "../../core/logger.js";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // ~30s, then returns to the menu — see docs/PLUGINS.md for a truly persistent watch mode

function findMostRecentTranscript(projectsDir: string): string | null {
  if (!fs.existsSync(projectsDir)) return null;
  let newest: { file: string; mtime: number } | null = null;
  const stack = [projectsDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // permission errors or a directory disappearing mid-walk — skip it
      // rather than crashing the live view.
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.name.endsWith(".jsonl")) {
        try {
          const mtime = fs.statSync(full).mtimeMs;
          if (!newest || mtime > newest.mtime) newest = { file: full, mtime };
        } catch {
          // Stat failure on a single file is not fatal — just skip it.
        }
      }
    }
  }
  return newest?.file ?? null;
}

/** Consolidates: cc-live. Polls the most recently modified transcript file
 * and prints a refreshed snapshot — token usage, cache efficiency, and a
 * rough burn rate — for a bounded window rather than streaming forever, so
 * it always hands control back to the interactive menu. */
export async function runLiveMonitor(config: ToolkitConfig): Promise<void> {
  const projectsDir = config.claudeProjectsDir || CLAUDE_PROJECTS_DIR;
  const file = findMostRecentTranscript(projectsDir);

  if (!file) {
    console.log(warn("No transcript files found."));
    return;
  }

  console.log(heading(`\nWatching ${file}`));
  console.log(subtle(`Refreshing every ${POLL_INTERVAL_MS / 1000}s for ~${(POLL_INTERVAL_MS * MAX_POLLS) / 1000}s, then returning to the menu.\n`));

  let lastOutputTokens = 0;
  let lastFrameAt = Date.now();
  for (let i = 0; i < MAX_POLLS; i++) {
    // A transient I/O error (file briefly mid-write, file deleted between
    // findMostRecentTranscript and readFileSync, permission flap) shouldn't
    // crash the live view — just skip this frame and try again next tick.
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (err) {
      logger.debug(`Live monitor: could not read ${file}: ${(err as Error).message}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const parsed = parseTranscript(file, content.split("\n"));
    if (parsed) {
      const now = Date.now();
      const elapsedSec = Math.max(1, (now - lastFrameAt) / 1000);
      const outputDelta = parsed.session.outputTokens - lastOutputTokens;
      const burnRate = outputDelta / elapsedSec;
      lastOutputTokens = parsed.session.outputTokens;
      lastFrameAt = now;

      process.stdout.write("\x1Bc"); // clear screen between frames
      console.log(heading("cc-atlas live"));
      console.log(
        renderKeyValueTable([
          ["Session", parsed.session.id],
          ["Turns", parsed.session.turnCount],
          ["Tool calls", parsed.toolCalls.length],
          ["Input tokens", parsed.session.inputTokens.toLocaleString()],
          ["Output tokens", parsed.session.outputTokens.toLocaleString()],
          ["Cache read tokens", parsed.session.cacheReadTokens.toLocaleString()],
          ["Output tokens/sec", burnRate.toLocaleString(undefined, { maximumFractionDigits: 1 })],
        ])
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
