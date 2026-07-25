---
description: Export cc-atlas's computed stats as Prometheus metrics or a JSON summary.
argument-hint: "[prometheus|json]"
disable-model-invocation: true
allowed-tools: Bash(cc-atlas *)
---

Parse `$ARGUMENTS` for a format — `prometheus` (default) or `json`. Run:

`cc-atlas export --format <format>`

Show the result to the user, or write it to a file if they asked for one.
