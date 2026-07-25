# Migration notes

If you're coming from one (or several) of the individual `cc-*` packages,
here's how to move to cc-atlas.

## 1. Find your feature in AUDIT.md

[AUDIT.md](./AUDIT.md) has a full table mapping every `cc-*` package name to
where it landed in cc-atlas's menu. Search the table for the package you used;
the "Where it landed" column tells you which menu screen (or CLI
subcommand) replaces it.

Quick reference for the most common ones:

| You used | Now use |
|---|---|
| `cc-session-stats`, `cc-session-length`, `cc-turns`, `cc-depth` | **Session Stats** menu |
| `cc-tool-mix`, `cc-toolbox`, `cc-mix`, `cc-pair`, `cc-ratio`, `cc-first`, `cc-last`, `cc-when`, `cc-flow`, `cc-sequence`, `cc-burst` | **Tool Usage** menu |
| `cc-streak`, `cc-recovery`, `cc-error`, `cc-fail` | **Streaks & Reliability** menu |
| `cc-burnout`, `cc-peak`, `cc-night-owl`, `cc-day-pattern`, `cc-shift`, `cc-gap`, `cc-momentum` | **Burnout & Wellness** menu |
| `cc-impact`, `cc-collab`, `cc-project-stats`, `cc-focus`, `cc-ghost-log` | **Git Activity** menu |
| `cc-calendar`, `cc-ai-heatmap` | **Heatmap** menu |
| `cc-save`, `cc-cache`, `cc-cost-forecast`, `cc-predict` | **Cost & Cache Savings** menu |
| `cc-edit`, `cc-read`, `cc-write`, `cc-grep`, `cc-cmds`, `cc-python`, `cc-bash-type`, `cc-lang`, `cc-file-churn`, `cc-reread`, `cc-delta` | **Content Analysis** menu |
| `cc-context-check`, `cc-compact`, `cc-think`, `cc-size` | **Context & Thinking** menu |
| `cc-human`, `cc-checkin`, `cc-ask`, `cc-subagent`, `cc-tasks`, `cc-todo`, `cc-plan`, `cc-web`, `cc-search`, `cc-fetch` | **Human/AI Collaboration** menu |
| `cc-personality`, `cc-score`, `cc-achievements` | **Personality, Score & Achievements** menu |
| `cc-model` | **Model Usage** menu |
| `cc-model-selector` | **Model Selector** menu |
| `cc-daily-report`, `cc-weekly-report`, `cc-monthly`, `cc-standup`, `cc-receipt`, `cc-compare` | **Reports** menu / `cc-atlas report` |
| `cc-stats-badge` | `cc-atlas badge` |
| `cc-alert` | `cc-atlas alert` |
| `cc-live` | **Live monitor** menu |
| `cc-health-check` | `cc-atlas doctor` |

## 2. Uninstall the old packages

```bash
npm uninstall -g cc-session-stats cc-tool-mix cc-burnout   # ...etc.
```

cc-atlas doesn't depend on or shell out to any of them — it's a clean-room
reimplementation against the same transcript data, so there's no
interoperability requirement to keep the old ones installed.

## 3. Point cc-atlas at your data

No import step is needed — cc-atlas reads the same `~/.claude/projects/`
transcripts the old packages did. Just run:

```bash
cc-atlas sync
```

This ingests your full history into `~/.cc-atlas/toolkit.sqlite3` (an
incremental, resumable process — safe to re-run any time, including on a
cron schedule before `cc-atlas alert`).

## 4. Reconfigure git repos

If you used `cc-impact`, `cc-collab`, `cc-ghost-log`, or similar, they
likely read the current working directory's git history automatically.
cc-atlas requires repos to be added explicitly (Settings → git repos, or edit
`~/.cc-atlas/config.json` → `gitRepos: []`) — this is a deliberate change
so a background `cc-atlas sync` doesn't silently walk directories you didn't
ask it to.

## 5. Known behavior differences

- **Dollar amounts** (`cc-save`, `cc-cost-forecast`) use an illustrative
  blended rate rather than tracking Anthropic's actual per-model pricing —
  see [AUDIT.md](./AUDIT.md) and `src/analytics/cost.ts`. Treat as
  directional, not a substitute for your actual bill.
- **`cc-denied`** (bash commands your human said no to) is not reproduced —
  transcripts don't reliably distinguish a user-denied call from any other
  failed one. See AUDIT.md for the full reasoning.
- A few narrow sub-metrics (parallel tool calls per turn, session work-mode
  classification, per-session file footprint) aren't implemented yet — see
  "Documented gaps" in [AUDIT.md](./AUDIT.md). These are good first
  contributions or plugin candidates.

## 6. Something missing?

If a metric you relied on isn't listed above or in AUDIT.md, it may be one
of the packages classified **Excluded** (a different product entirely —
`cc-safe-setup`, `cc-hook-registry`, `review-ready`, `cc-tamagotchi`, etc.)
rather than merged. Those remain separately installable; cc-atlas doesn't
replace them because they're not usage-analytics tools. See
[CONTRIBUTING.md](./CONTRIBUTING.md) if you'd like to add a documented gap
as a plugin.
