# M3: the walkthrough, first version

Date: 2026-10-13. Plan: `../plans/2026-10-13-walkthrough.md`. Research:
`../research/onboarding.md`. Built in five tasks, each by one agent in its own worktree, each checked
by the orchestrator on `main` (the gates, and one rule broken to see a test fail).

**What this record claims:** each beat fires when its condition holds, each line is true of the code,
and no line gives a cause a purpose. **What it does not claim: that a new player understands.** No
person who had not seen the game has played it. That check is the owner's, and its script is at the
end of this file.

## What is built

| Part | Commit | What it is |
|---|---|---|
| The beat engine and the lines | `00ad248`, `17417c2` | A pure state machine (`src/app/walkthrough.ts`). One line of at most eight words at the foot of the screen, after the thing happened, with no OK button. A beat that is done never shows again, and one that is ignored twice retires. Kept in browser storage, and the game plays the same with none |
| The bud card and the first death | `b4028b5`, `b8765dd` | Parent and child side by side at a bud, each difference counted from the two frame records and the two brain readouts. The frame carries growth, so the card compares the length gene of a newborn. The first death of a lived life leads with the living line |
| The notes and the field guide | `a07d213`, `4745616` | A "?" on the brain panel, the wiring count, the bud card, the counter, and the death screen opens three sentences in place. "More" opens the field guide: six chapters and a glossary, with live readings from the player's own world |
| The integration pass | `6f0e20c`, `4bd6275` | One agent played whole first lives at 1280 by 800 and 390 by 844, and fixed what broke at the seams |

The lines, as they are at the head:

| Beat | Line | Armed when |
|---|---|---|
| 1 | "Click any creature to become it." | Watch. It always shows there, also to a player who has been here before |
| 2 | "Your instincts are steering. Move to take over." and how to move | 4 seconds in a body with no input |
| 3 | "Green is food." | The body's energy rose under the player's hands |
| 4 | "It swims without you. It has a brain." then a pulse on the Brain button | The body swam one length with the hands off |
| 6 | "Your hands and its brain disagree." | The panel is open and the player steers against the brain |
| 7 | "Wiring changed since you first looked: 0" in the panel | The panel was open for 20 seconds. The count is from live data |
| 8a | "At the notch, a child buds." | The ring is half full, and the body has not budded |
| 8b | The bud card, for the first two buds. Then "You budded a child." | A bud |
| 9 | "The only score: your line, alive." with a pulse on the counter | The second bud, with the counter at 2 or more |
| 12 | "You are gone. Your line is not." on the death screen | The first death of a life of 20 seconds or more, with an heir |
| | "That one is starving. Pick another." | A click in Watch on a body under a quarter of a full store. It is not taken |
| | "You are starving. Find a plant." | The body is under a quarter of a full store |

Beat 10 (the mate, `court` in `src/app/walkthrough.ts`) was added with Task 13 of the M3 plan. Beat 5 is the pulse of beat 4 and the panel.

## How the words are held to the truth

- `tests/words.test.ts`: every string under `src/ui/words/` and every phrase of the brain sentence.
  A line has at most eight words. No string may say "in order to", "so that", "wants", "needs",
  "tries", "learned", and the like. Two sentences are allowed by name, with the reason: "It does not
  learn." and "The first creatures have brains wired by hand so that they can feed." (the purpose is
  that of the people who wrote the starter brain).
- `tests/guide.test.ts`: no number is typed in the guide. The caps (12 part genes, 96 neurons, 384
  connections, 5 heirs) are read from the Rust source by the test. The chances of chapter 3 are read
  from the parameters of the running world. What the guide says of mixing is pinned to the Rust
  source (`tests/guide.test.ts`, "what the guide says of mixing is what the code does"): `cross(` in
  `repro.rs`, `cmd_accept`, `growth`, and `MIX_RATE` in `mate.rs`, and the range of `mix_rate`. The
  outputs are still pinned as thrust, turn, accept. Until mating was built the pins said that no birth
  uses crossover and no rule reads `accept`.
- The orchestrator read every sentence of the notes and the guide against the core and changed two:
  a fin "steers" a body, since it does nothing at rest, and a blind world lost "much" of its sense,
  not "most", since one seed kept 0.24.
- Chapter 5 says what the findings say: "this world has not shown that sensing pays".

## What the integration pass found

Each part had passed its own tests. Played together, at laptop and phone size:

| Found | State |
|---|---|
| A click could hand a new player a body one tick from starving. A first life lasted 0.1 seconds and a second 4.2 | Fixed: a body under a quarter of a full store is not taken, and a line says why |
| The first-death screen came before the player had seen their body | Fixed: it waits for a life of 400 ticks (20 seconds) |
| "You are starving. Find green." on a screen with nothing green, since the world outside the eye cone is drawn grey | Fixed in the words. The grey is the owner's open M2 check and was not touched |
| A fed body buds every 10 seconds, and the card was up 42 of 70 seconds | Fixed: the card for the first two buds, then one line. The last card is in chapter 3 of the guide |
| After an heir pick the counter read "Descendants alive: 1" for the new body's parent | Fixed: "Your line: {n} alive", and every string that said "descendants" was read against `control.rs` |
| "The only score" fired on a death off the screen, once with the counter at 0 | Fixed: the second bud only, with the counter at 2 or more |
| `Esc` with a note open threw the player out of the body | Fixed |
| A line could start under the open guide and be marked done unseen | Fixed |
| The guide hid a death until it closed | Fixed: a death closes the guide and the notes, and the death screen takes focus |
| Four overlaps at 390 pixels wide | Fixed in CSS, measured in the browser, with no unit test |

