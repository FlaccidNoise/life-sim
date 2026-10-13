# M3: inputs from parts, and the rule of brain upkeep

The readings of Tasks 5, 6, and 7 of `../plans/2026-10-13-m3-minds.md`. Each is a reading, not a
trial: no default was tuned here. One run per seed, one simulation at a time.

## Before the rules change (Task 5)

Date: 2026-10-13. Head: `19a2c19`, with Tasks 1, 2, 3, and 4 merged. Every M3 rule is off.

- `make check`: exit 0. 92 Vitest tests.
- `make gates`: exit 0. The six rows of `gate-health` and `gate-evolve` are the M2 rows of the plan's
  "The switch-on rule", digit for digit. They were also read after each merge: the same.
- Throughput, at 1,320 creatures, load average 7.4 to 8.0 (other agents were building):

| Reading | Native | WASM |
|---|---|---|
| The head of M2 (`7895cd5`), load 3.8 to 8.0 | 3,123 | 2,997 |
| After Task 1 (`c3ab801`), load 5.9 to 6.1 | 3,355 | 3,111 |
| After Tasks 1 to 4 (`19a2c19`), load 7.4 to 8.0 | 3,132 | 3,081 |

So the skeleton costs no throughput that these readings can see. They move by 7% between two runs
of the same code on this machine. The last row is the "before" of the throughput readings below.

What each merge was held to, beyond the rows: one rule broken by the orchestrator, to see a test
fail.

| Task | Break | Result |
|---|---|---|
| 1 | `cmd_accept` not saved | `a_world_with_a_donor_is_the_same_in_a_reload` fails |
| 2 | A split puts the old weight on the way in | Two split tests fail |
| 3 | `mix_swap` and `mix_foreign` change places | Two tests fail |
| 4 | `readBrain` reads the target of a connection from the wrong bits | **No test failed.** Fixed in `16e5d49`: the round-trip test names the founder's first wired connection |
