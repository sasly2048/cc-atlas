---
description: Ingest the latest Claude Code session transcripts and configured git history into cc-atlas's local database.
disable-model-invocation: true
allowed-tools: Bash(cc-atlas *)
---

Run `cc-atlas sync` and report its output to the user — files ingested,
sessions and tool calls upserted, and any git commits synced.
