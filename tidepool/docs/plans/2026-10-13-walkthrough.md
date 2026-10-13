# Tidepool — the walkthrough, first version

Status: **written 2026-10-13 by the orchestrator, from `../research/onboarding.md`. The owner asked
for the feature that day (`../decisions/INDEX.md`). The choices in the next section are provisional,
owner to confirm.**

**Goal:** A person who has never seen Tidepool plays it and, with no instructions from anyone, comes
to understand what is on the screen: a body with a brain of its own, a child that is a copy with
random changes, a line that goes on when a body dies, and brains that were made by copy, change, and
unequal survival, never by training. It is a game first. The teaching rides on play.

**What the owner asked for:** "a detailed tutorial and explanation of everything that's going on, a
complete and total walkthrough as an onboarding experience for new users", built on "research to find
good onboarding methods and award-winning methodologies", that works "as a game and simulation but
also an explanation of biology, evolution and neural nets and computer science".

**Read first:** `../../AGENTS.md`, `../research/onboarding.md` (sections 2, 3, and the table of
section 1.4), `../design.md` §6 and §13, `src/ui/App.tsx`, `src/ui/state.ts`, `src/ui/BrainPanel.tsx`,
`src/ui/brain/words.ts`, `src/app/main.ts`.

## What the research changes

| Finding | Checked | What this plan does |
|---|---|---|
| A tutorial raised play only where the mechanics were unfamiliar, and lowered the return rate in a simple browser game. Forced steps helped in no game (Andersen et al., CHI 2012, 45,000 players, randomized) | Primary read | No step for steering or eating. No step blocks play or pauses the world. Teaching goes to the three things that are unlike other games: letting go, the brain, and going on as a descendant |
| Play alone does not teach a concept. Guided discovery does (Alfieri et al. 2011) | Abstract only | Each beat is act first, then one true sentence at that moment |
| The two most frequent errors about evolution in popular media are "an individual evolves" (22%) and purpose (16%) (Ferguson et al. 2022) | Primary read | All change is shown at a birth. No line of the game gives a cause a purpose, and a test holds that |
| Biologists graded Spore as having no natural selection | Abstract only | The game says what the player's own choices are: selection by a chooser |
| Novices think a network keeps learning while in use, or was programmed (Marx et al. 2024, 5 students) | Abstract only | The brain panel counts the changes to the wiring since birth, from the live data: 0 |
| Only a fraction of readers touch optional interactive content (Distill review 2020) | Primary read for the review | Nothing needed for play lives only in a note |

No study was found of a game that puts a steered player inside a neuroevolution simulation. Every
learning result above comes from a neighbouring form. So this plan ends with a playtest, and the
playtest is the owner's.

## Choices, provisional until the owner confirms

The research left eight questions for the owner. The build takes these answers and logs them.

| # | Question | Taken | Why |
|---|---|---|---|
| 1 | Does the first death come too soon, at 3 to 6 minutes? | Keep the life as it is. The first death leads with the living descendants | A longer life is a rule change, and the death is the lesson of the game |
| 2 | One tap to guess before the time-skip? | Left to M5, with the skip | No skip exists yet |
| 3 | May the game say that the heir and mate choices are selection by a chooser? | Yes | It is true, and it guards against the reading that the player designs a creature |
| 4 | May the game say that the founders' brains were wired by hand? | Yes | It is true. "Claim only what was measured" |
| 5 | How are beats measured with no server? | Counters in the browser, copied from the debug page, and a playtest by the owner | No account, no server (`../design.md`) |
| 6 | Who is the check of understanding for? | A general visitor. A developer skips the notes at no cost | The short notes must carry a person with no biology |
| 7 | A voice for two lines? | No | Not planned before M8 audio |
| 8 | A lint on the words of the game? | Yes, in `make check` | A rule that is not tested is not a rule |

One more, from the owner's words: the owner asked for "a complete and total walkthrough". Research
principle 11 says no manual. Both are met by **the field guide**: every note of the game in one
place, in reading order, reached from one button. It never opens by itself and nothing in play needs
it.

## The rules of every line

1. **Act first.** A line names what just happened. It never tells the player what to do next, but for
   the two lines that exist today ("Click any creature to become it", "Move to take over").
2. **At most eight words on the screen for a line.** A note has at most three sentences.
3. **No OK button.** A line leaves when the player acts or after 6 seconds.
4. **One new idea in a beat.**
5. **No purpose in a cause.** No line or note may say that a body or a brain changed "to", "so that",
   or "in order to" do a thing, or that it "wants", "needs", "tries", or "learned". A brain sentence
   says what a body senses and does. `tests/words.test.ts` holds this for every string of
   `src/ui/words/`. "It does not learn" is allowed by name, in the test.
6. **A beat that the player has done never shows again.** A beat that the player ignores twice
   retires. Both are kept in browser storage, and the game works the same when storage fails.
