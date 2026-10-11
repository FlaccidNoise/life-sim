# M1 exit record

Date: 2026-10-10. Task 20 of `docs/plans/2026-10-10-m0-m1-first-swim.md`. Written by the orchestrator of
the build.

## Verdict

**Everything a machine can check is met. The half of the exit that needs a person is not done.**

The roadmap's M1 exit has two halves:

1. "The world stays alive at 12,000 ticks on 3 seeds." **Met.** `gate-health` passes 3 of 3. A
   fresh-context audit reproduced the rows to the digit, and saw the same set pass on seeds 4 to 10 and
   at 36,000, 72,000, and 200,000 ticks (`m1-audit.md`).
2. "A stranger can swim, eat, bud, die, and continue as a descendant with no instructions." **Not
   shown.** The orchestrator played the production build with no query string and no dev tools, by
   synthetic input and screenshots. It swam, steered, and died. It did not bud and continue as a
   descendant in that session. See "Played as a stranger" below. This half is the owner's check.

## Gates

`make check` exits 0. `make gates` exits 0.

Health gate, the default world (1536 by 1024, 400 founder creatures, 1,200 founder plants), 12,000 ticks:

| Seed | `creatures` | `min_late` | `plants` | `births_late` | `max_gen` | `mean_chemo` | `parked` | `first_bud` |
|---|---|---|---|---|---|---|---|---|
| 1 | 1,477 | 778 | 1,682 | 1,544 | 11 | 0.57 | 0.00 | 1,527 |
| 2 | 1,373 | 958 | 1,471 | 1,470 | 12 | 0.50 | 0.00 | 1,483 |
| 3 | 1,148 | 669 | 1,504 | 1,165 | 11 | 0.53 | 0.00 | 1,638 |

Two defaults were tuned to get there, in 5 of the 12 trials allowed: `plant_growth` 0.005 to 0.02 and
`intake_rate` 0.04 to 0.08 (`m1-tuning.md`). The old defaults fail 0 of 3.

Throughput, the default world on seed 1 after 12,000 ticks of settling, a mean of 1,539 creatures over
the 2,000 timed ticks, Apple M4 Pro, orchestrator's reading with no other Tidepool work running:

| Reading | Ticks per second | Floor | A 24,000-tick skip |
|---|---|---|---|
| WASM in Node (the gate) | 3,757 | 2,400 | 6.4 s |
| Native | 4,381 | | 5.5 s |
| In the page (`?bench`, Chrome) | 3,961 and 4,004 | | 6.1 s and 6.0 s |

The audit read 3,771 to 3,862 in WASM. The margin over the floor is about 1.6 times. M1 has no eyes, and
the eye scan was the largest phase in the planning benchmark, so M2 will cost more.

Density, seed 1, tuned defaults (`m1-density.md`):

| Tick | Creatures | Plants | Nearest creature | Nearest plant | Nearest plant, body lengths | Within 2 lengths of a plant |
|---|---|---|---|---|---|---|
| 3,000 | 608 | 2,027 | 15.1 | 9.9 | 1.04 | 0.87 |
| 6,000 | 780 | 1,984 | 13.2 | 9.3 | 1.11 | 0.83 |
| 12,000 | 1,477 | 1,682 | 9.7 | 10.0 | 1.79 | 0.57 |

Page, Chrome on the reference machine, a 120 Hz display:

- 120 frames per second with the whole world in view and at scale 4, with about 400 to 900 creatures.
- 20.0 ticks per second.
- Input latency 33 to 39 ms, median of 20 presses, against a limit of 120 ms (`m1-feel.md`).
- The production bundle is 40 KB of page script, 5 KB of worker script, and a 194 KB `.wasm`, before
  compression.

## Played as a stranger

The orchestrator opened the production bundle with no query string and used only what the screen
showed. It is an agent, not a person. It drove the page with synthetic events and read screenshots. It
cannot say how the game feels. What follows is what happened and what a person with no instructions
would have to guess.

What happened:

- The page loaded and showed creatures gathered on green plant patches, with "Click any creature to
  become it."
- A click on a lone creature missed, because the creature had moved. A click into a crowd took a body.
  The camera zoomed in and the ring appeared.
- The arrow keys steered the body, and so did a held pointer. "Your instincts are steering. Move to take
  over." hid while the orchestrator steered and returned when it let go.
- The first body starved about 25 seconds after the click: "You starved. Your line has ended." It was
  pale when picked, which means it was nearly out of energy. Nothing on screen said so.
- "Keep watching" returned to Watch. A second, brighter body lived for more than a minute under its own
  brain. The orchestrator could not tell whether it budded.
- No session reached "continue as a descendant". That step is shown with default parameters only by a
  host test on the real core (`tests/host.test.ts`, "picking an heir resumes the world in that body"),
  and in a browser only with budding sped up through the dev handle.

What was confusing:

1. **How to move.** The hint said "Move to take over" and named no key. Fixed after this session: the
   hint now names the keys and the pointer.
2. **What the ring is, and what food is.** The ring is energy and the green blobs are food. Nothing says
   so. A pale body is a hungry body, and nothing says that either.
3. **How fast a body starves.** A full default body is empty in about 35 seconds of swimming with no
   food. A random pick is often a body that is nearly empty.
4. **Whether a bud happened.** A bud has no sound, no flash, and no count. The outline that marks the
   player's line is thin. The orchestrator never knew whether it had descendants until a death said no.
5. **The body at the edge of the screen.** The camera stays inside the world. A body near a world edge
   is drawn near the edge of the screen. One body sat half off the top of the screen, and creatures
   pile up along that wall.
