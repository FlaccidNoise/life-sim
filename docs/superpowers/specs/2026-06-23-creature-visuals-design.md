# Creature Visuals — gene-driven expressive rendering

**Date:** 2026-06-23
**Branch / worktree:** `worktree-creature-visuals` (`.claude/worktrees/creature-visuals`)
**Status:** Design approved; ready for implementation plan.

## Goal

Make creatures visually expressive so a player can read a creature's nature at a
glance — its **heading**, its **diet/danger**, its **senses**, and as many other
genes as can be encoded legibly — beyond the single colour channel used today.

Four concrete asks (from the owner):
1. **Heading** is always legible from the shape itself.
2. **Body shape from diet/predation genes** — predators spikier/dangerous, herbivores
   rounder/safe. A *procedural* shape generator driven by genes, not a fixed sprite set.
3. **Eyes** that encode vision: eye size (range), eye spread + cone arc (FOV), pupil
   sharpness (acuity). Eyes sit on the leading edge and reinforce heading.
4. **Broad gene → visual mapping** — encode many genes visually, creatively.

## Locked decisions

- **Art direction: flat-vector** (Kurzgesagt / *Thomas Was Alone* family). Hard 2-tone
  shading (no gradients), consistent outline weight, crisp linework, expressive
  leading-edge eyes. Validated interactively in the brainstorm companion
  (`creature-flat-v3.html`). Bioluminescence is explicitly a **later, separate change**
  layered on top — out of scope here.
- **Diet drives expression, not just silhouette:** low diet → round body, big round
  eyes, soft brow, small mouth (cute); high diet → angular spiked body, narrowed
  slit-pupil almond eyes, angry mirrored down-V brow, amber sclera, fanged snarl
  (fearsome). `fear = clamp(diet * 1.15, 0, 1)`, `cute = 1 - fear`.
- **Renderer architecture: hybrid LOD.** WebGL `gl.POINTS` for the far swarm; a
  Canvas2D overlay (trait-module registry, plain TypeScript) for the few creatures
  large enough on screen to show detail.
- **Extensibility via a trait-module registry** — each visual feature is an isolated,
  independently testable module. Adding a new gene's visual = register one module.
- **Heading/fearsome/cute and all geometry are derived from existing genes only.** No
  new genes, no sim/economy changes. Rendering is read-only over sim state.

## Gene → visual mapping (final)

Body silhouette and expression are the headline; every cue that can reinforce heading does.

| Gene | Visual encoding | Tier |
|------|-----------------|------|
| `DIET` | Body silhouette round blob → angular spiked star **and** expression cute → fearsome (eyes, brow, mouth, palette darkening) | 0+ |
| `DAMAGE` | Fang/serration count + size in the maw | 2 |
| `EAT_RATE` | Mouth width (gape), independent of fangs | 1+ |
| `SIZE` | Overall on-screen scale (already wired) | 0+ |
| `VISION_RANGE` | Eye size **and** vision-cone length | 1+ (cone 1+, eye detail 1+) |
| `VISION_FOV` | Eye spread (forward-set ↔ lateral) **and** cone half-angle | 1+ |
| `VISION_ACUITY` | Pupil sharpness / iris-ring contrast | 2 |
| `SENSE_RANGE` | Antennae length (smell organs at front) | 2 |
| `MAX_SPEED` | Tail length / streamlining (at the rear — also marks the back) | 1+ |
| `MAX_THRUST` | Tail thickness / propulsion plume | 2 |
| `MAX_TURN` | Side-fin count (nimbleness) | 2 |
| `METAB_EFF` | Colour **saturation** (freed from vision-range; see below) + subtle gloss | 1+ |
| `hue` | Lineage colour (unchanged — full wheel) | 0+ |

**Heading** is the emergent product: eyes + tapered front + cone all face the movement
direction; tail sits at the back; the whole creature rotates by `store.heading`.

**Vision cone:** a faint translucent flat wedge in front, length ∝ `VISION_RANGE`,
half-angle = `VISION_FOV`. Toggleable (clutter control across many creatures).

