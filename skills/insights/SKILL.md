---
description: Answer questions about the user's own Claude Code usage history — sessions, hours, streaks, error rate, burnout risk, cost/cache savings, most-used tools, and git commit activity — using the locally installed cc-atlas CLI. Use whenever the user asks about their Claude Code usage, productivity, burnout, streaks, cost, or activity history. Entirely local, no network calls.
allowed-tools: Bash(cc-atlas *)
---

# cc-atlas usage insights

`cc-atlas` is a bundled CLI that reads the user's local `~/.claude/projects`
session transcripts (and any git repos they've configured) into a local
SQLite database and computes usage analytics. Nothing leaves the machine —
no API calls, no telemetry.

## Workflow

1. Run `cc-atlas sync` first. It's safe and fast to re-run — incremental,
   only re-parsing transcript files that changed since the last sync.
2. For a specific question, prefer `cc-atlas ask "<question>"`. It
   understands a fixed vocabulary — hours, sessions, error rate, streak,
   burnout, most-used tool, cost, commits — optionally scoped to a project
   name and a period (today / this week / this month / all time). It is
   **pattern-matching, not a language model.** If it replies "I didn't
   recognize that one," fall back to `cc-atlas export --format json` and
   compute the answer yourself from the returned summary rather than
   guessing.
3. For a one-line snapshot (streak, hours today, burnout risk), use
   `cc-atlas status --json`.
4. For a fuller written report, use `cc-atlas report <day|week|month>
   --format markdown`.

## What this can't answer directly

Cross-project comparison, session replay, team activity, anomaly
detection, and goal tracking are interactive-only menu screens — they need
a real terminal to select options. If the user wants one of those, tell
them to run `cc-atlas` directly in their own terminal to open the menu.
Don't try to drive interactive prompts through a tool call.

## Be honest about the numbers

- Dollar figures use an illustrative blended rate, not Anthropic's actual
  per-model pricing — say so if you report a cost.
- If `cc-atlas sync` finds no session data yet, say that plainly rather
  than presenting a zero as a real answer.
