import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { SpatialHash } from './spatial-hash';
import { Rng } from './rng';
import { defaultConfig, type Config } from './config';
import { metabolize, hunt, cullDead, reproduce, satiatedBar } from './economy';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS, MIN_BAND } from './genome';

const W = 128;
const H = 128;

/** Seed a slot's scalar genes at their config centers (→ zero gene-upkeep, efficiency 1), then apply
 *  per-gene overrides keyed by ScalarGene index. Lets a test isolate one gene's economic effect. */
function genes(
  s: OrganismStore,
  slot: number,
  cfg: Config,
  overrides: Record<number, number> = {},
): void {
  const base = slot * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++)
    s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
  // diet's center (0.5) is only a mutation reference, not a sensible default → make test creatures
  // herbivores (diet 0, full graze) unless a test overrides it.
  s.scalarGenes[base + ScalarGene.DIET] = 0;
  for (const [idx, v] of Object.entries(overrides)) s.scalarGenes[base + Number(idx)] = v;
}

/** Build a spatial hash over the store's live set. metabolize's signature requires it for the lever-D
 *  crowding scan; with crowdingMortality=0 (the default) it is never read. cellSize 12 = default crowdRadius. */
function hashOf(s: OrganismStore): SpatialHash {
  const h = new SpatialHash(W, H, 12, 64);
  h.build(s);
  return h;
}

describe('metabolize', () => {
  const cfg = defaultConfig({ basalCost: 0.4, moveCost: 0.01, satiatedThreshold: 1000 });

  it('eats from the current food cell (eatRate gene) and pays basal + movement cost', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2 });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 1); // cell full (B=10)
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(5 + 2 - 0.4); // eat 2, basal 0.4·eff(1), no movement, no gene cost
    expect(food.sampleAt(10, 10)).toBeCloseTo(8); // 2 grazed
    expect(s.age[i]!).toBe(1);
  });

  it('brain-gated eating throttles intake AND depletion by the eatGate actuator', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    s.eatGate[i] = 0.5; // half-throttle (head half-up)
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2 });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 1);
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(5 + 1 - 0.4); // eat 2·0.5 = 1
    expect(food.sampleAt(10, 10)).toBeCloseTo(9); // only 1 grazed — depletion scales with the gate too
  });

  it('brainGatedEating off ignores the eatGate (unconditional eating)', () => {
    const cfgOff = defaultConfig({
      basalCost: 0.4,
      moveCost: 0.01,
      satiatedThreshold: 1000,
      brainGatedEating: false,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    s.eatGate[i] = 0; // would zero intake IF gating were on
    genes(s, i, cfgOff, { [ScalarGene.EAT_RATE]: 2 });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 1);
    metabolize(s, food, hashOf(s), cfgOff, null);
    expect(s.energy[i]).toBeCloseTo(5 + 2 - 0.4); // full eat 2 despite eatGate 0
  });

  it('a satiated creature stops eating (leaves biomass for others)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 100;
    const cfgSat = defaultConfig({ basalCost: 0.4, moveCost: 0.01, satiatedThreshold: 100 });
    genes(s, i, cfgSat, { [ScalarGene.EAT_RATE]: 2 });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 1);
    metabolize(s, food, hashOf(s), cfgSat, null);
    expect(food.sampleAt(10, 10)).toBeCloseTo(10); // nothing grazed
    expect(s.energy[i]).toBeCloseTo(100 - 0.4); // still pays basal
  });

  it('charges movement cost ∝ speed²', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.vx[i] = 3;
    s.vy[i] = 4; // speed² = 25
    s.energy[i] = 50;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2 });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty → no eat income
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(50 - 0.4 - 0.01 * 25);
  });

  it('charges extra basal upkeep for costed genes above their center (the selection cost)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 50;
    // maxSpeed +4 above center, eatRate +2 above center; everything else at center.
    genes(s, i, cfg, {
      [ScalarGene.MAX_SPEED]: cfg.maxSpeed + 4,
      [ScalarGene.EAT_RATE]: cfg.eatRate + 2,
    });
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty → isolate the costs
    metabolize(s, food, hashOf(s), cfg, null);
    // upkeep = basal(0.4)·eff(1) + 4·maxSpeedCost(0.05) + 2·eatRateCost(0.15) = 0.4 + 0.2 + 0.3 = 0.9
    expect(s.energy[i]).toBeCloseTo(50 - 0.9);
  });

  it('metabolic efficiency scales the basal cost (thrifty bodies are cheap)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 50;
    genes(s, i, cfg, { [ScalarGene.METAB_EFF]: 0.5 }); // half-efficiency metabolism
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(50 - 0.4 * 0.5); // basal halved, no gene upkeep
  });

  it('deadWaterCost adds an energy drain in dead water (the isolation lever), OFF at 0', () => {
    // One pocket → dead water (fertility 0) fills the rest of the field.
    const food = new FoodField(W, H, 16, 16, 10, 1);
    food.seedPatches(1, 2, 0, new Rng(2));
    // locate a dead-water cell (fertility ≈ 0, so no graze income to confound the cost)
    let dx = -1;
    let dy = -1;
    for (let yy = 4; yy < H && dx < 0; yy += 8)
      for (let xx = 4; xx < W; xx += 8)
        if (food.fertilityAt(xx, yy) < 1e-6) {
          dx = xx;
          dy = yy;
          break;
        }
    expect(dx).toBeGreaterThanOrEqual(0); // found dead water

    const lossAt = (deadWaterCost: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.x[i] = dx;
      s.y[i] = dy;
      s.energy[i] = 50;
      genes(s, i, cfg); // herbivore, centred genes → no gene upkeep, efficiency 1
      s.rebuildLive();
      metabolize(
        s,
        food,
        hashOf(s),
        defaultConfig({ basalCost: 0.4, moveCost: 0, deadWaterCost }),
        null,
      );
      return 50 - s.energy[i];
    };
    expect(lossAt(0)).toBeCloseTo(0.4); // OFF: just basal (no food in dead water → no graze income)
    expect(lossAt(2)).toBeCloseTo(0.4 + 2); // basal + deadWaterCost·(1−fertility=0)
  });
});

