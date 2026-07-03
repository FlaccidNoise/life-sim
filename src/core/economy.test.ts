import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { ScentField, Scent } from './scent-field';
import { SpatialHash } from './spatial-hash';
import { Rng } from './rng';
import { defaultConfig, type Config } from './config';
import { metabolize, hunt, cullDead, reproduce, satiatedBar, depositScent } from './economy';
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfgOff);
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
    metabolize(s, food, hashOf(s), cfgSat);
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg);
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
      metabolize(s, food, hashOf(s), defaultConfig({ basalCost: 0.4, moveCost: 0, deadWaterCost }));
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
    metabolize(s, empty(), hashOf(s), cfg);
    expect(s.energy[focal]).toBeCloseTo(50); // OFF → unchanged (gained 0, costs 0)
  });

  it('drains crowdingMortality per neighbor above crowdThreshold', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0.3 });
    const { s, focal } = cluster(cfg, 9); // focal sees 8 neighbors; over = 8 − 6 = 2
    metabolize(s, empty(), hashOf(s), cfg);
    expect(s.energy[focal]).toBeCloseTo(50 - 0.3 * 2); // drain 0.6
  });

  it('a creature inside the free band (neighbors ≤ crowdThreshold) pays nothing', () => {
    const cfg = defaultConfig({ ...base, crowdingMortality: 0.3 });
    const { s, focal } = cluster(cfg, 5); // focal sees 4 ≤ 6 → no drain
    metabolize(s, empty(), hashOf(s), cfg);
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
    metabolize(s, empty(), hashOf(s), cfg);
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
    forageGeneralistFloor: 0.7,
  });
  // K=10 split 0.5/0.5 → each channel's cap = 5, both full. eatRate 2 = center → no gene upkeep.
  const dualFood = (): FoodField => new FoodField(W, H, 16, 16, 10, 1, 2, 0.5);

  it('a generalist (pref 0.5) grazes BOTH channels but is PENALISED to the generalist floor (0.7×)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 0.5 });
    s.rebuildLive();
    const food = dualFood();
    metabolize(s, food, hashOf(s), cfg);
    expect(s.energy[i]).toBeCloseTo(5 + 1.4); // take 1 from A + 1 from B = 2, ×floor 0.7 → gained 1.4
    expect(food.sampleAt(10, 10)).toBeCloseTo(5 - 1); // biomass still depletes by the grazed amount (no windfall)
    expect(food.sampleAt2(10, 10)).toBeCloseTo(5 - 1);
  });

  it('forageGeneralistFloor=1 restores the legacy no-penalty generalist (spec=1)', () => {
    const cfgNoPenalty = defaultConfig({
      basalCost: 0,
      moveCost: 0,
      satiatedThreshold: 1000,
      foodChannels: 2,
      forageSpecBonus: 0.5,
      forageGeneralistFloor: 1,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfgNoPenalty, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 0.5 });
    s.rebuildLive();
    const food = dualFood();
    metabolize(s, food, hashOf(s), cfgNoPenalty);
    expect(s.energy[i]).toBeCloseTo(5 + 2); // spec=1 → gained 2 (legacy)
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg0);
    expect(s.energy[i]).toBeCloseTo(5 + 2); // takeB 2, spec=1 → gained 2 (no specialization bonus)
  });
});

