import boxen from "boxen";
import { title, subtle, accent } from "./theme.js";

const TAGLINES = [
  "Your Claude Code activity, unified.",
  "116 tools. One menu. Zero context-switching.",
  "Every session, every commit, every streak — in one place.",
  "The command center for how you actually work.",
];

export function renderBanner(version: string): string {
  const art = title("cc-atlas");
  const subtitle = subtle(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]!);
  return boxen(`${art}\n${subtitle}`, {
    padding: 1,
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    borderColor: "magenta",
    title: `${accent("v" + version)}`,
    titleAlignment: "right",
  });
}

export function renderBox(content: string, options?: { title?: string; color?: string }): string {
  return boxen(content, {
    padding: 1,
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    borderColor: (options?.color as any) ?? "cyan",
    title: options?.title,
    titleAlignment: "left",
  });
}