describe('metabolize density-dependent crowding drain (lever D)', () => {
  // Costs zeroed + empty food so the ONLY energy change is the crowding drain. crowdRadius 12 ≤ the hash
  // cell, so the 3×3 neighborhood covers it; clustering everyone within a ~2-unit box keeps them in range.
  const base = {
    basalCost: 0,
    moveCost: 0,
    satiatedThreshold: 1000,
    crowdThreshold: 6,
    crowdRadius: 12,
    worldWidth: W,
    worldHeight: H,
  };
  const empty = (): FoodField => new FoodField(W, H, 16, 16, 10, 0);
  /** focal (slot 0) at (50,50) + (count−1) neighbors packed into a ~2-unit box, all within crowdRadius. */
  const cluster = (cfg: Config, count: number): { s: OrganismStore; focal: number } => {
    const s = new OrganismStore(16);
    let focal = -1;
    for (let n = 0; n < count; n++) {
      const i = s.alloc();
      if (n === 0) focal = i;
      s.x[i] = 50 + (n % 3);
      s.y[i] = 50 + ((n / 3) | 0);
      s.energy[i] = 50;
      genes(s, i, cfg);
    }
    s.rebuildLive();
    return { s, focal };
  };

  it('crowdingMortality=0 → no drain even when densely packed (the byte-identical OFF path)', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0 });
    const { s, focal } = cluster(cfg, 9); // focal + 8 neighbors
    metabolize(s, empty(), hashOf(s), cfg, null);
    expect(s.energy[focal]).toBeCloseTo(50); // OFF → unchanged (gained 0, costs 0)
  });

  it('drains crowdingMortality per neighbor above crowdThreshold', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0.3 });
    const { s, focal } = cluster(cfg, 9); // focal sees 8 neighbors; over = 8 − 6 = 2
    metabolize(s, empty(), hashOf(s), cfg, null);
    expect(s.energy[focal]).toBeCloseTo(50 - 0.3 * 2); // drain 0.6
  });

  it('a creature inside the free band (neighbors ≤ crowdThreshold) pays nothing', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0.3 });
    const { s, focal } = cluster(cfg, 5); // focal sees 4 ≤ 6 → no drain
    metabolize(s, empty(), hashOf(s), cfg, null);
    expect(s.energy[focal]).toBeCloseTo(50);
  });

  it('an isolated creature (no neighbors in radius) pays nothing even with crowding ON', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0.3 });
    const s = new OrganismStore(4);
    const a = s.alloc();
    s.x[a] = 10;
    s.y[a] = 10;
    s.energy[a] = 50;
    genes(s, a, cfg);
    const b = s.alloc();
    s.x[b] = 100;
    s.y[b] = 100; // far beyond crowdRadius from a
    s.energy[b] = 50;
    genes(s, b, cfg);
    s.rebuildLive();
    metabolize(s, empty(), hashOf(s), cfg, null);
    expect(s.energy[a]).toBeCloseTo(50);
    expect(s.energy[b]).toBeCloseTo(50);
  });
});

