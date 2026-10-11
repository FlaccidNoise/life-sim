# M1 feel: possess, steer, and let go

Date: 2026-10-10. Task 18 of `docs/plans/2026-10-10-m0-m1-first-swim.md`.

## Who measured this

An agent measured this, not a person. The agent sent synthetic key and pointer events to the page and
read numbers from `window.__tidepool` and from screenshots. An agent cannot feel a control. Each feel
question below has the numbers that bear on it. Each felt judgment says "not judged: needs a person".
The owner plays the game at the M1 exit and gives those judgments.

## Owner play check, 2026-10-11

The owner played the dev build on a MacBook with no instructions. Swimming and steering "felt good".
The owner did not answer the four questions below one by one, so each felt judgment still reads "not
judged". Scent is not drawn, so the first question cannot be judged by anyone yet.
`m1-exit.md` has the rest of that session.

## Setup

- Apple M4 Pro, Chrome, a 120 Hz display, the Vite dev server (not a production build).
- Window 1280 by 739 CSS pixels. Phone check at 390 by 844 with touch emulation.
- Motor parameters at their defaults. Task 18 changed none.
- The measured creature must not die during a run. So the runs set `basal`, `part_upkeep`,
  `neuron_upkeep`, `conn_upkeep`, and `move_cost` to 0 and `lifespan` to 24000 with
  `__tidepool.setParam`.
- The motor numbers also use `repel` 0, so that no other body pushes the measured one. See "Bumps".
- Key numbers come from a founder of length 11.8 units. Pointer numbers come from a founder of length
  10.7 units. "L" below is one body length of the measured creature.
- One tick is 50 ms.

## Input latency

`__tidepool.inputLatencyMs` is the median of the last 20 samples. One sample runs from the `keydown`
or `pointerdown` handler, while the brain drives, to the first animation frame that draws a simulation
frame made with the player's input.

| Run | Median |
|---|---|
| 20 key presses (W, A, D, and the arrow keys), final code | 33 ms |
| 20 key presses, an earlier run | 38 ms |
| 20 pointer presses, 150 CSS pixels from the body | 39 ms |

The limit in the plan is 120 ms. The page thus does not extrapolate the possessed creature.

How the page ends a sample: the frame header says that the input was manual in that tick
(`brainDriving` is false). The plan says to compare the pose with a brain-driven extrapolation. The
brain is noise until Task 15, so the pose differs from any extrapolation in every tick, and that
compare would end the sample too early. The header word is exact.

Not in the number: the time from the physical key to the event handler, and the time from the draw
call to light on the screen. A 60 Hz display was not measured.

Other times, from the same page:

- The instincts line hides 7 to 65 ms after a key goes down (median 38.5 ms, 20 presses).
- The instincts line returns 542 and 546 ms after the keys come up (2 reads), and 525 and 541 ms after
  a touch lifts (2 reads). The grace period is 500 ms.
- With W held, the drawn heading changes by 1 degree a median of 82 ms after A or D goes down (range 50
  to 92 ms, 10 presses). It changes by 5 degrees after 158 ms and by 15 degrees after 266 ms.

## The four feel questions

### Can you follow a scent patch edge?

The page does not draw scent, and the frame does not carry it. A player has no edge to see yet. So
this question has no direct measurement.

What was measured instead is how well the body holds a curved line. The pointer stayed on a circle, a
fixed distance ahead of the body, for 15 seconds.

| Circle radius | Pointer lead | Distance from the line | Speed |
|---|---|---|---|
| 100 units | 3 L | 0.22 L inside, steady | 1.16 units per tick |
| 40 units | 3 L | 0.52 L inside, steady | 1.05 units per tick |
| 40 units | 1.5 L | 0.11 L inside, steady | 0.57 units per tick |

The body cuts the corner by a constant amount. It does not weave: the smallest and the largest error
after the first 2 seconds differ by less than 0.09 L in each run.

Felt judgment: not judged: needs a person. It also needs scent on the screen.

### Can you circle a plant without overshooting?

With the pointer held on a fixed world point (a plant 10.5 L away, 25 seconds):

- The body reaches the point (closest 0.01 L), then drifts 0.33 L past it.
- It comes back to within 0.05 L about 7 seconds after it first arrived.
- For the last 5 seconds it stays 0.07 to 0.11 L from the point and turns 1.16 radians in all. It does
  not hold a circle around the point. It sits on it and turns slowly.

Four shorter runs to a point 2 L or 5 L away gave the same start: overshoot 0.15 L to 0.30 L. Those
runs ended after 8 seconds, before the body was back on the point. A point 5 L dead ahead is within
1 L after 39 ticks. A point 5 L behind is within 1 L after 80 ticks, and the body first moves 0.83 L
farther away while it turns.

With the keys, the smallest circle at full thrust (W and D) has a radius of 8.8 units, which is 0.75 L.
D alone turns the body in place at 0.067 radians per tick (94 ticks for a full turn), and it drifts
0.9 units in 2 seconds.

Felt judgment: not judged: needs a person.

### Does turning at full speed feel wide but fair?

W held to top speed (1.49 units per tick), then D added:

- Turn rate per tick: 0.030, 0.052, 0.069, 0.082, 0.091, 0.099, 0.104, 0.108, then 0.12 steady.
- 90 degrees takes 17 ticks (0.85 s). The body moves 1.63 L along its old heading in that time.
- 180 degrees takes 30 ticks (1.5 s). The U-turn is 1.79 L wide.
- In the steady turn the speed falls to 1.06 units per tick and the radius is 0.75 L.
- The body slips: its velocity points 22 degrees outside its heading in the steady turn.

Felt judgment: not judged: needs a person.

### Does anything feel like ice?

- Forward coast. After W comes up at 1.49 units per tick, the speed falls by 8 percent per tick. The
  body travels 0.82 L in the 10 ticks of the grace period. Then the brain drives again.
- Spin coast. After D comes up in a full-rate turn, the body turns 20.6 degrees more. 95 percent of
  that is done in 11 ticks.
- Slip in a turn: 22 degrees, as above.
- Spin-up: the turn rate takes about 8 ticks to reach 90 percent of its steady value.

Felt judgment: not judged: needs a person. The spin coast of 20.6 degrees is the number to try first.

## Bumps

With `repel` at its default of 0.2 and W held, the speed fell from 1.33 to 0.69 units per tick over 7
ticks, twice in 50 ticks. With `repel` at 0 there was no dip in 60 ticks. That is one run of each, and
the cause was not isolated. A person should hold W through a crowd and say how it feels.

## What the measurements changed on the page

- **Pointer on the body.** At first a pointer held on the body made it spin in place: 2.34 radians in
  2 seconds, within 0.03 L of the point. `steerToward` now fades the turn from full at half a body
  length to none at the centre. The numbers under "circle a plant" are after this change.
- **The glide.** `follow` zooms about the screen centre. A creature picked in the outer part of the
  screen left the screen during the zoom, left the frame, and the camera stopped. The page now zooms
  about the body and then slides it to the centre. After the change the body was off the screen for 0
  animation frames in a pick 553 CSS pixels from the centre.
- **A short tap.** A key that goes down and up inside one animation frame now takes over for the
  grace period. Before, the page did not see it.

## Not checked

- No person held the controls.
- A real phone and a real touch screen. The phone check used emulation and synthetic touch events.
- A 60 Hz display, a slow laptop, and a production build.
- Two fingers down in Play (pinch zoom while steering).
- Feel with a real brain. Until Task 15 the brain is noise, so "your instincts" swim at random.
