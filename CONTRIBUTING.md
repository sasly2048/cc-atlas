# Contributing

## Setup

```bash
git clone https://github.com/sasly2048/cli-unified.git cc-atlas
cd cc-atlas
npm install
npm run dev -- menu   # run from source, no build step
```

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. Tests live in `test/unit` (pure functions, no I/O),
`test/integration` (SQLite + filesystem, using temp directories), and
`test/cli` (spawns the CLI via `tsx`, checks exit codes and stdout).

## Where things live

- **New analytics metric derived from existing session/tool_call/commit
  data?** Add a function to the relevant file in `src/analytics/` (or a new
  file if it doesn't fit an existing cluster) and a unit test in
  `test/unit/analytics.test.ts`. Analytics functions must be pure — data in,
  stats out, no filesystem or network access — so they're cheap to test.
- **New raw data to capture from transcripts?** Extend
  `src/types/domain.ts`, the schema in `src/db/schema.ts` (as a **new**
  numbered migration — never edit an existing one, see the comment at the
  top of that file), `src/db/repositories.ts`, and
  `src/services/transcript-parser.ts`.
- **New menu screen?** Add a render function to
  `src/commands/views/analytics-views.ts` (or `utility-views.ts` for
  non-analytics screens), wire it into the `MenuAction` union and
  `dispatch()` in `src/commands/menu.ts`.
- **New report format?** Add a renderer to `src/reports/` taking a
  `ReportData` (see `src/reports/data.ts`) and wire it into
  `runReportsMenu` in `src/commands/views/utility-views.ts`.
- **Something that doesn't fit the core toolkit?** Consider a plugin
  instead — see the Plugins section of [README.md](./README.md) and
  `src/plugins/types.ts`. AUDIT.md's "Documented gaps" section lists
  several good candidates (session work-mode classification, per-turn
  parallel-tool-call detection, skills-directory auditing, etc.).

## Code style

- No dead parameters — if a function argument isn't used, remove it rather
  than prefixing with `_` (lint enforces this for genuinely-required
  callback signatures only).
- Comments explain *why*, not *what* — see the top-level agent instructions
  this project was built under; the same bar applies to contributions.
- Keep `analytics/` functions free of `console.log`/UI concerns; that
  belongs in `commands/views/` or `reports/`.

## Changing the database schema

Migrations in `src/db/schema.ts` are append-only. If you need to change
existing data (not just add a table/column), add a new migration entry that
performs the transformation — don't edit a migration that's already been
released, since users' existing `~/.cc-atlas/toolkit.sqlite3` files will
have already run it.

## Adding a package to AUDIT.md

If yurukusa (or anyone) publishes a new single-purpose Claude Code analytics
package, add a row to the table in [AUDIT.md](./AUDIT.md) following the
existing format, classify it (Integrated / Merged / Excluded) with a
one-line reason, and update the totals table at the bottom.
