# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at `tidepool/`
- **`docs/decisions/INDEX.md`**: the decision log, one line per hard-to-reverse decision with a pointer to its reasoning. Read the entries that touch the area you are about to work in. This repo has no `docs/adr/`. Log a new decision as a line in the index, not as an ADR file.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single context:

```
tidepool/
├── GLOSSARY.md
└── docs/
    ├── decisions/INDEX.md   ← the decision log
    ├── design.md            ← what the game is
    └── architecture.md      ← how it is built
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts a logged decision, surface it explicitly rather than silently overriding:

> _Contradicts the 2026-10-09 decision (time-skip on death), but worth reopening because…_
