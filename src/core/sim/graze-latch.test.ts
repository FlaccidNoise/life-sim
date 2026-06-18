import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { metabolize, type EnvEffects } from '../cells/metabolism';
import { CellType } from '../cells/types';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { buildForagerGenome } from '../genome/critter-genome';
import { develop } from '../genome/develop';
import { instantiateBody } from '../organism/instantiate';

/**
 * Herbivore graze-latch (config.herbivoreLatch). Two things are proven:
 *  (1) with the flag OFF (the default) the legacy instant-drain eating path runs UNCHANGED — the
 *      grazeRate/grazeLatchRange args are fully gated, so passing junk values leaves the bite and the
 *      latch arrays byte-identical to the legacy call; and
 *  (2) with the flag ON, a small world run twice on the same seed is byte-identical (determinism),
 *      and the new code path actually fired non-vacuously (the latch engaged, a forager grazed energy
 *      off a plant chain cell over many ticks rather than instant-killing it).
 *
 * Foragers vs plants are classified by the anchored-base / MOVER distinction, never by
 * "non-carnivore organism" (plants are non-carnivore organisms too): a forager organism has a MOVER
 * (`organisms.mover[org] >= 0`); a plant is an anchored PHOTO base with no MOVER (`mover[org] === -1`).
 */

const noBonus = new Uint8Array(64);
const noCC = new Uint32Array(64);

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
 * A DIGESTIVE forager mouth at slot 0 overlapping a single PHOTO cell at slot 1 (within ri+rj=6).
 * One metabolize call; the new graze knobs are passed verbatim from the args so the SAME geometry can
 * be run with the latch off (junk knobs ignored) vs on. Light=0 so the PHOTO cell doesn't top up;
 * basalCost=0 so the only energy change is the bite.
 */
function biteScenario() {
  const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024, basalCost: 0 });
  const store = new CellStore(16, false);
  const f = store.fields;
  const eater = store.alloc();
  const prey = store.alloc();
  f.posX[eater] = 500;
  f.posY[eater] = 500;
  f.radius[eater] = 3;
  f.mass[eater] = 1;
  f.energy[eater] = 100;
  f.cellType[eater] = CellType.DIGESTIVE;
  f.posX[prey] = 503; // within ri+rj = 6
  f.posY[prey] = 500;
  f.radius[prey] = 3;
  f.mass[prey] = 1;
  f.energy[prey] = 50;
  f.cellType[prey] = CellType.PHOTO;
  f.anchored[prey] = 0; // a chain cell, not a tough base
  f.organismId[prey] = 1;
  const live = new Uint32Array([eater, prey]);
  const lf = new LightField(16, 16, 1024, 1024);
  lf.cap.fill(0);
  lf.light.fill(0);
  const hash = new SpatialHash(1024, 1024, 2 * cfg.cellRadius, store.capacity);
  hash.build(live, 2, f.posX, f.posY);
  return { f, live, hash, lf, cfg, eater, prey };
}

function callMetabolize(
  s: ReturnType<typeof biteScenario>,
  herbivoreLatch: boolean,
  grazeRate: number,
  grazeLatchRange: number,
): void {
  const { f, live, hash, lf, cfg } = s;
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
    0, // moveCost
    0, // neuralCost
    noBonus,
    0, // digestClusterBonus
    noEnv,
    0, // predDigestRate
    0, // predDigestEfficiency
    1, // predReach
    f.latchPrey,
    f.latchCell,
    noCC,
    0, // predLatchRange
    herbivoreLatch,
    grazeRate,
    grazeLatchRange,
  );
}

