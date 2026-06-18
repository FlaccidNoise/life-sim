import { describe, it, expect } from 'vitest';
import { metabolize, type EnvEffects } from '../cells/metabolism';
import { CellType } from '../cells/types';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { World } from './world';
import { defaultConfig, type Config } from './config';
import { buildForagerGenome } from '../genome/critter-genome';

/**
 * NON-INSTANT-KILL — the point of the herbivore graze-latch.
 *
 * Legacy eating (herbivoreLatch=false) drains the FULL digestRate from whatever edible cell the mouth
 * overlaps THIS tick: a low-energy plant chain cell (energy < digestRate) empties to 0 in a single
 * tick, so a brief brush is lethal and severEatenChainCells reaps the cell immediately. The graze-latch
 * (herbivoreLatch=true) latches the cell and drains only the modest grazeRate, so one (or a couple of)
 * ticks of contact leave the cell with energy > 0 — it survives the brush — and the cell only crosses
 * energy<=0 (and severs) after MANY ticks of sustained grazing.
 *
 * Part 1 isolates the per-tick drain contrast at the metabolize() kernel (exact arithmetic, no
 * photosynthesis/growth/transfer noise). Part 2 proves the end-to-end sever outcome through the real
 * World.seedPlantBase + buildForagerGenome + severEatenChainCells path.
 */

const noBonus = new Uint8Array(64); // all-zero → digestion multiplier 1 (no cluster bonus)
const noCC = new Uint32Array(64); // organism-cell-count: only read by the latch's held-alive check

const noEnv: EnvEffects = {
  lightMultiplier: 1,
  temp: null,
  tempComfortLow: 0,
  tempComfortHigh: 0,
  tempColdPenalty: 0,
  tempHeatPenalty: 0,
  toxin: null,
  toxinDamage: 0,
  toxinDepositOnMeatDecay: 0,
};

/** A DIGESTIVE mouth overlapping a single low-energy PHOTO chain cell (anchored=0, org!=0), light off so
 *  the cell's only energy change is the mouth's drain. cellEnergy < digestRate so legacy empties it in
 *  one tick. Returns the store, fields, live set, hash, and the two slots. */
function mouthOnChainCell(cellEnergy: number) {
  const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
  const store = new CellStore(16, false);
  const f = store.fields;
  const mouth = store.alloc();
  const cell = store.alloc();
  // mouth (lower slot, eats first)
  f.posX[mouth] = 500;
  f.posY[mouth] = 500;
  f.radius[mouth] = cfg.cellRadius; // r6, matches the forager mouth
  f.mass[mouth] = 1;
  f.energy[mouth] = 100;
  f.cellType[mouth] = CellType.DIGESTIVE;
  f.organismId[mouth] = 1;
  // plant chain cell, overlapping the mouth (distance 3 << ri+rj = 12)
  f.posX[cell] = 503;
  f.posY[cell] = 500;
  f.radius[cell] = cfg.cellRadius;
  f.mass[cell] = 1;
  f.energy[cell] = cellEnergy;
  f.cellType[cell] = CellType.PHOTO;
  f.organismId[cell] = 2; // a plant organism (not 0); anchored=0 ⇒ a chain cell, not the tough base
  f.anchored[cell] = 0;
  const live = Uint32Array.from([mouth, cell]);
  const lf = new LightField(16, 16, 1024, 1024);
  lf.cap.fill(0);
  lf.light.fill(0); // no photosynthesis → isolate the drain
  const hash = new SpatialHash(1024, 1024, 2 * cfg.cellRadius, store.capacity);
  hash.build(live, 2, f.posX, f.posY);
  return { cfg, store, f, live, lf, hash, mouth, cell };
}

/** Run the real metabolize kernel once over `s`, with the graze-latch flag on or off. basalCost=0 so
 *  the PHOTO cell's energy reflects ONLY the mouth's drain (its own basal would muddy the assertion). */
function runMetabolize(s: ReturnType<typeof mouthOnChainCell>, herbivoreLatch: boolean) {
  const { cfg, f, live, lf, hash } = s;
  metabolize(
    live,
    2,
    f,
    hash,
    lf,
    cfg.photoGain,
    cfg.photoDepletion,
    cfg.digestRate,
    cfg.digestEfficiency,
    cfg.baseToughness,
    0, // basalCost off → isolate the drain
    cfg.meatDecay,
    0, // moveCost off
    0, // neuralCost off
    noBonus,
    0, // digestClusterBonus off
    noEnv,
    0, // predDigestRate off
    0,
    1,
    f.latchPrey,
    f.latchCell,
    noCC,
    0, // predLatchRange off
    herbivoreLatch,
    cfg.grazeRate,
    cfg.grazeLatchRange,
  );
}

