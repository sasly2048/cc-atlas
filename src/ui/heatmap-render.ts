import chalk from "chalk";
import type { DailyRollup } from "../types/domain.js";
import { intensityBucket } from "../analytics/heatmap.js";

const SHADE_COLORS = [
  chalk.gray("·"),
  chalk.hex("#0e4429")("▪"),
  chalk.hex("#006d32")("▪"),
  chalk.hex("#26a641")("▪"),
  chalk.hex("#39d353")("▪"),
];
const GHOST_MARK = chalk.hex("#a78bfa")("▪");

/** Renders a GitHub-style contribution heatmap: weeks as columns, weekdays
 * as rows, one cell per day. Ghost days (AI-only activity) render in a
 * distinct color from human-present days. */
export function renderHeatmap(rollups: DailyRollup[]): string {
  if (rollups.length === 0) return chalk.dim("No activity recorded yet.");

  const byDate = new Map(rollups.map((r) => [r.date, r]));
  const first = new Date(rollups[0]!.date);
  const last = new Date(rollups[rollups.length - 1]!.date);

  // Align the grid to start on a Sunday so weekday rows line up correctly.
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  const weeks: string[][] = [];
  const cursor = new Date(start);
  let week: string[] = [];
  while (cursor <= last || week.length > 0) {
    week.push(cursor.toISOString().slice(0, 10));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
    if (cursor > last && week.length === 0) break;
  }
  if (week.length > 0) {
    while (week.length < 7) week.push("");
    weeks.push(week);
  }

  const rows: string[] = [];
  for (let day = 0; day < 7; day++) {
    let row = "";
    for (const w of weeks) {
      const date = w[day];
      if (!date) {
        row += "  ";
        continue;
      }
      const rollup = byDate.get(date);
      if (rollup?.ghostDay) {
        row += GHOST_MARK + " ";
      } else {
        row += SHADE_COLORS[intensityBucket(rollup?.hours ?? 0)] + " ";
      }
    }
    rows.push(row);
  }

  const legend = `${chalk.dim("less")} ${SHADE_COLORS.join(" ")} ${chalk.dim("more")}   ${GHOST_MARK} ${chalk.dim(
    "ghost day (AI ran, you weren't there)"
  )}`;

  return [...rows, "", legend].join("\n");
}