describe('graze-latch — legacy path byte-identical when herbivoreLatch=false', () => {
  it('the legacy overlap-drain bite + latch arrays are untouched by the (ignored) graze knobs', () => {
    // Same eating scenario, flag OFF, run twice with WILDLY different graze knobs. If the flag truly
    // gates the new path, the knobs are dead args and both outputs are byte-identical to the legacy bite.
    const a = biteScenario();
    callMetabolize(a, false, 0, 0);
    const b = biteScenario();
    callMetabolize(b, false, 9999, 9999); // junk knobs — must be completely ignored
    expect(a.f.energy[a.eater]!).toBe(b.f.energy[b.eater]!);
    expect(a.f.energy[a.prey]!).toBe(b.f.energy[b.prey]!);
    // The legacy path NEVER touches the latch arrays (those are predator-/graze-only).
    expect(a.f.latchPrey[a.eater]!).toBe(0);
    expect(a.f.latchCell[a.eater]!).toBe(0);
    expect(b.f.latchPrey[b.eater]!).toBe(0);
    expect(b.f.latchCell[b.eater]!).toBe(0);
    // The bite is the legacy overlap drain: digestRate (7) off the prey, kept at digestEfficiency (0.7).
    expect(a.f.energy[a.prey]!).toBeCloseTo(50 - 7, 4);
    expect(a.f.energy[a.eater]!).toBeCloseTo(100 + 7 * 0.7, 4);
  });

  it('legacy drain ≠ graze drain on the SAME tick (the flag selects a genuinely different path)', () => {
    // Guard against a vacuous "byte-identical" pass: the latch path must actually differ. The legacy bite
    // strips digestRate (7) instantly with no latch; the graze nibbles only grazeRate (1) and latches.
    const legacy = biteScenario();
    callMetabolize(legacy, false, 0, 0);
    const graze = biteScenario();
    callMetabolize(graze, true, 1, 1.5);
    expect(legacy.f.energy[legacy.prey]!).toBeCloseTo(50 - 7, 4); // legacy strips digestRate=7
    expect(legacy.f.latchPrey[legacy.eater]!).toBe(0); // …and never latches
    expect(graze.f.energy[graze.prey]!).toBeCloseTo(50 - 1, 4); // graze nibbles only grazeRate=1
    expect(graze.f.energy[graze.eater]!).toBeCloseTo(100 + 1 * 0.7, 4); // credited at digestEfficiency
    expect(graze.f.latchPrey[graze.eater]!).toBe(1); // the latch engaged (held the plant org)
    expect(graze.f.latchCell[graze.eater]!).toBe(graze.prey + 1); // tether handle = cell+1
  });
});

/** Foragers (MOVER) vs plant organisms (anchored base, no MOVER), counted off the organism table. */
function classify(w: World): { foragers: number; plants: number } {
  const cc = w.organisms.cellCount;
  const mover = w.organisms.mover;
  let foragers = 0;
  let plants = 0;
  for (let org = 1; org < cc.length; org++) {
    if (cc[org]! === 0) continue;
    if (mover[org]! >= 0)
      foragers++; // has a MOVER → a motile forager organism
    else plants++; // anchored PHOTO base, no MOVER → a plant organism
  }
  return { foragers, plants };
}

