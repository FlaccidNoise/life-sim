import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { buildForagerGenome, buildPredatorGenome } from '../genome/critter-genome';

// The live demo (main.ts) runs critters far harder than defaultConfig: maxThrust 14 for
// foragers and 14 × carnivoreThrustMult 2 = 28 for predators, with bond rest lengths
// shortened by the off=3*r genome spacing. Higher thrust over a shorter rest length means
// higher transient strain against bondMaxStrain (1.0) — the regime where a body could snap
// its bonds and fragment. The headless ecology run is only a population-level signal; THIS
// is the per-body guard locking the production feel knobs, the way golden-bond locks the
// default mechanics. Economy is zeroed so a body can only fail by fragmenting, not starving.
function liveDemoCfg(over = {}): ReturnType<typeof defaultConfig> {
  return defaultConfig({
    maxCells: 256,
    worldWidth: 2048,
    worldHeight: 2048,
    cellRadius: 4, // main.ts
    maxThrust: 14, // main.ts
    thrustScale: 5, // main.ts
    thrustBias: 3, // main.ts — drives constant cruise even with no food gradient → sustained strain
    turnScale: 0.45, // main.ts
    carnivoreThrustMult: 2.0, // main.ts — predator effective thrust = 28
    basalCost: 0,
    moveCost: 0,
    neuralCost: 0, // isolate mechanics: the body can fail only by fragmenting, never by starving
    ...over,
  });
}

describe('critter cohesion at live-demo production knobs (maxThrust 14, predator 28, off=3r)', () => {
  it('a forager cruising at maxThrust 14 holds its body together (no strain breaks)', () => {
    const w = new World(liveDemoCfg(), false);
    const org = w.spawnOrganism(buildForagerGenome(w.config.cellRadius, 1e6), 1024, 1024, 0);
    expect(org).toBeGreaterThanOrEqual(0);
    w.bonds.rebuildLive(w.cells);
    const bonds0 = w.bonds.liveBondCount;
    expect(bonds0).toBeGreaterThan(0);
    for (let t = 0; t < 2000; t++) w.tick();
    expect(w.bonds.liveBondCount).toBe(bonds0); // every bond survived; the body never fragmented
  });

  it('a predator at effective thrust 28 (×carnivoreThrustMult) holds together', () => {
    const w = new World(liveDemoCfg(), false);
    const org = w.spawnOrganism(buildPredatorGenome(w.config.cellRadius, 1e6, -1.5), 1024, 1024, 0);
    expect(org).toBeGreaterThanOrEqual(0);
    w.bonds.rebuildLive(w.cells);
    const bonds0 = w.bonds.liveBondCount;
    expect(bonds0).toBeGreaterThan(0);
    for (let t = 0; t < 2000; t++) w.tick();
    expect(w.bonds.liveBondCount).toBe(bonds0);
  });
});
