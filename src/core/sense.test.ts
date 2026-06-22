import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { SpatialHash } from './spatial-hash';
import { senseFood, senseCreatures } from './sense';
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
    senseFood(s, f, W, H);
    expect(s.senseX[i]!).toBeGreaterThan(0); // points toward +x (more food)
    expect(Math.abs(s.senseY[i]!)).toBeLessThan(Math.abs(s.senseX[i]!)); // ~no y component
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
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeGreaterThan(0); // pulled toward +x where the prey is
  });

  it('a herbivore’s sight points AWAY from a nearby predator (flee)', () => {
    const s = pair(0, 1); // viewer herbivore, other carnivore
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeLessThan(0); // pushed away from +x where the predator is
  });

  it('sees nothing outside its vision range', () => {
    const s = pair(1, 0);
    setVision(s, 0, { range: 5, fov: 1.5, acuity: 1, diet: 1 }); // prey is 10u away > range 5
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0);
  });

  it('sees nothing outside its vision cone (FOV)', () => {
    const s = pair(1, 0);
    s.heading[0] = Math.PI; // facing −x, away from the prey at +x
    setVision(s, 0, { range: 24, fov: 0.3, acuity: 1, diet: 1 }); // narrow cone, prey behind
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0); // no leak on either axis
  });

  it('a blind creature (acuity 0) sees nothing', () => {
    const s = pair(1, 0);
    setVision(s, 0, { range: 24, fov: 1.5, acuity: 0, diet: 1 });
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBe(0);
  });

  it('two creatures at the same position give finite, zero sight (div-by-zero guard)', () => {
    const s = pair(1, 0);
    s.x[1] = s.x[0]!; // co-locate the prey on the predator → d === 0
    s.y[1] = s.y[0]!;
    senseCreatures(s, hashOf(s), cfg);
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
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeGreaterThan(0); // drawn toward the big neighbor at +x
  });

  it('shelter does NOT override fleeing a bigger PREDATOR (diet-similarity gates it)', () => {
    const s = pair(0, 1); // viewer herbivore, neighbor carnivore (dissimilar diet → dietSim ≈ 0)
    setSize(s, 0, 4);
    setSize(s, 1, 12); // predator is bigger, but shelter must not draw prey into it
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeLessThan(0); // still flees the predator
  });

  it('no shelter pull toward a SMALLER same-guild creature', () => {
    const s = pair(0, 0);
    setSize(s, 0, 12); // viewer big
    setSize(s, 1, 4); // neighbor smaller → sizeDiff < 0 → no shelter term
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBe(0); // appeal 0 and no shelter → neutral
  });

  it('shelterGain 0 ablates the shelter pull', () => {
    const cfg0 = defaultConfig({ worldWidth: W, worldHeight: H, shelterGain: 0 });
    const s = pair(0, 0);
    setSize(s, 0, 4);
    setSize(s, 1, 12);
    setShelter(s, 0, 0.2);
    senseCreatures(s, hashOf(s), cfg0);
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
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeGreaterThan(0); // drawn toward the neighbor at +x
  });

  it('hue-blind (default) pulls TOWARD an opposite-hue neighbor too', () => {
    const s = pair(0, 0);
    s.hue[0] = 0;
    s.hue[1] = 0.5; // maximally distant hue — irrelevant under hue-blind
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeGreaterThan(0); // lineage ignored → still schools
  });

  it('cohesionHueBlind:false gives NO cohesion pull toward an opposite-hue neighbor (kin-clump mode)', () => {
    const s = pair(0, 0);
    s.hue[0] = 0;
    s.hue[1] = 0.5; // maximally distant hue → similarity 0
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfgKin);
    expect(s.sightX[0]!).toBe(0); // appeal 0 and hueSim 0 → neutral
  });

  it('cohesionHueBlind:false still pulls TOWARD a same-hue neighbor', () => {
    const s = pair(0, 0);
    s.hue[0] = 0.3;
    s.hue[1] = 0.3; // identical lineage color → full similarity
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfgKin);
    expect(s.sightX[0]!).toBeGreaterThan(0); // kin attract
  });

  it('founder-strength cohesion does NOT override fleeing a same-hue predator', () => {
    const s = pair(0, 1); // viewer herbivore, neighbor predator
    s.hue[0] = 0.3;
    s.hue[1] = 0.3; // same lineage color, but it wants to eat me
    setCohesion(s, 0, 0.5); // founder center — bounded below the flee appeal (−1)
    senseCreatures(s, hashOf(s), cfg);
    expect(s.sightX[0]!).toBeLessThan(0); // still flees
  });

  it('cohesionGain 0 ablates the schooling pull', () => {
    const cfg0 = defaultConfig({ worldWidth: W, worldHeight: H, cohesionGain: 0 });
    const s = pair(0, 0);
    s.hue[0] = 0.3;
    s.hue[1] = 0.3;
    setCohesion(s, 0, 0.5);
    senseCreatures(s, hashOf(s), cfg0);
    expect(s.sightX[0]!).toBe(0);
  });
});