describe('herbivore graze-latch — non-instant-kill (metabolize kernel)', () => {
  it('LEGACY (herbivoreLatch=false) empties a low-energy chain cell in ONE tick (instant kill)', () => {
    // cellEnergy 6 < digestRate 7 → legacy drains min(7,6)=6 → cell hits 0 in a single tick.
    const s = mouthOnChainCell(6);
    expect(s.cfg.digestRate).toBeGreaterThan(6); // precondition: one bite covers the whole cell
    runMetabolize(s, false);
    expect(s.f.energy[s.cell]).toBe(0); // emptied this tick → would sever immediately
  });

  it('GRAZE (herbivoreLatch=true) leaves the same cell ALIVE after one tick (a brush does not kill)', () => {
    const s = mouthOnChainCell(6);
    runMetabolize(s, true);
    // Only grazeRate (1.0) drained, not the full digestRate: 6 - 1 = 5 > 0.
    expect(s.f.energy[s.cell]).toBeCloseTo(6 - s.cfg.grazeRate, 4);
    expect(s.f.energy[s.cell]!).toBeGreaterThan(0); // survives the brush
    // The mouth latched the plant cell (handle = cell+1) and credited the bite × efficiency.
    expect(s.f.latchCell[s.mouth]).toBe(s.cell + 1);
    expect(s.f.latchPrey[s.mouth]).toBe(s.f.organismId[s.cell]);
    expect(s.f.energy[s.mouth]).toBeCloseTo(100 + s.cfg.grazeRate * s.cfg.digestEfficiency, 4);
  });

  it('GRAZE consumes the cell only after MANY ticks of sustained grazing (gradual, not instant)', () => {
    const cellEnergy = 6;
    const s = mouthOnChainCell(cellEnergy);
    let ticks = 0;
    while (s.f.energy[s.cell]! > 0 && ticks < 100) {
      runMetabolize(s, true);
      ticks++;
    }
    // At grazeRate 1.0 a 6-energy cell takes ceil(6/1)=6 ticks; never 1. The exact count just has to
    // be "many", proving the drain is gradual rather than a single instant-kill bite.
    expect(ticks).toBe(Math.ceil(cellEnergy / s.cfg.grazeRate));
    expect(ticks).toBeGreaterThan(1);
    expect(s.f.energy[s.cell]).toBe(0); // finally drained to 0
  });
});

/* ---------------------------------------------------------------------------------------------- */

/** Frozen-economy world (no basal/move/neural, spores off) so the only dynamics are growth + the graze
 *  we drive. Light flooded so the chain grows to the cap. Mirrors plant-sever.test.ts. herbivoreLatch
 *  ON so the demo's eating path is exercised. */
function grazeWorld(overrides: Partial<Config> = {}): World {
  const w = new World(
    defaultConfig({
      seed: 7,
      maxCells: 500,
      sessilePlants: true,
      herbivoreLatch: true,
      basalCost: 0,
      moveCost: 0,
      neuralCost: 0,
      plantGrowthThreshold: 5,
      plantGrowthCost: 2,
      plantBondLen: 15,
      plantSporeThreshold: 1e9, // single founder plant
      ...overrides,
    }),
    false,
  );
  w.light.light.fill(w.config.lightMax);
  w.light.cap.fill(w.config.lightMax);
  return w;
}

/** Walk the linear plant chain base→tip over the live bond graph (a plant is a path graph). */
function chainFromBase(w: World, base: number): number[] {
  const bonds = w.bonds;
  const cap = bonds.degreeCap;
  const order: number[] = [];
  const seen = new Set<number>();
  const queue = [base];
  seen.add(base);
  while (queue.length > 0) {
    const c = queue.shift()!;
    order.push(c);
    const d = bonds.degree[c]!;
    for (let k = 0; k < d; k++) {
      const s = bonds.adj[c * cap + k]!;
      const nb = bonds.cellA[s]! === c ? bonds.cellB[s]! : bonds.cellA[s]!;
      if (seen.has(nb)) continue;
      seen.add(nb);
      queue.push(nb);
    }
  }
  return order;
}

/** Drive the real metabolize kernel once over the whole world, then the sever step — the two halves of
 *  the tick that turn "mouth overlaps plant" into "cell drained → severed". No World.tick() so the
 *  forager is held in place and the only energy change on the grazed cell is the latch drain.
 *  Builds its OWN ascending live set: spawnOrganism does NOT rebuild World.liveIndices (only tick()
 *  does), so the freshly-seeded forager would otherwise be invisible to metabolize. Ascending slot
 *  order matches the determinism contract that rebuildLive upholds. */
