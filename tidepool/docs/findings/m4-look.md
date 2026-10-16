# M4 Task 6 — The page draws teeth: what was seen

**Date:** 2026-10-16, by the orchestrator on the rebaked worlds at the final defaults (`271eb80`),
Chrome, 1280 by 800, `pnpm exec vite --port 5199`. The agent of Task 6 compiled the shaders and
pinned the instance rows in tests; nothing of the new kinds existed in a world before Task 9 and
the switch-on, so these are the first sightings.

## Seen

- **`img/m4-possessed-hunter.jpeg`**, the 36,000-tick world, a possessed juvenile hunter: the court
  card draws both bodies from their parts, with the jaw's two mandibles at the nose on both and a
  toxin gland bulb on the other; the Dash and Lunge buttons come from the body's parts; the vision
  cone; the dimmed world; and at the top right **the kill mark of beat 11**, a pale ring on a body
  that just killed in view.
- **`img/m4-lunge.jpeg`**, after one lunge: the lunge's cost starved the juvenile at once, so this is
  the no-killer death state on a live page ("You starved. Your line has ended."). Around it the
  look-4 bodies with the new kinds: mandibles at the nose on many, spines, a gland bulb.
- **`img/m4-death-card.jpeg`**, a real death by a bite in a founder world under `?debug` with
  `founder_jaw=0.5` and `bite_mass_ratio=0`: "Eaten.", the killer drawn with its jaw, its
  generation and swatch, its brain at the kill with `dash` and `lunge` among the outputs, and the
  path "Sees another body on the right. Lunges."; the heirs first, since it is a first death. Behind
  the card, bitten bodies flash red (`FLAG_HURT`).
- Debris flecks are drawn in the 36,000-tick world (515 pieces in it), dull and small, as designed.
- No console error or warning on any page.

## Not seen, open

- A toxin cloud on screen: no gland fires in the first minutes of the 36,000-tick world (glands
  arrive after 72,000 ticks on one seed in three).
- A dash wake: the flag fires often (`FLAG_DASH` is set on most hunters), but the wake was not
  singled out in a screenshot.
- The draw timing of the plan's limit (a tenth over look 4). Not measured: the Task 6 agent pinned
  that a frame with no new record draws as before, and the 36,000-tick world draws at 120 fps on
  this machine with 1,713 bodies and 515 pieces of debris.
- **A defect:** on the death card the still brain's five output labels (thrust, turn, accept, dash,
  lunge) overlap each other and their rest/full ticks when a body declares more than three
  outputs. The live brain panel was not checked for the same. Fixed after the exit (`9258483`):
  rows closer than 40 pixels put each name on its gauge line, in the still brain and the live
  panel; seen on a real "Eaten." card at 1272 by 745.
- A phone.