7. **The word "evolve" is on no button that acts on one body.**

## The beats of the first version

From section 3 of the research. Beat 10 waits for Task 13 of the M3 plan (the mate card). Beats 11
and 13 to 18 wait for their milestones.

| # | Armed when | The game shows | The idea | Done when |
|---|---|---|---|---|
| 1 | Watch mode | "Click any creature to become it." (today's line) | It was alive before you came | A body is possessed |
| 2 | Possessed, and no input for 4 seconds | Today's two lines on how to move | You are one of them | The body moved 3 lengths under the player's input |
| 3 | The body's energy rose while the player steered | "Green is food." | Energy is the one currency | Shown once |
| 4 | Beat 3 done, the controls released, the brain feeds or turns to food | "It swims without you. It has a brain." Then the Brain button pulses once | This body has a brain of its own | 3 seconds with no input while the brain drives |
| 5 | Beat 4 done | The pulse on the Brain button. In the panel the strongest path and its sentence (built) | Senses in, numbers along lines, thrust and turn out | The panel was open for 5 seconds |
| 6 | The panel is open and the player steers against the brain | "Your hands and its brain disagree." | The brain runs on every tick, also while you steer | The two marks differ by 0.5 for 1 second |
| 7 | The panel was open for 20 seconds | In the panel: "Wiring changed since birth: 0", counted from the live data | Nothing learns in a life. A weight is a gene | Shown. The note is optional |
| 8a | The ring is half full | "A full ring buds a child." | | Shown once |
| 8b | The body buds | The bud card for 6 seconds: parent and child side by side, each difference marked | A child is a copy with a few random changes | First bud |
| 9 | Two buds, or one descendant has died | "The only score: descendants alive." with a pulse on the counter | Success is descendants left, not size or speed | Shown once |
| 10 | A full-grown body is near (after Task 13) | The mate card of Task 13, and "Its brain decides, not a rule." | Two sets of genes can mix | One courtship, accepted or refused |
| 12 | The first death | The death screen leads with the living descendants: "You are gone. Your line is not." Then the cause | The individual ends. The line goes on | An heir is picked |

Beats 1 to 4 are the 60-second test of `../roadmap.md` M8. Nothing else may ask for attention in the
first minute.

## The notes and the field guide

A small mark, "?", sits on the thing a note explains: the brain panel, the changes line, the bud
card, the descendants counter, the death screen, and (after Task 13) the mate card. A tap opens the
note in place: three sentences, then "More", which opens the field guide at that entry.

The field guide is one panel, opened by a button beside Brain and by the key `G`. It holds every note
in reading order, as six short chapters, and a glossary. Drafts of the short notes are in section 3
of the research ("The deeper layer"). The chapters:

1. **A body.** Parts, mass, energy, upkeep. Why a part costs.
2. **A brain.** Inputs from parts, hidden neurons, three outputs. A weight, a bias, a sign, a loop. A
   slow neuron holds a trace, and that is this brain's only memory. It dies with the body.
3. **A child.** Budding. The kinds of mutation of a body and of a brain. Most changes do little.
4. **A line.** Descendants as the only score. Death, and going on as a descendant. Your pick of an
   heir is selection by a chooser, as a breeder does.
5. **Evolution, without a goal.** Variation first, then unequal survival. No body changes. A trait
   can be lost. What this world has not shown: `../findings/` says a blind world can hold more
   creatures than a seeing one.
6. **The machine.** A seeded, repeatable simulation. No training, no gradient: neuroevolution, and
   NEAT's history ids as the source of how two brains of different shape are mixed. The founders'
   brains were wired by hand. Caps on brain and part count, for speed.

The glossary: gene, mutation, selection, fitness, lineage, neuron, weight, time constant, recurrent,
crossover, history id, neuroevolution, seed. One sentence each.

A chapter may show a live reading from the player's own world next to its text (the brain panel's
own counts, the bud card of the last bud). It runs no second simulation in this version.

## Tasks

Each task is one agent in its own worktree, as in the M3 plan. TypeScript only, but for the one core
message of Task W2. Every task: tests first, `make check` exits 0, one rule broken to see a test
fail, no `any`, no `!` on a value that can be absent, no `console.log`.

### Task W1: the beat engine, the lines, and the lint (`coder`)

**Files:** create `src/app/walkthrough.ts`, `src/app/walkstore.ts`, `src/ui/words/lines.ts`,
`tests/walkthrough.test.ts`, `tests/words.test.ts`. Modify `src/app/main.ts`, `src/ui/App.tsx`,
`src/ui/state.ts`, `src/ui/BrainPanel.tsx` (the pulse on the button, the changes line), `index.html`.

