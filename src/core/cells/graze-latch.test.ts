import { describe, it, expect } from 'vitest';
import { metabolize, type EnvEffects } from './metabolism';
import { CellType } from './types';
import { CellStore, type CellArrays } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { defaultConfig } from '../sim/config';

// Herbivore graze-latch (herbivoreLatch:true). A DIGESTIVE/MOTILE mouth LATCHES one edible PHOTO chain
// cell and drains it at the modest grazeRate over MANY ticks (sustained grazing), instead of the legacy
// instant FIRST-edible drain. These tests assert the latch is ACQUIRED + HELD across ticks and energy
// transfers GRADUALLY — crediting the eater × digestEfficiency, debiting the plant at grazeRate. They do
// NOT assert the ecology booms; only that the mechanic works.

function buildHash(
  store: CellStore,
  live: Uint32Array,
  n: number,
  w: number,
  h: number,
  cell: number,
) {
  const hash = new SpatialHash(w, h, cell, store.capacity);
  hash.build(live, n, store.fields.posX, store.fields.posY);
  return hash;
}

// All-zero digest-cluster bonus → multiplier 1 (lone mouth).
const noBonus = new Uint8Array(64);

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

/**
 * One forager mouth (organism 1) adjacent to one non-anchored PHOTO chain cell (organism 2).
 * Light off → the plant cell never refills, so its only energy change is the latch drain. The
 * organismCellCount array marks the plant organism alive so the latch's HOLD branch re-engages each tick.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setup(mouthType: number, _cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 })) {
  const store = new CellStore(16, false);
  const f = store.fields;
  const mouth = store.alloc(); // slot 0 — lower slot, runs first
  const plant = store.alloc(); // slot 1 — PHOTO chain cell, within grazeLatchRange
  f.posX[mouth] = 500;
  f.posY[mouth] = 500;
  f.radius[mouth] = 3;
  f.mass[mouth] = 1;
  f.energy[mouth] = 100;
  f.cellType[mouth] = mouthType;
  f.organismId[mouth] = 1;
  f.thrust[mouth] = 0;
  f.posX[plant] = 503; // distance 3 < grazeLatchRange·(ri+rj) = 1.5·6 = 9
  f.posY[plant] = 500;
  f.radius[plant] = 3;
  f.mass[plant] = 1;
  f.energy[plant] = 30;
  f.cellType[plant] = CellType.PHOTO;
  f.organismId[plant] = 2;
  f.anchored[plant] = 0; // a chain cell, not the tough anchored base → drains at the full grazeRate

  // light off so the plant cell does not photosynthesise — isolates the graze drain
  const lf = new LightField(16, 16, 1024, 1024);
  lf.cap.fill(0);
  lf.light.fill(0);

  // mark the plant organism alive so the latch HOLD check (organismCellCount[held] > 0) passes each tick
  const orgCC = new Uint32Array(64);
  orgCC[2] = 1;

  return { store, f, mouth, plant, lf, orgCC };
}

/** Thin wrapper over metabolize with the graze-latch knobs taken from cfg. */
function step(
  f: CellArrays,
  live: Uint32Array,
  n: number,
  hash: SpatialHash,
  lf: LightField,
  cfg: ReturnType<typeof defaultConfig>,
  orgCC: Uint32Array,
) {
  metabolize(
    live,
    n,
    f,
    hash,
    lf,
    cfg.photoGain,
    cfg.photoDepletion,
    cfg.digestRate,
    cfg.digestEfficiency,
    cfg.baseToughness,
    cfg.basalCost,
    cfg.meatDecay,
    cfg.moveCost,
    cfg.neuralCost,
    noBonus,
    0, // digestClusterBonus
    noEnv,
    0, // predDigestRate
    0, // predDigestEfficiency
    1, // predReach
    f.latchPrey,
    f.latchCell,
    orgCC,
    0, // predLatchRange (predator latch off)
    cfg.herbivoreLatch,
    cfg.grazeRate,
    cfg.grazeLatchRange,
    Number.MAX_SAFE_INTEGER,
  );
}