describe('metabolize two-channel availability-weighting (fugitive-B-niche fix)', () => {
  // forageAvailabilityWeighted: a soft specialist OFF its preferred resource falls back to what's present
  // instead of wasting its preferred share on an empty channel and starving — the fix that keeps the
  // drifting/fugitive B niche alive (place-coupled pockets where one channel is locally absent).
  const base = {
    basalCost: 0,
    moveCost: 0,
    satiatedThreshold: 1000,
    foodChannels: 2,
    forageSpecBonus: 0.5,
    forageGeneralistFloor: 0.7,
  } as const;
  const cfgLegacy = defaultConfig({ ...base, forageAvailabilityWeighted: false });
  const cfgAvail = defaultConfig({ ...base, forageAvailabilityWeighted: true });
  // A-only cell: build the balanced dual field, then strip channel B at (10,10) so only A is present there.
  const aOnlyFood = (): FoodField => {
    const f = new FoodField(W, H, 16, 16, 10, 1, 2, 0.5);
    f.grazeAt2(10, 10, 100); // remove all of channel B at this cell (B cap was 5)
    return f;
  };
  const forager = (cfg: ReturnType<typeof defaultConfig>): OrganismStore => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 0.8 });
    s.rebuildLive();
    return s;
  };

  it('LEGACY: a soft B-specialist (pref 0.8) on A-only food under-eats (wastes its B share on empty B)', () => {
    const s = forager(cfgLegacy);
    const food = aOnlyFood();
    metabolize(s, food, hashOf(s), cfgLegacy);
    // budget 2 split by pref: takeA=2·0.2=0.4 from A, takeB=2·0.8=1.6 but B is empty → 0. spec(0.8)=1.18.
    expect(s.energy[0]).toBeCloseTo(5 + 0.4 * 1.18); // gained 0.472 — starving despite A all around
    expect(food.sampleAt(10, 10)).toBeCloseTo(5 - 0.4); // only 0.4 of the available A grazed
  });

  it('AVAIL-WEIGHTED: the same forager spends its full budget on the present resource (A)', () => {
    const s = forager(cfgAvail);
    const food = aOnlyFood();
    metabolize(s, food, hashOf(s), cfgAvail);
    // availability renormalizes the budget onto A (B absent): takeA=2 from A, takeB=0. spec(0.8)=1.18.
    expect(s.energy[0]).toBeCloseTo(5 + 2 * 1.18); // gained 2.36 — fallback feeds it (5× the legacy)
    expect(food.sampleAt(10, 10)).toBeCloseTo(5 - 2); // full budget grazed from A
  });

  it('no resource present (both channels empty under foot) → gained 0, only upkeep is paid', () => {
    const s = forager(cfgAvail);
    const food = aOnlyFood();
    food.grazeAt(10, 10, 100); // strip channel A too → this cell is now barren in both channels
    const before = s.energy[0]!;
    metabolize(s, food, hashOf(s), cfgAvail);
    expect(s.energy[0]).toBeLessThanOrEqual(before); // no food gained (eSum=0 guard); costs are zeroed in cfg
    expect(s.energy[0]).toBeCloseTo(before); // basalCost/moveCost are 0 here → energy unchanged, not NaN
    expect(food.sampleAt(10, 10)).toBeCloseTo(0); // nothing to graze
  });

  it('equal availability is byte-identical to the legacy split (no regression where both present)', () => {
    // Generalist pref 0.5 on a BALANCED field: availability-weighting reduces to the 50/50 legacy split.
    const mk = (cfg: ReturnType<typeof defaultConfig>): OrganismStore => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.x[i] = 10;
      s.y[i] = 10;
      s.energy[i] = 5;
      genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.FORAGE_PREF]: 0.5 });
      s.rebuildLive();
      return s;
    };
    const sL = mk(cfgLegacy);
    const fL = new FoodField(W, H, 16, 16, 10, 1, 2, 0.5);
    metabolize(sL, fL, hashOf(sL), cfgLegacy);
    const sA = mk(cfgAvail);
    const fA = new FoodField(W, H, 16, 16, 10, 1, 2, 0.5);
    metabolize(sA, fA, hashOf(sA), cfgAvail);
    expect(sA.energy[0]).toBe(sL.energy[0]); // exact equality — same arithmetic when both channels are present
    expect(fA.sampleAt(10, 10)).toBe(fL.sampleAt(10, 10));
    expect(fA.sampleAt2(10, 10)).toBe(fL.sampleAt2(10, 10));
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
    forageGeneralistFloor: 0.7,
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg);
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
    metabolize(s, food, hashOf(s), cfg);
    // Only C present → eSum = wC·avC, so takeC = budget·(eC/eSum) = budget = 2 (availability-weighting works).
    // maxW = 0.5 → s01 = 0.25 → spec = floor 0.7 + (1.5−0.7)·0.25 = 0.9 (the generalist penalty applies).
    // gained = 2·0.9 = 1.8.
    expect(s.energy[i]).toBeCloseTo(5 + 1.8);
  });
});

