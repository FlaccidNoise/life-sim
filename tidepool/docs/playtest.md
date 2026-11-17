# Playtest: the owner checks of M3 and M4, in one sitting

This script replaces the owner checks of `findings/m3-exit.md` (nine) and `findings/m4-exit.md` (six, and
a pointer to the M3 nine). It also holds the M2 checks that M3 carried (`findings/m2-exit.md`, checks 1, 3, 4, 5) and the
owner checks at the end of `findings/m4-diet.md`. Every step was walked once in a browser on
2026-11-16, on the build of the `ship-slice` branch.

Each step has the same parts. **Do** says what to do. **Look** says where to look. **Answer** is the
question. Write each answer down word for word. An answer that you cannot give is a finding.

An agent cannot answer these questions. An agent can only make sure that each step shows what it says.

## Set-up

1. In `tidepool/`, run `make dev`. Open the address that it prints, with no `?` after it.
2. Use a port that you have not used before. A reused port can serve a stale page.
3. Keep the tab in front. A hidden tab stops the world.
4. Use a window of about 1300 by 700 pixels.
5. Keys: W A D or the arrows steer. A held pointer steers. C courts, Space dashes, and Esc leaves a creature. B opens the brain. G opens the guide.

## Where each old check went

| Old check | Step |
|---|---|
| M3 1, brain panel with no instructions | 3 |
| M3 2, the moment the brain takes over | 4 |
| M3 3, the sentence about the strongest path | 5 |
| M3 4, court a creature | 6 |
| M3 5 and M2 1, tell creatures apart by shape | 2 |
| M3 6 and M2 3, a creature with no eyes | 7 |
| M3 7 and M2 4, `/?bench` on a phone and a slower laptop | 14 |
| M3 8 and M2 5, the four felt judgments of `m1-feel.md` | 15 |
| M3 9, a person who has not seen the game | 16 |
| M4 1, see a hunt | 8 |
| M4 2, be hunted | 9 |
| M4 3, die by a bite | 10 |
| M4 4, hunt | 11 |
| M4 5, the first hunter | 12 |
| M4 6, the guide | 13 |
| M4 7, the M3 checks | all of the above |
| M4 diet check, three diets in one world, "eats flesh" on the card, the guide's line about a jaw | 6, 10, 11, 13 |

**Dropped, and why:**

- The Lunge button and the F key (M4 checks 2 and 4). The parts plan folded the lunge into the dash.
  A dash by a creature with a jaw is now a strike (`findings/m4-parts.md`). There is one button, Dash.
- `?world=/m2-world-long.tdpl` as the way to open the game (M3 5, M4 1). The page now opens on the baked world with no `?world=`.
- `?look` (M3 5). It is gone since 2026-10-15 (`findings/m3-shapes.md`).
- The scent patch edge, question 1 of `m1-feel.md`. The page draws no scent, so no player has an edge to follow.
  Step 15 asks the bump question of the same file in its place.

## The steps

### Open the world

1. **Do:** Open the address from set-up with no `?`.
   **Look:** The page loads the baked world with no wait. The tick starts near 36,000. A line says "Click any creature to become it."
   **Answer:** Does the world look alive in the first 5 seconds, with no instructions?

### M3 and M2: shapes, brain, mixing

2. **Do:** Turn the wheel over a crowd until single creatures fill a hand's width.
   **Look:** Outlines, tails, spines, and the jaw at the nose.
   **Answer:** Can you tell creatures apart by shape alone? Can you tell a fast one from a good turner?

3. **Do:** Click a creature with a full energy ring. Press B.
   **Look:** The brain panel. Its inputs are on the left, its outputs on the right, and it says "The brain drives."
   **Answer:** Does the panel make sense with no instructions? Write what you think each side means.

4. **Do:** Hold W for 2 seconds. Let go.
   **Look:** The panel says "You steer." while you hold the key. About half a second after you let go, it says "The brain drives."
   **Answer:** Can you see the moment when the brain takes over?

5. **Do:** Read the bold sentence under the graph. Watch the creature for 10 seconds with your hands off.
   **Look:** The sentence, for example "Always swims forward.", and the thrust and turn gauges on the right.
   **Answer:** Is the sentence true to what the creature does?

6. **Do:** Steer to another creature with a held pointer. Hold C when the Courting card shows.
   **Look:** The card. It lists length, width, parts, diet, hidden neurons, and connections for both. It also says why an exchange can or cannot happen.
   **Answer:** Do you know what the card compares? Do you know why it said yes or no?