No error or warning in the console at any point.

## What is still wrong or not checked

1. **Old age is not guarded.** A new player can take a body that dies of old age in 90 seconds with
   no sign of age on the screen. *Done (`45eeae5`): the frame carries age, and a click on a body in the last tenth of its life is
   refused.*
2. **Nothing in Watch shows which bodies are starving,** so a player can be refused twice without
   knowing why "that one". A body's colour dims with its energy, and no new player knows that.
3. **A life with the hands off still starves in under a minute,** even after three buds. That is the
   world, not the walkthrough: half of all newborns starve as juveniles (`juv_starved` 0.52).
4. **The counter can read 1 the moment a first body is taken,** because the body came with living
   descendants and the game marks them.
5. "Continue as a descendant." is false in one case: a body that the player left alive and is
   offered later as an heir.
6. At 390 pixels, at the top edge of the world, the camera cannot move further and the body sits
   under the card and the counter.
7. A bud's line can cut into another line for 3 seconds.
8. The sketch on the bud card ignores `?look`.
9. **Not checked at all:** a real phone (touch was emulated), a screen reader, Firefox or Safari,
   blocked storage in a real browser, a wiring count above 0, a brood of more than one child seen in
   play, and the "At the notch" line in the first pass (it showed in the second, at 26.9 seconds).
10. One observation not explained: an early agent saw 0, 0, and 13 nudged weights among about 50
    children. The core is right (20,000 mutations of a founder: mean 6.01 of 60, none in 0.15% of
    births, 13 or more in 0.6%), and the page pairs the two brains by uid.

## A first life, timed

From the second pass at 1280 by 800, seconds since the page loaded with `?walk=reset`:

| Second | What appeared |
|---|---|
| 0.2 | "Click any creature to become it." |
| 9.1 | A click on a body at 0.20 of a full store: "That one is starving. Pick another." |
| 12.7 | Took a body at 0.61. "Your line: 0 alive" |
| 16.9 | "Green is food." |
| 26.9 | "At the notch, a child buds." |
| 37.4, 61.6 | The first and the second bud card |
| 67.7 | "The only score: your line, alive." with the counter at 3 |
| 84.6 | The third bud: one line, no card |
| 88.1 | "It swims without you. It has a brain." Then the pulse on the Brain button at 94.1 |
| 124.7 | "Your hands and its brain disagree." |
| 142.8 | "Wiring changed since you first looked: 0" |
| 154.9 | Death after 142 seconds: "You are gone. Your line is not.", 2 heirs, focus on the first |
| 178 | The heir is picked. "Your line: 1 alive" |

In the first pass a fast player had done beats 1 to 4 by second 20.8. In this one the player fed and
budded before letting go, so beat 4 came at second 88. Both are inside the rules of the plan. The
60-second test of the roadmap is not a thing an agent can pass or fail: it needs a new person.

## The playtest, for the owner

From section 4 of the research. One person who has not seen the game, on a laptop and on a phone,
with no words from you. Open `/?walk=reset`. With `?debug` a button copies the times of each beat.

**The 60-second test.** Pass: inside 60 seconds they have taken a creature, let go for 3 seconds, and
said without being asked something that means "they are all alive" or "it thinks for itself".

**After 10 minutes, four open questions.** Write the answers down word for word. Never ask "was that
clear?": players say yes and then cannot explain.

1. "Why does your descendant look different from the creature you started as?"
2. "Did your creature get better at finding food while you played it?"
3. "How did these brains get their wiring?"
4. "What is the score?"

Mark each answer as one of: correct, purpose ("so it could", "it needed"), one body changing ("it
adapted", "it learned"), or designed ("I chose", "the game gave").

**What counts as failure:**

- They read a line aloud and do not act on it.
- They stop moving to read.
- They do not let go inside 60 seconds.
- They do not open the brain in the first life.
- They leave at the first death, or call it "game over".
- After 10 minutes they say "it learned", "it evolved an eye so it could see", or "I designed it".
- A person who knows neural networks is slowed by a note, or cannot find the true account of the
  brain inside a minute of looking.

## Screenshots

In `img/`: `m3-walk-3.png`, `m3-walk-4.png`, `m3-walk-7.png`, `m3-walk-9.png` (the lines of those
beats, from the first build, with the old wording of the counter), `m3-walk-bud.png`,
`m3-walk-bud-narrow.png`, `m3-walk-death.png`, `m3-guide-brain.png`, `m3-guide-evolution.png`,
`m3-guide-note.png`, `m3-guide-narrow.png`, and the files of the pass, `m3-pass-*.png`.