describe('metabolize diet-axis disruptive selection (dietGeneralistFloor)', () => {
  // Mirror of the forage spec on the DIET axis: graze income ×= dietSpec = floor + (1−floor)·2·|diet−0.5|,
  // so the omnivore (diet 0.5, d01=0) earns floor× while a committed grazer (diet 0, d01=1) earns 1×.
  // herbivoryExp 0 makes the graze BUDGET diet-independent, isolating dietSpec as the ONLY diet effect.
  // Costs zeroed + satiatedThreshold high → the energy delta == graze income. Single channel, cell full (B=10).
  const food = (): FoodField => new FoodField(W, H, 16, 16, 10, 1);
  const grazeGain = (dietGeneralistFloor: number, diet: number): number => {
    const cfg = defaultConfig({
      basalCost: 0,
      moveCost: 0,
      satiatedThreshold: 1000,
      herbivoryExp: 0,
      dietGeneralistFloor,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 5;
    genes(s, i, cfg, { [ScalarGene.EAT_RATE]: 2, [ScalarGene.DIET]: diet });
    s.rebuildLive();
    metabolize(s, food(), hashOf(s), cfg);
    return s.energy[i]! - 5; // == graze income (all costs zeroed)
  };

  it('floor 0.5 PENALISES the omnivore (diet 0.5 → 0.5×) but not a committed grazer (diet 0 → 1×)', () => {
    expect(grazeGain(0.5, 0)).toBeCloseTo(2); // d01=1 → dietSpec 1 → full budget 2 grazed
    expect(grazeGain(0.5, 0.5)).toBeCloseTo(1); // d01=0 → dietSpec 0.5 → half
    expect(grazeGain(0.5, 0.5)).toBeLessThan(grazeGain(0.5, 0)); // omnivore earns LESS than the grazer
  });

  it('a committed grazer (diet 0) earns the same under floor 0.5 as under floor 1 (no-op at d01=1)', () => {
    expect(grazeGain(0.5, 0)).toBeCloseTo(grazeGain(1, 0)); // dietSpec=1 at diet 0 regardless of floor
  });

  it('floor 1 (OFF) is diet-independent: grazer and omnivore earn the SAME graze income (byte-identical no-op)', () => {
    expect(grazeGain(1, 0)).toBeCloseTo(2);
    expect(grazeGain(1, 0.5)).toBeCloseTo(2); // dietSpec ≡ 1 for every diet → no penalty
    expect(grazeGain(1, 0.5)).toBe(grazeGain(1, 0)); // EXACT equality: floor 1 never perturbs the income
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
    metabolize(s, food, hashOf(s), cfg);
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
    hunt(s, mkHash(s), cfg);
    // drain = min(damage(5)·diet(1), preyEnergy) = 5; prey loses the drain, predator absorbs drain×gain.
    expect(s.energy[prey]).toBeCloseTo(25);
    expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain);
  });

  it('a satiated predator (energy ≥ its satiated bar) stops hunting — B4 graze-stop mirror', () => {
    // satiatedBar = SATIATED_THRESHOLD gene (100) × (SIZE 10 / cellRadius 6)^sizeStoreExp(1) ≈ 167. A predator
    // at/above the bar skips hunting entirely (the rule metabolize already applies to grazing), so hunting
    // success converts to breeding instead of an uncapped hoard the breed gate never spends.
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.x[prey] = 54;
    s.y[prey] = 50; // 4u away, within biteRange 12
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();

    s.energy[pred] = 200; // ≥ satiatedBar (~167) → full → does not hunt
    s.energy[prey] = 30;
    hunt(s, mkHash(s), cfg);
    expect(s.energy[prey]).toBe(30); // untouched — the satiated predator left the prey alone
    expect(s.energy[pred]).toBe(200); // absorbed nothing

    s.energy[pred] = 20; // control: hungry (< bar) → it bites, so the skip above wasn't a false positive
    s.energy[prey] = 30;
    hunt(s, mkHash(s), cfg);
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
    hunt(s, mkHash(s), cfg);
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
    hunt(s, mkHash(s), cfg);
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
    hunt(s, mkHash(s), noCannibal);
    expect(s.energy[peer]).toBe(30); // peer spared despite being nearest
    expect(s.energy[prey]).toBeCloseTo(30 - 5 * 0.9); // prey eaten instead
  });

  it('huntDietGap spares a near-peer (0.77) but allows eating a meaningfully-lower omnivore (0.5)', () => {
    const gapCfg = { ...cfg, cannibalism: false, huntDietGap: 0.25 };
    // hunter 0.78; a 0.77 near-peer sits NEARER than a 0.5 omnivore. With gap 0.25 the hunter needs
    // prey diet ≤ 0.78−0.25 = 0.53, so the 0.77 peer is spared and the 0.5 omnivore is eaten.
    const s = new OrganismStore(4);
    const hunter = s.alloc();
    const peer = s.alloc();
    const prey = s.alloc();
    s.x[hunter] = 50;
    s.y[hunter] = 50;
    s.energy[hunter] = 20;
    s.x[peer] = 52; // nearer than the omnivore
    s.y[peer] = 50;
    s.energy[peer] = 30;
    s.x[prey] = 56;
    s.y[prey] = 50; // within biteRange 12
    s.energy[prey] = 30;
    genes(s, hunter, cfg, {
      [ScalarGene.DIET]: 0.78,
      [ScalarGene.DAMAGE]: 5,
      [ScalarGene.SIZE]: 10,
    });
    // peer small enough to eat (size) + toothless → only the diet-gap can spare it; only 0.01 lower than hunter.
    genes(s, peer, cfg, { [ScalarGene.DIET]: 0.77, [ScalarGene.DAMAGE]: 0, [ScalarGene.SIZE]: 5 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0.5, [ScalarGene.DAMAGE]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();
    hunt(s, mkHash(s), gapCfg);
    expect(s.energy[peer]).toBe(30); // 0.77 near-peer spared (within the 0.25 gap)
    expect(s.energy[prey]).toBeCloseTo(30 - 5 * 0.78); // 0.5 omnivore eaten (drain = damage·hunterDiet)
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
    hunt(s, mkHash(s), cfg); // cannibalism true
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
      hunt(s, mkHash(s), cfg); // huntSizeRatio 1.15
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
    hunt(s, mkHash(s), cfg);
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
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0 });
      expect(s.energy[prey]).toBeCloseTo(25); // drained 5
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain); // pure gain, no counter
    });

    it('counterBiteFraction > 0 → predator pays counterBiteFraction × prey DAMAGE', () => {
      const { s, pred, prey } = setup(8);
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0.15 });
      expect(s.energy[prey]).toBeCloseTo(25); // prey still loses exactly the drain
      // gain 5×gain, then counter-bite 0.15×8 = 1.2 back out → biting an armed prey costs the attacker
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain - 0.15 * 8);
    });

    it('a toothless prey (DAMAGE 0) imposes no counter-cost even when ON (defense scales with the gene)', () => {
      const { s, pred } = setup(0);
      hunt(s, mkHash(s), { ...cfg, counterBiteFraction: 0.15 });
      expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain); // 0.15×0 = 0 → same as OFF
    });
  });

  it('brain-gated bite: biteGate 0 → no drain, biteGate 1 → full drain (A2a)', () => {
    // A diet-1 predator above a diet-0 prey, within biteRange. With brainGatedBiting ON, the drain
    // scales by biteGate: a shut gate (0) bites nothing, an open gate (1) lands the full bite.
    const gated = { ...cfg, brainGatedBiting: true };
    const preyEnergyAfter = (gate: number): number => {
      const s = new OrganismStore(4);
      const pred = s.alloc();
      const prey = s.alloc();
      s.x[pred] = 50;
      s.y[pred] = 50;
      s.energy[pred] = 50;
      s.x[prey] = 54; // 4 units away, within biteRange 12
      s.y[prey] = 50;
      s.energy[prey] = 50;
      genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
      genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
      s.biteGate[pred] = gate;
      s.biteGate[prey] = gate;
      s.rebuildLive();
      hunt(s, mkHash(s), gated);
      return s.energy[prey]!;
    };
    expect(preyEnergyAfter(0)).toBe(50); // gate shut → no bite, prey untouched
    expect(preyEnergyAfter(1)).toBeLessThan(50); // gate open → bite lands
  });
});

