#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bootstrap } from "./core/bootstrap.js";
import { runInteractiveMenu } from "./commands/menu.js";
import { runSync } from "./commands/sync.js";
import { runDoctor, generateBadge, checkStreakAlert } from "./commands/views/utility-views.js";
import { buildReportData } from "./reports/data.js";
import { renderMarkdownReport, renderStandupReport } from "./reports/markdown.js";
import { renderHtmlReport } from "./reports/html.js";
import { renderPrometheusExport } from "./reports/prometheus.js";
import { renderJsonExport } from "./reports/json-export.js";
import { answerQuery } from "./services/nlq.js";
import { computeStatus, renderStatusLine } from "./commands/status.js";
import { SessionRepository, ToolCallRepository, GitCommitRepository } from "./db/repositories.js";
import { setVerbose } from "./core/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version: string };

const DAY_MS = 24 * 60 * 60 * 1000;

const program = new Command();
program.name("cc-atlas").description("Unified CLI for Claude Code usage analytics").version(pkg.version);
program.option("-v, --verbose", "verbose logging");
program.hook("preAction", (thisCommand) => {
  if (thisCommand.opts().verbose) setVerbose(true);
});

program
  .command("menu", { isDefault: true })
  .description("Launch the interactive menu (default)")
  .action(async () => {
    const ctx = bootstrap();
    await runInteractiveMenu(ctx, pkg.version);
  });

program
  .command("sync")
  .description("Ingest Claude Code transcripts and configured git repos")
  .action(async () => {
    const ctx = bootstrap();
    await runSync(ctx.db, ctx.config);
  });

program
  .command("doctor")
  .description("Run environment health checks")
  .action(() => {
    const ctx = bootstrap();
    runDoctor(ctx.config);
  });

program
  .command("badge")
  .description("Generate a README stats badge SVG")
  .action(() => {
    const ctx = bootstrap();
    generateBadge(ctx.db, ctx.config);
  });

program
  .command("alert")
  .description("Check streak risk; exits non-zero if the streak is about to lapse (cron-friendly)")
  .action(() => {
    const ctx = bootstrap();
    const atRisk = checkStreakAlert(ctx.db, ctx.config);
    process.exitCode = atRisk ? 1 : 0;
  });

program
  .command("report")
  .description("Generate a report to stdout")
  .argument("[period]", "day | week | month", "week")
  .option("-f, --format <format>", "markdown | html | standup", "markdown")
  .action((period: string, options: { format: string }) => {
    const ctx = bootstrap();
    const days = period === "day" ? 1 : period === "month" ? 30 : 7;
    const label = period === "day" ? "Today" : period === "month" ? "This month" : "This week";
    const data = buildReportData(ctx.db, ctx.config, Date.now() - days * DAY_MS, label);

    if (options.format === "html") console.log(renderHtmlReport(data));
    else if (options.format === "standup") console.log(renderStandupReport(data));
    else console.log(renderMarkdownReport(data));
  });

program
  .command("export")
  .description("Export computed stats in Prometheus or JSON format to stdout")
  .option("-f, --format <format>", "prometheus | json", "prometheus")
  .action((options: { format: string }) => {
    const ctx = bootstrap();
    const data = buildReportData(ctx.db, ctx.config, 0, "All time");
    console.log(options.format === "json" ? renderJsonExport(data) : renderPrometheusExport(data));
  });

program
  .command("ask")
  .description("Ask a plain-English question about your usage (pattern-matched, not an LLM call)")
  .argument("<question...>", "e.g. \"how many hours this week\"")
  .action((questionParts: string[]) => {
    const ctx = bootstrap();
    const sessions = new SessionRepository(ctx.db).all();
    const toolCalls = new ToolCallRepository(ctx.db).all();
    const commits = new GitCommitRepository(ctx.db).all();
    const answer = answerQuery(questionParts.join(" "), {
      sessions,
      toolCalls,
      commits,
      burnoutConfig: ctx.config.burnout,
    });
    console.log(answer);
  });

program
  .command("status")
  .description("Compact one-line status for shell prompts/statuslines (streak, hours today, burnout risk)")
  .option("--json", "output machine-readable JSON instead of a formatted line")
  .action((options: { json?: boolean }) => {
    const ctx = bootstrap();
    const status = computeStatus(ctx.db, ctx.config);
    console.log(options.json ? JSON.stringify(status) : renderStatusLine(status));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
