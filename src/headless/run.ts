import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { spawnSwimmer } from '../core/sim/critter';
import { CellType } from '../core/cells/types';

/** Count organisms that currently hold ≥1 live cell (the multicellular bodies). */
function countLiveOrganisms(w: World): number {
  const cc = w.organisms.cellCount;
  let n = 0;
  for (let org = 1; org < cc.length; org++) if (cc[org]! > 0) n++;
  return n;
}

// M2: seed the breathing 2-trophic regime (default 2048² world) and report the
// economy telemetry so a headless run shows the food web is alive, not collapsed.
const world = new World(defaultConfig({ seed: 1, maxCells: 60_000 }));
world.seedLife(20_000);
// M4: a hand-wired swimmer critter so the neural hot path (THINK/motor/reposition) runs.
spawnSwimmer(world, world.config.worldWidth * 0.5, world.config.worldHeight * 0.5, 0);

// M5: a small bonded DIGESTIVE cluster so the run exercises the bond/transfer/digest-bonus
// kernels and the report shows non-trivial organism + bond counts (the multicellular payoff).
(function spawnCluster(): void {
  const f = world.cells.fields;
  const r = world.config.cellRadius;
  const cx = world.config.worldWidth * 0.5 + 200;
  const cy = world.config.worldHeight * 0.5;
  const org = world.organisms.alloc();
  const ds: number[] = [];
  for (let kk = 0; kk < 4; kk++) {
    const i = world.cells.alloc();
    if (i < 0) return;
    f.posX[i] = cx + (kk % 2) * (2.4 * r);
    f.posY[i] = cy + ((kk / 2) | 0) * (2.4 * r);
    f.radius[i] = r;
    f.mass[i] = 2; // heavier than free cells (mass 1) → resists repulsion jostling, holds together (like the critter)
    f.energy[i] = 5000; // provisioned reserve so the cluster persists like the swimmer
    f.cellType[i] = CellType.DIGESTIVE;
    f.organismId[i] = org;
    ds.push(i);
  }
  const g = (i: number): number => f.generation[i]!;
  const bond = (a: number, b: number): void => {
    const dx = f.posX[a]! - f.posX[b]!;
    const dy = f.posY[a]! - f.posY[b]!;
    world.bonds.addBond(a, g(a), b, g(b), Math.sqrt(dx * dx + dy * dy), 1);
  };
  bond(ds[0]!, ds[1]!);
  bond(ds[1]!, ds[3]!);
  bond(ds[3]!, ds[2]!);
  bond(ds[2]!, ds[0]!);
  world.bonds.rebuildLive(world.cells);
})();

const ticks = 1000;
const start = performance.now();
for (let i = 0; i < ticks; i++) world.tick();
const ms = performance.now() - start;
const m = world.metrics;

console.log(`shared memory: ${world.cells.soa.shared}`);
console.log(
  `population:    ${m.population}  (photo ${m.photo}, digestive ${m.digestive}, motile ${m.motile}, meat ${m.meat})`,
);
console.log(`mean energy:   ${m.meanEnergy.toFixed(1)}`);
console.log(
  `neural:        neurons=${world.net.liveNeuronCount} synapses=${world.net.liveSynapseCount}`,
);
console.log(
  `multicellular: organisms=${countLiveOrganisms(world)} bonds=${world.bonds.liveBondCount}`,
);
console.log(
  `diversity:     ${m.diversity.toFixed(3)}  (phenotypic Simpson; >0 ⇒ 2nd trophic level alive)`,
);
console.log(`last tick b/d: ${world.lastBirths}/${world.lastDeaths}`);
console.log(`ticks:         ${world.tickCount}`);
// rebuildLive scans full capacity each tick; this line surfaces whether that
// O(maxCells) scan dominates in the realised (possibly sparse) population regime.
console.log(
  `elapsed:       ${ms.toFixed(1)} ms (${(ticks / (ms / 1000)).toFixed(0)} ticks/s)` +
    `  [rebuildLive scans ${world.config.maxCells} slots/tick]`,
);
