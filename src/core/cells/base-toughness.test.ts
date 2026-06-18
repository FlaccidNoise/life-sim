import { describe, it, expect } from 'vitest';
import { metabolize, type EnvEffects } from './metabolism';
import { CellType } from './types';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { defaultConfig } from '../sim/config';

/**
 * Base toughness (metabolism.ts:131). A plant's pinned base (`anchored=1`) drains at
 * `digestRate · baseToughness` per forager bite, a chain cell at the full `digestRate`. The only
 * difference between the two scenarios below is the prey's `anchored` flag, so the energy a forager
 * extracts in one tick — and the number of bites a forager needs to drain the prey to 0 — directly
 * measures the toughness multiplier. Photosynthesis/transfer are frozen off (no light, transferRate
 * irrelevant since prey is a lone cell) so nothing tops the prey back up, isolating the bite rate.
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
 * A forager (DIGESTIVE) at slot 0 adjacent to a single PHOTO prey at slot 1. Light forced to 0 so the
 * PHOTO prey photosynthesises nothing — the only energy change to the prey is the forager's bite. The
 * prey is `anchored` per the arg (a base) or not (a chain cell). basalCost forced to 0 so a tick on the
 * prey is exactly the bite (no upkeep drain) and the rate comparison is clean.
 */
function biteOnce(anchored: boolean, preyEnergy: number): { prey: number; eater: number } {
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
  f.energy[prey] = preyEnergy;
  f.cellType[prey] = CellType.PHOTO;
  f.anchored[prey] = anchored ? 1 : 0;
  const live = new Uint32Array([eater, prey]);
  const lf = new LightField(16, 16, 1024, 1024);
  lf.cap.fill(0);
  lf.light.fill(0);
  const hash = new SpatialHash(1024, 1024, 2 * cfg.cellRadius, store.capacity);
  hash.build(live, 2, f.posX, f.posY);
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
    0,
    0,
    noBonus,
    0,
    noEnv,
    0,
    0,
    1,
    f.latchPrey,
    f.latchCell,
    noCC,
    0,
    false,
    0,
    0,
  );
  return { prey: f.energy[prey], eater: f.energy[eater] };
}

describe('base toughness', () => {
  it('an anchored base drains at exactly baseToughness× the rate of a chain cell in one bite', () => {
    const cfg = defaultConfig();
    const start = 1000; // well above both bite sizes so neither bite is clamped to avail
    const chain = biteOnce(false, start);
    const base = biteOnce(true, start);

    const chainLost = start - chain.prey;
    const baseLost = start - base.prey;

    // chain cell loses the full digestRate; base loses digestRate·baseToughness.
    expect(chainLost).toBeCloseTo(cfg.digestRate, 4);
    expect(baseLost).toBeCloseTo(cfg.digestRate * cfg.baseToughness, 4);
    // the base drains at exactly the toughness multiplier of the chain rate.
    expect(baseLost / chainLost).toBeCloseTo(cfg.baseToughness, 4);

    // the forager keeps digestEfficiency of what it took, so it gains baseToughness× less off a base.
    expect(chain.eater - 100).toBeCloseTo(cfg.digestRate * cfg.digestEfficiency, 4);
    expect(base.eater - 100).toBeCloseTo(
      cfg.digestRate * cfg.baseToughness * cfg.digestEfficiency,
      4,
    );
  });

  it('a base survives a fixed forager contact far longer than a chain cell would', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024, basalCost: 0 });
    const start = 100;

    // Run the same forager-camped-on-prey scenario for both anchored states, counting the bites
    // needed to drain the prey to <= 0. Rebuild a fresh world each time so the only variable is anchored.
    function bitesToDrain(anchored: boolean): number {
      const store = new CellStore(16, false);
      const f = store.fields;
      const eater = store.alloc();
      const prey = store.alloc();
      f.posX[eater] = 500;
      f.posY[eater] = 500;
      f.radius[eater] = 3;
      f.mass[eater] = 1;
      f.energy[eater] = 1e9; // forager never starves — it just keeps biting
      f.cellType[eater] = CellType.DIGESTIVE;
      f.posX[prey] = 503;
      f.posY[prey] = 500;
      f.radius[prey] = 3;
      f.mass[prey] = 1;
      f.energy[prey] = start;
      f.cellType[prey] = CellType.PHOTO;
      f.anchored[prey] = anchored ? 1 : 0;
      const live = new Uint32Array([eater, prey]);
      const lf = new LightField(16, 16, 1024, 1024);
      lf.cap.fill(0);
      lf.light.fill(0);
      const hash = new SpatialHash(1024, 1024, 2 * cfg.cellRadius, store.capacity);
      hash.build(live, 2, f.posX, f.posY);
      let bites = 0;
      const cap = 100_000; // guard against a non-terminating loop
      while (f.energy[prey] > 0 && bites < cap) {
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
          0,
          0,
          noBonus,
          0,
          noEnv,
          0,
          0,
          1,
          f.latchPrey,
          f.latchCell,
          noCC,
          0,
          false,
          0,
          0,
        );
        bites++;
      }
      return bites;
    }

    const chainBites = bitesToDrain(false);
    const baseBites = bitesToDrain(true);

    // chain cell: start / digestRate bites (rounded up).
    expect(chainBites).toBe(Math.ceil(start / cfg.digestRate));
    // base cell: start / (digestRate·baseToughness) bites — ~1/baseToughness× more.
    expect(baseBites).toBe(Math.ceil(start / (cfg.digestRate * cfg.baseToughness)));
    // the base outlasts the chain cell by ~1/baseToughness (10× at the default 0.1).
    expect(baseBites / chainBites).toBeGreaterThan(1 / cfg.baseToughness - 1);
    expect(baseBites).toBeGreaterThan(chainBites);
  });
});
