import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { spawnSwimmer, type Critter } from './critter';
import { CellType } from '../cells/types';
import { develop } from '../genome/develop';
import { buildAutotrophGenome, buildForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { serializeGenomeLibrary } from '../genome/genome';
import { serializeLineageLog } from '../genome/lineage-log';

function runWorld(seed: number): World {
  const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
  w.seedLife(1000);
  for (let i = 0; i < 200; i++) w.tick();
  return w;
}

describe('reproducibility', () => {
  it('produces byte-identical arrays for the same (Config, seed)', () => {
    const a = runWorld(12345);
    const b = runWorld(12345);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.posY.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posY.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.age.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.age.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.heading.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.heading.slice(0, 1000)),
    );
  });

  it('produces different positions for different seeds', () => {
    const a = runWorld(1);
    const b = runWorld(2);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).not.toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
  });
});

function runWithCritter(seed: number): { w: World; c: Critter } {
  const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
  w.seedLife(500);
  // Spawn the critter into a PHOTO cluster so the smell field gives it a real
  // gradient → the reproduced activations cover the sensor→neuron→motor chain.
  const f = w.cells.fields;
  for (let k = 0; k < 12; k++) {
    const i = w.cells.alloc();
    f.posX[i] = 1040 + (k % 4) * 4;
    f.posY[i] = 1000 + ((k / 4) | 0) * 4;
    f.radius[i] = w.config.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
  }
  const c = spawnSwimmer(w, 1000, 1000, 0.5);
  for (let i = 0; i < 150; i++) w.tick();
  return { w, c };
}

describe('reproducibility — neuron activations', () => {
  it('produces byte-identical activations for the same (Config, seed)', () => {
    const a = runWithCritter(999);
    const b = runWithCritter(999);
    // Compare the actual critter neuron slots + the mover's thrust/heading, so the
    // sensorimotor chain — not only the oscillator — is locked.
    const slots = [a.c.sensorFwd, a.c.sensorLat, a.c.clockA, a.c.clockB, a.c.turn, a.c.thrust];
    for (const s of slots) expect(a.w.net.actCur[s]!).toBe(b.w.net.actCur[s]!);
    expect(a.w.cells.fields.heading[a.c.mover]!).toBe(b.w.cells.fields.heading[b.c.mover]!);
    // and the SENSOR chain (not just the free-running oscillator) computed a non-zero
    // value — proving the sensor→neuron path, fed by the PHOTO smell gradient, ran.
    expect(a.w.net.actCur[a.c.sensorFwd]! !== 0 || a.w.net.actCur[a.c.sensorLat]! !== 0).toBe(true);
  });
});

describe('reproducibility — bonds + organism state', () => {
  function runBonded(seed: number): World {
    const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
    w.seedLife(500);
    // A bonded digestive cluster near a PHOTO patch + a swimmer → exercises bond springs,
    // transfer, the digestion-clustering bonus, and the neural chain together.
    const f = w.cells.fields;
    const org = w.organisms.alloc();
    const cluster: number[] = [];
    for (let kk = 0; kk < 4; kk++) {
      const i = w.cells.alloc();
      f.posX[i] = 1000 + (kk % 2) * 14;
      f.posY[i] = 1000 + ((kk / 2) | 0) * 14;
      f.radius[i] = w.config.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 200;
      f.cellType[i] = CellType.DIGESTIVE;
      f.organismId[i] = org;
      cluster.push(i);
    }
    for (let kk = 0; kk + 1 < cluster.length; kk++) {
      w.bonds.addBond(
        cluster[kk]!,
        f.generation[cluster[kk]!]!,
        cluster[kk + 1]!,
        f.generation[cluster[kk + 1]!]!,
        14,
        1,
      );
    }
    w.bonds.rebuildLive(w.cells);
    spawnSwimmer(w, 1040, 1000, 0.5);
    for (let i = 0; i < 150; i++) w.tick();
    return w;
  }

  it('produces byte-identical bond positions, organismId, and organism energy for the same (Config, seed)', () => {
    const a = runBonded(424242);
    const b = runBonded(424242);
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    for (let i = 0; i < a.cells.capacity; i++) {
      expect(fa.posX[i]!).toBe(fb.posX[i]!);
      expect(fa.posY[i]!).toBe(fb.posY[i]!);
      expect(fa.energy[i]!).toBe(fb.energy[i]!);
      expect(fa.organismId[i]!).toBe(fb.organismId[i]!);
    }
    for (let org = 0; org < a.organisms.maxOrganisms; org++) {
      expect(a.organisms.energy[org]!).toBe(b.organisms.energy[org]!);
      expect(a.organisms.cellCount[org]!).toBe(b.organisms.cellCount[org]!);
    }
  });
});

