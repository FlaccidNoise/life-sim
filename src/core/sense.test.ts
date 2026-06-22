import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { SpatialHash } from './spatial-hash';
import { senseFood, senseCreatures, senseEnv } from './sense';
import { Walls } from './walls';
import { defaultConfig } from './config';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

const W = 256;
const H = 256;
const COLS = 32;
const ROWS = 32;
const K = 10;

/** Sculpt a smooth +x food gradient: B(col) ≈ K·col/(cols−1), increasing toward +x. */
function gradientField(): FoodField {
  const f = new FoodField(W, H, COLS, ROWS, K, 1); // start full
  const cellW = W / COLS;
  const cellH = H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const target = (K * c) / (COLS - 1);
      f.grazeAt(c * cellW + cellW / 2, r * cellH + cellH / 2, K - target);
    }
  }
  return f;
}

describe('senseFood', () => {
  it('senses a gradient pointing toward higher food (+x here)', () => {
    const f = gradientField();
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = W / 2;
    s.y[i] = H / 2;
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE] = W / COLS; // sample one cell apart
    s.rebuildLive();
    senseFood(s, f, defaultConfig({ worldWidth: W, worldHeight: H })); // foodChannels defaults to 1
    expect(s.senseX[i]!).toBeGreaterThan(0); // points toward +x (more food)
    expect(Math.abs(s.senseY[i]!)).toBeLessThan(Math.abs(s.senseX[i]!)); // ~no y component
  });

  it('two-channel: a channel-B specialist smells toward the B gradient, an A-specialist toward A', () => {
    // Channel A rises toward +x (gradientField); build channel B rising toward −x (mirror) so the two
    // resources pull in OPPOSITE directions — then preference alone decides which way a creature is drawn.
    const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5); // two channels, symmetric split
    const cellW = W / COLS;
    const cellH = H / ROWS;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;
        const halfK = K / 2; // each channel's cap after the split
        f.grazeAt(cx, cy, halfK - (halfK * c) / (COLS - 1)); // A: rich toward +x
        f.grazeAt2(cx, cy, halfK - (halfK * (COLS - 1 - c)) / (COLS - 1)); // B: rich toward −x
      }
    const cfg = defaultConfig({ worldWidth: W, worldHeight: H, foodChannels: 2 });
    const s = new OrganismStore(4);
    const a = s.alloc(); // A-specialist
    const b = s.alloc(); // B-specialist
    for (const i of [a, b]) {
      s.x[i] = W / 2;
      s.y[i] = H / 2;
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE] = cellW;
    }
    s.scalarGenes[a * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF] = 0; // pure A
    s.scalarGenes[b * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF] = 1; // pure B
    s.rebuildLive();
    senseFood(s, f, cfg);
    expect(s.senseX[a]!).toBeGreaterThan(0); // A-specialist pulled toward +x (channel A)
    expect(s.senseX[b]!).toBeLessThan(0); // B-specialist pulled toward −x (channel B)
  });
});

describe('senseEnv', () => {
  it('leaves all 4 transients at 0 when both features are off', () => {
    const s = new OrganismStore(1);
    const i = s.alloc();
    s.rebuildLive();
    s.wallSenseX[i] = 9;
    s.wallSenseY[i] = 9;
    s.flowSenseX[i] = 9;
    s.flowSenseY[i] = 9;
    senseEnv(s, null, null, defaultConfig({ wallRegionCount: 0, flowStrength: 0 }));
    expect(s.wallSenseX[i]).toBe(0);
    expect(s.wallSenseY[i]).toBe(0);
    expect(s.flowSenseX[i]).toBe(0);
    expect(s.flowSenseY[i]).toBe(0);
  });
});