describe('metabolize two-channel niche split (lever B)', () => {
  // foodChannels=2: the eat budget splits across channels A/B by FORAGE_PREF, then converts at the
  // specialization rate spec=1+forageSpecBonus·(2·|pref−0.5|). Costs zeroed so energy delta == income.
  const cfg = defaultConfig({
    basalCost: 0,
    moveCost: 0,
    satiatedThreshold: 1000,
    foodChannels: 2,
    forageSpecBonus: 0.5,
  });
  // K=10 split 0.5/0.5 → each channel's cap = 5, both full. eatRate 2 = center → no gene upkeep.
  const dualFood = (): FoodField => new FoodField(W, H, 16, 16, 10, 1, 2, 0.5);

  it('a generalist (pref 0.5) grazes BOTH channels equally at base conversion (spec=1)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 0.5 });
    s.rebuildLive();
    const food = dualFood();
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(5 + 2); // take 1 from A + 1 from B, spec=1 → gained 2
    expect(food.sampleAt(10, 10)).toBeCloseTo(5 - 1);
    expect(food.sampleAt2(10, 10)).toBeCloseTo(5 - 1);
  });

  it('a hard B-specialist (pref 1) eats only channel B and converts at the 1.5× bonus', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 1 });
    s.rebuildLive();
    const food = dualFood();
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(5 + 3); // takeB 2, spec=1.5 → gained 3
    expect(food.sampleAt(10, 10)).toBeCloseTo(5); // channel A untouched
    expect(food.sampleAt2(10, 10)).toBeCloseTo(5 - 2); // channel B depleted by 2
  });

  it('forageSpecBonus=0 removes the windfall: a specialist earns the single-channel ceiling', () => {
    const cfg0 = defaultConfig({
      basalCost: 0,
      moveCost: 0,
      satiatedThreshold: 1000,
      foodChannels: 2,
      forageSpecBonus: 0,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg0, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 1 });
    s.rebuildLive();
    const food = dualFood();
    metabolize(s, food, hashOf(s), cfg0, null);
    expect(s.energy[i]).toBeCloseTo(5 + 2); // takeB 2, spec=1 → gained 2 (no specialization bonus)
  });
});

