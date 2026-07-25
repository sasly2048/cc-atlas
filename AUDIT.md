# Package Audit — the yurukusa npm ecosystem

This is the source-of-truth decision record for every package published under
[npmjs.com/~yurukusa](https://www.npmjs.com/~yurukusa) at the time cc-atlas was
built (116 packages, July 2026). Every package is classified as one of:

- **Integrated** — its functionality lives in cc-atlas, reachable from the
  interactive menu or a CLI subcommand.
- **Integrated (partial)** — the core idea is in cc-atlas, but a sub-metric the
  original package reported isn't reproduced (reason given per row).
- **Merged** — a literal or near-literal duplicate of another package in the
  list (see the huge number of `cc-x` / `@yurukusa/cc-x` scoped-and-unscoped
  republishes), folded into the one feature that covers it.
- **Excluded** — deliberately left out, with a reason. Nothing is missing by
  accident; every exclusion below is either out of this toolkit's domain, or
  relies on a signal that Claude Code's transcript format doesn't reliably
  provide.

## How to read this

The yurukusa catalog has three distinct shapes, which explains most of the
116-to-~15-menu-items compression:

1. **Literal duplicates.** Dozens of packages exist twice — once unscoped
   (`cc-foo`) and once scoped (`@yurukusa/cc-foo`) — with identical
   descriptions. These are the same package republished under two names, not
   two different tools. All scoped/unscoped pairs are merged into one.
2. **One-metric-per-package fan-out.** Most of the rest are single-purpose
   CLIs that each read the same underlying data — Claude Code's
   `~/.claude/projects/**/*.jsonl` session transcripts — and report one slice
   of it (first tool called, last tool called, tool pairs, tool trigrams,
   burst lengths, position-in-session bias, etc.). Because they share a data
   source, cc-atlas computes them together in one pass (see
   `src/analytics/tool-usage.ts`) and exposes them as one menu screen instead
   of N separate installs.
3. **A handful of genuinely different products.** `cc-safe-setup` (safety
   hooks), `cc-hook-registry`/`cc-hook-test` (hook tooling), `review-ready`/
   `review-ready-mcp` (pre-PR diff linting), and `cc-tamagotchi` (a novelty
   pet) don't share cc-atlas's "analyze my Claude Code usage" premise. These are
   excluded, not merged — bolting them onto this toolkit would blur what it
   does rather than unify it.

## Data-fidelity note

cc-atlas ingests Claude Code's own transcript format, not the yurukusa
packages' source code (most of the 116 packages don't publish source in a
form this session could vendor from). Every analytics module was
**reimplemented from the published package descriptions**, against a
best-effort reading of the transcript schema (see
`src/services/transcript-parser.ts`). A few original metrics depend on
signals the transcript format doesn't expose reliably or at all — those are
marked "Integrated (partial)" or "Excluded" with the specific gap named, not
silently dropped.

## The table