describe('senseCreatures (sight)', () => {
  const cfg = defaultConfig({ worldWidth: W, worldHeight: H });
  const setVision = (
    s: OrganismStore,
    slot: number,
    v: { range: number; fov: number; acuity: number; diet: number },
  ): void => {
    const sg = slot * SCALAR_GENE_COUNT;
    s.scalarGenes[sg + ScalarGene.VISION_RANGE] = v.range;
    s.scalarGenes[sg + ScalarGene.VISION_FOV] = v.fov;
    s.scalarGenes[sg + ScalarGene.VISION_ACUITY] = v.acuity;
    s.scalarGenes[sg + ScalarGene.DIET] = v.diet;
  };
  /** pred at (100,100) facing +x, the other creature 10u ahead at (110,100). */
  const pair = (predDiet: number, otherDiet: number): OrganismStore => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.heading[a] = 0; // facing +x (toward b)
    s.x[b] = 110;
    s.y[b] = 100;
    setVision(s, a, { range: 24, fov: 1.5, acuity: 1, diet: predDiet });
    setVision(s, b, { range: 24, fov: 1.5, acuity: 1, diet: otherDiet });
    s.rebuildLive();
    return s;
  };
  const hashOf = (s: OrganismStore): SpatialHash => {
    const h = new SpatialHash(W, H, 12, 4);
    h.build(s);
    return h;
  };

  it('a predator’s sight points TOWARD a nearby herbivore (chase)', () => {
    const s = pair(1, 0); // viewer carnivore, other herbivore
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeGreaterThan(0); // pulled toward +x where the prey is
  });

  it('a herbivore’s sight points AWAY from a nearby predator (flee)', () => {
    const s = pair(0, 1); // viewer herbivore, other carnivore
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeLessThan(0); // pushed away from +x where the predator is
  });

  it('sees nothing outside its vision range', () => {
    const s = pair(1, 0);
    setVision(s, 0, { range: 5, fov: 1.5, acuity: 1, diet: 1 }); // prey is 10u away > range 5
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0);
  });

  it('sees nothing outside its vision cone (FOV)', () => {
    const s = pair(1, 0);
    s.heading[0] = Math.PI; // facing −x, away from the prey at +x
    setVision(s, 0, { range: 24, fov: 0.3, acuity: 1, diet: 1 }); // narrow cone, prey behind
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0); // no leak on either axis
  });

  it('a blind creature (acuity 0) sees nothing', () => {
    const s = pair(1, 0);
    setVision(s, 0, { range: 24, fov: 1.5, acuity: 0, diet: 1 });
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBe(0);
  });

  it('two creatures at the same position give finite, zero sight (div-by-zero guard)', () => {
    const s = pair(1, 0);
    s.x[1] = s.x[0]!; // co-locate the prey on the predator → d === 0
    s.y[1] = s.y[0]!;
    senseCreatures(s, hashOf(s), cfg, null);
    expect(Number.isFinite(s.sightX[0]!)).toBe(true);
    expect(Number.isFinite(s.sightY[0]!)).toBe(true);
    expect(s.sightX[0]!).toBe(0); // the d===0 contributor is skipped, not NaN
    expect(s.sightY[0]!).toBe(0);
  });

  // ── shelter-seeking (size-aware sight) ──────────────────────────────────────────────────────────
  const setSize = (s: OrganismStore, slot: number, size: number): void => {
    s.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.SIZE] = size;
  };
  const setShelter = (s: OrganismStore, slot: number, drive: number): void => {
    s.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.SHELTER_DRIVE] = drive;
  };

  it('a small herbivore is pulled TOWARD a bigger same-guild creature (shelter)', () => {
    const s = pair(0, 0); // same diet → chase/flee appeal is ~0, so only shelter can move the vector
    setSize(s, 0, 4); // viewer small
    setSize(s, 1, 12); // neighbor much bigger
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeGreaterThan(0); // drawn toward the big neighbor at +x
  });

  it('shelter does NOT override fleeing a bigger PREDATOR (diet-similarity gates it)', () => {
    const s = pair(0, 1); // viewer herbivore, neighbor carnivore (dissimilar diet → dietSim ≈ 0)
    setSize(s, 0, 4);
    setSize(s, 1, 12); // predator is bigger, but shelter must not draw prey into it
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeLessThan(0); // still flees the predator
  });

  it('no shelter pull toward a SMALLER same-guild creature', () => {
    const s = pair(0, 0);
    setSize(s, 0, 12); // viewer big
    setSize(s, 1, 4); // neighbor smaller → sizeDiff < 0 → no shelter term
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBe(0); // appeal 0 and no shelter → neutral
  });

  it('shelterGain 0 ablates the shelter pull', () => {
    const cfg0 = defaultConfig({ worldWidth: W, worldHeight: H, shelterGain: 0 });
    const s = pair(0, 0);
    setSize(s, 0, 4);
    setSize(s, 1, 12);
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg0, null);
    expect(s.sightX[0]!).toBe(0); // same setup as the shelter test, but the global gain zeroes it
  });

  // ── schooling / cohesion ────────────────────────────────────────────────────────────────────────
  // Default is HUE-BLIND (pull toward any neighbor); cohesionHueBlind:false restores same-hue-only.
  const setCohesion = (s: OrganismStore, slot: number, drive: number): void => {
    s.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.COHESION_DRIVE] = drive;
  };
  const cfgKin = defaultConfig({ worldWidth: W, worldHeight: H, cohesionHueBlind: false });

  it('a creature is pulled TOWARD a neighbor (schooling)', () => {
    const s = pair(0, 0); // same diet → appeal ~0, so only cohesion can move the vector
    s.hue[0] = 0.3;
    s.hue[1] = 0.3;
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeGreaterThan(0); // drawn toward the neighbor at +x
  });

  it('hue-blind (default) pulls TOWARD an opposite-hue neighbor too', () => {
    const s = pair(0, 0);
    s.hue[0] = 0;
    s.hue[1] = 0.5; // maximally distant hue — irrelevant under hue-blind
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeGreaterThan(0); // lineage ignored → still schools
  });

  it('cohesionHueBlind:false gives NO cohesion pull toward an opposite-hue neighbor (kin-clump mode)', () => {
    const s = pair(0, 0);
    s.hue[0] = 0;
    s.hue[1] = 0.5; // maximally distant hue → similarity 0
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfgKin, null);
    expect(s.sightX[0]!).toBe(0); // appeal 0 and hueSim 0 → neutral
  });

  it('cohesionHueBlind:false still pulls TOWARD a same-hue neighbor', () => {
    const s = pair(0, 0);
    s.hue[0] = 0.3;
    s.hue[1] = 0.3; // identical lineage color → full similarity
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfgKin, null);
    expect(s.sightX[0]!).toBeGreaterThan(0); // kin attract
  });

  it('founder-strength cohesion does NOT override fleeing a same-hue predator', () => {
    const s = pair(0, 1); // viewer herbivore, neighbor predator
    s.hue[0] = 0.3;
    s.hue[1] = 0.3; // same lineage color, but it wants to eat me
    setCohesion(s, 0, 0.5); // founder center — bounded below the flee appeal (−1)
    senseCreatures(s, hashOf(s), cfg, null);
    expect(s.sightX[0]!).toBeLessThan(0); // still flees
  });

  it('cohesionGain 0 ablates the schooling pull', () => {
    const cfg0 = defaultConfig({ worldWidth: W, worldHeight: H, cohesionGain: 0 });
    const s = pair(0, 0);
    s.hue[0] = 0.3;
    s.hue[1] = 0.3;
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfg0, null);
    expect(s.sightX[0]!).toBe(0);
  });

  // ── wall occlusion (line-of-sight blocking) ──────────────────────────────────────────────────────
  // A dense Walls over the small world; scan for a viewer→target pair that is in-cone, in-range, AND
  // has a solid cell strictly between them — the fixture the occlusion guard must act on.
  const dense = defaultConfig({
    worldWidth: W,
    worldHeight: H,
    wallCols: 128,
    wallRows: 128,
    wallRegionCount: 1,
    wallDensity: 0.6,
    flowScale: 6, // short noise wavelength → fine solid features a 10u segment can cross
    foodPatchCount: 0, // no pockets to carve open → solids stay where the noise put them
    seed: 7,
  });
  /** Find a (viewer, target) 10u apart, viewer facing the target, with a wall on the segment. */
  const occludedFixture = (
    walls: Walls,
  ): { vx: number; vy: number; tx: number; ty: number } | null => {
    for (let vx = 20; vx < W - 20; vx += 4) {
      for (let vy = 20; vy < H - 20; vy += 4) {
        const tx = vx + 10;
        const ty = vy;
        if (walls.isSolidAt(vx, vy) || walls.isSolidAt(tx, ty)) continue; // both ends must be open
        if (walls.losBlocked(vx, vy, tx, ty)) return { vx, vy, tx, ty };
      }
    }
    return null;
  };
  const occludedPair = (fx: { vx: number; vy: number; tx: number; ty: number }): OrganismStore => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.x[a] = fx.vx;
    s.y[a] = fx.vy;
    s.heading[a] = 0; // facing +x toward the target
    s.x[b] = fx.tx;
    s.y[b] = fx.ty;
    setVision(s, a, { range: 24, fov: 1.5, acuity: 1, diet: 1 });
    setVision(s, b, { range: 24, fov: 1.5, acuity: 1, diet: 0 });
    s.rebuildLive();
    return s;
  };

  it('a wall between viewer and target removes the target from the sight vector', () => {
    const walls = new Walls(W, H, dense.wallCols, dense.wallRows, dense);
    const fx = occludedFixture(walls);
    expect(fx).not.toBeNull(); // the dense field must contain an occluded in-cone pair
    const s = occludedPair(fx!);
    const h = hashOf(s);
    // Sanity: with NO wall the target is clearly seen (non-zero pull toward +x).
    senseCreatures(s, h, cfg, null);
    expect(Math.abs(s.sightX[0]!)).toBeGreaterThan(0);
    // With occlusion ON the wall hides the target → sight collapses to ~0.
    senseCreatures(s, h, cfg, walls);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0);
  });

  it('wallOccludesVision:false ignores walls (target still seen behind a wall)', () => {
    const walls = new Walls(W, H, dense.wallCols, dense.wallRows, dense);
    const fx = occludedFixture(walls);
    expect(fx).not.toBeNull();
    const s = occludedPair(fx!);
    const cfgNoOcc = defaultConfig({ worldWidth: W, worldHeight: H, wallOccludesVision: false });
    senseCreatures(s, hashOf(s), cfgNoOcc, walls);
    expect(Math.abs(s.sightX[0]!)).toBeGreaterThan(0); // ablation off → wall ignored, target seen
  });
});