describe('reproducibility — M6 genome reproduction + mutation', () => {
  function spawnAutotroph(w: World, energy: number): void {
    const ref = w.genomes.register(buildAutotrophGenome(w.config.cellRadius));
    const body = develop(
      buildAutotrophGenome(w.config.cellRadius),
      w.config.maxCellsPerOrganism,
      w.config.maxRecursionDepth,
    );
    const org = instantiateBody(
      body,
      w.cells,
      w.net,
      w.bonds,
      w.organisms,
      ref,
      1000,
      1000,
      0,
      w.config.worldWidth,
      w.config.worldHeight,
      w.instantiateScratch,
    w.glowEffectors,
    );
    const f = w.cells.fields;
    for (let i = 0; i < w.cells.capacity; i++) if (f.organismId[i] === org) f.energy[i] = energy;
  }

  function run(): World {
    const cfg = defaultConfig({
      seed: 5,
      maxCells: 256,
      reproThreshold: 600,
      basalCost: 0,
      photoGain: 0,
      organismDeathFloor: -1,
      mutationParamRate: 0.5,
      mutationWeightRate: 0.5,
      mutationParamSigma: 0.2,
      mutationWeightSigma: 0.2,
      mutationDuplicateGeneRate: 0.2,
    });
    const w = new World(cfg, false);
    spawnAutotroph(w, 300);
    for (let t = 0; t < 20; t++) {
      const f = w.cells.fields;
      for (let i = 0; i < w.cells.capacity; i++)
        if (w.cells.isAlive(i) && f.cellType[i] === CellType.PHOTO) f.energy[i] = 300; // deterministic top-up
      w.tick();
    }
    return w;
  }

  it('produces byte-identical energy/organismId/genomeRef/posX for the same (Config, seed)', () => {
    const a = run();
    const b = run();
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(fa.organismId)).toEqual(Array.from(fb.organismId));
    expect(Array.from(fa.genomeRef)).toEqual(Array.from(fb.genomeRef));
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(a.genomes.size).toBe(b.genomes.size);
    expect(a.cells.aliveCount).toBeGreaterThan(4); // reproduction actually happened
  });
});

describe('reproducibility — M7 mutation>0 with births AND deaths', () => {
  // Organism births/deaths are per-tick snapshots that, in this regime, fire
  // early (food gets consumed, then a declining steady state — no births land on
  // the final tick). Accumulate them across the run so the non-vacuity check
  // sees the whole trajectory, not just tick 1499.
  function runForagers(): { w: World; births: number; deaths: number } {
    const cfg = defaultConfig({
      seed: 11,
      maxCells: 6000,
      worldWidth: 512,
      worldHeight: 512,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
      reproThreshold: 700,
      reproParentFloor: 120,
      organismDeathFloor: 0, // foragers that can't feed starve → atomic death
      mutationWeightRate: 0.5,
      mutationWeightSigma: 0.15,
      mutationParamRate: 0.2,
      mutationParamSigma: 0.1,
    });
    const w = new World(cfg, false);
    w.seedLife(2500);
    for (let k = 0; k < 16; k++) {
      const ref = w.genomes.register(buildForagerGenome(cfg.cellRadius, 100));
      const body = develop(
        buildForagerGenome(cfg.cellRadius, 100),
        cfg.maxCellsPerOrganism,
        cfg.maxRecursionDepth,
      );
      instantiateBody(
        body,
        w.cells,
        w.net,
        w.bonds,
        w.organisms,
        ref,
        cfg.worldWidth * (0.15 + 0.7 * (k / 16)),
        cfg.worldHeight * 0.5,
        0,
        cfg.worldWidth,
        cfg.worldHeight,
        w.instantiateScratch,
      w.glowEffectors,
      );
    }
    let births = 0;
    let deaths = 0;
    for (let t = 0; t < 700; t++) {
      w.tick();
      births += w.lastOrganismBirths;
      deaths += w.lastOrganismDeaths;
    }
    return { w, births, deaths };
  }

  it('produces byte-identical SoA and genome library across two runs (births + deaths)', () => {
    const a = runForagers();
    const b = runForagers();
    const fa = a.w.cells.fields;
    const fb = b.w.cells.fields;
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
    expect(Array.from(fa.organismId)).toEqual(Array.from(fb.organismId));
    expect(Array.from(fa.genomeRef)).toEqual(Array.from(fb.genomeRef));
    expect(serializeGenomeLibrary(a.w.genomes)).toBe(serializeGenomeLibrary(b.w.genomes));
    expect(serializeLineageLog(a.w.lineage)).toBe(serializeLineageLog(b.w.lineage));
    expect(a.w.lineage.size).toBeGreaterThan(0); // non-vacuity: the run actually populated the log
    // The run actually exercised BOTH structural events (else the guard is vacuous),
    // and did so identically across the two runs.
    expect(a.births).toBeGreaterThan(0);
    expect(a.deaths).toBeGreaterThan(0);
    expect(a.births).toBe(b.births);
    expect(a.deaths).toBe(b.deaths);
    expect(a.w.genomes.size).toBeGreaterThan(0);
  }, 30000); // two 700-tick / 6000-cell forager runs exceed the 5s default (first death ~tick 481)
});

describe('reproducibility — crowdDivideCap (density-dependent division)', () => {
  // The default OFF path (cap 65535) is already covered by the suites above (those configs leave
  // crowdDivideCap at its default). These pin the cap-ON code path: the World.fillDensity grid pass
  // + the lifecycle guard must be byte-deterministic AND non-vacuously active.
  function runCapped(seed: number, cap: number): World {
    const w = new World(
      defaultConfig({
        seed,
        maxCells: 6000,
        worldWidth: 512,
        worldHeight: 512,
        crowdDivideCap: cap,
        crowdGridSize: 32,
      }),
      false,
    );
    w.seedLife(800);
    for (let t = 0; t < 400; t++) w.tick();
    return w;
  }

  it('produces byte-identical SoA across two runs with the cap ON', () => {
    const a = runCapped(7, 3);
    const b = runCapped(7, 3);
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
    expect(Array.from(fa.cellType)).toEqual(Array.from(fb.cellType));
    expect(a.cells.aliveCount).toBe(b.cells.aliveCount);
  });

  it('is non-vacuous: the cap suppresses plant growth vs the OFF default', () => {
    const capped = runCapped(7, 3).cells.aliveCount;
    const uncapped = runCapped(7, 65535).cells.aliveCount; // OFF sentinel = the un-capped sim
    expect(uncapped).toBeGreaterThan(capped); // the cap actually limited the field (guard fired)
  });
});