describe('metabolize three-channel place-coupled niche (F1)', () => {
  // foodChannels=3, foodPocketChannelMode=1: pockets grow distinct resources (A/B/C round-robin). The eat
  // budget splits across {A,B,C} by the barycentric FORAGE_PREF + FORAGE_PREF_C preference, then converts at
  // spec=1+forageSpecBonus·((maxW−1/3)/(2/3)). Costs zeroed so the energy delta == grazing income. This is
  // the NON-VACUITY proof: a C-specialist standing in a C-pocket genuinely earns energy from channel C.
  const cfg = defaultConfig({
    basalCost: 0,
    moveCost: 0,
    satiatedThreshold: 1000,
    foodChannels: 3,
    foodPocketChannelMode: 1,
    forageSpecBonus: 0.5,
  });
  // Replays a fixed RNG sequence → three well-separated pockets so cell (16,16)→A, (48,48)→B, (80,80)→C.
  class QueueRng {
    private j = 0;
    constructor(private q: number[]) {}
    float(): number {
      return this.q[Math.min(this.j++, this.q.length - 1)]!;
    }
  }
  // 1024² over a 128-cell grid, K=10, three pockets at cells (16,16),(48,48),(80,80) (p%3 → A,B,C).
  const tripleFood = (): FoodField => {
    const f = new FoodField(1024, 1024, 128, 128, 10, 1, 3, 0.5, 1);
    f.seedPatches(3, 5, 0, new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]));
    return f;
  };

  it('a hard C-specialist in a C-pocket earns energy from channel C (and depletes only C)', () => {
    const food = tripleFood();
    const pC = food.patchCenters[2]!; // pocket 2 → channel C
    // Guard the fixture: the C-pocket really carries channel-C biomass and ~nothing in A/B (place-coupling).
    expect(food.sampleAt3(pC.x, pC.y)).toBeGreaterThan(5);
    expect(food.sampleAt(pC.x, pC.y)).toBeLessThan(0.5);
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = pC.x;
    s.y[i] = pC.y;
    s.energy[i] = 5;
    // prefC 1 → wC=1, wA=wB=0 (pure C-specialist). eatRate 2 (center) → no gene upkeep.
    genes(s, i, cfg, {
      [ScalarGene.EAT_RATE]: 2,
      [ScalarGene.FORAGE_PREF]: 0.5,
      [ScalarGene.FORAGE_PREF_C]: 1,
    });
    s.rebuildLive();
    const cBefore = food.sampleAt3(pC.x, pC.y);
    metabolize(s, food, hashOf(s), cfg, null);
    // takeC = budget·wC = 2, spec = 1+0.5·1 = 1.5 → gained 3.
    expect(s.energy[i]).toBeCloseTo(5 + 3);
    expect(food.sampleAt3(pC.x, pC.y)).toBeCloseTo(cBefore - 2); // channel C depleted by exactly the take
    expect(food.sampleAt(pC.x, pC.y)).toBeLessThan(0.5); // channel A in a C-pocket stays empty
    expect(food.sampleAt2(pC.x, pC.y)).toBeLessThan(0.5); // channel B too
  });

  it('a C-specialist standing in an A-pocket starves on C (sampleAt3 ~0 there → no income)', () => {
    const food = tripleFood();
    const pA = food.patchCenters[0]!; // pocket 0 → channel A
    expect(food.sampleAt3(pA.x, pA.y)).toBeLessThan(0.5); // no channel-C resource in an A-pocket
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = pA.x;
    s.y[i] = pA.y;
    s.energy[i] = 5;
    genes(s, i, cfg, {
      [ScalarGene.EAT_RATE]: 2,
      [ScalarGene.FORAGE_PREF]: 0.5,
      [ScalarGene.FORAGE_PREF_C]: 1, // pure C eater
    });
    s.rebuildLive();
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(5); // wA=wB=0, no C here → grazed nothing, no costs → unchanged
    expect(food.sampleAt(pA.x, pA.y)).toBeGreaterThan(5); // the A resource it can't use is untouched
  });

  it('a generalist (pref 0.5, prefC 0.5) in a C-pocket grazes the FULL budget on C (availability-weighted)', () => {
    const food = tripleFood();
    const pC = food.patchCenters[2]!;
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = pC.x;
    s.y[i] = pC.y;
    s.energy[i] = 5;
    // pref 0.5, prefC 0.5 → wC=0.5, wB=0.25, wA=0.25. In a C-pocket only channel C has biomass, so the
    // availability weighting (e_ch = w_ch·avail_ch, renormalized) routes the WHOLE budget to C — a generalist
    // does NOT starve here; it just forgoes the specialization bonus.
    genes(s, i, cfg, {
      [ScalarGene.EAT_RATE]: 2,
      [ScalarGene.FORAGE_PREF]: 0.5,
      [ScalarGene.FORAGE_PREF_C]: 0.5,
    });
    s.rebuildLive();
    metabolize(s, food, hashOf(s), cfg, null);
    // Only C present → eSum = wC·avC, so takeC = budget·(eC/eSum) = budget = 2. maxW = 0.5 → spec = 1.125.
    // gained = 2·1.125 = 2.25 (vs the old waste-the-A/B-share model's 1.125).
    expect(s.energy[i]).toBeCloseTo(5 + 2.25);
  });
});