describe('herbivore graze-latch — acquisition + sustained gradual drain', () => {
  for (const mouthType of [CellType.DIGESTIVE, CellType.MOTILE]) {
    const name = mouthType === CellType.DIGESTIVE ? 'DIGESTIVE' : 'MOTILE';

    it(`a ${name} mouth LATCHES an adjacent PHOTO chain cell and drains grazeRate/tick, crediting the eater × efficiency`, () => {
      const cfg = defaultConfig({
        worldWidth: 1024,
        worldHeight: 1024,
        herbivoreLatch: true,
        grazeRate: 1.0,
        grazeLatchRange: 1.5,
        basalCost: 0, // isolate the graze accounting from upkeep
      });
      const { store, f, mouth, plant, lf, orgCC } = setup(mouthType, cfg);
      const live = new Uint32Array([mouth, plant]);
      const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

      const mouthE0 = f.energy[mouth]!;
      const plantE0 = f.energy[plant]!;

      // First tick: the mouth acquires the latch.
      step(f, live, 2, hash, lf, cfg, orgCC);

      // latchCell is the (cell+1) tether handle → points at the plant slot.
      expect(f.latchCell[mouth]).toBe(plant + 1);
      // latchPrey holds the latched PLANT's organismId (2), NOT the mouth's own org.
      expect(f.latchPrey[mouth]).toBe(2);
      // gradual: exactly one grazeRate drained — NOT the whole 30-unit cell (legacy digestRate 7 would
      // have stripped 7 in one bite; the latch takes 1).
      expect(f.energy[plant]).toBeCloseTo(plantE0 - cfg.grazeRate, 4);
      // eater credited grazeRate × digestEfficiency (basal 0, no cluster bonus).
      expect(f.energy[mouth]).toBeCloseTo(mouthE0 + cfg.grazeRate * cfg.digestEfficiency, 4);

      // Sustained: hold the latch across many ticks; energy trickles in linearly.
      const TICKS = 10;
      for (let t = 1; t < TICKS; t++) {
        step(f, live, 2, hash, lf, cfg, orgCC);
        // latch is HELD every tick (handle + held organism unchanged).
        expect(f.latchCell[mouth]).toBe(plant + 1);
        expect(f.latchPrey[mouth]).toBe(2);
      }

      // After TICKS ticks: a fixed grazeRate drained per tick, eater credited × efficiency each tick.
      expect(f.energy[plant]).toBeCloseTo(plantE0 - cfg.grazeRate * TICKS, 4);
      expect(f.energy[mouth]).toBeCloseTo(
        mouthE0 + cfg.grazeRate * cfg.digestEfficiency * TICKS,
        4,
      );
      // The cell still has energy left after 10 ticks — a brief brush no longer kills it.
      expect(f.energy[plant]!).toBeGreaterThan(0);
    });
  }

  it('takes MANY ticks to consume a chain cell (a brief brush does not strip it like the legacy bite)', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      herbivoreLatch: true,
      grazeRate: 1.0,
      grazeLatchRange: 1.5,
      basalCost: 0,
    });
    const { store, f, mouth, plant, lf, orgCC } = setup(CellType.DIGESTIVE, cfg);
    f.energy[plant] = 30; // a modest chain cell
    const live = new Uint32Array([mouth, plant]);
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

    // 3 ticks (a brief brush) leaves most of the cell intact — legacy digestRate 7 would have emptied
    // it in ~4-5 bites; grazeRate 1 leaves 27.
    for (let t = 0; t < 3; t++) step(f, live, 2, hash, lf, cfg, orgCC);
    expect(f.energy[plant]).toBeCloseTo(30 - 3 * cfg.grazeRate, 4);

    // Count ticks to drain it to ≤0 — it should be ~30 (grazeRate 1, no refill), i.e. MANY ticks.
    let ticks = 3;
    while (f.energy[plant] > 0 && ticks < 1000) {
      step(f, live, 2, hash, lf, cfg, orgCC);
      ticks++;
    }
    expect(ticks).toBe(30); // 30 energy / grazeRate 1 = 30 ticks (gradual, non-instant-kill)
  });

  it('releases the latch when the held PHOTO cell is gone (energy ≤ 0 → no PHOTO found in range)', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      herbivoreLatch: true,
      grazeRate: 1.0,
      grazeLatchRange: 1.5,
      basalCost: 0,
    });
    const { store, f, mouth, plant, lf, orgCC } = setup(CellType.DIGESTIVE, cfg);
    f.energy[plant] = 1; // one grazeRate-tick of food left
    const live = new Uint32Array([mouth, plant]);
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

    // Tick 1: drains the last unit, latch acquired.
    step(f, live, 2, hash, lf, cfg, orgCC);
    expect(f.latchCell[mouth]).toBe(plant + 1);
    expect(f.energy[plant]).toBeCloseTo(0, 4);

    // Tick 2: the cell now has energy ≤ 0, so the latch scan finds no edible PHOTO → it RELEASES.
    step(f, live, 2, hash, lf, cfg, orgCC);
    expect(f.latchCell[mouth]).toBe(0);
    expect(f.latchPrey[mouth]).toBe(0);
  });
});

