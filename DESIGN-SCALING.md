# Design Discussion — Scaling to a Bigger, Sparser, Longer-Lasting World

**The goal (owner):** a much bigger world, longer runs, cells that **swim great distances** to find
food, food in **sparse pockets** across the map — fewer, longer-lived, more individual creatures.

This doc is the result of reading the engine first-hand + an 8-dimension audit + two empirical probes.
**Headline: the goal is achievable, but for a different reason than I first thought.** I initially
flagged chemotaxis range as a hard blocker. That was wrong — measured, it isn't. The real constraints
are (A) ecosystem density and (B) the per-tick cost model. Here is the corrected picture.

## What is NOT the blocker (corrected with evidence)

**Sensing range is fine.** I measured the real `FoodField` (`src/headless/sensing-range-probe.ts`): a forager can
smell a 16-cell food pocket from **~944 world units away** on a 2048 world — **92% of the half-world**.
With the current *fixed* 64² grid, that fraction is **preserved at any world size** (patches grow with
the world, so range auto-scales: 944 → 1888 → 3776 units at 2048 → 4096 → 8192). "Swim a great distance
to a sparse pocket" already works. The earlier "~86 unit" claim conflated the field's *amplitude*
e-folding length with the distance the *gradient* stays above the `senseThreshold` floor — off by ~10×.

**Exploration when truly out of range is a minor weakness.** With no gradient, a reflex MOTILE cell
cruises in a *straight line* (`act.ts:40` — no turning). But (1) the sensible range is so large that
"no gradient anywhere" is rare unless pockets are extremely sparse, and (2) neural foragers steer via
their brain (recurrent `thrustBias` + motor neurons), so they already wander. Worth improving for the
genuinely-lost case, but not a gate.

## The TWO real constraints

### (A) Ecosystem density — the actual hard constraint  ⚠️
Your own ecology probe already proved this (`feel-probe.ts:174`, DIAG6):
> *"There is a MAX world size for a given prey density… the full 2048² collapsed because ambush
> bite-rate ∝ local prey density and 2048² is 4× sparser at the same counts."*

Predation (and digestion) are **contact** events — a mouth must physically overlap food. Bite-rate ∝
*local* density. Spread the same population over a bigger map and the food web starves: the M2 config
comment (`config.ts:219-228`) records the same thing at the producer level ("a sparser 4096² world
collapses digestives → monoculture"). **You cannot have "globally sparse" AND "contact-fed trophic
levels sustain" at the same local density.** This is physics of the feeding model, not a tuning miss.

**The reframe that dissolves it:** "sparse" should mean **globally sparse, locally dense** — empty
water between *clustered* pockets where, *inside* a pocket, density is high enough for the contact
ecology to work. The light field already supports exactly this (`light-field.ts` seeds Gaussian
patches; lower `lightPatchCount` + smaller `lightPatchRadius` = sparse clusters). Foragers navigate
*between* pockets (feasible — see sensing above), and the ecology runs *within* them. This is the
single most important design decision below.

### (B) Per-tick cost scales with capacity + world area, not live population  ⚠️
Confirmed (ARCH-003). Every tick, regardless of how many cells are alive:
- `rebuildLive` scans the full `maxCells` capacity (100k) **twice** (`world.ts:326,526`).
- `SpatialHash.build` does `counts.fill(0)` + a prefix-sum over **all** buckets = O(world_area / cellSize²).
- Bonds scan `maxBonds` (16k); organism aggregate/death/adulthood scans are O(maxOrganisms) (8k).

At today's scale (2048², dense) this is invisible — forces dominate. But a bigger+sparser world is the
worst case: e.g. an 8192² world (cellSize 8) has **~1M buckets cleared/tick** + 100k capacity scans,
while maybe 30k cells do real work — ~95% of per-tick fixed cost is wasted on empty space. **Longer
runs at bigger/sparser scale require the per-tick cost to become O(live population).**

**The fix is well-contained:** maintain `liveIndices` incrementally (push on `alloc`, swap-remove on
`free`) so `rebuildLive` disappears; clear only *touched* hash buckets (or key the hash by occupied
cells). No determinism change (still canonical order). This is the foundational engineering for scale.

## Secondary decisions (real, but tuning/scoped)

- **Grid-resolution tradeoff** (CONF-003): fixed grid counts → map-spanning gradient range that
  auto-scales with the world, but coarser *local* gradients in a big world. World-derived grid →
  sharp local gradients, constant absolute range = shrinking fraction of a big map. **Pick one and
  document the invariant** (don't naively "fix" the grid to world-derived — it would *shorten*
  long-range navigation, the opposite of the goal).
- **Economy is hand-coupled to `cellRadius`** (CONF-002): a rescale today means re-deriving ~6 knobs by
  hand (the ecology branch already did this r6→r4). Area-normalize the economy so rescales are
  self-similar — pays for itself across the multi-phase ecology work.
- **Organism centroid is a non-toroidal mean** (CORR-004, cited): wrong for bodies straddling the world
  seam. Harmless for small bodies far from the seam now; a real bug surface as bodies/worlds grow.
- **Parallelism (M8) is half-prepped** (ARCH-001 fact): only `CellStore` is SharedArrayBuffer-backed;
  bonds/organisms/net/fields are plain buffers. A future worker port (the ultimate "bigger" lever) is
  not as mechanical as the architecture doc implies. Not urgent — just don't assume it's free.

## The decisions to make together

1. **Density model.** Adopt "globally sparse, locally dense pockets" (clustered food, navigate between,
   ecology within)? This is the unlock for sparse + sustaining. → *Recommended.*
2. **Cost-model rework.** Do the O(live) incremental live-set + touched-bucket hash *before* pushing
   world size up, so longer/bigger runs don't drown in empty-space overhead? → *Recommended as the
   foundation.*
3. **Target scale.** What's the actual ambition — 4096²? 8192²? "as big as 60fps allows"? This sets
   whether (B) is mandatory-now or soon, and whether M8 parallelism comes onto the roadmap.
4. **Sequencing vs the in-flight ecology milestone.** This scaling work *is* the back half of the
   ecology milestone (which already targets "a bigger, more open world"). Fold these in as ecology
   phases, or carve a separate "scale architecture" track that the ecology balance then sits on top of?
5. **Exploration behavior.** Add a deterministic persistent/Lévy roam + maybe short spatial memory for
   the genuinely-lost case, or rely on the (large) sensing range + neural wander and skip it?