describe('satiatedBar (size-scaled energy reserve)', () => {
  it('scales the full bar with body size — a 2×-size body has a 2× reserve (exp 1)', () => {
    const cfg = defaultConfig({ cellRadius: 6, sizeStoreExp: 1 });
    const s = new OrganismStore(4);
    const i = s.alloc();
    genes(s, i, cfg, {
      [ScalarGene.SATIATED_THRESHOLD]: 100,
      [ScalarGene.REPRO_THRESHOLD]: 40,
      [ScalarGene.SIZE]: 12, // 2× the reference (cellRadius 6)
    });
    expect(satiatedBar(s.scalarGenes, i, cfg)).toBeCloseTo(200); // 100 × (12/6)^1
  });

  it('a small body’s scaled bar is floored to MIN_BAND above its repro bar', () => {
    const cfg = defaultConfig({ cellRadius: 6, sizeStoreExp: 1 });
    const s = new OrganismStore(4);
    const i = s.alloc();
    genes(s, i, cfg, {
      [ScalarGene.SATIATED_THRESHOLD]: 100,
      [ScalarGene.REPRO_THRESHOLD]: 40,
      [ScalarGene.SIZE]: 2, // 100 × (2/6) = 33.3 < repro(40)+MIN_BAND(5)=45 → floored
    });
    expect(satiatedBar(s.scalarGenes, i, cfg)).toBeCloseTo(40 + MIN_BAND);
  });

  it('sizeStoreExp 0 leaves the bar at the raw gene (no size coupling)', () => {
    const cfg = defaultConfig({ cellRadius: 6, sizeStoreExp: 0 });
    const s = new OrganismStore(4);
    const i = s.alloc();
    genes(s, i, cfg, {
      [ScalarGene.SATIATED_THRESHOLD]: 100,
      [ScalarGene.REPRO_THRESHOLD]: 40,
      [ScalarGene.SIZE]: 30, // huge, but coupling off
    });
    expect(satiatedBar(s.scalarGenes, i, cfg)).toBeCloseTo(100);
  });
});

