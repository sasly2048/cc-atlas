import chalk from "chalk";
import gradient from "gradient-string";

const BRAND_COLORS = ["#7c3aed", "#2563eb", "#06b6d4"];
const GOLD_COLORS = ["#f59e0b", "#fbbf24", "#fde68a"];

export interface Theme {
  gradientEnabled: boolean;
}

let theme: Theme = { gradientEnabled: true };

export function setTheme(next: Partial<Theme>): void {
  theme = { ...theme, ...next };
}

export function title(text: string): string {
  return theme.gradientEnabled ? gradient(BRAND_COLORS)(text) : chalk.bold.cyan(text);
}

export function premiumTitle(text: string): string {
  return theme.gradientEnabled ? gradient(GOLD_COLORS)(text) : chalk.bold.yellow(text);
}

export function heading(text: string): string {
  return chalk.bold.white(text);
}

export function subtle(text: string): string {
  return chalk.dim(text);
}

export function good(text: string): string {
  return chalk.green(text);
}

export function warn(text: string): string {
  return chalk.yellow(text);
}

export function bad(text: string): string {
  return chalk.red(text);
}

export function accent(text: string): string {
  return chalk.magenta(text);
}

export function gold(text: string): string {
  return chalk.hex("#f59e0b").bold(text);
}

export function num(value: number | string): string {
  return chalk.bold.cyan(String(value));
}

const CATEGORY_STYLE: Record<string, { color: (t: string) => string; icon: string }> = {
  professional: { color: (t) => chalk.bold.blue(t), icon: "💼" },
  technical: { color: (t) => chalk.bold.cyan(t), icon: "🛠️" },
  fun: { color: (t) => chalk.bold.green(t), icon: "✨" },
  premium: { color: (t) => (theme.gradientEnabled ? gradient(GOLD_COLORS)(t) : chalk.bold.yellow(t)), icon: "👑" },
};

/** Colored, iconified badge for an archetype category (professional /
 * technical / fun / premium). Falls back to a plain accent style for
 * unrecognized categories rather than throwing. */
export function categoryBadge(category: string): string {
  const style = CATEGORY_STYLE[category];
  if (!style) return accent(category.toUpperCase());
  return style.color(`${style.icon} ${category.toUpperCase()}`);
}

export function divider(width = 48): string {
  return theme.gradientEnabled ? gradient(BRAND_COLORS)("─".repeat(width)) : subtle("─".repeat(width));
}

export function bullet(text: string, icon = "◆"): string {
  return `  ${accent(icon)} ${text}`;
}

/** Renders a colored block-progress bar, e.g. for scores 0-100. Color
 * shifts red -> yellow -> green as the value climbs. */
export function scoreBar(value: number, max = 100, width = 24): string {
  const clamped = Math.max(0, Math.min(max, value));
  const filled = Math.round((clamped / max) * width);
  const empty = width - filled;
  const ratio = clamped / max;
  const colorFn = ratio >= 0.75 ? chalk.green : ratio >= 0.45 ? chalk.yellow : chalk.red;
  return `${colorFn("█".repeat(filled))}${chalk.dim("░".repeat(empty))} ${colorFn.bold(`${Math.round(clamped)}/${max}`)}`;
}
