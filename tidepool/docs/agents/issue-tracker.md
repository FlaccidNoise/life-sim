# Issue tracker: JTBug

Issues and specs for this repo live in JTBug, the owner's tracker on the tailnet (`$BUG_URL`, web UI at the same address). Tidepool's work is in group `tidepool`. The draft's imported Beads backlog is group `lifesim-draft`. Never mix the two. The MCP server is in the repo-root `.mcp.json`. Agents act as `claude-tidepool`. Source and design: `~/CodingProjects/jtBugTracking`.

## Access

- **MCP** (primary): the `jtbug` server in this repo's `.mcp.json`, with header `X-Actor: claude-tidepool`. Tools: `briefing`, `bug_list`, `bug_view`, `bug_create`, `bug_split`, and one `bug_<verb>` per verb below.
- **CLI** (fallback): `BUG_ACTOR=claude-tidepool node ~/CodingProjects/jtBugTracking/packages/cli/bin/bug.js <cmd>`.
- **REST** (the frontier only): `curl -s "$BUG_URL/api/bugs?group=tidepool&state=new&state=open&state=reopened&limit=200"`. Each bug carries `openBlockers`.
- If `$BUG_URL` doesn't answer, run `tailscale up` and retry. Don't fall back to local files.

## Conventions

- **Create an issue**: `bug_create` with `group: "tidepool"`, `kind` (`bug`, `task`, or `epic`), `priority` 1 to 4, and the body in `description`. Put acceptance criteria in the description under `## Acceptance`.
- **Read an issue**: `bug_view` with the number.
- **List issues**: `bug_list` with `group: "tidepool"` and a `state` filter. New issues start in state `new`.
- **Make an issue a child of a parent**: `parentId` on `bug_create`. A spec or plan is an `epic`.
- **Blocking**: `bug_depend` with `id` (the waiting bug) and `on` (the blocker). A blocker stops counting once it is closed. `dispatch` is refused while a blocker is open.
- **Frontier query**: the REST call above, keeping bugs with an empty `openBlockers` and no `assignee`. Scope it to one epic with `&parentId=<n>`.
- **Claim**: `bug_take`.
- **Comment on an issue**: `bug_comment`.
- **Close**: `bug_fix` with a note naming the commit, then `bug_close` with resolution `fixed`. `close fixed` works only from state `fixed`. The group's verification policy decides who may close.
- **Stuck**: `bug_block` with the reason. Never stop silently.
- Reference bugs as `#N` in commit messages.

## When a skill says "publish to the issue tracker"

Create a JTBug bug in group `tidepool` as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

Read it with `bug_view`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic with **child** bugs as tickets.

- **Map**: `bug_create` with `kind: "epic"` and tag `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `bug_create` with `parentId: <map>` and tag `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Frontier query**: the REST frontier with `&parentId=<map>`. First by importance wins.
- **Claim**: `bug_take`, the session's first write.
- **Resolve**: `bug_comment` with the answer, then `bug_fix` and `bug_close fixed`, then append a context pointer (gist + `#N`) to the map with `bug_comment`.
