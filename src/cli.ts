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

const REPORT_PERIODS: Record<string, { days: number; label: string }> = {
  day: { days: 1, label: "Today" },
  week: { days: 7, label: "This week" },
  month: { days: 30, label: "This month" },
};
const REPORT_FORMATS = new Set(["markdown", "html", "standup"]);
const EXPORT_FORMATS = new Set(["prometheus", "json"]);

const program = new Command();
program.name("cc-atlas").description("Unified CLI for Claude Code usage analytics").version(pkg.version);
program.option("-v, --verbose", "verbose logging");
program.hook("preAction", (thisCommand) => {
  // thisCommand is the leaf (sub)command, not the root program — opt values
  // live on whichever level defined them, and verbosity on the root has to
  // be looked up from getOptionValue rather than the leaf's opts, which
  // would otherwise return an empty object for inherited options.
  const root = thisCommand.parent ?? thisCommand;
  const verbose = Boolean(
    thisCommand.opts().verbose || root.getOptionValueSource?.("verbose") === "cmd"
  );
  if (verbose) setVerbose(true);
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
    const periodSpec = REPORT_PERIODS[period];
    if (!periodSpec) {
      console.error(
        `cc-atlas report: unknown period "${period}". Valid: ${Object.keys(REPORT_PERIODS).join(", ")}.`
      );
      process.exitCode = 2;
      return;
    }
    if (!REPORT_FORMATS.has(options.format)) {
      console.error(
        `cc-atlas report: unknown format "${options.format}". Valid: ${[...REPORT_FORMATS].join(", ")}.`
      );
      process.exitCode = 2;
      return;
    }
    const ctx = bootstrap();
    const days = periodSpec.days;
    const label = periodSpec.label;
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
    if (!EXPORT_FORMATS.has(options.format)) {
      console.error(
        `cc-atlas export: unknown format "${options.format}". Valid: ${[...EXPORT_FORMATS].join(", ")}.`
      );
      process.exitCode = 2;
      return;
    }
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