describe('metabolize size→move-cost coupling', () => {
  it('a 2×-size body pays 2× the movement cost (exp 1)', () => {
    const cfg = defaultConfig({
      basalCost: 0.4,
      moveCost: 0.01,
      satiatedThreshold: 1000,
      cellRadius: 6,
      sizeMoveCostExp: 1,
      sizeCost: 0, // isolate the move-cost coupling from the SIZE gene's own upkeep
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.vx[i] = 3;
    s.vy[i] = 4; // speed² = 25
    s.energy[i] = 50;
    genes(s, i, cfg, { [ScalarGene.SIZE]: 12 }); // 2× reference → moveFactor (12/6)^1 = 2
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty → isolate the costs
    metabolize(s, food, hashOf(s), cfg, null);
    expect(s.energy[i]).toBeCloseTo(50 - 0.4 - 0.01 * 2 * 25); // movement cost doubled by size
  });
});

describe('hunt (predation)', () => {
  const cfg = defaultConfig({ biteRange: 12, damage: 5, worldWidth: W, worldHeight: H });
  const mkHash = (s: OrganismStore): SpatialHash => {
    const h = new SpatialHash(W, H, 12, 8); // cell = biteRange
    h.build(s);
    return h;
  };

  it('a predator drains energy from the nearest creature into itself', () => {
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 20;
    s.x[prey] = 54;
    s.y[prey] = 50; // 4 units away, within biteRange 12
    s.energy[prey] = 30;
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 }); // small enough to eat
    s.rebuildLive();
    hunt(s, mkHash(s), cfg, null);
    // drain = min(damage(5)·diet(1), preyEnergy) = 5; prey loses the drain, predator absorbs drain×gain.
    expect(s.energy[prey]).toBeCloseTo(25);
    expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain);
  });

  it('a pure grazer (diet 0) does not hunt', () => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.x[a] = 50;
    s.y[a] = 50;
    s.energy[a] = 20;
    s.x[b] = 54;
    s.y[b] = 50;
    s.energy[b] = 30;
    genes(s, a, cfg, { [ScalarGene.DIET]: 0 });
    genes(s, b, cfg, { [ScalarGene.DIET]: 0 });
    s.rebuildLive();
    hunt(s, mkHash(s), cfg, null);
    expect(s.energy[a]).toBe(20);
    expect(s.energy[b]).toBe(30);
  });

  it('drain is capped at the prey’s energy (no over-draining / no free energy)', () => {
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 10;
    s.x[prey] = 52;
    s.y[prey] = 50;
    s.energy[prey] = 3; // only 3 to give
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 20, [ScalarGene.SIZE]: 10 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();
    hunt(s, mkHash(s), cfg, null);
    expect(s.energy[prey]).toBeCloseTo(0); // drained to 0 (capped) → dies next cull
    expect(s.energy[pred]).toBeCloseTo(10 + 3 * cfg.predationGain); // gained the 3 that existed × gain
  });

  it('with cannibalism OFF, a predator spares a same-or-higher-diet peer but still eats prey', () => {
    const noCannibal = { ...cfg, cannibalism: false };
    // Two predators side by side + a herbivore prey just past the peer. The hunter must skip the peer
    // (same diet) and bite the prey instead — no predator-on-predator drain.
    const s = new OrganismStore(4);
    const hunter = s.alloc();
    const peer = s.alloc();
    const prey = s.alloc();
    s.x[hunter] = 50;
    s.y[hunter] = 50;
    s.energy[hunter] = 20;
    s.x[peer] = 52; // nearer than the prey
    s.y[peer] = 50;
    s.energy[peer] = 30;
    s.x[prey] = 56;
    s.y[prey] = 50; // within biteRange 12
    s.energy[prey] = 30;
    genes(s, hunter, cfg, {
      [ScalarGene.DIET]: 0.9,
      [ScalarGene.DAMAGE]: 5,
      [ScalarGene.SIZE]: 10,
    });
    // peer is small enough to eat (size) → only the DIET gate can spare it. toothless so it can't bite back.
    genes(s, peer, cfg, { [ScalarGene.DIET]: 0.9, [ScalarGene.DAMAGE]: 0, [ScalarGene.SIZE]: 5 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();
    hunt(s, mkHash(s), noCannibal, null);
    expect(s.energy[peer]).toBe(30); // peer spared despite being nearest
    expect(s.energy[prey]).toBeCloseTo(30 - 5 * 0.9); // prey eaten instead
  });

  it('with cannibalism ON (default), the predator bites the nearest peer', () => {
    const s = new OrganismStore(4);
    const hunter = s.alloc();
    const peer = s.alloc();
    s.x[hunter] = 50;
    s.y[hunter] = 50;
    s.energy[hunter] = 20;
    s.x[peer] = 52;
    s.y[peer] = 50;
    s.energy[peer] = 30;
    genes(s, hunter, cfg, {
      [ScalarGene.DIET]: 0.9,
      [ScalarGene.DAMAGE]: 5,
      [ScalarGene.SIZE]: 10,
    });
    genes(s, peer, cfg, { [ScalarGene.DIET]: 0.9, [ScalarGene.DAMAGE]: 0, [ScalarGene.SIZE]: 5 }); // small → eatable
    s.rebuildLive();
    hunt(s, mkHash(s), cfg, null); // cannibalism true
    expect(s.energy[peer]).toBeCloseTo(30 - 5 * 0.9); // peer drained
  });

  it('big-eats-small: a predator cannot bite prey that is not enough smaller (size refuge)', () => {
    const mk = (predSize: number, preySize: number): number => {
      const s = new OrganismStore(4);
      const pred = s.alloc();
      const prey = s.alloc();
      s.x[pred] = 50;
      s.y[pred] = 50;
      s.energy[pred] = 20;
      s.x[prey] = 54;
      s.y[prey] = 50;
      s.energy[prey] = 30;
      genes(s, pred, cfg, {
        [ScalarGene.DIET]: 1,
        [ScalarGene.DAMAGE]: 5,
        [ScalarGene.SIZE]: predSize,
      });
      genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: preySize });
      s.rebuildLive();
      hunt(s, mkHash(s), cfg, null); // huntSizeRatio 1.15
      return s.energy[prey];
    };
    expect(mk(10, 5)).toBeCloseTo(25); // 10 ≥ 5×1.15 → eaten (lost 5)
    expect(mk(6, 6)).toBe(30); // same size → size refuge, untouched
    expect(mk(5, 6)).toBe(30); // smaller predator → can't eat a bigger creature
  });

  it('no creature in bite range → no drain', () => {
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 20;
    s.x[prey] = 90;
    s.y[prey] = 90; // far beyond biteRange
    s.energy[prey] = 30;
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0 });
    s.rebuildLive();
    hunt(s, mkHash(s), cfg, null);
    expect(s.energy[pred]).toBe(20);
    expect(s.energy[prey]).toBe(30);
  });

  describe('Red Queen counter-bite (lever E1)', () => {
    // A predator (diet 1, damage 5) and an armed herbivore (diet 0, DAMAGE 8) 4 units apart. The bite
    // drains 5 from the prey and the predator absorbs 5×predationGain; with counter-bite ON the predator
    // then pays back counterBiteFraction × the prey's DAMAGE gene.
    const setup = (preyDamage: number): { s: OrganismStore; pred: number; prey: number } => {
      const s = new OrganismStore(4);
      const pred = s.alloc();
      const prey = s.alloc();
      s.x[pred] = 50;
      s.y[pred] = 50;
      s.energy[pred] = 20;
      s.x[prey] = 54;
      s.y[prey] = 50;
      s.energy[prey] = 30;
      genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
      genes(s, prey, cfg, {
        [ScalarGene.DIET]: 0,
        [ScalarGene.DAMAGE]: preyDamage,
        [ScalarGene.SIZE]: 5,
      });
      s.rebuildLive();
      return { s, pred, prey };
    };

    it('counterBiteFraction 0 (OFF) → predator pays no counter-cost (byte-identical bite)', () => {
      const { s, pred, prey } = setup(8);
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0 }, null);
      expect(s.energy[prey]).toBeCloseTo(25); // drained 5
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain); // pure gain, no counter
    });

    it('counterBiteFraction > 0 → predator pays counterBiteFraction × prey DAMAGE', () => {
      const { s, pred, prey } = setup(8);
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0.15 }, null);
      expect(s.energy[prey]).toBeCloseTo(25); // prey still loses exactly the drain
      // gain 5×gain, then counter-bite 0.15×8 = 1.2 back out → biting an armed prey costs the attacker
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain - 0.15 * 8);
    });

    it('a toothless prey (DAMAGE 0) imposes no counter-cost even when ON (defense scales with the gene)', () => {
      const { s, pred } = setup(0);
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0.15 }, null);
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain); // 0.15×0 = 0 → same as OFF
    });
  });
});

