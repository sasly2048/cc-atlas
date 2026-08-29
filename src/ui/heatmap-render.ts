import chalk from "chalk";
import type { DailyRollup } from "../types/domain.js";
import { intensityBucket } from "../analytics/heatmap.js";

// Five visually distinct glyphs, one per intensity level. Using the same
// `▪` for levels 1-4 means monochrome terminals (NO_COLOR=1) collapse all
// non-zero activity to the same mark — readers can't tell a quiet day from
// a heavy one. Each level now has its own shape, so the legend stays
// readable even when color is stripped.
const NO_COLOR = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
const SHADE_GLYPHS = NO_COLOR ? ["·", "▪", "◾", "◼", "■"] : ["·", "▪", "▪", "▪", "▪"];
const SHADE_COLORS = NO_COLOR
  ? SHADE_GLYPHS
  : [
      chalk.gray(SHADE_GLYPHS[0]!),
      chalk.hex("#0e4429")(SHADE_GLYPHS[1]!),
      chalk.hex("#006d32")(SHADE_GLYPHS[2]!),
      chalk.hex("#26a641")(SHADE_GLYPHS[3]!),
      chalk.hex("#39d353")(SHADE_GLYPHS[4]!),
    ];
const GHOST_GLYPH = NO_COLOR ? "◇" : "▪";
const GHOST_MARK = NO_COLOR ? GHOST_GLYPH : chalk.hex("#a78bfa")(GHOST_GLYPH);

/** Renders a GitHub-style contribution heatmap: weeks as columns, weekdays
 * as rows, one cell per day. Ghost days (AI-only activity) render in a
 * distinct color from human-present days. */
export function renderHeatmap(rollups: DailyRollup[]): string {
  if (rollups.length === 0) return chalk.dim("No activity recorded yet.");

  const byDate = new Map(rollups.map((r) => [r.date, r]));
  const firstDate = rollups[0]?.date;
  const lastDate = rollups[rollups.length - 1]?.date;
  if (!firstDate || !lastDate) return chalk.dim("No activity recorded yet.");
  const first = new Date(firstDate);
  const last = new Date(lastDate);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return chalk.dim("No activity recorded yet.");
  }

  // Align the grid to start on a Sunday so weekday rows line up correctly.
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  // Cap the grid span at one year of weeks. A 5+ year history is still
  // rendered, but the SVG-style ASCII grid here is sized for a year; going
  // wider would explode terminal width without adding information the user
  // can read at a glance.
  const MAX_WEEKS = 53;
  const weeks: string[][] = [];
  const cursor = new Date(start);
  let week: string[] = [];
  let safety = 0;
  while (safety++ < MAX_WEEKS * 7 + 14) {
    week.push(cursor.toISOString().slice(0, 10));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
      if (weeks.length >= MAX_WEEKS) break;
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