# Agent Instructions

## Two projects in this repo

- **`tidepool/`** is the active project: a ground-up rebuild as a game. It has its own `AGENTS.md`,
  toolchain, and pnpm root. For Tidepool work, read `tidepool/AGENTS.md` and work from `tidepool/`.
- **`src/`** is the first draft. Keep it working. Do not extend it unless asked.

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

When ending a work session, complete every step below. Work is not complete until `git push` succeeds.

1. **File issues for remaining work** - Create bd issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Push to remote**:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # must show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed and pushed
7. **Hand off** - Provide context for next session

Rules:
- Don't stop before pushing. That leaves work stranded locally.
- Don't say "ready to push when you are". Push it yourself.
- If push fails, resolve and retry until it succeeds

