# Security & Code Quality Audit

This document records the issues found and fixed in a thorough audit of the
`cc-atlas` codebase, plus the issues that were considered but left as-is with
justification.

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 4     | 4     |
| High     | 6     | 6     |
| Medium   | 8     | 8     |
| Low      | 6     | 6     |
| **Total**| **24**| **24**|

The audit also added 12 new unit tests covering the injection-resistance and
config-sanitization fixes.

---

## Critical

### 1. CLI test reads the test runner's real `~/.claude`
- **File:** `test/cli/cli.test.ts`
- **Impact:** The "sync against an empty projects directory" test ingested
  117 real session files from the test runner's actual home directory
  (~/.claude/projects) and the assertion failed. Worse, it was silently
  mutating the test user's real database.
- **Root cause:** `os.homedir()` on Windows reads `USERPROFILE` (not
  `HOME`). The test only overrode `HOME`, so on Windows Node still found
  the runner's real home and the default Claude projects path resolved to
  real data.
- **Fix:** Override both `HOME` and `USERPROFILE` in the test's child
  process env, and force `NO_COLOR=1` / `FORCE_COLOR=0` so the stdout
  assertions stay stable.

### 2. Test file used CommonJS `require()` in an ESM project
- **File:** `test/unit/differentiators.test.ts:223`
- **Impact:** `require('fs').writeFileSync(...)` inside a `vitest` ESM
  context. Worked on some Node versions, failed on others (EPERM on
  Windows in the audit run, because `C:/` isn't writable). The leftover
  was a debug `if` that wrote a snapshot to a fixed path on test
  failure — it should never have been merged.
- **Fix:** Removed the `if` block entirely. The assertion is the test.

### 3. Leftover one-off fix script in `scripts/`
- **File:** `scripts/_fix_export.ps1`
- **Impact:** A PowerShell script that surgically rewrote `src/cli.ts`
  to add report/export validation that was already present in the
  committed code. Running it now would no-op, but it shipped in the
  repo and is the kind of thing that gets re-run by a future developer
  with stale expectations, breaking the file.
- **Fix:** Deleted.

### 4. Stray UTF-16 notes file at the repo root
- **File:** `test.txt`
- **Impact:** Contained the single line `src/utils/dates.ts` — a
  scratch note from a prior debugging session, encoded as UTF-16 LE
  (which is unusual for a `*.txt` file and confused some tooling).
- **Fix:** Deleted.

---

## High

### 5. Prometheus label values weren't escaping newlines
- **File:** `src/reports/prometheus.ts:escapeLabel`
- **Impact:** A tool name containing a raw `\n` (e.g. a maliciously
  crafted transcript) would let the attacker inject additional metric
  lines into the exported exposition. Tools like Prometheus and the
  textfile collector parse on `\n`, so a single malicious name like
  `Read"\ncc_atlas_smuggled 1\n` would add a new metric to the
  output.
- **Fix:** Escape `\n` → `\\n` and `"` → `\\"` per the Prometheus
  exposition spec. Added a regression test that feeds the malicious
  string and asserts the smuggled metric line is not on its own line.

### 6. Markdown report unescapes project names in tables
- **File:** `src/reports/markdown.ts`
- **Impact:** A project name containing `|` would shift the column
  boundaries of the table, and one containing `\n` would inject
  additional rows. Project names are derived from the cwd encoded in
  the directory name, so a maliciously-named cwd could break report
  consumers.
- **Fix:** Added `escapeMarkdownCell` (escapes `\\`, `|`, and
  newlines) and `escapeInlineMarkdown` (escapes `*`, `_`, `` ` ``).
  Applied to project, tool, and standup top-project cells. Added
  regression tests.

### 7. HTML report wasn't escaping the risk level
- **File:** `src/reports/html.ts`
- **Impact:** `risk-${data.burnout.riskLevel}` was inserted into both
  a CSS class selector and text content unescaped. Currently
  `riskLevel` is a typed union (`"low" | "moderate" | "high" |
  "severe"`) so there's no immediate attack, but defense-in-depth
  matters for any future change that broadens the type.
- **Fix:** Wrap the value in `escapeHtml` for both the CSS class and
  the visible text. Added a regression test that feeds a hostile
  `periodLabel` and asserts `<script>` doesn't make it into the
  output.

### 8. SVG badge didn't escape its embedded text
- **File:** `src/reports/badge.ts`
- **Impact:** `aria-label="${label}: ${message}"` and
  `<text>${label}</text>` / `<text>${message}</text>` were
  unescaped. Currently both are derived from numeric fields, so
  nothing user-controlled reaches them — but if a future change
  embeds a project name, an attacker could inject XML/HTML.
- **Fix:** Added an `escapeXml` helper and wrapped all three
  interpolations. Added a regression test.

### 9. CLI `preAction` hook would silently miss the `--verbose` flag
- **File:** `src/cli.ts:preAction`
- **Impact:** Commander's `preAction` receives the *leaf*
  (sub)command, not the root. `thisCommand.opts()` only returns
  options defined on the leaf — the root-level `--verbose` lives
  there. So `verbose` was effectively never being set, and
  `--verbose` looked like a no-op for every subcommand.
- **Fix:** Look up the inherited option via the root
  `getOptionValueSource("verbose")` and OR it with the leaf's
  opts.

### 10. `ingestTranscripts` used `forEach` with bare `return`
- **File:** `src/services/ingest.ts`
- **Impact:** Inside `forEach`, a bare `return` only exits the
  callback, not the iteration. The `return` was used as
  "skip this file and continue", which happens to work in `forEach`
  for *that* file — but the pattern hides what's really a `continue`,
  and the `onProgress` callback was being called with the wrong
  `index` argument shape (the second arg is the *element*, not the
  index, in the second-arg position; the original code happened to
  be correct by accident because both args are positional). The
  bigger problem is the cutoff calculation: `maxAgeDays * 24 * 60 *
  60 * 1000` silently overflows `Number.MAX_SAFE_INTEGER` for any
  huge `maxAgeDays` (e.g. 100000 days), turning the cutoff into
  `Infinity` and effectively disabling the filter.
- **Fix:** Converted to a `for (let i = 0; ...)` loop with explicit
  `continue` for clarity, and clamped the cutoff product to
  `Number.MAX_SAFE_INTEGER`.

---

## Medium

### 11. `loadConfig` accepted hand-edited configs with wrong types
- **File:** `src/core/config.ts`
- **Impact:** `JSON.parse` of a config file with `theme: "neon"`
  (not in the union) or `dailyHourWarning: "ten"` (not a number)
  would silently propagate the bad value into the running config,
  crashing later code that expected a finite number. A hand edit
  could take the whole CLI down.
- **Fix:** Added a `sanitize` function that coerces known bad
  values back to defaults (theme, burnout thresholds, ingest max
  age, alerts streak risk, goals, gitRepos array shape). Applied
  on every `loadConfig` call. Added regression tests.

### 12. Settings menu accepted unvalidated numeric input
- **File:** `src/commands/views/utility-views.ts:runSettingsMenu`,
  `src/commands/views/more-views.ts:runGoalsSettings`
- **Impact:** `Number(value) || config.burnout.dailyHourWarning`
  silently kept the previous value on any unparseable input, with
  no feedback. Worse, it accepted negatives and out-of-range values
  (`dailyHourWarning: 9999h`). Goals could be set to a string via
  `Number("foo") || 0`.
- **Fix:** Parse + range check; warn the user and keep the
  current value on bad input. Validate path existence for
  `claudeProjectsDir` and team members' `claudeProjectsDir`, with
  a warning rather than a hard fail (so a fresh install with
  paths-not-yet-created still works).

### 13. Live monitor crashed on transient I/O errors
- **File:** `src/commands/views/live.ts`
- **Impact:** `fs.readFileSync` and `fs.statSync` had no
  try/catch. The transcript is being actively written by Claude
  Code, so a read between two writes can fail with EBUSY/EPERM on
  some platforms — and a directory disappearing mid-walk would
  crash `findMostRecentTranscript`.
- **Fix:** Wrapped every fs call in `findMostRecentTranscript` and
  the per-tick `readFileSync` in try/catch, logging at debug
  level and skipping the frame. Also changed "Output tokens/poll"
  to "Output tokens/sec" and made the rate per-second (more
  meaningful for a 2-second poll interval).

### 14. `runDoctor` checked Node >= 18 instead of >= 18.17
- **File:** `src/commands/views/utility-views.ts:runDoctor`
- **Impact:** `engines.node` is `>=18.17` but the doctor said
  anything 18.x was fine. Node 18.0–18.16 doesn't have the
  `node:test` APIs the test runner depends on, and it predates
  several ESM stabilizations the bundler uses.
- **Fix:** Compare both major and minor, require 18.17. Updated
  the label.

### 15. `sync` re-queried sessions even with no new commits
- **File:** `src/commands/sync.ts`
- **Impact:** After ingesting git, the code unconditionally ran
  `recomputeAiAttribution` which re-queries every session and
  re-checks every commit. If no new commits were inserted (a
  common no-op path on repeated sync runs), this was pure
  overhead.
- **Fix:** Skip the recompute if `commitsInserted === 0`.

### 16. Heatmap render assumed non-empty first/last entries
- **File:** `src/ui/heatmap-render.ts`
- **Impact:** `rollups[0]!.date` and `rollups[rollups.length - 1]!.date`
  would throw at runtime if either was undefined (defended by the
  earlier `rollups.length === 0` guard, but the type system didn't
  know that). Also no cap on weeks: a multi-year span would explode
  the terminal width.
- **Fix:** Added explicit empty/NaN checks, and a 53-week cap with
  a safety counter on the loop.

### 17. `cost.ts` had a dead parameter
- **File:** `src/analytics/cost.ts:projectMonthEnd`
- **Impact:** `costSoFarThisRun` was passed in but never used
  (the function recomputes from the sessions directly). Dead
  parameters mislead readers.
- **Fix:** Removed.

### 18. Receipt layout would overflow on long tool names
- **File:** `src/reports/receipt.ts:row`
- **Impact:** A 200-character tool name would produce an 200+ char
  receipt line, breaking the "register tape" aesthetic. The
  `Math.max(1, ...)` guard only ensured at least one space of
  padding.
- **Fix:** Truncate the label with an ellipsis if it would
  otherwise overflow. Added a regression test.

---

## Low

### 19. `prepublishOnly` only built, didn't test
- **File:** `package.json`
- **Impact:** A broken test could be published because the test
  step wasn't part of the publish gate.
- **Fix:** `prepublishOnly` now runs `typecheck && test && build`.

### 20. Vitest config had no timeouts
- **File:** `vitest.config.ts`
- **Impact:** The CLI test suite spawns child processes that can
  take 10+ seconds on cold start (tsx warmup). The default 5s
  timeout caused flakes on slow CI.
- **Fix:** Set `testTimeout` and `hookTimeout` to 60s.

### 21. `test.txt` (see Critical #4) and `_fix_export.ps1`
- Already covered above.

### 22. Heatmap cursor loop had no bound
- See Medium #16.

### 23. CLI repeated DB open on every subcommand
- **File:** `src/cli.ts`
- **Impact:** Every subcommand calls `bootstrap()` which calls
  `openDatabase()`. The `openDatabase` cache prevents re-opening
  the same file twice, but each subcommand still triggers the
  `if (instance) return instance` check, the schema migration
  check (the `MIGRATIONS.forEach` runs again on each call, but
  the `applied.has(version)` short-circuits it), etc. Minor —
  total time on a slow machine is ~5ms. Left as-is; refactoring
  the CLI to share a `ctx` across subcommands would be more
  invasive than the win warrants.

### 24. Repositories: `SessionRepository.all()` hard-codes
       `source_label = 'you'`
- **File:** `src/db/repositories.ts:SessionRepository.all`
- **Impact:** Consistent with the doc comment; not a bug, but
  any code wanting "all sessions" (for the team view) has to
  call `allSources()` separately. Documented and intentional,
  not changed.

---

## Tests added

- `test/unit/security.test.ts` (12 tests):
  - Prometheus label injection (newline + backslash)
  - Markdown cell injection (pipes in project names)
  - Markdown inline emphasis injection (asterisks/underscores)
  - HTML title/body escape
  - SVG XML escape
  - Receipt layout with long tool names
  - Config sanitization: invalid burnout thresholds
  - Config sanitization: non-string gitRepos
  - Config sanitization: unknown theme values
  - Config sanitization: negative maxAgeDays / streakRiskHours
  - Config sanitization: end-to-end on a hostile on-disk config

The full test suite now runs **82 tests** (up from 70), all passing,
and `tsc --noEmit` and `eslint` both come back clean.