**Colour-channel change:** today saturation encodes `VISION_RANGE` and brightness encodes
speed (`renderer.ts:73-74`). Eye size now carries vision range, so **saturation is freed
to encode `METAB_EFF`**. Brightness stays = current speed (it animates well). This change
applies to the Tier-0 WebGL path too, to keep far/near consistent.

### Genes intentionally NOT given a visual in v1 (flagged)

- `REPRO_THRESHOLD`, `SATIATED_THRESHOLD`, `BIRTH_ENERGY` — abstract life-history (r/K).
  No legible 1:1 visual. Candidate later: a "yolk" core sized by `BIRTH_ENERGY`.
- `SHELTER_DRIVE`, `COHESION_DRIVE` — social drives; hard to draw on a solitary creature.
- `FORAGE_PREF` — only live when `foodChannels === 2`; conditional two-tone marking later.
- **Genome-hash surface pattern** (stripes/spots for lineage distinction) — no spare
  heritable channel; deferred as a creative-optional follow-up.

These are deliberately deferred, not forgotten — each is a natural future `TraitModule`.

## Architecture

### Hybrid LOD renderer

At 8192² scale, zoomed out → all creatures sub-pixel; zoomed in → only a handful large.
Split by LOD at the renderer level:

- **Tier 0 (far / swarm):** existing WebGL `gl.POINTS` pass (`renderer.ts:511-581`).
  One batched draw call for thousands. Upgrade: pass `heading` so the diet glyph rotates
  and gets a small heading nub; apply the saturation←`METAB_EFF` change.
- **Tier 1 / 2 (near):** a **Canvas2D overlay** stacked over the WebGL canvas, sharing the
  camera transform, drawing each large creature via the trait registry. Only creatures
  whose on-screen radius exceeds the tier threshold are drawn here, so cost scales with
  *visible detailed creatures*, which is small. Zoomed-out swarm view → this path draws
  nothing.

Tier thresholds (on-screen body radius in px): Tier 0 `< ~6px`, Tier 1 `~6–22px`,
Tier 2 `> ~22px` (final constants tuned during implementation).

### Trait-module registry (extensibility)

```ts
interface CreatureVisualCtx {
  ctx: CanvasRenderingContext2D; // translated to creature centre + rotated by heading
  R: number;                     // on-screen body radius (px)
  tier: 0 | 1 | 2;
  genes: GeneView;               // typed accessor over the SoA arrays for one creature
  derived: {                     // computed ONCE per creature, shared by all modules
    fear: number; cute: number;
    base: RGB; ink: RGB; shadow: RGB; lite: RGB;
    screenUp: [number, number];  // for consistent 2-tone shading direction under rotation
  };
}

interface TraitModule {
  id: string;
  z: number;        // static draw order: cone(-10) tail(-5) fins(-4) body(0) maw(5) eyes(10) brow(12) antennae(8)
  minTier: 0 | 1 | 2;
  draw(c: CreatureVisualCtx): void;
}
```

- The detail renderer holds an **ordered array of `TraitModule`s** (sorted once by `z`).
- Per visible creature: build `CreatureVisualCtx` once (compute `derived`), then invoke
  each module where `minTier ≤ tier`.
- **Adding a gene's visual = add one module + register it.** No edits to other modules,
  no shader changes. Each module is unit-testable against an offscreen canvas.
- `GeneView` is the single typed accessor (`genes.diet`, `genes.norm('VISION_RANGE')`,
  `genes.raw(ScalarGene.DAMAGE)`), so modules never recompute normalisation or fear/cute.

### Shape generator

Ported from the validated playground (`creature-flat-v3.html`):
- Radial outline of N points; lobe function `cos(angle * spikeCount)`, `spikeCount`,
  spike amplitude, and edge sharpness all ramp with `DIET`; forward taper biases radius
  toward +x (heading-front).
- Smooth (quadratic-midpoint) path when `diet < 0.4`, angular polygon otherwise.
- This lives in its own module (`shape.ts`) consumed by the `body` TraitModule and reused
  for the clip region of the 2-tone shading + gloss.