7. **Do:** Press Esc. Click creatures one at a time until the brain panel has no Eye row and the world has no cone.
   **Look:** About one creature in nine has no eye. The world outside a circle around it is dimmed.
   **Answer:** Is the dimmed world fair, or only annoying?

### M4: hunts, deaths, diets

8. **Do:** Press Esc. In Watch, zoom in on a crowd and wait. If you see no bite in 2 minutes, open `/?world=m2-world-long.tdpl`.
   **Look:** The jaw shuts on a bite. The bitten creature flashes red. A kill leaves a pale ring on the killer and a dull fleck of debris.
   **Answer:** Can you see who bit whom? Many creatures carry jaws, also plant eaters. Does a jaw tell you who hunts?

9. **Do:** Click a small creature next to a bigger one with a jaw. Keep your hands off for 1 minute. If it lives, press Space.
   **Look:** The energy ring flashes on the side of each hit. The Dash button counts down after a dash.
   **Answer:** Is it frightening? Is the cause of each hit always shown?

10. **Do:** Let a creature be eaten. Read the card.
    **Look:** "Eaten." The killer is drawn with its jaw, its generation, and its swatch. Its diet reads "eats plants", "eats both", or "eats flesh". Under it are its brain at the kill, the strongest path in words, and the heirs.
    **Answer:** Does the card make sense with no instructions? Is the killer's diet what you expected?

11. **Do:** Click Keep watching. Take a creature that the Courting card calls "eats both" or "eats flesh". Hold W and press Space toward another creature.
    **Look:** A dash by a creature with a jaw is a strike. Watch the jaw.
    **Answer:** Can you catch something? Find a creature that eats plants, one that eats both, and one that eats flesh in this one world.

12. **Do:** Open `/?walk=reset`. Click a creature. Watch until a kill happens in view.
    **Look:** The first kill in view in a life rings the killer for 2 seconds. It rings the place for 1 second.
    **Answer:** Did you see a hunter before you were bitten? With `?debug` added, the button "Copy beat times" copies a log. Its `firstBite` is the seconds of hunter in view before the first bite, "bitten first", or "no hunter seen".

13. **Do:** Press G. Read chapters 1, 2, and 6. Press Esc.
    **Look:** Chapter 1 says what a jaw, a spike, and a shell plate do, and what a diet is. Chapter 2 says what the inputs, the triggers, and a strike are. Chapter 6 says that the first creatures have wired brains.
    **Answer:** Is every sentence true to what you saw? Does the line about a jaw make sense?

### Speed and feel

14. **Do:** Open `/?bench` on a phone and on a slower laptop. Wait for the line.
    **Look:** "N ticks per second at N creatures." and how long a 24,000-tick skip takes on this device. On a slow device the wait is about a minute.
    **Answer:** Write both lines. Does the skip time feel acceptable?

15. **Do:** Take a creature with a full ring. Do the four moves below.
    **Look:** Circle a plant with a held pointer. Turn at full speed with W and D. Let go of W and watch it coast. Hold W through a crowd.
    **Answer:**
    1. Can you circle a plant without overshooting?
    2. Does turning at full speed feel wide but fair?
    3. Does anything feel like ice?
    4. Do bumps in a crowd feel right?

### A person who has not seen the game

16. **Do:** Give a person who has not seen the game a laptop with `/?walk=reset`. Say nothing. Repeat on a phone.
    **Look:** Whether they take a creature, let go for 3 seconds, and say something that means "they are all alive".
    **Answer:** After 10 minutes, ask the four questions below. Write the answers word for word. Never ask "was that clear?".
    1. Why does your descendant look different from the creature you started as?
    2. Did your creature get better at finding food while you played it?
    3. How did these brains get their wiring?
    4. What is the score?

    Mark each answer as correct, purpose ("so it could"), one body changing ("it learned"), or designed ("I chose").
    The failure list and the 60-second test are in `findings/m3-walkthrough.md`, "The playtest, for the owner".

## Known limits of the walk

- A creature taken at random often starves in under a minute. The card then says "You starved." With no living heir it adds "Your line has ended." Click Keep watching. Take a fuller creature.
- The counter can read "Your line: 1 alive" when you take a creature. The creature came with a living descendant.
- No agent has played this on a real phone. Step 14 and step 16 on a phone are the owner's.