describe('graze-latch — determinism + non-vacuity when herbivoreLatch=true', () => {
  // A small DENSE arena of sessile plants + a few foragers seeded right on top of them, so a forager
  // latches a plant chain cell within a few hundred ticks. We only need the graze path to FIRE and be
  // byte-deterministic — NOT to prove the ecology booms (the owner tunes balance after).
  function runGraze(): {
    w: World;
    latched: boolean;
    sustained: boolean;
    grazedEnergy: boolean;
    foragersStart: number;
    plantsStart: number;
  } {
    const cfg = defaultConfig({
      seed: 7,
      maxCells: 4000,
      maxBonds: 16384,
      maxOrganisms: 4096,
      cellRadius: 4,
      worldWidth: 384,
      worldHeight: 384,
      sessilePlants: true,
      // Graze-latch ON — the mechanic under test.
      herbivoreLatch: true,
      grazeRate: 1.0,
      grazeLatchRange: 1.5,
      grazeLatchStiffness: 1.0,
      // Slow upkeep so foragers live long enough to find + camp a plant.
      basalCost: 0.0015,
      reproThreshold: 280,
      reproParentFloor: 60,
      organismDeathFloor: 0,
      cruiseThrust: 1,
      maxThrust: 14,
    });
    const w = new World(cfg, false);

    // A grid of plant bases. Each grows a chain → the standing food the foragers graze.
    for (let gx = 0; gx < 6; gx++) {
      for (let gy = 0; gy < 6; gy++) {
        w.seedPlantBase(
          cfg.worldWidth * (0.12 + (0.76 * gx) / 5),
          cfg.worldHeight * (0.12 + (0.76 * gy) / 5),
          30,
        );
      }
    }
    // Foragers seeded on top of the plant grid so first contact (and the latch) happens fast.
    for (let k = 0; k < 12; k++) {
      const g = buildForagerGenome(cfg.cellRadius, 60);
      const ref = w.genomes.register(g);
      const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
      instantiateBody(
        body,
        w.cells,
        w.net,
        w.bonds,
        w.organisms,
        ref,
        cfg.worldWidth * (0.15 + (0.7 * (k % 4)) / 4),
        cfg.worldHeight * (0.15 + (0.7 * Math.floor(k / 4)) / 3),
        (k * 2.39996) % (Math.PI * 2),
        cfg.worldWidth,
        cfg.worldHeight,
        w.instantiateScratch,
        w.glowEffectors,
      );
    }

    const f = w.cells.fields;
    let latched = false;
    let sustained = false; // a forager held the SAME plant org across consecutive ticks (the hold path)
    let grazedEnergy = false; // a forager actually gained energy from a partial graze (not an instant kill)
    let start = { foragers: 0, plants: 0 };
    const prevLatch = new Map<number, number>(); // forager mouth idx → its latchPrey last tick
    for (let t = 0; t < 400; t++) {
      // Snapshot forager mouth energies before the tick so we can detect a graze gain.
      const preE = new Map<number, number>();
      for (let i = 0; i < w.liveCount; i++) {
        const idx = w.liveIndices[i]!;
        if (f.cellType[idx] === CellType.DIGESTIVE && f.latchCell[idx]! > 0)
          preE.set(idx, f.energy[idx]!);
      }
      w.tick();
      // Classify off the FIRST aggregated tick — organisms.cellCount/mover are only populated by
      // aggregateOrganisms (inside tick), so a pre-tick count would see every org as cellCount 0.
      if (t === 0) start = classify(w);
      const seen = new Map<number, number>();
      for (let i = 0; i < w.liveCount; i++) {
        const idx = w.liveIndices[i]!;
        if (f.cellType[idx] !== CellType.DIGESTIVE) continue;
        if (f.latchCell[idx]! > 0) latched = true;
        const lp = f.latchPrey[idx]!;
        if (lp !== 0) {
          seen.set(idx, lp);
          if (prevLatch.get(idx) === lp) sustained = true; // same held plant org as last tick
        }
        const before = preE.get(idx);
        if (before !== undefined && f.energy[idx]! > before) grazedEnergy = true;
      }
      prevLatch.clear();
      for (const [k, v] of seen) prevLatch.set(k, v);
    }

    return {
      w,
      latched,
      sustained,
      grazedEnergy,
      foragersStart: start.foragers,
      plantsStart: start.plants,
    };
  }

  it('two same-seed runs are byte-identical AND the graze-latch fired non-vacuously', () => {
    const a = runGraze();
    const b = runGraze();
    const fa = a.w.cells.fields;
    const fb = b.w.cells.fields;
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
    expect(Array.from(fa.cellType)).toEqual(Array.from(fb.cellType));
    expect(Array.from(fa.organismId)).toEqual(Array.from(fb.organismId));
    // The latch arrays are on the determinism contract — they must match bit-for-bit.
    expect(Array.from(fa.latchCell)).toEqual(Array.from(fb.latchCell));
    expect(Array.from(fa.latchPrey)).toEqual(Array.from(fb.latchPrey));

    // Setup sanity: both trophic levels were actually seeded, classified by MOVER vs anchored base
    // (NOT "non-carnivore organism", which would conflate plants and foragers).
    expect(a.foragersStart).toBe(12);
    expect(a.plantsStart).toBe(36);

    // Non-vacuity: the graze path genuinely ran, identically across both runs.
    expect(a.latched).toBe(true); // a forager mouth latched a plant cell at least once
    expect(a.latched).toBe(b.latched);
    expect(a.sustained).toBe(true); // it held the same plant org across consecutive ticks (multi-tick graze)
    expect(a.sustained).toBe(b.sustained);
    expect(a.grazedEnergy).toBe(true); // a latched forager gained energy from a partial graze (gradual feeding)
    expect(a.grazedEnergy).toBe(b.grazedEnergy);
  }, 30000);
});