describe('hunt diet-axis disruptive selection (dietGeneralistFloor)', () => {
  // The forage spec mirrored onto HUNT income: the predator absorbs drain·predationGain·dietSpec, where
  // dietSpec = floor + (1−floor)·2·|diet−0.5|. A committed hunter (diet 1, d01=1) keeps the full payoff (×1);
  // an omnivore-hunter (diet 0.6, d01=0.2) is penalised toward the floor. Comparing the SAME predDiet at
  // floor 0.5 vs floor 1 holds the drain fixed, isolating dietSpec as the only difference in absorption.
  const cfg = defaultConfig({ biteRange: 12, damage: 5, worldWidth: W, worldHeight: H });
  const mkHash = (s: OrganismStore): SpatialHash => {
    const h = new SpatialHash(W, H, 12, 8); // cell = biteRange
    h.build(s);
    return h;
  };
  // A predator (given diet) over a diet-0 prey 4 units away; returns the predator's energy GAIN this tick.
  const predGain = (dietGeneralistFloor: number, predDiet: number): number => {
    const c = defaultConfig({
      biteRange: 12,
      damage: 5,
      worldWidth: W,
      worldHeight: H,
      dietGeneralistFloor,
    });
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 20;
    s.x[prey] = 54; // 4 units away, within biteRange 12
    s.y[prey] = 50;
    s.energy[prey] = 30;
    genes(s, pred, c, {
      [ScalarGene.DIET]: predDiet,
      [ScalarGene.DAMAGE]: 5,
      [ScalarGene.SIZE]: 10,
    });
    genes(s, prey, c, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();
    hunt(s, mkHash(s), c);
    return s.energy[pred]! - 20;
  };

  it('floor<1 scales the biter’s absorbed energy by its dietSpec (omnivore-hunter absorbs less than at floor 1)', () => {
    // diet 0.6 → drain = min(5·0.6, 30) = 3 in BOTH runs; only dietSpec differs (1 vs 0.6), isolating the penalty.
    expect(predGain(1, 0.6)).toBeCloseTo(3 * cfg.predationGain); // dietSpec 1 → full absorption
    expect(predGain(0.5, 0.6)).toBeCloseTo(3 * cfg.predationGain * 0.6); // dietSpec 0.5+0.5·0.2 = 0.6
    expect(predGain(0.5, 0.6)).toBeLessThan(predGain(1, 0.6));
  });

  it('an omnivore-hunter (diet 0.6) absorbs LESS per bite than a committed hunter (diet 1) under floor 0.5', () => {
    expect(predGain(0.5, 0.6)).toBeLessThan(predGain(0.5, 1));
  });

  it('a committed hunter (diet 1) is unpenalised even under floor 0.5 (dietSpec=1 at d01=1)', () => {
    // drain = min(5·1, 30) = 5; dietSpec at diet 1 = floor + (1−floor)·1 = 1 regardless of floor.
    expect(predGain(0.5, 1)).toBeCloseTo(5 * cfg.predationGain);
    expect(predGain(0.5, 1)).toBeCloseTo(predGain(1, 1));
  });
});

describe('hunt Holling Type-II handling-time refractory (huntHandlingTime)', () => {
  // After a SUCCESSFUL bite a predator is "busy handling prey" for huntHandlingTime ticks: hunt() skips it
  // while huntCooldownLeft>0, and metabolize() ticks that counter down. This caps kills-per-time (Type-II
  // functional response) regardless of prey density. All metabolize costs zeroed so energy moves ONLY via
  // hunt — the prey's energy is the clean "did a bite land?" signal, independent of any predator upkeep.
  const cfg = defaultConfig({
    biteRange: 12,
    damage: 5,
    worldWidth: W,
    worldHeight: H,
    huntHandlingTime: 5,
    basalCost: 0,
    moveCost: 0,
    deadWaterCost: 0,
    sizeCost: 0,
    damageCost: 0,
  });
  const mkHash = (s: OrganismStore): SpatialHash => {
    const h = new SpatialHash(W, H, 12, 8); // cell = biteRange
    h.build(s);
    return h;
  };

  it('a successful bite arms the refractory; the predator cannot feed again until it counts down to 0', () => {
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 20;
    s.x[prey] = 54; // 4 units away, within biteRange 12
    s.y[prey] = 50;
    s.energy[prey] = 1000; // huge so it survives many bites and never confounds with a cull
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 }); // small enough to eat
    s.rebuildLive();
    const hash = mkHash(s); // positions never change in this test → reuse it for hunt + metabolize

    // First hunt: the bite lands. Predator energy rises and the handling-time refractory is armed.
    hunt(s, hash, cfg);
    expect(s.energy[pred]).toBeCloseTo(20 + 5 * cfg.predationGain); // fed (drain 5 × gain)
    expect(s.energy[prey]).toBeCloseTo(1000 - 5); // prey lost the drain
    expect(s.huntCooldownLeft[pred]!).toBe(5); // refractory armed to huntHandlingTime

    // The 4 refractory ticks: metabolize counts the cooldown 5→1 and hunt() refuses to feed while it is >0.
    for (let expected = 4; expected >= 1; expected--) {
      const preyBefore = s.energy[prey]!;
      const predBefore = s.energy[pred]!;
      metabolize(s, new FoodField(W, H, 16, 16, 10, 0), hash, cfg); // empty food → no graze income
      expect(s.huntCooldownLeft[pred]!).toBe(expected); // decremented by exactly 1
      hunt(s, hash, cfg);
      expect(s.energy[prey]).toBeCloseTo(preyBefore); // busy handling → no bite landed
      expect(s.energy[pred]).toBeCloseTo(predBefore); // predator gained nothing this tick
    }

    // One more metabolize drives the cooldown to 0 → the predator may feed again on the next hunt.
    metabolize(s, new FoodField(W, H, 16, 16, 10, 0), hash, cfg);
    expect(s.huntCooldownLeft[pred]!).toBe(0);
    const preyBefore = s.energy[prey]!;
    hunt(s, hash, cfg);
    expect(s.energy[prey]).toBeCloseTo(preyBefore - 5); // bite lands again
    expect(s.huntCooldownLeft[pred]!).toBe(5); // and the refractory re-arms
  });

  it('huntHandlingTime 0 (OFF) never arms the refractory — a predator can bite every tick', () => {
    const off = { ...cfg, huntHandlingTime: 0 };
    const s = new OrganismStore(4);
    const pred = s.alloc();
    const prey = s.alloc();
    s.x[pred] = 50;
    s.y[pred] = 50;
    s.energy[pred] = 20;
    s.x[prey] = 54;
    s.y[prey] = 50;
    s.energy[prey] = 1000;
    genes(s, pred, off, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5, [ScalarGene.SIZE]: 10 });
    genes(s, prey, off, { [ScalarGene.DIET]: 0, [ScalarGene.SIZE]: 5 });
    s.rebuildLive();
    const hash = mkHash(s);
    hunt(s, hash, off);
    expect(s.huntCooldownLeft[pred]!).toBe(0); // OFF path never writes the counter
    metabolize(s, new FoodField(W, H, 16, 16, 10, 0), hash, off);
    const preyBefore = s.energy[prey]!;
    hunt(s, hash, off); // no refractory → bites again immediately
    expect(s.energy[prey]).toBeCloseTo(preyBefore - 5);
  });
});

