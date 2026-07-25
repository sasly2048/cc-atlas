<h1 align="center">cc-atlas</h1>

<p align="center">
  <strong>One CLI for your Claude Code usage.</strong>
</p>

<div align="center">

**cc-atlas** is a single, polished, interactive toolkit that reads your local
**Claude Code** session transcripts and git history and turns them into
session stats, tool usage breakdowns, streaks, burnout signals, cost/cache
savings, team leaderboards, and more — in one menu, against one local
SQLite database, with nothing sent over a network.

</div>

<div align="center">

![Last Commit](https://img.shields.io/github/last-commit/sasly2048/cli-unified)
![License](https://img.shields.io/badge/License-MIT-informational.svg)
![Made with Love](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![Node](https://img.shields.io/badge/Node-%E2%89%A518.17-339933?logo=node.js&logoColor=white)
![Runtime](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

</div>

---

## Overview

Every time you use Claude Code, it writes a JSONL transcript of the session
to `~/.claude/projects/`. cc-atlas reads that history (and, optionally, git
log data from repos you point it at) and turns it into an interactive,
terminal-native dashboard — no telemetry, no external API calls, no account.
Everything is computed locally and stored in one SQLite database at
`~/.cc-atlas/toolkit.sqlite3`.

It's a single, consolidated tool: one menu covering session stats, tool
usage, streaks, burnout, git activity, cost/cache savings, and more,
instead of a dozen separate single-purpose scripts — plus a handful of
capabilities, like cross-project comparison, team leaderboards, anomaly
detection, and a local Q&A command, that go beyond what any one-off script
does. See [Features](#features) below.

The idea and initial feature set are inspired by, and partly repackaged
from, [yurukusa](https://www.npmjs.com/~yurukusa)'s catalog of Claude Code
analytics packages — full credit and the complete package-by-package
mapping are in [Credits & inspiration](#credits--inspiration) and
[AUDIT.md](./AUDIT.md).

<p align="center">
  <img src="https://github.com/user-attachments/assets/a0992694-6477-45b9-83e5-0a243d4748eb"
       alt="Screenshot 1"
       width="380" />
  <img src="https://github.com/user-attachments/assets/4fa79a24-5bf9-4e2f-985f-053a7a0100e9"
       alt="Screenshot 2"
       width="380" />
</p>


## How it works

1. **`cc-atlas sync`** walks `~/.claude/projects/**/*.jsonl`, incrementally
   parsing any file whose mtime/size changed since the last run, and
   upserts sessions + tool calls into SQLite. It does the same for any git
   repos in `config.gitRepos` (`git log --numstat`), and for any teammates'
   transcript directories in `config.team.members`.
2. **Analytics run as pure functions** over the ingested rows — no
   filesystem or terminal dependency, so every module in `src/analytics/`
   is unit-testable in isolation (data in, stats out).
3. **The interactive menu** (or a non-interactive CLI subcommand) renders
   whichever screen you pick, computing only what that screen needs —
   there's no eager full-load of your history into memory.
4. **Reports and exports** (Markdown, HTML, a Prometheus metrics feed, a
   JSON summary, a README badge) are just alternate renderers over the same
   computed stats.

## Features

**Core analytics** — session stats (duration, turns, fire-and-forget rate),
tool usage (frequency, first/last tool, pairs, trigrams, bursts), streaks &
reliability (error rate, clean-call streaks, self-recovery), burnout &
wellness (risk score, peak hours, late-night rate, weekly momentum), git
activity (commits, AI-attributed commits, ghost days), a GitHub-style
heatmap, cost & cache savings, content analysis (hottest files, languages,
bash commands), context & thinking (compaction rate, thinking-block usage),
human/AI collaboration (autonomy rate, check-in cadence, plan mode), model
usage + a task-complexity model recommender, and a personality/achievements
layer with 22 archetypes across professional/technical/fun/premium styles.

**Extras** — cross-project comparison, session replay, team activity,
anomaly detection, goals & progress tracking, a local pattern-matched
"ask" command, and Prometheus/JSON export. See the [dedicated
section](#extras) below for what each one does.

**Output** — Markdown/HTML/standup/receipt/compare reports, a self-contained
SVG README badge, a cron-friendly streak-risk alert, a live session monitor,
and a one-line `status` command for shell prompts or a statusline widget.

**Extensibility** — a plugin system (`config.plugins.enabled`) for adding
your own menu screens with dependency-injected access to the same SQLite
connection and config, without touching this package's source.

## Extras

A handful of capabilities that go beyond a straightforward stats dashboard:

- **Cross-project comparison** (`src/analytics/project-compare.ts`) — put
  two projects side by side with computed deltas, e.g. *"webapp gets 2.3x
  more autonomous work than api-server."*
- **Session replay** (`src/analytics/session-replay.ts`) — compresses one
  session's tool-call stream into a scannable arrow chain
  (`Read → Edit → Bash(fail) → Bash`) instead of scrolling raw JSONL.
- **Team activity** (`src/analytics/team.ts`, `config.team.members`) —
  point cc-atlas at teammates' own `~/.claude/projects` directories (still
  read locally — no server, no new network calls) and get a per-person
  leaderboard in the same database.
- **Anomaly detection** (`src/analytics/anomalies.ts`) — flags days/sessions
  that are statistically unusual (z-score over daily hours, error rate, and
  session length) instead of leaving outliers to be eyeballed on a heatmap.
- **Goals & progress** (`src/analytics/goals.ts`, `config.goals`) — set a
  weekly-hours or streak target and track ongoing progress, not just a
  last-minute "streak about to lapse" nudge.
- **Ask** (`src/services/nlq.ts`, `cc-atlas ask "…"`) — a fixed, documented
  vocabulary of questions (hours / sessions / error rate / streak / burnout
  / top tool / cost / commits, optionally scoped to a project and a period)
  answered by pattern-matching against locally computed stats. **Not** an
  LLM integration — no network call, no API key — and it says so plainly
  when it doesn't recognize a question.
- **Export** (`src/reports/prometheus.ts`, `src/reports/json-export.ts`,
  `cc-atlas export`) — Prometheus text-exposition format for an existing
  Grafana/Prometheus stack, or a JSON summary for anything else.
- **Status** (`cc-atlas status [--json]`) — a compact one-liner
  (`🔥 5d · 2.3h today · 🟢 low`) meant to be shelled out to from a shell
  prompt (a starship "custom" module, a tmux `status-right` script) or a
  VS Code task/extension that runs a command and shows its output in the
  status bar.

## Tech stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript (strict mode), ESM, Node.js ≥18.17 |
| **CLI** | Commander, Inquirer |
| **Terminal UI** | Chalk, gradient-string, Boxen, cli-table3, Ora |
| **Database** | SQLite via better-sqlite3 (WAL mode, typed repositories, append-only migrations) |
| **Git integration** | simple-git (`git log --numstat` parsing, AI-attribution heuristics) |
| **Testing** | Vitest (unit + integration + CLI-process tests) |
| **CI** | GitHub Actions — ubuntu/macOS/Windows × Node 18/20 matrix |

## Getting started

```bash
npm install -g cc-atlas
cc-atlas            # interactive menu (default)
```

```bash
cc-atlas sync                              # ingest transcripts + configured git repos
cc-atlas doctor                            # environment health check
cc-atlas report week --format markdown     # non-interactive report to stdout
cc-atlas badge                             # generate a README stats badge SVG
cc-atlas alert                             # exit non-zero if your streak is about to lapse (cron-friendly)
cc-atlas ask "how many hours this week"    # pattern-matched Q&A over your local stats
cc-atlas status                            # one-line summary for a shell prompt/statusline
cc-atlas export --format prometheus        # metrics for an existing Grafana/Prometheus stack
```

### From source

```bash
git clone https://github.com/sasly2048/cli-unified.git cc-atlas
cd cc-atlas
npm install

npm run dev -- menu     # run from source via tsx, no build step needed
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

### As a Claude Code plugin

cc-atlas also ships as a [Claude Code plugin](https://code.claude.com/docs/en/plugins),
so Claude can answer questions about your own usage directly in chat —
"how many hours have I used Claude Code this week" gets answered without
you leaving the conversation.

```
/plugin marketplace add sasly2048/cli-unified
/plugin install cc-atlas@cc-atlas-marketplace
/reload-plugins
```

Or try it without installing, from a checkout:

```bash
claude --plugin-dir /path/to/cli-unified
```

First use triggers a one-time setup (installs dependencies and builds
cc-atlas into `~/.claude/plugins/data/cc-atlas/`) — give it a few seconds
on the first session after install; every session after that is instant.

**What you get:**
- A model-invocable **insights** skill — ask about hours, sessions,
  streaks, error rate, burnout, cost, or top tools in plain language and
  Claude runs `cc-atlas sync` + `cc-atlas ask` for you, no slash command
  needed.
- Manual commands: `/cc-atlas:sync`, `/cc-atlas:status`,
  `/cc-atlas:report [period] [format]`, `/cc-atlas:export [prometheus|json]`,
  and `/cc-atlas:menu` (points you to the full interactive menu, which
  needs a real terminal — see below).
- The plugin exposes a bare `cc-atlas` command on `PATH` inside Claude
  Code's Bash tool, backed by the same CLI described throughout this
  README — see [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json),
  [`skills/`](./skills/), and [`hooks/hooks.json`](./hooks/hooks.json).

The full interactive menu (Dashboard, Compare two projects, Session
replay, Team activity, Anomalies, Goals) still needs a real TTY and isn't
driven through the plugin — run bare `cc-atlas` in your terminal for that,
same as the npm install path above.

## What it reads

- **Claude Code session transcripts** — `~/.claude/projects/**/*.jsonl` (or
  a custom path set in Settings). This is the same on-disk history Claude
  Code itself writes; cc-atlas never talks to a network API to get it.
- **Git history** — for repos you add in Settings, via `git log --numstat`.
- **Teammates' transcript directories** (optional) — entries in
  `config.team.members` are read the same way, tagged separately in the
  same local database. Still entirely local.

## Configuration

One file, `~/.cc-atlas/config.json`, covers everything — theme, the Claude
projects directory, git repos to track, burnout thresholds, alert
sensitivity, report output location, team members, goals, and enabled
plugins. Edit it directly or use the **Settings** menu (team members) and
**Goals** screen (goal targets). See
[`src/core/config.ts`](./src/core/config.ts) for the full shape and
defaults.

## Project structure

```
src/
  cli.ts                 Commander entry point (interactive menu + subcommands)
  core/                   config, paths, logger, bootstrap
  db/                     SQLite schema, append-only migrations, typed repositories
  services/               transcript parsing, ingestion, git history, natural-language Q&A
  analytics/               pure functions: data in, stats out (18 modules)
  ui/                      theme, prompts, tables, spinners, heatmap rendering
  reports/                  Markdown/HTML/standup/receipt/badge/Prometheus/JSON renderers
  commands/                 menu wiring + view functions
  plugins/                  plugin type + loader

test/
  unit/                    pure-function tests, no I/O
  integration/             SQLite + filesystem tests, temp directories
  cli/                     spawns the CLI via tsx, checks exit codes and stdout

.claude-plugin/            Claude Code plugin manifest + single-plugin marketplace catalog
skills/                    Claude Code skills that shell out to the built CLI (see below)
hooks/                     SessionStart hook that builds cc-atlas into the plugin data dir
```

Note the two different "plugin" concepts in this repo: `src/plugins/` is
cc-atlas's **own** extensibility system (add a menu screen without
touching this package — see [Plugins](#plugins) below). The top-level
`.claude-plugin/`, `skills/`, and `hooks/` are what make cc-atlas
installable **as a Claude Code plugin** (see
[As a Claude Code plugin](#as-a-claude-code-plugin) above) — unrelated to
each other, sharing only the word "plugin."

- **Modular by layer**, not by original package — `analytics/` is pure
  functions over typed records, easy to unit test without touching the
  filesystem or a terminal.
- **One SQLite database**, incrementally updated — re-running `sync` only
  re-parses transcript files whose mtime/size changed, so it stays fast
  against years of history.
- **Lazy, minimal startup** — the CLI only opens the database and loads
  what a given menu screen needs.

## Plugins

Add your own menu entries without touching this package. In
`~/.cc-atlas/config.json`:

```json
{ "plugins": { "enabled": ["my-cc-atlas-plugin"] } }
```

Where `my-cc-atlas-plugin` is an installed (or absolute-path) ESM module
whose default export matches:

```ts
import { definePlugin } from "cc-atlas";

export default definePlugin({
  id: "my-plugin",
  menuLabel: "🔍 My Analyzer",
  run(ctx) {
    // ctx.db     — the same SQLite connection (see src/db/repositories.ts)
    // ctx.config — the loaded ToolkitConfig
  },
});
```

## Data fidelity notes

- Claude Code's transcript format isn't formally documented; the parser in
  `src/services/transcript-parser.ts` is deliberately defensive about
  missing/unexpected fields rather than crashing on them.
- Dollar figures (Cost & Cache) use an illustrative blended rate, not
  Anthropic's actual per-model, per-date pricing — treat them as
  directional. See `src/analytics/cost.ts`.
- "Ghost days" and AI-commit attribution are a heuristic: a commit is
  AI-attributed if it carries Claude Code's conventional
  `Co-Authored-By: Claude` trailer, or falls inside a recorded session
  window. See `src/services/git-service.ts`.
- `cc-atlas ask` is pattern-matching over a fixed, documented vocabulary,
  not a language model — see [Extras](#extras).

## Credits & inspiration

cc-atlas is inspired by, and its initial feature set is repackaged from,
[yurukusa](https://www.npmjs.com/~yurukusa)'s catalog of Claude Code
analytics packages — full credit for those original ideas belongs there.
See [AUDIT.md](./AUDIT.md) for the complete package-by-package mapping.
cc-atlas is an independent, clean-room reimplementation with no code
dependency on yurukusa's packages, and isn't affiliated with or endorsed
by yurukusa.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev -- menu   # run the CLI from source via tsx, no build step
```

## Migrating from an individual `cc-*` package

See [MIGRATION.md](./MIGRATION.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
setup, code locations, and the pre-PR checklist before opening an issue or
pull request.

## Status

Actively developed. Core ingestion, the full analytics/menu/report surface,
and the team/goals/anomaly/export additions are solid and covered by tests
(unit, integration, and CLI-process). Known gaps are tracked explicitly in
[AUDIT.md](./AUDIT.md)'s "Documented gaps" section rather than left
silent — mostly narrower sub-metrics from the original packages that
weren't reproducible from the transcript format with confidence.

## License

MIT — see [LICENSE](./LICENSE).
