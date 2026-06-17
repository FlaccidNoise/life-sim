import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { CellType } from '../core/cells/types';

/**
 * Headless digestion-clustering payoff probe (§10 R1 selection-gradient tool). Builds a
 * bonded 4-cell DIGESTIVE cluster (with bracing, so each cell has ≥1 digestive neighbour)
 * vs the same number of LONE digestives in an identical dense PHOTO lawn, runs both for
 * `ticks`, and prints the harvested energy + the bonded/lone ratio. Mirrors
 * `trophic-probe.ts`: takes config overrides (so Josh can sweep `digestClusterBonus`/
 * `transferRate` headless) and a seed range, printing a CSV-style row per seed. The
 * harvest is deterministic for a fixed config (no RNG in the hand-built setup), so the
 * seed column just confirms the gradient is robust across the swept overrides.
 *
 * Usage: tsx src/headless/cluster-probe.ts '<json config overrides>' [ticks] [seed] [seedCount]
 *   e.g. tsx src/headless/cluster-probe.ts '{"digestClusterBonus":0.5}' 200 1 3
 */
const overrides = JSON.parse(process.argv[2] ?? '{}') as Partial<Config>;
const ticks = Number(process.argv[3] ?? 200);
const baseSeed = Number(process.argv[4] ?? 1);
const seedCount = Number(process.argv[5] ?? 1);

/** Place 4 DIGESTIVE cells (bonded into a braced cluster if `bonded`) amid a fixed PHOTO lawn. */
function harvest(seed: number, bonded: boolean): number {
  const cfg = defaultConfig({
    seed,
    // The 20×20 PHOTO lawn (400 cells) + 4 digestives needs > 256 slots.
    maxCells: 512,
    worldWidth: 400,
    worldHeight: 400,
    foodGridCols: 8,
    foodGridRows: 8,
    repulsion: 0,
    basalCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    initialMotileFraction: 0,
    transferRate: 0, // isolate the digestion bonus from sharing
    digestClusterBonus: 0.5,
    ...overrides,
  });
  const w = new World(cfg, false);
  const f = w.cells.fields;
  // A dense PHOTO lawn the digestives sit in (effectively infinite, identical prey supply).
  for (let gx = 0; gx < 20; gx++) {
    for (let gy = 0; gy < 20; gy++) {
      const i = w.cells.alloc();
      f.posX[i] = 40 + gx * 16;
      f.posY[i] = 40 + gy * 16;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 1e6;
      f.cellType[i] = CellType.PHOTO;
    }
  }
  const org = bonded ? w.organisms.alloc() : 0;
  const ds: number[] = [];
  for (let kk = 0; kk < 4; kk++) {
    const i = w.cells.alloc();
    f.posX[i] = 180 + (kk % 2) * 14;
    f.posY[i] = 180 + ((kk / 2) | 0) * 14;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.DIGESTIVE;
    f.organismId[i] = org;
    ds.push(i);
  }
  if (bonded) {
    for (let kk = 0; kk + 1 < ds.length; kk++) {
      w.bonds.addBond(
        ds[kk]!,
        f.generation[ds[kk]!]!,
        ds[kk + 1]!,
        f.generation[ds[kk + 1]!]!,
        14,
        1,
      );
    }
    // brace 0-2 and 1-3 so each cell has ≥1 bonded DIGESTIVE neighbour
    w.bonds.addBond(ds[0]!, f.generation[ds[0]!]!, ds[2]!, f.generation[ds[2]!]!, 14, 1);
    w.bonds.addBond(ds[1]!, f.generation[ds[1]!]!, ds[3]!, f.generation[ds[3]!]!, 14, 1);
    w.bonds.rebuildLive(w.cells);
  }
  for (let t = 0; t < ticks; t++) w.tick();
  let total = 0;
  for (const i of ds) total += f.energy[i]!;
  return total;
}

const cfg0 = defaultConfig({ ...overrides });
console.log(
  `# ticks=${ticks} digestClusterBonus=${cfg0.digestClusterBonus} digestRate=${cfg0.digestRate} ` +
    `digestEfficiency=${cfg0.digestEfficiency} transferRate=0 (isolated)`,
);
console.log('seed,bonded,lone,ratio,payoff');
for (let s = 0; s < seedCount; s++) {
  const seed = baseSeed + s;
  const bonded = harvest(seed, true);
  const lone = harvest(seed, false);
  const ratio = lone !== 0 ? bonded / lone : Infinity;
  console.log(
    `${seed},${bonded.toFixed(2)},${lone.toFixed(2)},${ratio.toFixed(4)},${bonded > lone ? 'bonded>lone' : 'NO-GRADIENT'}`,
  );
}
