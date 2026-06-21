import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { SpatialHash } from './spatial-hash';
import { Rng } from './rng';
import { defaultConfig, type Config } from './config';
import { metabolize, hunt, cullDead, reproduce } from './economy';
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
    metabolize(s, food, cfg);
    expect(s.energy[i]).toBeCloseTo(5 + 2 - 0.4); // eat 2, basal 0.4·eff(1), no movement, no gene cost
    expect(food.sampleAt(10, 10)).toBeCloseTo(8); // 2 grazed
    expect(s.age[i]!).toBe(1);
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
    metabolize(s, food, cfgSat);
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
    metabolize(s, food, cfg);
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
    metabolize(s, food, cfg);
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
    metabolize(s, food, cfg);
    expect(s.energy[i]).toBeCloseTo(50 - 0.4 * 0.5); // basal halved, no gene upkeep
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
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 5 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0 });
    s.rebuildLive();
    hunt(s, mkHash(s), cfg);
    // drain = min(damage(5)·diet(1), preyEnergy) = 5, moved prey→predator (conserved)
    expect(s.energy[prey]).toBeCloseTo(25);
    expect(s.energy[pred]).toBeCloseTo(25);
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
    genes(s, pred, cfg, { [ScalarGene.DIET]: 1, [ScalarGene.DAMAGE]: 20 });
    genes(s, prey, cfg, { [ScalarGene.DIET]: 0 });
    s.rebuildLive();
    hunt(s, mkHash(s), cfg);
    expect(s.energy[prey]).toBeCloseTo(0); // drained to 0 (capped) → dies next cull
    expect(s.energy[pred]).toBeCloseTo(13); // gained only the 3 that existed
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
    const births = reproduce(s, new Rng(1), cfg);
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
    expect(reproduce(s, new Rng(1), cfg)).toBe(0);
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
    expect(reproduce(s, new Rng(1), cfgHigh)).toBe(1); // breeds on its gene, not the config 100
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
      return reproduce(s, new Rng(1), c);
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
    expect(reproduce(s, new Rng(5), c)).toBe(1);
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
    reproduce(s1, new Rng(7), detCfg);
    s1.rebuildLive();
    const s2 = make();
    reproduce(s2, new Rng(7), detCfg);
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
