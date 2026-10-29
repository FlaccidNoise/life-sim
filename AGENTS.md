# Agent Instructions

## Two projects in this repo

- **`tidepool/`** is the active project: a ground-up rebuild as a game. It has its own `AGENTS.md`,
  toolchain, and pnpm root. For Tidepool work, read `tidepool/AGENTS.md` and work from `tidepool/`.
- **`src/`** is the first draft. Keep it working. Do not extend it unless asked.

## Issue tracking

Work is tracked in JTBug (`$BUG_URL`). Tidepool is group `tidepool`. The draft's backlog is group `lifesim-draft`: the Beads issues imported on 2026-10-29 as #816 to #1154. Each one carries a `beads:<old-id>` tag, so an old ID in a plan (`life-sim-tmvb`) is found with `bug_list` and the quoted phrase `q: '"beads:life-sim-tmvb"'` (quotes match exactly, bare words fuzzily). The MCP server is in `.mcp.json` (actor `claude-tidepool`). Commands: `tidepool/docs/agents/issue-tracker.md`.

## Session end

Commit at each task. Push only when the owner asks. The GitHub repo is public.