### Colour

`palette.ts` remains the colour source of truth (JS↔GLSL parity, pinned by
`palette.test.ts`). Tier 0 uses the GLSL side; Tier 1/2 use the JS side. The
saturation←`METAB_EFF` change is made in both in lockstep (keep the parity test green).

### Determinism

Rendering is read-only over sim state and touches no RNG or sim arrays — byte-identical
to the sim, no determinism-contract impact. (Consistent with the renderer's existing
isolation.)

## Integration points

- `src/render/renderer.ts` — Tier-0 attribute plumbing (`heading`, saturation change),
  shaders `DOT_VERT`/`DOT_FRAG` (`renderer.ts:35-103`), draw loop (`renderer.ts:511-581`),
  camera (`renderer.ts:355-373`) exposed for the overlay.
- **New:** `src/render/detail/` — `registry.ts` (TraitModule list + dispatch),
  `gene-view.ts` (`GeneView`), `shape.ts` (outline generator), and one file per trait
  module (`body.ts`, `eyes.ts`, `maw.ts`, `vision-cone.ts`, `antennae.ts`, `tail.ts`,
  `fins.ts`, `brow.ts`).
- **New:** `src/render/detail-overlay.ts` — owns the stacked 2D canvas, mirrors the camera
  transform, iterates `store.liveIndices`, computes on-screen radius, dispatches the
  registry for Tier 1/2 creatures.
- `src/render/palette.ts` (+ `palette.test.ts`) — saturation←`METAB_EFF`.
- `src/app/main.ts:405-406` — wire the overlay alongside `renderer.setCamera/draw`; add the
  vision-cone toggle to the control surface.
- Gene indices read via `ScalarGene` enum (`src/core/genome.ts:36-71`).

## Implementation steps (incremental, each independently verifiable)

The owner prefers tiny, individually reviewable increments. Suggested order:

1. **Overlay scaffold + camera sync** — stacked 2D canvas over the WebGL canvas, mirrors
   camera, draws a debug marker at each Tier-1/2 creature. Verify alignment with the WebGL
   dots at multiple zooms. No genes yet.
2. **`GeneView` + `shape.ts` + `body` module** — body silhouette from DIET with 2-tone flat
   shading + outline, rotated by heading. Verify round↔spiky morph and heading legibility.
3. **`eyes` + `brow` modules** — cute round ↔ fearsome slit/almond; size←range, spread←FOV,
   pupil←acuity; pupils track heading; mirrored brow. Verify across full rotation.
4. **`vision-cone` module + toggle** — flat translucent wedge; length←range, angle←FOV.
5. **`maw` module** — mouth width←eat, fangs←damage.
6. **`antennae`, `tail`, `fins` modules** — sense, speed/thrust, turn.
7. **Tier-0 WebGL upgrade** — heading nub + rotated glyph + saturation←METAB_EFF (+ palette
   parity test update). Verify far swarm still draws in one call and reads heading.
8. **LOD tuning + clutter pass** — thresholds, cone default on/off, perf check at scale.

## Testing

- **Unit:** each TraitModule renders to an offscreen canvas; assert key invariants
  (e.g. body bbox grows with SIZE; predator eye path is angular; cone half-angle = FOV;
  fang count tracks DAMAGE). `shape.ts` outline tested directly (point count, forward
  taper, spike amplitude vs diet).
- **Parity:** keep `palette.test.ts` green after the saturation change.
- **Determinism:** existing sim determinism tests must stay byte-identical (rendering is
  read-only) — run the suite after Tier-0 attribute changes.
- **Visual / manual:** verify in the live app at multiple zooms; confirm heading reads at
  all angles (auto-rotate equivalent). Note: use a fresh Vite port to avoid the stale
  compiled `main.ts` gotcha.

## Out of scope (explicit)

- Bioluminescence / glow aesthetic (separate later change).
- Visuals for the deferred genes listed above.
- Any sim, economy, genome, or determinism-affecting change.
- Genome-hash surface patterns.
