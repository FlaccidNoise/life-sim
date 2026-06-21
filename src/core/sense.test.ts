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
});