describe('cullDead', () => {
  it('frees organisms with energy ≤ 0 and returns the count', () => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.energy[a] = -1;
    s.energy[b] = 5;
    s.rebuildLive();
    expect(cullDead(s)).toBe(1);
    expect(s.isAlive(a)).toBe(false);
    expect(s.isAlive(b)).toBe(true);
  });
});

describe('reproduce (breed at the per-creature satiated bar)', () => {
  // mutation OFF so the child's inherited birthEnergy gene equals the parent's exactly (testable math);
  // repro bar 40 < satiated 60 so the band is ordered; reproOverhead 15.
  const cfg = defaultConfig({
    reproThreshold: 40,
    satiatedThreshold: 60,
    birthEnergy: 25,
    reproOverhead: 15,
    mutationSigma: 0,
    hueMutationSigma: 0,
    offspringOffset: 8,
    worldWidth: W,
    worldHeight: H,
  });

  it('provisions the child to its birthEnergy gene; parent pays that + reproOverhead', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 100;
    genes(s, p, cfg); // parent genes at centers (satiated 60, birthEnergy 25)
    s.rebuildLive();
    const births = reproduce(s, new Rng(1), cfg, false, false, null);
    expect(births).toBe(1);
    expect(s.energy[p]).toBeCloseTo(100 - 25 - 15); // paid childBirthEnergy(25) + reproOverhead(15)
    s.rebuildLive();
    expect(s.liveCount).toBe(2);
    const child = s.liveIndices[1]!;
    expect(s.energy[child]!).toBeCloseTo(25); // provisioned to its birthEnergy gene
  });

  it('does not reproduce below the per-creature satiated bar', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.energy[p] = 59; // < satiated gene 60
    genes(s, p, cfg);
    s.rebuildLive();
    expect(reproduce(s, new Rng(1), cfg, false, false, null)).toBe(0);
  });

  it('breeds at the parent’s OWN satiated GENE, not the config default', () => {
    // config breed bar is 100, but the creature's gene is 50 → energy 55 must breed (reads the gene).
    const cfgHigh = defaultConfig({
      reproThreshold: 100,
      satiatedThreshold: 100,
      reproOverhead: 15,
      mutationSigma: 0,
      worldWidth: W,
      worldHeight: H,
    });
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 55;
    genes(s, p, cfgHigh, {
      [ScalarGene.REPRO_THRESHOLD]: 30,
      [ScalarGene.SATIATED_THRESHOLD]: 50, // own bar 50 ≪ config 100
      [ScalarGene.BIRTH_ENERGY]: 20,
    });
    s.rebuildLive();
    expect(reproduce(s, new Rng(1), cfgHigh, false, false, null)).toBe(1); // breeds on its gene, not the config 100
  });

  it('breed bar is reproGene+MIN_BAND when the satiated gene is below the repro gene', () => {
    const c = defaultConfig({ reproOverhead: 15, mutationSigma: 0, worldWidth: W, worldHeight: H });
    const breeds = (energy: number): number => {
      const s = new OrganismStore(4);
      const p = s.alloc();
      s.x[p] = 50;
      s.y[p] = 50;
      s.energy[p] = energy;
      genes(s, p, c, {
        [ScalarGene.REPRO_THRESHOLD]: 60,
        [ScalarGene.SATIATED_THRESHOLD]: 40, // inverted → guard lifts the bar to 60+MIN_BAND
        [ScalarGene.BIRTH_ENERGY]: 20,
      });
      s.rebuildLive();
      return reproduce(s, new Rng(1), c, false, false, null);
    };
    expect(breeds(60 + MIN_BAND - 1)).toBe(0); // below the guarded bar (NOT the inverted satiated 40)
    expect(breeds(60 + MIN_BAND + 1)).toBe(1); // above it → breeds
  });

  it('provisions the child to ITS OWN (mutated) birthEnergy gene, not the parent’s', () => {
    // mutation strong + parent energy huge (cap won't bind) → child energy must track the CHILD's gene.
    const c = defaultConfig({
      reproThreshold: 40,
      satiatedThreshold: 60,
      reproOverhead: 15,
      mutationSigma: 0.5,
      worldWidth: W,
      worldHeight: H,
    });
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 500;
    genes(s, p, c, { [ScalarGene.BIRTH_ENERGY]: 30 });
    s.rebuildLive();
    expect(reproduce(s, new Rng(5), c, false, false, null)).toBe(1);
    s.rebuildLive();
    const child = s.liveIndices[1]!;
    const childGene = s.scalarGenes[child * SCALAR_GENE_COUNT + ScalarGene.BIRTH_ENERGY]!;
    expect(Math.abs(childGene - 30)).toBeGreaterThan(0.1); // mutation moved it off the parent's 30
    expect(s.energy[child]!).toBeCloseTo(childGene); // energy tracks the CHILD's gene, not 30
  });

  it('is deterministic given the seed (position AND inherited scalar genes)', () => {
    // mutation ON here so the gene-mutation path is exercised and must still be byte-deterministic.
    const detCfg = defaultConfig({
      reproThreshold: 40,
      satiatedThreshold: 60,
      reproOverhead: 15,
      offspringOffset: 8,
      worldWidth: W,
      worldHeight: H,
    });
    const make = (): OrganismStore => {
      const s = new OrganismStore(8);
      for (let k = 0; k < 3; k++) {
        const p = s.alloc();
        s.x[p] = 50;
        s.y[p] = 50;
        s.energy[p] = 100;
        // Non-trivial parent genes so the mutateScalarGenes path is actually exercised (not parent=0).
        genes(s, p, detCfg, { [ScalarGene.MAX_SPEED]: 7 + k, [ScalarGene.EAT_RATE]: 2 + k * 0.3 });
      }
      s.rebuildLive();
      return s;
    };
    const s1 = make();
    reproduce(s1, new Rng(7), detCfg, false, false, null);
    s1.rebuildLive();
    const s2 = make();
    reproduce(s2, new Rng(7), detCfg, false, false, null);
    s2.rebuildLive();
    for (let k = 0; k < s1.liveCount; k++) {
      const i = s1.liveIndices[k]!;
      expect(s2.x[i]!).toBe(s1.x[i]!);
      expect(s2.y[i]!).toBe(s1.y[i]!);
      // every inherited scalar gene must match byte-for-byte (mutation is deterministic)
      for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
        expect(s2.scalarGenes[i * SCALAR_GENE_COUNT + g]!).toBe(
          s1.scalarGenes[i * SCALAR_GENE_COUNT + g]!,
        );
      }
    }
  });
});
