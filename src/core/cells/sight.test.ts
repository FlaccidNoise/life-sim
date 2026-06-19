import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { RockField } from '../environment/rock-field';
import { CellType } from './types';
import { SightTarget } from './sense-source';
import { sightVector } from './sight';

// Build a hash over `store`'s current live cells so sightVector can scan buckets.
function buildHash(store: CellStore, live: number[], w = 800, h = 800, cellSize = 16): SpatialHash {
  const f = store.fields;
  const hash = new SpatialHash(w, h, cellSize, store.capacity);
  hash.build(Uint32Array.from(live), live.length, f.posX, f.posY);
  return hash;
}

// Build a RockField over manually-placed rocks (mirrors sight-occlusion.test.ts's helper).
function rocksWith(centers: Array<[number, number, number]>, w = 800, h = 800): RockField {
  const rf = new RockField(
    8,
    Math.max(3, Math.round(w / 64)),
    Math.max(3, Math.round(h / 64)),
    w,
    h,
  );
  for (let i = 0; i < centers.length; i++) {
    rf.cx[i] = centers[i]![0];
    rf.cy[i] = centers[i]![1];
    rf.radius[i] = centers[i]![2];
  }
  rf.rockCount = centers.length;
  rf.buildGrid();
  return rf;
}

describe('sightVector — FOOD target, no occlusion', () => {
  it('writes unitDir×proximity toward the nearest edible cell in the cone', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0; // looking +x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;

    const food = store.alloc(); // 1 — 50 units ahead in +x
    f.posX[food] = 450;
    f.posY[food] = 400;
    f.cellType[food] = CellType.PHOTO;
    f.organismId[food] = 0;

    const hash = buildHash(store, [eye, food]);
    const carn = new Uint8Array(8);
    sightVector(eye, f, hash, carn, SightTarget.FOOD, 100, Math.PI / 4, 800, 800);

    // dist 50, viewRange 100 → proximity 0.5; unit dir +x → senseX 0.5, senseY 0.
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('writes the zero vector when nothing is in the cone (target directly behind)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const behind = store.alloc(); // directly BEHIND the eye (−x) → outside the cone
    f.posX[behind] = 350;
    f.posY[behind] = 400;
    f.cellType[behind] = CellType.PHOTO;
    f.organismId[behind] = 0;
    const hash = buildHash(store, [eye, behind]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('rejects a target just outside the half-angle but inside range', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0; // looking +x, half-angle = π/6 (30°)
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    // 45° off-axis (+x,+y diagonal) → outside a 30° half-angle cone.
    const off = store.alloc();
    f.posX[off] = 430;
    f.posY[off] = 430;
    f.cellType[off] = CellType.PHOTO;
    f.organismId[off] = 0;
    const hash = buildHash(store, [eye, off]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 6, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('accepts a target just inside the half-angle', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0; // looking +x, half-angle = π/3 (60°)
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    // 45° off-axis → inside a 60° half-angle cone.
    const on = store.alloc();
    f.posX[on] = 430;
    f.posY[on] = 430;
    f.cellType[on] = CellType.PHOTO;
    f.organismId[on] = 0;
    const hash = buildHash(store, [eye, on]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 3, 800, 800);
    // dist = sqrt(30²+30²) ≈ 42.43; unit dir = (1/√2, 1/√2); proximity = (100-42.43)/100 ≈ 0.5757.
    const dist = Math.sqrt(30 * 30 + 30 * 30);
    const prox = (100 - dist) / 100;
    expect(f.senseX[eye]).toBeCloseTo((30 / dist) * prox, 5);
    expect(f.senseY[eye]).toBeCloseTo((30 / dist) * prox, 5);
  });

  it('ignores a cell beyond viewRange', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const far = store.alloc(); // 90 ahead, viewRange 60 → out of range
    f.posX[far] = 490;
    f.posY[far] = 400;
    f.cellType[far] = CellType.PHOTO;
    f.organismId[far] = 0;
    const hash = buildHash(store, [eye, far]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 60, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it("excludes the eye's own organism cells", () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 5;
    const sib = store.alloc(); // same organism (5) → excluded even though edible-typed
    f.posX[sib] = 440;
    f.posY[sib] = 400;
    f.cellType[sib] = CellType.PHOTO;
    f.organismId[sib] = 5;
    const hash = buildHash(store, [eye, sib]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('picks the strictly nearer of two in-cone targets', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const nearC = store.alloc(); // 1 — 30 ahead
    f.posX[nearC] = 430;
    f.posY[nearC] = 400;
    f.cellType[nearC] = CellType.PHOTO;
    f.organismId[nearC] = 0;
    const farC = store.alloc(); // 2 — 60 ahead
    f.posX[farC] = 460;
    f.posY[farC] = 400;
    f.cellType[farC] = CellType.PHOTO;
    f.organismId[farC] = 0;
    const hash = buildHash(store, [eye, nearC, farC]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    // nearer at dist 30 → proximity 0.7, +x.
    expect(f.senseX[eye]).toBeCloseTo(0.7, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('ignores MEAT corpses for a FOOD eye (edible to a gut, but not a sight FOOD target)', () => {
    // FOOD == isEdibleBy(MOTILE, type) == PHOTO or MEAT. Confirm MEAT *is* a FOOD target,
    // since a heterotroph eats corpses. (Pins the classifier semantics, not an exclusion.)
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const corpse = store.alloc();
    f.posX[corpse] = 450;
    f.posY[corpse] = 400;
    f.cellType[corpse] = CellType.MEAT;
    f.organismId[corpse] = 0;
    const hash = buildHash(store, [eye, corpse]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});

describe('sightVector — deterministic equidistant tie-break (strict <, canonical-first wins)', () => {
  // Geometry: eye + both candidates all share ONE bucket (cellSize 64 → bucket center at ~432), so
  // canonical scan order reduces to ascending sorted slot = ascending live index. The two candidates
  // are at (+24,+16) and (+24,−16) from the eye → EXACTLY equal d2. Strict-< keeps the first-seen, so
  // the lower-live-index candidate wins regardless of geometry; sign of senseY tells them apart.
  const EYEX = 432;
  const EYEY = 432;
  const DX = 24;
  const DY = 16;
  const dist = Math.sqrt(DX * DX + DY * DY);

  it('two exactly-equidistant in-cone targets resolve to the first in canonical scan order', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = EYEX;
    f.posY[eye] = EYEY;
    f.heading[eye] = 0; // +x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    // candidate ABOVE axis, lower live index (1) → canonical-first.
    const above = store.alloc();
    f.posX[above] = EYEX + DX;
    f.posY[above] = EYEY + DY;
    f.cellType[above] = CellType.PHOTO;
    f.organismId[above] = 0;
    // candidate BELOW axis, higher live index (2).
    const below = store.alloc();
    f.posX[below] = EYEX + DX;
    f.posY[below] = EYEY - DY;
    f.cellType[below] = CellType.PHOTO;
    f.organismId[below] = 0;

    const hash = buildHash(store, [eye, above, below], 800, 800, 64);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 2, 800, 800);

    const prox = (100 - dist) / 100;
    // ABOVE wins (canonical-first) → senseY positive.
    expect(f.senseX[eye]).toBeCloseTo((DX / dist) * prox, 5);
    expect(f.senseY[eye]).toBeCloseTo((DY / dist) * prox, 5);
    expect(f.senseY[eye]).toBeGreaterThan(0);
  });

  it('is order-independent: swapping which slot holds the upper candidate flips the winner to match scan order', () => {
    // Identical geometry, but now the BELOW-axis candidate has the lower live index. Canonical-first
    // must then pick it (senseY negative) — proving selection follows scan order, not geometry.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = EYEX;
    f.posY[eye] = EYEY;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    // candidate BELOW-axis FIRST (live index 1).
    const below = store.alloc();
    f.posX[below] = EYEX + DX;
    f.posY[below] = EYEY - DY;
    f.cellType[below] = CellType.PHOTO;
    f.organismId[below] = 0;
    // candidate ABOVE-axis SECOND (live index 2).
    const above = store.alloc();
    f.posX[above] = EYEX + DX;
    f.posY[above] = EYEY + DY;
    f.cellType[above] = CellType.PHOTO;
    f.organismId[above] = 0;

    const hash = buildHash(store, [eye, below, above], 800, 800, 64);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 2, 800, 800);
    expect(f.senseY[eye]).toBeLessThan(0); // below-axis (canonical-first) wins now
  });
});

describe('sightVector — PREY vs PREDATOR classification', () => {
  it('PREY eye locks the nearest non-carnivore flesh; ignores carnivore flesh and plants', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0, predator's eye
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const plant = store.alloc(); // 1 — PHOTO ahead, must be ignored by a PREY eye
    f.posX[plant] = 420;
    f.posY[plant] = 400;
    f.cellType[plant] = CellType.PHOTO;
    f.organismId[plant] = 0;
    const prey = store.alloc(); // 2 — herbivore MOVER ahead
    f.posX[prey] = 450;
    f.posY[prey] = 400;
    f.cellType[prey] = CellType.MOVER;
    f.organismId[prey] = 2;
    const carn = new Uint8Array(8);
    carn[1] = 1; // eye's own organism is a carnivore (irrelevant here); org 2 is prey (carn=0)
    const hash = buildHash(store, [eye, plant, prey]);
    sightVector(eye, f, hash, carn, SightTarget.PREY, 100, Math.PI / 4, 800, 800);
    // locks the prey at dist 50 → proximity 0.5, +x (the nearer PHOTO is skipped).
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('PREDATOR eye locks the nearest carnivore flesh; ignores non-carnivore flesh', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0, a prey's eye
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 2;
    const otherPrey = store.alloc(); // 1 — another herbivore flesh ahead, must be ignored
    f.posX[otherPrey] = 420;
    f.posY[otherPrey] = 400;
    f.cellType[otherPrey] = CellType.MOVER;
    f.organismId[otherPrey] = 3;
    const hunter = store.alloc(); // 2 — carnivore flesh ahead
    f.posX[hunter] = 460;
    f.posY[hunter] = 400;
    f.cellType[hunter] = CellType.MOVER;
    f.organismId[hunter] = 1;
    const carn = new Uint8Array(8);
    carn[1] = 1; // org 1 carnivore; org 3 not
    const hash = buildHash(store, [eye, otherPrey, hunter]);
    sightVector(eye, f, hash, carn, SightTarget.PREDATOR, 100, Math.PI / 4, 800, 800);
    // locks the hunter at dist 60 → proximity 0.4, +x.
    expect(f.senseX[eye]).toBeCloseTo(0.4, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('a PREDATOR mouth cell (not flesh) is never a PREY target', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const mouth = store.alloc(); // PREDATOR type → isFlesh false → not prey
    f.posX[mouth] = 450;
    f.posY[mouth] = 400;
    f.cellType[mouth] = CellType.PREDATOR;
    f.organismId[mouth] = 2; // carn=0 here, but type already disqualifies it
    const hash = buildHash(store, [eye, mouth]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.PREY, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });
});

describe('sightVector — toroidal seam', () => {
  it('sees a target across the world seam (shortest toroidal path, not the long way)', () => {
    // World 96 wide. Eye at x=6 looking in −x (heading π). Target at x=92 → wrapDelta = −10
    // (10 units to the LEFT across the seam), which is straight ahead of a −x-facing eye.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 6;
    f.posY[eye] = 48;
    f.heading[eye] = Math.PI; // looking −x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const acrossSeam = store.alloc();
    f.posX[acrossSeam] = 92; // = -4 relative to 96-wide world; delta from eye = -10
    f.posY[acrossSeam] = 48;
    f.cellType[acrossSeam] = CellType.PHOTO;
    f.organismId[acrossSeam] = 0;
    // cellSize 32 → cols=rows=3. viewRange 40 → R=2 → 5×5 window wraps the 3-wide grid (seam guard active).
    const hash = buildHash(store, [eye, acrossSeam], 96, 96, 32);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 40, Math.PI / 4, 96, 96);
    // dist 10, range 40 → proximity 0.75; unit dir = −x → senseX −0.75, senseY 0.
    expect(f.senseX[eye]).toBeCloseTo(-0.75, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('does NOT double-count when the window wraps a tiny grid (each bucket visited at most once)', () => {
    // Tiny 3×3 grid with R=2 (window 5 wide > 3 cols) — the seam guard must visit each column/row once.
    // A single target in-cone must produce exactly one (correct) selection; a double-visit of its bucket
    // would still pick it (idempotent), but a double-visit of OTHER buckets in the wrong relative order
    // could corrupt an equidistant tie-break. Here we assert the simpler invariant: the result equals the
    // result of the SAME query on a large grid where no wrapping happens — i.e. the guard is a no-op for
    // correctness, only de-duplicating visits.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 48;
    f.posY[eye] = 48;
    f.heading[eye] = 0; // +x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const food = store.alloc();
    f.posX[food] = 68; // 20 ahead, well within the tiny world and range
    f.posY[food] = 48;
    f.cellType[food] = CellType.PHOTO;
    f.organismId[food] = 0;
    // Tiny world: 96×96, cellSize 32 → 3×3. viewRange 40 → R=2 → window 5 > 3 (wrap + seam guard).
    const hashSmall = buildHash(store, [eye, food], 96, 96, 32);
    sightVector(eye, f, hashSmall, new Uint8Array(8), SightTarget.FOOD, 40, Math.PI / 4, 96, 96);
    const smallX = f.senseX[eye]!;
    const smallY = f.senseY[eye]!;

    // dist 20, range 40 → proximity 0.5, +x.
    expect(smallX).toBeCloseTo(0.5, 5);
    expect(smallY).toBeCloseTo(0, 5);
  });

  it('equidistant tie-break stays deterministic even when the window wraps the grid', () => {
    // Two equidistant candidates on a tiny wrapping grid (3×3, R=2 → window 5 > 3 cols, seam guard
    // active). The guard must keep the canonical-first winner stable (no duplicate visit reorders the
    // tie). Eye centred in its bucket; both targets at (+12,±8) — same bucket (4), equal dist 14.42 →
    // lower live index (above-axis) wins.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 48;
    f.posY[eye] = 48;
    f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const above = store.alloc(); // (+12,+8) dist 14.42, live index 1
    f.posX[above] = 60;
    f.posY[above] = 56;
    f.cellType[above] = CellType.PHOTO;
    f.organismId[above] = 0;
    const below = store.alloc(); // (+12,−8) dist 14.42, live index 2
    f.posX[below] = 60;
    f.posY[below] = 40;
    f.cellType[below] = CellType.PHOTO;
    f.organismId[below] = 0;
    const hash = buildHash(store, [eye, above, below], 96, 96, 32);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 40, Math.PI / 2, 96, 96);
    expect(f.senseY[eye]).toBeGreaterThan(0); // above-axis (canonical-first) wins
  });
});

describe('sightVector — rock occlusion (optional rocks param)', () => {
  // Eye at (400,400) looking +x with a 60° half-angle cone. A NEARER FOOD target sits up-and-right at
  // (425,425) (dist ~35, 45° off-axis → in-cone); a FARTHER FOOD target is straight ahead at (470,400)
  // (dist 70). A rock at (412,412) r=5 sits on the eye→near diagonal but ~12 units off the +x axis, so
  // it occludes ONLY the near target. Occlusion ON → near skipped, far wins; OFF → near (closer) wins.
  const nearDist = Math.sqrt(25 * 25 + 25 * 25);
  const nearProx = (100 - nearDist) / 100;
  const nearComp = (25 / nearDist) * nearProx; // senseX == senseY for the 45° near target

  function buildOcclusionScene(): { store: CellStore; eye: number; hash: SpatialHash } {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400;
    f.posY[eye] = 400;
    f.heading[eye] = 0; // +x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const near = store.alloc(); // 1 — ~35 away at 45°, hidden behind the rock
    f.posX[near] = 425;
    f.posY[near] = 425;
    f.cellType[near] = CellType.PHOTO;
    f.organismId[near] = 0;
    const far = store.alloc(); // 2 — 70 ahead in +x, clear line of sight
    f.posX[far] = 470;
    f.posY[far] = 400;
    f.cellType[far] = CellType.PHOTO;
    f.organismId[far] = 0;
    const hash = buildHash(store, [eye, near, far]);
    return { store, eye, hash };
  }

  it('skips an occluded nearer target so an unoccluded farther one wins', () => {
    const { store, eye, hash } = buildOcclusionScene();
    const f = store.fields;
    const rocks = rocksWith([[412, 412, 5]]); // on the eye→near diagonal, off the +x axis to far
    const carn = new Uint8Array(8);
    sightVector(eye, f, hash, carn, SightTarget.FOOD, 100, Math.PI / 3, 800, 800, rocks);
    // near is occluded → far (dist 70) wins: proximity (100-70)/100 = 0.3, +x.
    expect(f.senseX[eye]).toBeCloseTo(0.3, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('without rocks, the nearer target wins (occlusion OFF → unchanged behaviour)', () => {
    const { store, eye, hash } = buildOcclusionScene();
    const f = store.fields;
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 3, 800, 800);
    // No rocks → nearer (~35) wins: unit dir (1/√2,1/√2) × nearProx.
    expect(f.senseX[eye]).toBeCloseTo(nearComp, 5);
    expect(f.senseY[eye]).toBeCloseTo(nearComp, 5);
  });

  it('with an empty RockField (rockCount 0), the nearer target still wins', () => {
    const { store, eye, hash } = buildOcclusionScene();
    const f = store.fields;
    const rocks = rocksWith([]); // rockCount 0 → occlusion gated OFF
    const carn = new Uint8Array(8);
    sightVector(eye, f, hash, carn, SightTarget.FOOD, 100, Math.PI / 3, 800, 800, rocks);
    expect(f.senseX[eye]).toBeCloseTo(nearComp, 5);
    expect(f.senseY[eye]).toBeCloseTo(nearComp, 5);
  });

  it('a rock beside the corridor does not occlude (nearer target still wins)', () => {
    const { store, eye, hash } = buildOcclusionScene();
    const f = store.fields;
    const rocks = rocksWith([[412, 360, 5]]); // far off both lines of sight → no block
    const carn = new Uint8Array(8);
    sightVector(eye, f, hash, carn, SightTarget.FOOD, 100, Math.PI / 3, 800, 800, rocks);
    expect(f.senseX[eye]).toBeCloseTo(nearComp, 5);
    expect(f.senseY[eye]).toBeCloseTo(nearComp, 5);
  });
});

describe('sightVector — wide-window output value-lock on the minimum 3×3 grid', () => {
  it('produces the locked sense vector when 2R+1 exceeds the grid width', () => {
    // OUTPUT VALUE-LOCK for the wide-window (2R+1 > cols) scan on the minimum 3×3 grid.
    // world 48×48, cellSize 16 → exactly cols=rows=3 (the hash minimum). viewRange 30 → R=2,
    // so a 5×5 window wraps around a 3×3 grid. This locks the produced sense vector so a refactor
    // that mangles the modulo wrap (NaN, or scanning the wrong direction) is caught.
    // NOTE: the toroidal-seam guard (skipping buckets already visited via the wrap) is a PERFORMANCE
    // optimization, not what this test discriminates. With a single FOOD target the strict-< nearest
    // tie-break makes a double bucket-visit idempotent, so this test would still pass with the guard
    // removed — it is a value-lock, not a guard-discriminator.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 24;
    f.posY[eye] = 24;
    f.heading[eye] = 0; // center bucket, looking +x
    f.cellType[eye] = CellType.SENSOR;
    f.organismId[eye] = 1;
    const food = store.alloc(); // 1 — 20 ahead in +x, in range (viewRange 30)
    f.posX[food] = 44;
    f.posY[food] = 24;
    f.cellType[food] = CellType.PHOTO;
    f.organismId[food] = 0;

    const hash = new SpatialHash(48, 48, 16, store.capacity);
    hash.build(Uint32Array.from([eye, food]), 2, f.posX, f.posY);

    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 30, Math.PI / 2, 48, 48);
    // dist 20, viewRange 30 → proximity 1/3; +x. This is the locked output value.
    expect(f.senseX[eye]).toBeCloseTo(1 / 3, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});
