---
description: Generate a Claude Code usage report for a period (day, week, or month).
argument-hint: "[day|week|month] [markdown|html|standup]"
disable-model-invocation: true
allowed-tools: Bash(cc-atlas *)
---

Parse `$ARGUMENTS` for an optional period (default `week`) and an optional
format (default `markdown`; also accepts `html` or `standup`). Run:

`cc-atlas report <period> --format <format>`

Then show the full output to the user.
