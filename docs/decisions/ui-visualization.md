# UI / Visualization Decisions

Decisions about how the sim is rendered and presented (encoding channels, panels, color).
Full rationale lives in `docs/superpowers/specs/`.

---

### [APPROVED] Dot encoding remap: trophic role → shape, color → "color-by" mode (lineage default)
**Date:** 2026-06-22
**Context:** Frontend-design polish pass. The canvas dot stacked 4 axes on color/sat/bright/size,
with diet (trophic role) on hue. The diet green→red ramp was defined three times inconsistently
(`renderer.ts:38`, `distributions.ts:133`, `index.html:185`) with a muddy olive middle, and the
green↔red pairing is colorblind-hostile.
**Decision:** Move **trophic role to dot SHAPE** (○ herbivore · ◇ omnivore · △ predator) — a
life-constant, low-cardinality categorical, ideal for a shape channel. Free up **hue for a
"color-by" mode** cycled with `c`: **lineage** (default) → diet → energy. Lineage is the only
color meaning backed by an actual mechanic (the heritable `hue` gene + `COHESION_DRIVE` schooling,
`genome.ts:11`/`sense.ts:148`); it makes genetic diversity/speciation — the active
`feat/diversity-levers` research question — visible at a glance (monoculture = one color). Saturation
(vision), brightness (speed), and size (body) are unchanged. A single `palette.ts` becomes the one
source of truth for the diet/lineage/energy ramps + the histogram palette.
**Alternatives considered:**
- *Color stays diet (green→red), shape redundantly encodes role* — rejected: shape would just
  duplicate color, adding clutter without information.
- *Shape encodes energy/behavior mode* — rejected: mode changes rapidly, so dots would morph
  constantly (flicker = noise, not signal). Shape must encode a stable trait.
- *Camouflage / aposematism / mate-choice as color meaning* — rejected: no supporting mechanic
  exists, so they would be decorative fluff.
**Trade-off accepted:** macro-zoom "green grazers vs red hunters" read is lost from the canvas
(shape isn't legible at ~2px); mitigated by the `c` color-by toggle (flip back to diet) and the
distributions panel headcount. Populations run ~99% herbivore today, so little dynamism is lost.
**Caveat:** schooling is hue-*blind* by default (`cohesionHueBlind:true`, commit `12423d7`), so
lineage-colored *schools* only appear when that knob is off; lineage color still shows diversity
regardless.
**Spec:** `docs/superpowers/specs/2026-06-22-ui-visual-polish-design.md`

---

### [APPROVED] Legend → floating, closeable, dynamic; distributions → distinct hues + gene picker
**Date:** 2026-06-22
**Context:** Same pass. The legend sat at the top of the right panel (`index.html:64-77`), pushing
the data panels below the fold; every non-diet histogram was one flat blue (`distributions.ts:135`),
and only 5 of 18 genes were ever shown.
**Decision:** Move the legend to a **floating, closeable** frosted panel bottom-left over the canvas
(beside the dots it explains), made **dynamic** to show the current color-by mode + shape glyphs.
Give each **distribution histogram its own hue** from the shared palette, and add a **gene picker**
(checklist) so any of the 18 scalar genes + energy/age can be shown; default = today's 5.
**Spec:** `docs/superpowers/specs/2026-06-22-ui-visual-polish-design.md`

---
