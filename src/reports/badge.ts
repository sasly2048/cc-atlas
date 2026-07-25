import type { ReportData } from "./data.js";
import { computeCurrentStreak } from "../analytics/forecast.js";

/** Consolidates: cc-stats-badge — a shields.io-style SVG badge for a
 * GitHub README showing streak/hours/autonomy at a glance. Self-contained
 * SVG, no external image service involved. */
export function renderStatsBadge(data: ReportData, autonomyRate: number): string {
  const streak = computeCurrentStreak(data.sessions);
  const label = "claude code";
  const message = `${streak}d streak · ${data.sessionStats.totalHours.toFixed(0)}h · ${(
    autonomyRate * 100
  ).toFixed(0)}% autonomous`;

  const labelWidth = 11 * label.length + 20;
  const messageWidth = 7 * message.length + 20;
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="28" role="img" aria-label="${label}: ${message}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="28" rx="6" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="28" fill="#2b2f36"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="28" fill="#7c3aed"/>
    <rect width="${totalWidth}" height="28" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="13">
    <text x="${labelWidth / 2}" y="18">${label}</text>
    <text x="${labelWidth + messageWidth / 2}" y="18">${message}</text>
  </g>
</svg>`;
}
