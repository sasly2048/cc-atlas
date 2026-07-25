import type { ReportData } from "./data.js";

const WIDTH = 40;

function line(char = "-"): string {
  return char.repeat(WIDTH);
}

function row(label: string, value: string): string {
  const padding = Math.max(1, WIDTH - label.length - value.length);
  return `${label}${" ".repeat(padding)}${value}`;
}

/** Consolidates: cc-receipt — a novelty ASCII "receipt" of the AI's work,
 * printed to look like a register tape. */
export function renderReceipt(data: ReportData): string {
  const lines: string[] = [];
  lines.push(center("CLAUDE CODE"));
  lines.push(center("Daily Work Receipt"));
  lines.push(line("="));
  lines.push(row("Period", data.periodLabel));
  lines.push(row("Sessions", String(data.sessionStats.totalSessions)));
  lines.push(row("Hours", data.sessionStats.totalHours.toFixed(1)));
  lines.push(row("Tool calls", String(data.toolUsage.totalCalls)));
  lines.push(row("Commits", String(data.gitActivity.totalCommits)));
  lines.push(row("Lines +", String(data.gitActivity.totalInsertions)));
  lines.push(row("Lines -", String(data.gitActivity.totalDeletions)));
  lines.push(line());
  for (const [tool, count] of data.toolUsage.byTool.slice(0, 5)) {
    lines.push(row(`  ${tool}`, `x${count}`));
  }
  lines.push(line());
  lines.push(row("TOTAL COST (est.)", `$${data.cost.actualCostUsd.toFixed(2)}`));
  lines.push(row("SAVED VIA CACHE", `$${data.cost.cacheSavingsUsd.toFixed(2)}`));
  lines.push(line("="));
  lines.push(center("The AI never clocks out."));
  lines.push(center("Thank you for your commits!"));
  return lines.join("\n");
}

function center(text: string): string {
  const padding = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return " ".repeat(padding) + text;
}
