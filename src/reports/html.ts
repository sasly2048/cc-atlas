import type { ReportData } from "./data.js";

/** Consolidates the HTML-output half of cc-daily-report / cc-weekly-report /
 * cc-monthly / cc-ai-heatmap. Self-contained: no external CSS/JS, safe to
 * open straight from disk. */
export function renderHtmlReport(data: ReportData): string {
  const rows = (pairs: Array<[string, string | number]>) =>
    pairs.map(([k, v]) => `<tr><td>${escapeHtml(String(k))}</td><td>${escapeHtml(String(v))}</td></tr>`).join("\n");

  const projectRows = data.sessionStats.byProject
    .slice(0, 10)
    .map((p) => `<tr><td>${escapeHtml(p.project)}</td><td>${p.sessions}</td><td>${p.hours.toFixed(1)}</td></tr>`)
    .join("\n");

  const toolRows = data.toolUsage.byTool
    .slice(0, 10)
    .map(([tool, count]) => `<tr><td>${escapeHtml(tool)}</td><td>${count}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Claude Code Report — ${escapeHtml(data.periodLabel)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: .25rem; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; }
  td, th { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #8882; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; margin: 1rem 0; }
  .stat { border: 1px solid #8884; border-radius: 8px; padding: .75rem; }
  .stat .label { font-size: .8rem; opacity: .7; }
  .stat .value { font-size: 1.4rem; font-weight: 600; }
  .risk-low { color: #16a34a; } .risk-moderate { color: #ca8a04; }
  .risk-high { color: #ea580c; } .risk-severe { color: #dc2626; }
</style>
</head>
<body>
<h1>Claude Code Activity Report</h1>
<p>${escapeHtml(data.periodLabel)} · generated ${new Date().toISOString()}</p>

<div class="summary">
  <div class="stat"><div class="label">Sessions</div><div class="value">${data.sessionStats.totalSessions}</div></div>
  <div class="stat"><div class="label">Hours</div><div class="value">${data.sessionStats.totalHours.toFixed(1)}</div></div>
  <div class="stat"><div class="label">Commits</div><div class="value">${data.gitActivity.totalCommits}</div></div>
  <div class="stat"><div class="label">Ghost days</div><div class="value">${data.gitActivity.ghostDays.length}</div></div>
  <div class="stat"><div class="label">Burnout</div><div class="value risk-${data.burnout.riskLevel}">${data.burnout.riskLevel}</div></div>
</div>

<h2>Top Projects</h2>
<table><tr><th>Project</th><th>Sessions</th><th>Hours</th></tr>${projectRows}</table>

<h2>Tool Usage</h2>
<table><tr><th>Tool</th><th>Calls</th></tr>${toolRows}</table>

<h2>Cost &amp; Cache</h2>
<table>${rows([
    ["Estimated cost", `$${data.cost.actualCostUsd.toFixed(2)}`],
    ["Cache savings", `$${data.cost.cacheSavingsUsd.toFixed(2)}`],
    ["Cache hit ratio", `${(data.cost.cacheHitRatio * 100).toFixed(1)}%`],
  ])}</table>
<p style="font-size:.8rem;opacity:.7">${escapeHtml(data.cost.ratesNote)}</p>

</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