```ts
// src/app/walkthrough.ts — pure. No DOM, no storage, no clock of its own.
export type BeatId =
  | 'possess' | 'move' | 'eat' | 'letGo' | 'openBrain' | 'disagree' | 'noChange'
  | 'halfRing' | 'bud' | 'score' | 'court' | 'firstDeath';
export interface Facts {           // one per frame, from what the page already knows
  mode: 'watch' | 'play'; manual: boolean; panelOpen: boolean; dead: boolean;
  energy01: number; lengthsMoved: number; buds: number; lineageAlive: number;
  split: number;                   // how far the player's mark is from the brain's, 0 to 2
}
export interface Walk { done: BeatId[]; shown: Partial<Record<BeatId, number>>; /* and timers */ }
export function step(walk: Walk, facts: Facts, dt: number): { walk: Walk; line: string | null; pulse: 'brain' | 'score' | null };
```

- `walkstore.ts` reads and writes `done` and `shown` in `localStorage`, each call in a `try`. With no
  storage the walk lives in memory.
- Every string of the walkthrough is in `src/ui/words/lines.ts`. `tests/words.test.ts` holds rules 2
  and 5 for every string under `src/ui/words/`, and fails with the string and the rule it broke.
- Today's hint "Green is food. Fill your ring and you will bud." is split into beats 3 and 8a.
- The changes line of beat 7 is counted in the panel: the weights and the wires of the first `brain`
  message of a uid against the latest one.
- A playtest log: the time of the first trigger of each beat, in storage. With `?debug` a button
  copies it as JSON.
- Tests: each beat arms and is done as the table says, a done beat never shows again, an ignored beat
  retires after two showings, no two lines show at once, and beats 1 to 4 can all be done inside 60
  seconds of facts.

### Task W2: the bud card and the first death (`coder`)

**Files:** create `src/ui/BudCard.tsx`, `src/app/kin.ts`, `tests/kin.test.ts`. Modify
`src/protocol.ts`, `src/worker/host.ts`, `tests/host.test.ts` (one message: `brainOf { uid }`, answered
by `brainOf { uid, words }`), `src/app/main.ts`, `src/ui/App.tsx`, `src/ui/state.ts`,
`src/ui/DeathOverlay.tsx`, `src/ui/words/lines.ts`, `index.html`.

- `kin.ts`: `childOf(prev, next, parentSlot)` finds the body that is new in the frame where `buds`
  rose, carries the lineage mark, and is nearest to the parent. `differences(parent, child)` gives
  the list that the card shows: length and width in percent, each part gained, lost, or resized, the
  count of hidden neurons and of connections, and from the two brain readouts the count of weights
  that differ and of wires gained or lost. A difference under 1% is not listed. An empty list reads
  "No change you can see." and that is a true and common case.
- The card stays 6 seconds, never blocks, and can be opened again from the field guide's chapter 3.
- The first death only: the overlay leads with the living descendants and the line of beat 12. From
  the second death it is as today.
- States first: no child found (no card, and the toast of today), a child that died before the card
  drew, and a `brainOf` answer of 0 words (the card shows the body differences alone).

### Task W3: the notes and the field guide (`coder-std`)

**Files:** create `src/ui/Guide.tsx`, `src/ui/Note.tsx`, `src/ui/words/notes.ts`,
`src/ui/words/guide.ts`, `tests/guide.test.ts`. Modify `src/ui/App.tsx`, `src/ui/state.ts`,
`src/app/main.ts`, `src/ui/BrainPanel.tsx`, `src/ui/BudCard.tsx`, `src/ui/DeathOverlay.tsx`,
`index.html`.

- A note is three sentences and a "More" link. The guide is six chapters and a glossary, as above.
  Every sentence is true of the code at the head: where the text gives a number (a cap, a rate), a
  test reads the number from the built module or from `params`, and fails when they differ.
- The guide opens with `G` and a button, closes with `Esc`, traps focus while open, and is a sheet on
  a narrow screen. The world keeps running behind it.
- Tests: each mark opens its note, "More" opens the guide at the right entry, every glossary word
  that a note uses is in the glossary, and `tests/words.test.ts` passes on the new files.

### Task W4: the mate beat (`coder-std`), after Task 13 of the M3 plan

Beat 10 and the note on the mate card. Files: `src/app/walkthrough.ts`, `src/ui/MateCard.tsx`,
`src/ui/words/*.ts`, their tests.

### Task W5: the look, the playtest script, and the record (orchestrator)

- A browser pass on a laptop width and a phone width: every beat reached, with screenshots in
  `docs/findings/img/` and the record in `docs/findings/m3-walkthrough.md`.
- The playtest script for the owner, from section 4 of the research: the 60-second test, the four
  open questions, how to code an answer, and what counts as failure.
- **The owner's check, never done by an agent:** play it with a person who has not seen the game.

## What this plan does not claim

That the walkthrough teaches. It claims that each beat fires when its condition holds, that each line
is true of the code, and that no line gives a cause a purpose. Whether a new player understands is
measured by the playtest of Task W5, and no agent can run it.