describe('depositScent brain-gated broadcast (A2b)', () => {
  // A grazer (diet 0, hue 0) with a positive PHERO_DEPOSIT gene broadcasts into the PREY channel. With
  // brainGatedScent ON the deposited amount is scaled by the creature's scentGate: a shut gate (0) lays
  // NOTHING, an open gate (1) lays the full passive amount. pheroDepositStrength 1 so amount == the gene.
  const cfg = defaultConfig({
    brainGatedScent: true,
    pheroDepositStrength: 1,
    scentIdentity: true,
  });
  const scentAt = (gate: number): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 500;
    s.y[i] = 500;
    s.hue[i] = 0;
    genes(s, i, cfg, { [ScalarGene.PHERO_DEPOSIT]: 2 }); // diet 0 (grazer) → deposits into PREY
    s.scentGate[i] = gate;
    s.rebuildLive();
    const scent = new ScentField(1000, 1000, 50, 50);
    depositScent(s, scent, cfg);
    return scent.channel(Scent.PREY).sampleAt(500, 500);
  };

  it('scentGate 0 → no deposit (the field stays empty at the body)', () => {
    expect(scentAt(0)).toBe(0);
  });

  it('scentGate 1 → the full passive deposit lands (amount = gene × strength)', () => {
    expect(scentAt(1)).toBeCloseTo(2); // 2 (gene) · 1 (strength) · (1 − diet 0) into PREY
  });

  it('brainGatedScent OFF ignores the gate (unconditional passive deposit)', () => {
    const off = defaultConfig({
      brainGatedScent: false,
      pheroDepositStrength: 1,
      scentIdentity: true,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 500;
    s.y[i] = 500;
    s.hue[i] = 0;
    genes(s, i, off, { [ScalarGene.PHERO_DEPOSIT]: 2 });
    s.scentGate[i] = 0; // would zero the deposit IF gating were on
    s.rebuildLive();
    const scent = new ScentField(1000, 1000, 50, 50);
    depositScent(s, scent, off);
    expect(scent.channel(Scent.PREY).sampleAt(500, 500)).toBeCloseTo(2); // full deposit despite gate 0
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
    sexualReproduction: false,
    worldWidth: W,
    worldHeight: H,
  });
  const emptyHash = (s: OrganismStore, c: Config): SpatialHash =>
    new SpatialHash(c.worldWidth, c.worldHeight, 2 * c.cellRadius, s.capacity);

  it('provisions the child to its birthEnergy gene; parent pays that + reproOverhead', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 100;
    genes(s, p, cfg); // parent genes at centers (satiated 60, birthEnergy 25)
    s.rebuildLive();
    const births = reproduce(s, new Rng(1), cfg, false, false, null, emptyHash(s, cfg));
    expect(births).toBe(1);
    expect(s.energy[p]).toBeCloseTo(100 - 25 - 15); // paid childBirthEnergy(25) + reproOverhead(15)
    s.rebuildLive();
    expect(s.liveCount).toBe(2);
    const child = s.liveIndices[1]!;
    expect(s.energy[child]!).toBeCloseTo(25); // provisioned to its birthEnergy gene
  });

  it('brainGatedBreeding: breedGate below threshold skips breeding (no births, no rng); at/above breeds (A2c)', () => {
    // A single satiated, mature, viable creature that WOULD breed this tick (energy above its satiated
    // bar). With the gate shut (breedGate 0 < threshold 0.5) reproduce() must skip it — 0 births, the
    // population unchanged. With the gate open (breedGate 1 ≥ 0.5) it breeds — 1 birth.
    const c = defaultConfig({
      reproThreshold: 40,
      satiatedThreshold: 60,
      birthEnergy: 25,
      reproOverhead: 15,
      mutationSigma: 0,
      sexualReproduction: false,
      brainGatedBreeding: true,
      breedGateThreshold: 0.5,
      worldWidth: W,
      worldHeight: H,
    });
    // Gate shut → no birth, population unchanged.
    const shut = new OrganismStore(4);
    const ps = shut.alloc();
    shut.x[ps] = 50;
    shut.y[ps] = 50;
    shut.energy[ps] = 100;
    genes(shut, ps, c);
    shut.breedGate[ps] = 0; // below threshold → skip
    shut.rebuildLive();
    expect(reproduce(shut, new Rng(1), c, false, false, null, emptyHash(shut, c))).toBe(0);
    shut.rebuildLive();
    expect(shut.liveCount).toBe(1); // unchanged

    // Gate open → breeds (same creature, same energy).
    const open = new OrganismStore(4);
    const po = open.alloc();
    open.x[po] = 50;
    open.y[po] = 50;
    open.energy[po] = 100;
    genes(open, po, c);
    open.breedGate[po] = 1; // at/above threshold → breeds
    open.rebuildLive();
    expect(reproduce(open, new Rng(1), c, false, false, null, emptyHash(open, c))).toBe(1);
  });

  it('breedCooldown blocks repeat breeding for the refractory period, then allows it again', () => {
    // The satiation-dwell lever: a fresh creature breeds, then is blocked for breedCooldown ticks even while
    // energy-rich, then breeds again. Energy kept far above the bar to ISOLATE the cooldown from the bar.
    // (Each reproduce() = one tick over the SAME single live parent — we don't rebuildLive, so children
    // never enter the parent set; only the parent's cooldown is exercised.)
    const c = defaultConfig({
      reproThreshold: 40,
      satiatedThreshold: 60,
      birthEnergy: 25,
      reproOverhead: 15,
      mutationSigma: 0,
      breedCooldown: 3,
      sexualReproduction: false,
      worldWidth: W,
      worldHeight: H,
    });
    const s = new OrganismStore(16);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 100000; // far above the bar — stays breeding-eligible on energy through every call
    genes(s, p, c);
    s.rebuildLive(); // liveIndices = [p]; not rebuilt again, so p is the only parent considered
    const rng = new Rng(1);
    const ch = emptyHash(s, c);
    const seq = [0, 1, 2, 3, 4].map(() => reproduce(s, rng, c, false, false, null, ch));
    // first breed (newborn starts ready), then 3 blocked ticks, then breeds again
    expect(seq).toEqual([1, 0, 0, 0, 1]);
  });

  it('does not reproduce below the per-creature satiated bar', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.energy[p] = 59; // < satiated gene 60
    genes(s, p, cfg);
    s.rebuildLive();
    expect(reproduce(s, new Rng(1), cfg, false, false, null, emptyHash(s, cfg))).toBe(0);
  });

  it('breeds at the parent’s OWN satiated GENE, not the config default', () => {
    // config breed bar is 100, but the creature's gene is 50 → energy 55 must breed (reads the gene).
    const cfgHigh = defaultConfig({
      reproThreshold: 100,
      satiatedThreshold: 100,
      reproOverhead: 15,
      mutationSigma: 0,
      sexualReproduction: false,
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
    expect(reproduce(s, new Rng(1), cfgHigh, false, false, null, emptyHash(s, cfgHigh))).toBe(1); // breeds on its gene, not the config 100
  });

  it('breed bar is reproGene+MIN_BAND when the satiated gene is below the repro gene', () => {
    const c = defaultConfig({
      reproOverhead: 2,
      mutationSigma: 0,
      sexualReproduction: false,
      worldWidth: W,
      worldHeight: H,
    });
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
      return reproduce(s, new Rng(1), c, false, false, null, emptyHash(s, c));
    };
    // reproOverhead (2) is set below MIN_BAND (5) so the viability floor (reproOverhead 2 +
    // reproThreshold 60 = 62) sits below the satiated bar (60+MIN_BAND=65). The satiated bar — not the
    // viability floor — is the binding constraint being probed here.
    expect(breeds(60 + MIN_BAND - 1)).toBe(0); // energy 64: above the floor (62) but below the bar (65) → blocked by the bar
    expect(breeds(60 + MIN_BAND + 1)).toBe(1); // energy 66: above the bar (65) AND the floor (62) → breeds
  });

  it('provisions the child to ITS OWN (mutated) birthEnergy gene, not the parent’s', () => {
    // mutation strong + parent energy huge (cap won't bind) → child energy must track the CHILD's gene.
    const c = defaultConfig({
      reproThreshold: 40,
      satiatedThreshold: 60,
      reproOverhead: 15,
      mutationSigma: 0.5,
      sexualReproduction: false,
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
    expect(reproduce(s, new Rng(5), c, false, false, null, emptyHash(s, c))).toBe(1);
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
      sexualReproduction: false,
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
    reproduce(s1, new Rng(7), detCfg, false, false, null, emptyHash(s1, detCfg));
    s1.rebuildLive();
    const s2 = make();
    reproduce(s2, new Rng(7), detCfg, false, false, null, emptyHash(s2, detCfg));
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

describe('metabolize senescence tax (age stages)', () => {
  // basal 0.4, empty food, no movement → the energy delta is exactly the (basal + senescence) cost.
  // senescenceAgeCost 0 isolates the elder TAX from the longevity UPKEEP; gene at center 100 → no upkeep anyway.
  const cfg = defaultConfig({
    basalCost: 0.4,
    moveCost: 0,
    satiatedThreshold: 1000,
    ageStages: true,
    senescenceRate: 0.01,
    senescenceAge: 100,
    senescenceAgeCost: 0,
    worldWidth: W,
    worldHeight: H,
  });
  const lossAtAge = (age: number, c: Config = cfg): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 50;
    genes(s, i, c, { [ScalarGene.SENESCENCE_AGE]: 100 });
    s.age[i] = age;
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty → isolate the costs
    metabolize(s, food, hashOf(s), c);
    return 50 - s.energy[i]!;
  };

  it('a young adult (age < SENESCENCE_AGE) pays only basal', () => {
    expect(lossAtAge(50)).toBeCloseTo(0.4); // 50 < 100 → no tax
  });

  it('an elder (age past SENESCENCE_AGE) pays basal·(1 + rate·over)', () => {
    // age 300 → over = 300 − 100 = 200; basal 0.4·(1 + 0.01·200) = 0.4·3 = 1.2 (death-of-old-age clock)
    expect(lossAtAge(300)).toBeCloseTo(1.2);
  });

  it('the tax reads age at/above SENESCENCE_AGE only (exactly at the threshold → over 0, no tax)', () => {
    expect(lossAtAge(100)).toBeCloseTo(0.4); // age == senescenceAge → over 0 → basal only
  });

  it('senescenceRate 0 → no tax even for an elder (senescence-only ablation within ageStages on)', () => {
    expect(lossAtAge(300, defaultConfig({ ...cfg, senescenceRate: 0 }))).toBeCloseTo(0.4);
  });

  it('ageStages false → no tax even for an elder (master OFF = byte-identical)', () => {
    expect(lossAtAge(300, defaultConfig({ ...cfg, ageStages: false }))).toBeCloseTo(0.4);
  });
});

describe('metabolize SENESCENCE_AGE longevity cost (geneUpkeep)', () => {
  // senescenceRate 0 → the elder tax is off, isolating the per-tick UPKEEP a durable body pays for its
  // SENESCENCE_AGE gene above center (the disposable-soma tradeoff). Young (age 0) → no tax confound.
  const cfg = defaultConfig({
    basalCost: 0.4,
    moveCost: 0,
    satiatedThreshold: 1000,
    ageStages: true,
    senescenceRate: 0,
    senescenceAge: 400,
    senescenceAgeCost: 0.0005,
    worldWidth: W,
    worldHeight: H,
  });
  const lossWithGene = (senAge: number): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.energy[i] = 50;
    genes(s, i, cfg, { [ScalarGene.SENESCENCE_AGE]: senAge });
    s.age[i] = 0;
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty
    metabolize(s, food, hashOf(s), cfg);
    return 50 - s.energy[i]!;
  };

  it('SENESCENCE_AGE above center adds over·senescenceAgeCost basal upkeep', () => {
    // 600 − 400 = 200 above center; upkeep = basal 0.4 + 200·0.0005 = 0.4 + 0.1 = 0.5
    expect(lossWithGene(600)).toBeCloseTo(0.5);
  });

  it('SENESCENCE_AGE at center adds no upkeep (longevity below baseline is free)', () => {
    expect(lossWithGene(400)).toBeCloseTo(0.4);
  });
});

describe('reproduce maturity gate (age stages)', () => {
  // Satiated bar = SATIATED_THRESHOLD gene 60 (SIZE at center → no size-scaling). Energy 100 ≫ 60, so the
  // ONLY thing that can stop a breed is the juvenile gate. breedCooldown 0 (default) → cooldown never fires.
  const cfg = defaultConfig({
    reproThreshold: 40,
    satiatedThreshold: 60,
    birthEnergy: 25,
    reproOverhead: 15,
    mutationSigma: 0,
    hueMutationSigma: 0,
    offspringOffset: 8,
    ageStages: true,
    maturityAge: 100,
    sexualReproduction: false,
    worldWidth: W,
    worldHeight: H,
  });
  const breedsAtAge = (age: number, c: Config = cfg): number => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 100; // well above the satiated bar 60
    genes(s, p, c, { [ScalarGene.MATURITY_AGE]: 100 });
    s.age[p] = age;
    s.rebuildLive();
    const ch = new SpatialHash(c.worldWidth, c.worldHeight, 2 * c.cellRadius, s.capacity);
    ch.build(s);
    return reproduce(s, new Rng(1), c, false, false, null, ch);
  };

  it('a juvenile (age < MATURITY_AGE) at the satiated bar does NOT breed', () => {
    expect(breedsAtAge(50)).toBe(0);
  });

  it('an adult (age ≥ MATURITY_AGE) breeds', () => {
    expect(breedsAtAge(100)).toBe(1); // age == maturity → mature → breeds
    expect(breedsAtAge(150)).toBe(1);
  });

  it('ageStages false → a young creature breeds as today (byte-identical OFF path)', () => {
    expect(breedsAtAge(50, defaultConfig({ ...cfg, ageStages: false }))).toBe(1);
  });
});

describe('sexual reproduction (crossover + compatibility + seeking)', () => {
  // Helper: a store with two adjacent satiated adults, scalar genes seeded compatible or not.
  function twoAdults(dietA: number, dietB: number) {
    const cfg = defaultConfig({
      sexualReproduction: true,
      ageStages: false,
      breedCooldown: 0,
      satiatedThreshold: 100,
      reproThreshold: 40,
      mateContactRange: 50,
      mateSeekWindow: 5,
    });
    const s = new OrganismStore(8);
    const N = SCALAR_GENE_COUNT;
    for (let i = 0; i < 2; i++) {
      const slot = s.alloc();
      s.x[slot] = 100 + i * 5;
      s.y[slot] = 100; // 5u apart, within mateContactRange
      s.energy[slot] = 200; // above satiatedBar
      for (let g = 0; g < N; g++)
        s.scalarGenes[slot * N + g] = defaultConfig({})[SCALAR_GENE_SPECS[g]!.centerKey] as number;
      s.scalarGenes[slot * N + ScalarGene.SATIATED_THRESHOLD] = 100;
      s.scalarGenes[slot * N + ScalarGene.REPRO_THRESHOLD] = 40;
      s.scalarGenes[slot * N + ScalarGene.BIRTH_ENERGY] = 30;
    }
    s.scalarGenes[0 * N + ScalarGene.DIET] = dietA;
    s.scalarGenes[1 * N + ScalarGene.DIET] = dietB;
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    const tick = () => {
      hash.build(s);
      const b = reproduce(s, new Rng(1), cfg, false, false, null, hash);
      s.rebuildLive();
      return b;
    };
    return { cfg, s, tick };
  }

  it('compatible adults: enter seeking, then mate on a later tick', () => {
    const { s, tick } = twoAdults(0, 0); // identical diet → compatible
    expect(tick()).toBe(0); // tick 1: both enter SEEKING, no birth yet
    expect(s.seeking[0]).toBe(1);
    let births = 0;
    for (let t = 0; t < 5; t++) births += tick();
    expect(births).toBeGreaterThan(0); // mate on a seeking tick
  });

  it('compatible adults beyond one hash cell still mate (mateContactRange is a real lever)', () => {
    // Regression: findMate scanned a fixed 3×3 hash neighbourhood (±1 cell ≈ ±12u at cellRadius 6), so any
    // mateContactRange beyond one cell was silently ignored — the demo's #1 documented repro lever did
    // nothing when raised. Place two compatible adults 30u apart (inside mateContactRange 50 but ~2 cells
    // away) and require they breed once findMate scans a range-derived neighbourhood like hunt() does.
    const cfg = defaultConfig({
      sexualReproduction: true,
      ageStages: false,
      breedCooldown: 0,
      satiatedThreshold: 100,
      reproThreshold: 40,
      mateContactRange: 50,
      mateSeekWindow: 8,
    });
    const s = new OrganismStore(8);
    const N = SCALAR_GENE_COUNT;
    for (let i = 0; i < 2; i++) {
      const slot = s.alloc();
      s.x[slot] = 100;
      s.y[slot] = 100 + i * 30; // 30u apart → outside the old ±1-cell (12u) scan, inside mateContactRange 50
      s.energy[slot] = 200;
      for (let g = 0; g < N; g++)
        s.scalarGenes[slot * N + g] = defaultConfig({})[SCALAR_GENE_SPECS[g]!.centerKey] as number;
      s.scalarGenes[slot * N + ScalarGene.DIET] = 0; // identical diet → compatible
      s.scalarGenes[slot * N + ScalarGene.SATIATED_THRESHOLD] = 100;
      s.scalarGenes[slot * N + ScalarGene.REPRO_THRESHOLD] = 40;
      s.scalarGenes[slot * N + ScalarGene.BIRTH_ENERGY] = 30;
    }
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    let births = 0;
    for (let t = 0; t < 8; t++) {
      hash.build(s);
      births += reproduce(s, new Rng(1), cfg, false, false, null, hash);
      s.rebuildLive();
    }
    expect(births).toBeGreaterThan(0);
  });

  it('predator × prey never breed (compatibility gate)', () => {
    const { tick } = twoAdults(0, 1); // grazer + predator → incompatible (DIET-dominated distance)
    let births = 0;
    for (let t = 0; t < 10; t++) births += tick();
    expect(births).toBe(0);
  });

  it('a lone satiated adult seeks then times out without breeding', () => {
    // window 9 so the 10-tick loop below ends on the timeout tick (enter t0 → exit t9). With a shorter
    // window the seeker would re-enter (breedCooldown 0 → no forage pause in this isolated harness) and
    // the loop would catch it mid-search; the behaviour under test is "seek → time out → exit", not the
    // re-entry cadence (which the real sim gates via the post-metabolize cooldown).
    const { cfg } = twoAdults(0, 0);
    cfg.mateSeekWindow = 9;
    const s = new OrganismStore(4);
    const N = SCALAR_GENE_COUNT;
    const slot = s.alloc();
    s.x[slot] = 100;
    s.y[slot] = 100;
    s.energy[slot] = 200;
    for (let g = 0; g < N; g++) s.scalarGenes[slot * N + g] = 1;
    s.scalarGenes[slot * N + ScalarGene.SATIATED_THRESHOLD] = 100;
    s.scalarGenes[slot * N + ScalarGene.REPRO_THRESHOLD] = 40;
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    let births = 0;
    for (let t = 0; t < 10; t++) {
      hash.build(s);
      births += reproduce(s, new Rng(1), cfg, false, false, null, hash);
    }
    expect(births).toBe(0);
    expect(s.seeking[slot]).toBe(0); // timed out, exited seeking
  });

  it('energy is conserved on a sexual birth (mother pays, father unchanged)', () => {
    const { s, tick } = twoAdults(0, 0);
    const before = s.energy[0]! + s.energy[1]!;
    let bornSlot = -1;
    for (let t = 0; t < 6 && bornSlot < 0; t++) {
      tick();
      if (s.liveCount > 2) bornSlot = 2;
    }
    expect(bornSlot).toBe(2);
    const after = s.energy[0]! + s.energy[1]! + s.energy[2]!;
    // total drops by exactly reproOverhead (provisioning is an internal transfer mother→child).
    expect(before - after).toBeCloseTo(defaultConfig({}).reproOverhead, 5);
  });
});