function grazeAndSever(w: World): void {
  const cfg = w.config;
  const f = w.cells.fields;
  const slots: number[] = [];
  for (let i = 0; i < w.cells.highWaterMark; i++) if (w.cells.isAlive(i)) slots.push(i);
  const live = Uint32Array.from(slots);
  const n = live.length;
  w.light.light.fill(0); // freeze photosynthesis so the grazed cell only loses energy to the mouth
  w.hash.build(live, n, f.posX, f.posY);
  metabolize(
    live,
    n,
    f,
    w.hash,
    w.light,
    cfg.photoGain,
    cfg.photoDepletion,
    cfg.digestRate,
    cfg.digestEfficiency,
    cfg.baseToughness,
    cfg.basalCost,
    cfg.meatDecay,
    cfg.moveCost,
    cfg.neuralCost,
    w.digestBonus,
    cfg.digestClusterBonus,
    noEnv, // env modulation off (this world disables temp/toxin/day-night) — World.env is private
    cfg.predDigestRate,
    cfg.predDigestEfficiency,
    cfg.predReach,
    f.latchPrey,
    f.latchCell,
    w.organisms.cellCount,
    cfg.predLatchRange,
    cfg.herbivoreLatch,
    cfg.grazeRate,
    cfg.grazeLatchRange,
  );
  w.plants.severEatenChainCells(w.cells, w.bonds, live, n, cfg.meatEnergyOnDeath, false);
}

describe('herbivore graze-latch — non-instant-kill (real World + seedPlantBase + forager)', () => {
  it('a brief graze does NOT sever a chain cell; sustained grazing eventually does', () => {
    const w = grazeWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    const f = w.cells.fields;

    // Pick a real, non-anchored chain cell partway up the grown chain (the base is tough/anchored).
    const chain = chainFromBase(w, base);
    expect(chain.length).toBeGreaterThan(3);
    // Graze the TIP cell: it has a single plant neighbour (the cell below it), so a mouth parked just
    // BEYOND the tip (away from that neighbour) has ONLY the tip inside grazeLatchRange·(ri+rj) — the
    // latch can't pick a different, closer chain cell, so we assert on exactly this cell.
    const target = chain[chain.length - 1]!;
    const below = chain[chain.length - 2]!;
    expect(f.anchored[target]).toBe(0);
    expect(f.cellType[target]).toBe(CellType.PHOTO);
    // Reset it to a low energy a single legacy bite WOULD empty, isolating the latch as the only reason
    // it survives a brush.
    const startE = w.config.digestRate - 1; // < digestRate ⇒ legacy would zero it in one tick
    f.energy[target] = startE;

    // Unit vector from the tip's neighbour toward the tip — push the mouth a little past the tip along
    // it so the mouth overlaps the tip but is farther from every other chain cell.
    const dx = f.posX[target]! - f.posX[below]!;
    const dy = f.posY[target]! - f.posY[below]!;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Seed a REAL forager (buildForagerGenome) and slide its DIGESTIVE mouth onto the tip.
    const forager = w.spawnOrganism(buildForagerGenome(w.config.cellRadius, 100), 1500, 1500, 0);
    let mouth = -1;
    for (let i = 0; i < w.cells.highWaterMark; i++) {
      if (
        w.cells.isAlive(i) &&
        f.organismId[i] === forager &&
        f.cellType[i] === CellType.DIGESTIVE
      ) {
        mouth = i;
        break;
      }
    }
    expect(mouth).toBeGreaterThanOrEqual(0);
    const seat = () => {
      f.posX[mouth] = f.posX[target]! + ux * 4; // overlap the tip (4 << ri+rj = 12), past it
      f.posY[mouth] = f.posY[target]! + uy * 4;
    };
    seat();
    f.thrust[mouth] = 0; // hold still — no movement that could tow it off

    // ONE graze tick: the cell is grazed (grazeRate drained) but NOT emptied → not severed.
    grazeAndSever(w);
    expect(w.cells.isAlive(target)).toBe(true);
    expect(f.cellType[target]).toBe(CellType.PHOTO); // still a living plant cell, not MEAT
    expect(f.organismId[target]).toBe(org); // still part of the plant
    expect(f.energy[target]).toBeCloseTo(startE - w.config.grazeRate, 4);
    expect(f.energy[target]!).toBeGreaterThan(0);
    expect(f.latchCell[mouth]).toBe(target + 1); // latched onto exactly this cell

    // SUSTAINED grazing: keep the mouth on the cell. After many ticks it crosses energy<=0 and only
    // THEN severs to MEAT (org 0). It must take more than one tick — that is non-instant-kill.
    let ticks = 1;
    while (w.cells.isAlive(target) && f.cellType[target] === CellType.PHOTO && ticks < 200) {
      seat(); // re-seat in case the tether nudged the mouth
      grazeAndSever(w);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(1); // gradual, not instant
    expect(f.cellType[target]).toBe(CellType.MEAT); // finally severed
    expect(f.organismId[target]).toBe(0); // freed from the plant
  });
});
