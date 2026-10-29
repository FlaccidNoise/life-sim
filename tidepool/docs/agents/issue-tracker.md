# Issue tracker: Beads

Tidepool tickets live in Beads. The database is at the repo root (`../.beads/`) and is shared with the draft in `/src`, so every Tidepool ticket carries the `tidepool` label, and every query filters on it. The `life-sim-` prefix is shared too. Use the `bd` CLI. It finds `../.beads/` from `tidepool/`. Add `--json` to any read command when you parse the output.

Plans stay in `docs/plans/`. A ticket points at its plan section, and doesn't copy it.

## Conventions

- **Create an issue**: `bd create "<title>" --body-file - --acceptance "<criteria>" -l tidepool,ready-for-agent --silent` with the body on stdin. `--silent` prints only the new ID, so capture it: `id=$(bd create ... --silent)`.
- **Read an issue**: `bd show <id> --json`.
- **List issues**: `bd list -l tidepool --json`, with `--status` filters.
- **Make an issue a child of a parent**: `bd create ... --parent <parent-id>`. A milestone or plan is an epic: `-t epic`.
- **Blocking**: native `blocks` edges. Add one at create time with `--deps <blocker-id>,<blocker-id>`, or later with `bd dep add <child-id> <blocker-id>`. A ticket is unblocked when every blocker is closed.
- **Frontier query**: `bd ready -l tidepool --json`. Scope it to one plan with `--parent <epic-id>`. Trust `bd ready`, not the `[READY]` tag in `bd dep tree`: the tree tags a blocked leaf as ready.
- **Show the graph**: `bd dep tree <id>`.
- **Claim**: `bd update <id> --claim`. It fails if someone else already claimed the issue.
- **Comment on an issue**: `bd update <id> --append-notes "..."`.
- **Close**: `bd close <id> --reason "<what was done, with the commit>" --suggest-next`.

## Gotchas

- On 2026-10-29 the database had a repo-ID mismatch, and bd warned it could delete issues during sync. `bd migrate --update-repo-id` fixed it. If the "DATABASE MISMATCH" warning comes back, stop and tell the user. Don't run `bd sync` past it.
- `.beads/issues.jsonl` is the durable copy and is committed. `.beads/*.db*` and `.beads/daemon.*` are local state.
- `bd` stamps every issue with `owner` = your git email, and `bd delete` writes a tombstone row instead of removing the line. Both land in the committed `.beads/issues.jsonl`. In a public repo, that publishes the email. Never test tracker commands on real tickets: `--ephemeral` issues don't show in `bd ready`, so test in a scratch repo instead.

## When a skill says "publish to the issue tracker"

Create a Beads issue as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic with **child** issues as tickets.

- **Map**: `bd create "<effort>" -t epic -l tidepool,wayfinder:map --body-file -`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `bd create ... --parent <map-id> -l tidepool,wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Frontier query**: `bd ready --parent <map-id> --json`, dropping any issue with an assignee.
- **Claim**: `bd update <id> --claim`, the session's first write.
- **Resolve**: `bd close <id> --reason "<answer>"`, then append a context pointer (gist + ID) to the map's Decisions-so-far with `bd update <map-id> --append-notes`.