describe('herbivore graze-latch — SATIATION (eat-and-go)', () => {
  // A FED mouth (energy ≥ grazeSatiation) releases any latch and skips ALL eating → it roams; a HUNGRY
  // mouth (below the threshold) feeds normally. Both share the SAME setup; only the mouth energy differs.
  const cfg = defaultConfig({
    worldWidth: 1024,
    worldHeight: 1024,
    herbivoreLatch: true,
    grazeRate: 1.0,
    grazeLatchRange: 1.5,
    basalCost: 0, // isolate the graze accounting from upkeep
  });
  const SATIATION = 50;

  /** metabolize with an explicit grazeSatiation (the shared `step` helper hard-codes it inert). */
  function stepSat(
    f: CellArrays,
    live: Uint32Array,
    hash: SpatialHash,
    lf: LightField,
    orgCC: Uint32Array,
    satiation: number,
  ) {
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
      cfg.basalCost,
      cfg.meatDecay,
      cfg.moveCost,
      cfg.neuralCost,
      noBonus,
      0,
      noEnv,
      0,
      0,
      1,
      f.latchPrey,
      f.latchCell,
      orgCC,
      0,
      cfg.herbivoreLatch,
      cfg.grazeRate,
      cfg.grazeLatchRange,
      satiation,
    );
  }

  it('a FED mouth (energy ≥ grazeSatiation) releases its latch and does NOT eat the adjacent PHOTO', () => {
    const { store, f, mouth, plant, lf, orgCC } = setup(CellType.DIGESTIVE, cfg);
    f.energy[mouth] = 100; // ≥ SATIATION (50) → satiated
    f.energy[plant] = 30;
    f.latchPrey[mouth] = 2; // pretend it was latched last tick — satiation must RELEASE it
    f.latchCell[mouth] = plant + 1;
    const live = new Uint32Array([mouth, plant]);
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

    const mouthE0 = f.energy[mouth];
    stepSat(f, live, hash, lf, orgCC, SATIATION);

    // No eating: the plant is untouched and the mouth gained nothing (basal 0).
    expect(f.energy[plant]).toBe(30);
    expect(f.energy[mouth]).toBe(mouthE0);
    // Latch released → it roams.
    expect(f.latchPrey[mouth]).toBe(0);
    expect(f.latchCell[mouth]).toBe(0);
  });

  it('a HUNGRY mouth (energy < grazeSatiation) still grazes the adjacent PHOTO', () => {
    const { store, f, mouth, plant, lf, orgCC } = setup(CellType.DIGESTIVE, cfg);
    f.energy[mouth] = 10; // < SATIATION (50) → hungry
    f.energy[plant] = 30;
    const live = new Uint32Array([mouth, plant]);
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

    const mouthE0 = f.energy[mouth];
    stepSat(f, live, hash, lf, orgCC, SATIATION);

    // Normal graze: one grazeRate drained, eater credited × efficiency, latch acquired.
    expect(f.energy[plant]).toBeCloseTo(30 - cfg.grazeRate, 4);
    expect(f.energy[mouth]).toBeCloseTo(mouthE0 + cfg.grazeRate * cfg.digestEfficiency, 4);
    expect(f.latchCell[mouth]).toBe(plant + 1);
    expect(f.latchPrey[mouth]).toBe(2);
  });
});

describe('herbivore graze-latch — legacy path is byte-identical when OFF', () => {
  it('with herbivoreLatch:false a DIGESTIVE mouth uses the legacy instant drain (digestRate) and sets NO latch', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      herbivoreLatch: false,
      basalCost: 0,
    });
    const { store, f, mouth, plant, lf, orgCC } = setup(CellType.DIGESTIVE, cfg);
    f.energy[plant] = 30;
    const live = new Uint32Array([mouth, plant]);
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);

    const mouthE0 = f.energy[mouth]!;
    step(f, live, 2, hash, lf, cfg, orgCC);

    // legacy overlap drain at the full digestRate (7), NOT grazeRate; no latch is set.
    expect(f.energy[plant]).toBeCloseTo(30 - cfg.digestRate, 4);
    expect(f.energy[mouth]).toBeCloseTo(mouthE0 + cfg.digestRate * cfg.digestEfficiency, 4);
    expect(f.latchCell[mouth]).toBe(0);
    expect(f.latchPrey[mouth]).toBe(0);
  });
});