6. **Leaving a body.** Only the Escape key did it, and nothing named the key. Fixed after this session:
   Play has a Leave button.
7. **A small window made larger.** The world stayed small until a zoom. Fixed after this session.

The audit adds one more that a person should check first: under its own brain, a picked creature has an
heir at its death in 26% to 36% of cases, and the median life after the pick is 63 to 92 seconds
(`m1-audit.md`, finding F5). The design asks for a life of 3 to 6 minutes when played well.

## After the audit

The audit (`m1-audit.md`) found 0 critical, 0 high, 5 medium, and 8 low findings. These were fixed
with no change to a simulation rule or parameter, and the state hashes did not change:

- The heir preview on the death overlay showed a stale frame, because a paused worker posted no frame
  when the camera moved. The worker now posts one. Checked in a browser: with the world paused at tick
  1,013, a zoom from scale 4 to the whole world redrew the frame from 31 creatures to 364 at the same
  tick.
- No test checked the movement cost or that mutation changes a gene. Both have a test now, and each
  test was seen to fail with its rule removed.
- Two proof rows in `gates.md` held output from an earlier build. Both proofs were run again.
- Play has a Leave button (44 CSS pixels high, top right), and the hint names the keys and the pointer.
- A window that was never zoomed fits the world again when it is resized. Checked in a browser: scale
  0.4 at 600 pixels wide, 0.72 after the window grew to 1,280, and a zoomed camera kept through a
  resize.
- A release that crosses a death no longer shows "That one is gone."
- Both benches take `--seed`. `gates.md` says that the throughput gate is a seed 1 reading.

Not fixed, on purpose: the five rule questions below, and the health gate's blind spot for the sense.

## Open problems

Sorted by who decides.

**The owner decides (each needs a rule change, so none was made in M1):**

1. **Bodies shrink to the smallest size the genes allow**, on 3 of 3 seeds: length 12 to about 6.1,
   width 0.5 to 0.31. Intake grows with length, upkeep with length times width, and nothing eats a
   small body. The health gate's `max_gen` band passes because of it. With body mutation off, `max_gen`
   is 8, 7, 8. M2 (Bodies) is where this is decided.
2. **Scent following thins the world.** With the sense on, the world holds 41% to 46% fewer creatures
   and 34% to 40% fewer plants at tick 36,000 than with it off. It levels off near 650 creatures at
   tick 200,000 and still passes the gate. Two numbers that might fix it were not tried
   (`bite_fraction`, `plant_seed_range`). 7 of the 12 tuning trials are unused.
3. **Who counts as an heir.** A child born before the player took the body is not an heir. A body the
   player took and left is one.
4. **The push between bodies ignores mass.** A newborn shoves an adult as hard as the adult shoves it.
   Read from the code, not measured.
5. **Brain upkeep is flat.** For the smallest newborn it is about three quarters of its resting cost.
   More than half of all newborns starve as juveniles.

**For the M2 plan:**

6. **A generation is about 2,200 ticks, not 800.** One 24,000-tick skip holds about 11 generations, not
   the 30 that the design assumed. One skip does move the population: body width and brain weight size
   moved more than 1 standard deviation on 3 of 3 seeds. The brain weight shift is no more than a
   random walk gives.
7. **The health gate cannot see whether the sense pays.** It passes 3 of 3 with the sense switched off.
8. **The throughput margin is 1.6 times the floor before eyes exist.** The motor's neighbour scan was
   58% of the tick in a crowded probe world.
9. **Tunable numbers outside the parameter table:** the gene ranges, the starter brain's three wired
   weights, `PARENT_RESERVE`, `GROW_FLOOR`. M2 rebuilds the body genes, so they were left.
10. **The throughput gate is a seed 1 reading.** On seeds 3 and 4 the settled world holds fewer than the
    1,200 creatures that the gate needs.

**Not proven yet:**

11. **CI has never run.** Nothing is pushed. Not confirmed: that the native build on x86-64 gives the
    hashes that the `.wasm` gives, and that a shared runner clears the CI floor of 800.
12. **No browser but Chrome, no real phone, no 60 Hz display, no real touch.**

## Owner checks

These need the owner and were not done by an agent:

1. Open `/?bench` on a phone and on a mid-range laptop. Record the two lines in `docs/gates.md` under
   "In-page bench". The line names the creature count that the reading was taken at.
2. Play for five minutes with no instructions. Say whether steering feels right, and answer the four
   questions in `m1-feel.md` that are marked "not judged: needs a person". Try the two numbers that the
   feel record flags first: the body turns about 20 degrees more after a turn key comes up, and a body
   that pushes through a crowd loses about half of its speed.
3. Say whether you could swim, eat, bud, die, and continue as a descendant.

## Owner play check, 2026-10-11

The owner played the dev build on a MacBook, with no instructions.

| Step | Result |
|---|---|
| Swim | Done. "It felt good." |
| Eat | Not reported |
| Bud | **Not done.** The owner did not see a bud and was not sure whether there was something to press |
| Die | Done |
| Continue as a descendant | **Not done.** No heir was offered |

**The first half of the M1 exit is not met.** A person swam and died and could not continue as a
descendant. The owner could not tell whether a bud needs an action. It needs none: a fed adult buds by
itself at `bud_at`. This is confusion 4 of "Played as a stranger" seen by a person, and it agrees with
the audit's 26% to 36% (finding F5). The M2 plan carries both: a bud that the player can see, and a
measured target for how often a death has an heir.

Still open: the `?bench` line from a phone and from a mid-range laptop, and the four felt judgments of
`m1-feel.md` one by one. The owner gave one judgment for steering as a whole: it felt good.