<!-- AUDIT_TABLE_START -->
| # | Package | Description | Decision | Where it landed |
|---|---|---|---|---|
| 1 | [`cc-safe-setup`](https://www.npmjs.com/package/cc-safe-setup) | One command to make Claude Code safe. 701 example hooks + 8 built-in. 56 CLI commands. Token consumption diagnosis. Works with Auto Mode. | Excluded | Different product surface (PreToolUse/PostToolUse safety hooks, 56 CLI commands for guardrails/config) — not usage analytics. Out of scope for this toolkit; install separately if you want hook-based safety guardrails. |
| 2 | [`cc-edit`](https://www.npmjs.com/package/cc-edit) | Which files does Claude Code edit most? Edit tool analysis — top files, extensions, growth ratio. | Integrated | Content Analysis — topEditedFiles |
| 3 | [`cc-fail`](https://www.npmjs.com/package/cc-fail) | See which tools fail most in your Claude Code sessions. Bash exit rates, WebFetch errors, permission denials and more. | Integrated | Streaks & Reliability — failureRateByTool |
| 4 | [`cc-health-check`](https://www.npmjs.com/package/cc-health-check) | CLI diagnostic for your Claude Code setup. 20 checks across 6 dimensions. | Integrated | Doctor command (`cc-atlas doctor`) |
| 5 | [`cc-peak`](https://www.npmjs.com/package/cc-peak) | Find your peak Claude Code hours. Hour-of-day heatmap, day-of-week breakdown, and personalized 'best window' recommendation. | Integrated | Burnout & Wellness — peakHours / bestWindow |
| 6 | [`cc-grep`](https://www.npmjs.com/package/cc-grep) | How does Claude Code search code? Grep tool analysis — output modes, file types, context usage. | Integrated | Content Analysis — topGrepPatterns |
| 7 | [`cc-live`](https://www.npmjs.com/package/cc-live) | Watch your active Claude Code session in real-time. Token usage, cache efficiency, burn rate, and cost estimate. Zero dependencies. | Integrated | Live session monitor |
| 8 | [`cc-read`](https://www.npmjs.com/package/cc-read) | Which files does Claude Code read most? Top files, extensions, and projects from session transcripts. | Integrated | Content Analysis — topReadFiles |
| 9 | [`cc-ghost-log`](https://www.npmjs.com/package/cc-ghost-log) | See what your AI did while you were gone. Shows git commits from Ghost Days — days AI ran Claude Code autonomously while you were offline. | Integrated | Git Activity — ghostDays |
| 10 | [`@yurukusa/cc-speed`](https://www.npmjs.com/package/cc-speed) | How fast does Claude Code actually work? Tool execution rate (tools/hour), pace tiers, and burst session analysis. | Integrated (partial) | Tool Usage — avgBurstLength approximates execution rate; distinct pace tiers not reproduced |
| 11 | [`cc-hook-registry`](https://www.npmjs.com/package/cc-hook-registry) | Search, browse, and install Claude Code hooks from the community. GitHub-based registry, no server needed. | Excluded | Community hook registry/installer — content distribution, not analytics. Different domain from cc-safe-setup's own ecosystem. |
| 12 | [`cc-context-check`](https://www.npmjs.com/package/cc-context-check) | See how full your Claude Code context window is — reads token usage from session transcripts | Integrated | Context & Thinking — avgMaxContextTokens / sizeTierCounts |
| 13 | [`@yurukusa/cc-warmup`](https://www.npmjs.com/package/cc-warmup) | Does Claude Code warm up or fade? Tool execution rate progression within sessions — early, mid, and late phase analysis. | Integrated (partial) | Tool Usage — positionBias approximates early/mid/late phase intuition; not a strict 3-phase classifier |
| 14 | [`cc-session-stats`](https://www.npmjs.com/package/cc-session-stats) | See how much time you actually spend with Claude Code. Session durations, daily patterns, health warnings. | Integrated | Session Stats |
| 15 | [`@yurukusa/cc-context`](https://www.npmjs.com/package/cc-context) | How does Claude's context window grow within a session? Context window usage analysis — size tiers, growth patterns, and compaction pressure. | Merged | Duplicate of cc-context-check → Context & Thinking |
| 16 | [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) | See how much of your Claude Code time is YOU vs AI autonomous subagents. | Integrated (partial) | Collaboration — subagentAdoptionRate/avgSubagentsPerSession; exact human-vs-AI time split not derivable from transcripts, approximated via subagent counts |
| 17 | [`cc-warmup`](https://www.npmjs.com/package/cc-warmup) | Does Claude Code warm up or fade? Tool execution rate progression within sessions — early, mid, and late phase analysis. | Merged | Duplicate of @yurukusa/cc-warmup |
| 18 | [`cc-predict`](https://www.npmjs.com/package/cc-predict) | Forecast your Claude Code usage — projected month-end hours, ghost days, and streak | Integrated | Dashboard/Forecast (hours+streak) and Cost & Cache (cost forecast) |
| 19 | [`cc-compare`](https://www.npmjs.com/package/cc-compare) | Compare two time periods of Claude Code activity — week over week, month over month | Integrated | Reports — compare |
| 20 | [`cc-audit-log`](https://www.npmjs.com/package/cc-audit-log) | See what your Claude Code actually did. Human-readable audit trail from session transcripts. | Excluded | Human-readable transcript dump — low incremental analytical value over reading transcripts directly; not a stats feature |
| 21 | [`@yurukusa/cc-session-stats`](https://www.npmjs.com/package/cc-session-stats) | See how much time you actually spend with Claude Code. Session durations, daily patterns, health warnings. | Merged | Duplicate of cc-session-stats |
| 22 | [`cc-skill-audit`](https://www.npmjs.com/package/cc-skill-audit) | Audit your Claude Code skills: token overhead, usage frequency, prune candidates | Excluded | Reads ~/.claude/skills/, a different data source than sessions/git this toolkit ingests. Documented as a good future plugin. |
| 23 | [`cc-personality`](https://www.npmjs.com/package/cc-personality) | Discover your Claude Code developer archetype. Diagnoses your coding style from real usage patterns. | Integrated | Personality, Score & Achievements — archetype |
| 24 | [`@yurukusa/cc-pulse`](https://www.npmjs.com/package/cc-pulse) | What's the rhythm of a Claude Code session? Intra-session timing gap distribution — instant bursts, quick cycles, deliberate pauses. | Integrated (partial) | Collaboration — medianMinutesBetweenCheckins approximates intra-session timing rhythm; full gap histogram not separately exposed |
| 25 | [`cc-python`](https://www.npmjs.com/package/cc-python) | How does Claude Code use Python? python3 call analysis — 3,790 calls, 55.9% inline one-liners, py_compile as quality gate. | Merged | Content Analysis — bashCommandTypes classifies python3 invocations generically rather than with a dedicated Python-specific breakdown |
| 26 | [`@yurukusa/cc-streak`](https://www.npmjs.com/package/cc-streak) | How long can Claude Code go without an error? Median 12 successful tool calls between errors. Longest streak: 829. Bash breaks 52% of streaks. | Merged | Duplicate of cc-streak |
| 27 | [`cc-bash-type`](https://www.npmjs.com/package/cc-bash-type) | Classify Claude Code Bash calls by intent — inspect vs execute vs git vs package vs network. See what kind of work your sessions actually do. | Integrated | Content Analysis — bashCommandTypes |
| 28 | [`@yurukusa/cc-first`](https://www.npmjs.com/package/cc-first) | Analyze which tools Claude Code reaches for first — opening patterns across your sessions | Integrated | Tool Usage — firstToolCounts |
| 29 | [`@yurukusa/cc-flow`](https://www.npmjs.com/package/cc-flow) | Tool transition analysis for Claude Code — what follows what in your sessions | Integrated | Tool Usage — topPairs |
| 30 | [`@yurukusa/cc-delta`](https://www.npmjs.com/package/cc-delta) | Analyze Claude Code edit sizes — surgical vs massive changes, expansion ratios, and file type breakdown across all your sessions | Integrated | Content Analysis — editSizeStats |
| 31 | [`cc-burst`](https://www.npmjs.com/package/cc-burst) | Analyze Claude Code tool burst patterns — how many consecutive calls does each tool make? | Integrated | Tool Usage — avgBurstLength |
| 32 | [`@yurukusa/cc-scope`](https://www.npmjs.com/package/cc-scope) | Measure the file footprint of each Claude Code session — how many unique files does Claude touch per session? | Excluded | Per-session distinct-file-footprint metric not separately tracked; documented gap / plugin candidate |
| 33 | [`cc-last`](https://www.npmjs.com/package/cc-last) | Analyze which tools Claude Code uses last — closing patterns across your sessions | Integrated | Tool Usage — lastToolCounts |
| 34 | [`cc-sequence`](https://www.npmjs.com/package/cc-sequence) | Analyze Claude Code 3-tool sequences (trigrams) — what follows what follows what? | Integrated | Tool Usage — topTrigrams |
| 35 | [`cc-night-owl`](https://www.npmjs.com/package/cc-night-owl) | When does Claude Code actually work? Hourly session distribution from ~/.claude logs. | Integrated | Burnout & Wellness — hourlyShift / lateNightSessionRate |
| 36 | [`cc-compact`](https://www.npmjs.com/package/cc-compact) | How often does Claude Code compact your context? Compaction frequency, pre-compaction token counts, and trigger types. | Integrated | Context & Thinking — compactionRate |
| 37 | [`@yurukusa/cc-think`](https://www.npmjs.com/package/cc-think) | How deeply does Claude Code think before acting? Thinking block frequency, depth distribution, and hidden reasoning volume. | Integrated | Context & Thinking — thinkingBlockRate |
| 38 | [`@yurukusa/cc-denied`](https://www.npmjs.com/package/cc-denied) | Every Bash command your human said NO to. 161 denials. 72% were pkill. One was rm. See what Claude Code tried to run that you stopped. | Excluded | Transcripts don't reliably distinguish a user-denied tool call from any other failed/errored call — no trustworthy signal to build on. See src/analytics/collaboration.ts. |
| 39 | [`@yurukusa/cc-mix`](https://www.npmjs.com/package/cc-mix) | Analyze session tool diversity in Claude Code — how many tools per session, and when is the toolset decided? | Merged | Duplicate of cc-mix |
| 40 | [`cc-arc`](https://www.npmjs.com/package/cc-arc) | Analyze how Claude Code sessions evolve across 3 phases — does the Explore→Code→Verify arc actually exist? | Excluded | Explore→Code→Verify 3-phase session classifier not implemented; documented plugin candidate |
| 41 | [`cc-toolbox`](https://www.npmjs.com/package/cc-toolbox) | How many distinct tools does Claude Code use per session? Breadth analysis across your sessions. | Integrated | Tool Usage — avgDistinctToolsPerSession |
| 42 | [`cc-turns`](https://www.npmjs.com/package/cc-turns) | Analyze user turn count per Claude Code session — fire-and-forget vs collaborative patterns, and how interventions correlate with tool usage | Integrated | Session Stats — fireAndForgetRate / avgUserTurns |
| 43 | [`@yurukusa/cc-multi`](https://www.npmjs.com/package/cc-multi) | Analyze parallel tool calls per turn in Claude Code sessions — how often does Claude call multiple tools at once? | Excluded | Parallel-tool-calls-per-turn requires grouping simultaneous tool_use blocks within one assistant turn; not tracked in v1, documented gap |
| 44 | [`cc-pair`](https://www.npmjs.com/package/cc-pair) | Analyze which Claude Code tools appear together in the same session — co-occurrence and affinity matrix | Integrated | Tool Usage — topPairs |
| 45 | [`@yurukusa/cc-ratio`](https://www.npmjs.com/package/cc-ratio) | Analyze tool usage ratios in Claude Code sessions — Read:Edit, Write:Edit, Bash:Grep and more | Merged | Duplicate of cc-ratio |
| 46 | [`cc-hook-test`](https://www.npmjs.com/package/cc-hook-test) | Test runner for Claude Code hooks. Auto-detects hook type and runs test cases. | Excluded | Same domain as cc-safe-setup/cc-hook-registry — hook development tooling, not analytics |
| 47 | [`@yurukusa/cc-when`](https://www.npmjs.com/package/cc-when) | Analyze when in a session each Claude Code tool appears — Glob is front-loaded, ExitPlanMode is back-loaded | Integrated | Tool Usage — positionBias |
| 48 | [`cc-reread`](https://www.npmjs.com/package/cc-reread) | Find files Claude Code reads over and over. Spot obsessive re-read patterns across your sessions. | Integrated | Content Analysis — mostRereadFiles |
| 49 | [`@yurukusa/cc-human`](https://www.npmjs.com/package/cc-human) | What does your human actually do during a Claude Code session? Pure-autonomous vs interactive, follow-up patterns, engagement split. | Integrated | Human/AI Collaboration — autonomyRate / pureAutonomousSessionRate |
| 50 | [`@yurukusa/cc-checkin`](https://www.npmjs.com/package/cc-checkin) | When does your human check in? Timing of user messages within Claude Code sessions — early supervisors vs long-trust autonomous runs. | Integrated | Human/AI Collaboration — avgUserCheckinsPerSession / medianMinutesBetweenCheckins |
| 51 | [`cc-file-churn`](https://www.npmjs.com/package/cc-file-churn) | Which files does Claude Code touch the most? Ranks files by Edit/Write/Read frequency across all sessions. | Integrated | Content Analysis — fileChurn |
| 52 | [`cc-recovery`](https://www.npmjs.com/package/cc-recovery) | How does Claude Code recover from errors? 99% self-recover rate. Track retry, investigate, fix, rollback, and pivot patterns across all your sessions. | Integrated | Streaks & Reliability — selfRecoveryRate |
| 53 | [`cc-save`](https://www.npmjs.com/package/cc-save) | How much money has Claude's prompt cache saved you? Cache savings analysis — the real dollar value of cache_read vs fresh input tokens. | Integrated | Cost & Cache Savings — cacheSavingsUsd |
| 54 | [`@yurukusa/cc-error`](https://www.npmjs.com/package/cc-error) | Which Claude Code tools fail most often? 54% of sessions hit at least one error. WebFetch fails 25% of the time. Track tool failure rates across all your sessions. | Merged | Duplicate of cc-error |
| 55 | [`cc-error`](https://www.npmjs.com/package/cc-error) | Which Claude Code tools fail most often? 54% of sessions hit at least one error. WebFetch fails 25% of the time. Track tool failure rates across all your sessions. | Integrated | Streaks & Reliability — failureRateByTool |
| 56 | [`@yurukusa/cc-cache`](https://www.npmjs.com/package/cc-cache) | How effective is Claude Code's prompt caching? Shows cache hit ratio and illustrative API cost savings. | Integrated | Cost & Cache Savings — cacheHitRatio |
| 57 | [`@yurukusa/cc-text`](https://www.npmjs.com/package/cc-text) | How much does Claude actually say? 73% of assistant turns produce no visible text. Measure silence rate, text length tiers, and thinking patterns. | Excluded | Distinguishing 'silent' assistant turns (tool-only, no visible text) from text-bearing ones isn't tracked at the block level in the current schema; documented gap |
| 58 | [`cc-size`](https://www.npmjs.com/package/cc-size) | How much conversation history have you accumulated? Total disk usage and growth rate of your Claude Code sessions. | Integrated | Context & Thinking — totalTranscriptTokens (proxy for transcript history size) |
| 59 | [`@yurukusa/cc-recovery`](https://www.npmjs.com/package/cc-recovery) | How does Claude Code recover from errors? 99% self-recover rate. Track retry, investigate, fix, rollback, and pivot patterns across all your sessions. | Merged | Duplicate of cc-recovery |
| 60 | [`cc-focus`](https://www.npmjs.com/package/cc-focus) | Are you spreading too thin across projects? Weekly project scatter trends for Claude Code sessions. | Integrated | Git Activity — weeklyProjectSpread |
| 61 | [`cc-daily-report`](https://www.npmjs.com/package/cc-daily-report) | AI activity report for your Claude Code Ghost Days. Shows what your AI did while you were offline. | Integrated | Reports — daily period |
| 62 | [`cc-burnout`](https://www.npmjs.com/package/cc-burnout) | Detect burnout risk from Claude Code usage patterns — before you hit the wall | Integrated | Burnout & Wellness — score/riskLevel |
| 63 | [`cc-gap`](https://www.npmjs.com/package/cc-gap) | How much time passes between your Claude Code sessions? Gap distribution and work rhythm analysis. | Integrated | Burnout & Wellness — gapHoursBetweenSessions |
| 64 | [`@yurukusa/cc-ask`](https://www.npmjs.com/package/cc-ask) | How often does Claude Code ask for help vs just doing things? Measure your autonomy rate from session transcripts. | Merged | Human/AI Collaboration — autonomyRate/pureAutonomousSessionRate covers the 'ask vs. just do it' framing |
| 65 | [`cc-session-length`](https://www.npmjs.com/package/cc-session-length) | How long are your Claude Code sessions? Duration distribution and analysis. | Merged | Session Stats — avgSessionMinutes/medianSessionMinutes/p90SessionMinutes |
| 66 | [`cc-checkin`](https://www.npmjs.com/package/cc-checkin) | When does your human check in? Timing of user messages within Claude Code sessions — early supervisors vs long-trust autonomous runs. | Merged | Duplicate of @yurukusa/cc-checkin |
| 67 | [`@yurukusa/cc-search`](https://www.npmjs.com/package/cc-search) | What does Claude Code search the web for? Topic breakdown and query explorer from session transcripts. | Integrated (partial) | Human/AI Collaboration — webSearchSessionRate; topic/query-text breakdown not implemented |
| 68 | [`cc-mode`](https://www.npmjs.com/package/cc-mode) | Classify your Claude Code sessions by work mode: EXECUTE, CODE, EXPLORE, READ, RESEARCH, PLAN | Excluded | EXECUTE/CODE/EXPLORE/READ/RESEARCH/PLAN session classifier not implemented; documented plugin candidate |
| 69 | [`@yurukusa/cc-mode`](https://www.npmjs.com/package/cc-mode) | Classify your Claude Code sessions by work mode: EXECUTE, CODE, EXPLORE, READ, RESEARCH, PLAN | Merged | Duplicate of cc-mode (both excluded together) |
| 70 | [`cc-mix`](https://www.npmjs.com/package/cc-mix) | Analyze session tool diversity in Claude Code — how many tools per session, and when is the toolset decided? | Integrated | Tool Usage — avgDistinctToolsPerSession |
| 71 | [`@yurukusa/cc-fetch`](https://www.npmjs.com/package/cc-fetch) | What sites does Claude Code browse? Domain breakdown from WebFetch calls in session transcripts. | Integrated (partial) | Human/AI Collaboration — webFetchSessionRate; domain breakdown not implemented |
| 72 | [`cc-denied`](https://www.npmjs.com/package/cc-denied) | Every Bash command your human said NO to. 161 denials. 72% were pkill. One was rm. See what Claude Code tried to run that you stopped. | Excluded | Duplicate of @yurukusa/cc-denied — same exclusion reasoning |
| 73 | [`@yurukusa/cc-plan`](https://www.npmjs.com/package/cc-plan) | How often does Claude Code use plan mode? Session adoption rate, plan cycles per session, and per-project breakdown. | Integrated | Human/AI Collaboration — planModeAdoptionRate / avgPlanCyclesPerSession |
| 74 | [`cc-model`](https://www.npmjs.com/package/cc-model) | Which Claude AI models power your sessions? Distribution and timeline of model usage. | Integrated | Model Usage — byModel / timeline |
| 75 | [`cc-ratio`](https://www.npmjs.com/package/cc-ratio) | Analyze tool usage ratios in Claude Code sessions — Read:Edit, Write:Edit, Bash:Grep and more | Integrated | Tool Usage — ratios (Read:Edit, Write:Edit, Bash:Grep) |
| 76 | [`cc-tamagotchi`](https://www.npmjs.com/package/cc-tamagotchi) | Your Claude Code AI pet - a tamagotchi driven by real session data | Excluded | Novelty pet UI driven by session data; playful but out of scope for a v1 productivity toolkit. Candidate for a future plugin/easter egg. |
| 77 | [`cc-lang`](https://www.npmjs.com/package/cc-lang) | See which programming languages Claude Code works with most — edits, new files, and ratios by language | Integrated | Content Analysis — languageBreakdown |
| 78 | [`cc-calendar`](https://www.npmjs.com/package/cc-calendar) | GitHub-style activity calendar for Claude Code. Shows YOU vs AI activity with Ghost Day detection. | Integrated | Heatmap |
| 79 | [`cc-multi`](https://www.npmjs.com/package/cc-multi) | Analyze parallel tool calls per turn in Claude Code sessions — how often does Claude call multiple tools at once? | Excluded | See @yurukusa/cc-multi — same gap, both excluded together |
| 80 | [`cc-write`](https://www.npmjs.com/package/cc-write) | What does Claude Code create? File types, sizes, and projects from Write tool calls. | Integrated | Content Analysis — topWrittenFiles |
| 81 | [`cc-tool-mix`](https://www.npmjs.com/package/cc-tool-mix) | See which tools Claude Code uses most in your sessions — break down by category and project. | Merged | Tool Usage — byTool/byCategory |
| 82 | [`cc-monthly`](https://www.npmjs.com/package/cc-monthly) | Monthly Claude Code activity report. Hours, sessions, commits, lines, Ghost Days, week-by-week breakdown in Markdown. | Integrated | Reports — monthly period |
| 83 | [`cc-collab`](https://www.npmjs.com/package/cc-collab) | Are you getting better at working with Claude Code? Weekly efficiency trends: commits per CC hour. | Integrated | Git Activity — weeklyCollabTrend |
| 84 | [`cc-ai-heatmap`](https://www.npmjs.com/package/cc-ai-heatmap) | GitHub-style AI activity heatmap from Claude Code proof-log files | Merged | Heatmap — ghost-day coloring |
| 85 | [`@yurukusa/cc-tools`](https://www.npmjs.com/package/cc-tools) | Which tools does your Claude Code AI call most? Distribution of tool usage across sessions. | Merged | Duplicate of Tool Usage byTool |
| 86 | [`cc-day-pattern`](https://www.npmjs.com/package/cc-day-pattern) | What day of the week do you actually code with Claude Code? Weekday heatmap: sessions, hours, and avg session length per day. | Merged | Burnout & Wellness — weekdayBreakdown, and Heatmap |
| 87 | [`cc-depth`](https://www.npmjs.com/package/cc-depth) | How many turns per Claude Code session? Distribution of conversation depth. | Merged | Session Stats — avgTurnsPerSession |
| 88 | [`review-ready`](https://www.npmjs.com/package/review-ready) | Pre-PR checklist that catches the small things before your reviewer does: debug statements, missing tests, secrets, TODO debt, and complexity spikes. | Excluded | Pre-PR static diff checklist (debug statements, secrets, TODOs, complexity) — a code-review tool, not Claude Code usage analytics. Entirely different product; not merged. |
| 89 | [`@yurukusa/cc-web`](https://www.npmjs.com/package/cc-web) | How often does Claude Code use web search? Session adoption rate, WebSearch vs WebFetch split, and per-project breakdown. | Merged | Human/AI Collaboration — webSearchSessionRate/webFetchSessionRate |
| 90 | [`cc-delta`](https://www.npmjs.com/package/cc-delta) | Analyze Claude Code edit sizes — surgical vs massive changes, expansion ratios, and file type breakdown across all your sessions | Merged | Duplicate of @yurukusa/cc-delta |
| 91 | [`cc-review-queue`](https://www.npmjs.com/package/cc-review-queue) | Show files changed by AI that need human review — reads activity-log.jsonl from Claude Code | Excluded | Reads a separate activity-log.jsonl hook-output format this toolkit doesn't ingest — different data source. Documented plugin candidate. |
| 92 | [`cc-momentum`](https://www.npmjs.com/package/cc-momentum) | Week-by-week Claude Code session trend — are you accelerating or declining? | Integrated | Burnout & Wellness — weeklyMomentum / momentumTrend |
| 93 | [`cc-shift`](https://www.npmjs.com/package/cc-shift) | Visualize when your AI worked throughout the day. Like a shift schedule, but for your AI. | Integrated | Burnout & Wellness — hourlyShift |
| 94 | [`cc-streak`](https://www.npmjs.com/package/cc-streak) | How long can Claude Code go without an error? Median 12 successful tool calls between errors. Longest streak: 829. Bash breaks 52% of streaks. | Integrated | Streaks & Reliability — longestStreak/medianStreak |
| 95 | [`cc-score`](https://www.npmjs.com/package/cc-score) | Your Claude Code AI Productivity Score — a single 0-100 number you can share | Integrated | Personality, Score & Achievements — productivityScore |
| 96 | [`review-ready-mcp`](https://www.npmjs.com/package/review-ready-mcp) | MCP server for Review Ready — run pre-PR checks (debug statements, secrets, TODO debt, complexity) from Claude | Excluded | MCP wrapper for review-ready — same exclusion reasoning, different product |
| 97 | [`cc-todo`](https://www.npmjs.com/package/cc-todo) | How does Claude Code manage tasks? TodoWrite analysis — completion rate, task counts, session patterns. | Integrated | Human/AI Collaboration — taskToolUsageRate |
| 98 | [`cc-cmds`](https://www.npmjs.com/package/cc-cmds) | What shell commands does Claude Code run most? Bash tool analysis — 54,636 calls, cat is #1 at 5,198 times. | Integrated | Content Analysis — topBashCommands |
| 99 | [`cc-standup`](https://www.npmjs.com/package/cc-standup) | AI-generated daily standup from Claude Code proof-log files | Integrated | Reports — standup |
| 100 | [`@yurukusa/cc-alert`](https://www.npmjs.com/package/cc-alert) | Streak risk notifier for Claude Code — cron-friendly warning before your streak dies | Integrated | Streak risk alert command (`cc-atlas alert`) |
| 101 | [`cc-achievements`](https://www.npmjs.com/package/cc-achievements) | Auto-detect your Claude Code milestones. 20 achievements from your ~/.claude folder. Browser only, zero installs. | Integrated | Personality, Score & Achievements — achievements |
| 102 | [`cc-project-stats`](https://www.npmjs.com/package/cc-project-stats) | Time spent per project in Claude Code — ranked by hours, you vs AI | Merged | Session Stats — byProject; the 'you vs AI hours' split isn't separately tracked (see cc-agent-load note) |
| 103 | [`cc-when`](https://www.npmjs.com/package/cc-when) | Analyze when in a session each Claude Code tool appears — Glob is front-loaded, ExitPlanMode is back-loaded | Merged | Duplicate of @yurukusa/cc-when |
| 104 | [`cc-output`](https://www.npmjs.com/package/cc-output) | See how much text Claude Code generated for you. Output tokens, words, pages, and novel equivalents across all sessions. | Excluded | Output tokens are already reported (Cost & Cache, Context); a words/pages-equivalent conversion is cosmetic and out of scope |
| 105 | [`cc-cost-forecast`](https://www.npmjs.com/package/cc-cost-forecast) | Project your Claude Code API cost to month-end | Integrated | Cost & Cache Savings — projectedMonthEndCostUsd |
| 106 | [`cc-subagent`](https://www.npmjs.com/package/cc-subagent) | How many subagents does your Claude Code spawn? Session count, adoption rate, and per-project breakdown. | Merged | Human/AI Collaboration — subagentAdoptionRate/avgSubagentsPerSession |
| 107 | [`cc-weekly-report`](https://www.npmjs.com/package/cc-weekly-report) | Generate a weekly AI activity report from Claude Code proof-log files. | Integrated | Reports — weekly period |
| 108 | [`@yurukusa/cc-bash`](https://www.npmjs.com/package/cc-bash) | See which shell commands Claude Code runs most. Find Bash calls that should use Read, Glob, or Grep instead. | Merged (partial) | Content Analysis — topBashCommands; the 'should have used Read/Glob/Grep instead' advisory isn't implemented |
| 109 | [`@yurukusa/cc-stats-badge`](https://www.npmjs.com/package/cc-stats-badge) | Generate a Claude Code stats badge for your GitHub README — streak, hours, autonomy ratio | Integrated | README badge generator (`cc-atlas badge`) |
| 110 | [`cc-model-selector`](https://www.npmjs.com/package/cc-model-selector) | Task complexity → Claude model recommendation for Claude Code users | Integrated | Model Selector (task complexity → recommendation) |
| 111 | [`@yurukusa/cc-tasks`](https://www.npmjs.com/package/cc-tasks) | How does Claude Code manage agent tasks? TaskCreate/Update/List analysis — 1,042 tasks, 97.2% completion rate. | Merged (partial) | Human/AI Collaboration — taskToolUsageRate; TaskCreate/TaskUpdate completion-rate detail not tracked |
| 112 | [`cc-think`](https://www.npmjs.com/package/cc-think) | How deeply does Claude Code think before acting? Thinking block frequency, depth distribution, and hidden reasoning volume. | Integrated | Context & Thinking — avgThinkingBlocksPerSession |
| 113 | [`@yurukusa/cc-mcp`](https://www.npmjs.com/package/cc-mcp) | MCP server for cc-toolkit — gives Claude real-time access to your Claude Code usage stats | Excluded | An MCP server exposing these stats back to Claude — a different transport/interface, not a CLI menu feature. Candidate for a future companion package. |
| 114 | [`cc-impact`](https://www.npmjs.com/package/cc-impact) | What did you actually build with Claude Code? Commits, lines added, files changed across all your git repos. | Integrated | Git Activity — totalCommits/totalInsertions/totalDeletions |
| 115 | [`cc-receipt`](https://www.npmjs.com/package/cc-receipt) | ASCII receipt of your AI's daily work from Claude Code proof-log. The AI never clocks out. | Integrated | Reports — receipt |
| 116 | [`cc-human`](https://www.npmjs.com/package/cc-human) | What does your human actually do during a Claude Code session? Pure-autonomous vs interactive, follow-up patterns, engagement split. | Merged | Duplicate of @yurukusa/cc-human |
<!-- AUDIT_TABLE_END -->

## Totals

| Decision | Count |
|---|---|
| Integrated | 65 |
| Integrated (partial) | 6 |
| Merged | 24 |
| Merged (partial) | 2 |
| Excluded | 19 |
| **Total** | **116** |

## Documented gaps and future plugin candidates

These didn't make it into v1 but are called out explicitly rather than
silently dropped — each is a reasonable target for a `src/plugins/`-style
extension:

- **Per-turn parallel tool call grouping** (`cc-multi`) — needs grouping
  simultaneous `tool_use` blocks within one assistant turn.
- **Session work-mode classifier** (`cc-mode`, `cc-arc`) — EXECUTE / CODE /
  EXPLORE / READ / RESEARCH / PLAN and 3-phase arc detection.
- **Per-session distinct file footprint** (`cc-scope`).
- **Skills directory audit** (`cc-skill-audit`) — different data source
  (`~/.claude/skills/`) than sessions/git.
- **`activity-log.jsonl` hook-output ingestion** (`cc-review-queue`) —
  different data source than the transcript files this toolkit reads.
- **MCP server exposing these stats back to Claude** (`cc-mcp`) — a
  different transport/interface (MCP tool calls, not a terminal menu).
- **Assistant silence-rate / text-length tiers** (`cc-text`) — needs
  per-block text-vs-tool-use classification not currently retained.
