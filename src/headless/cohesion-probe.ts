import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { spawnSwimmer, type Critter } from '../core/sim/critter';
import { wrapDelta } from '../core/math/vec2';

/**
 * Cohesion diagnostic: spawn N swimmer critters into the seeded ecosystem and track,
 * over time, whether each stays ONE organism (holds together), how many of its bonds
 * survive, and the PEAK spoke strain it experiences (so we know how high bondMaxStrain
 * must be to stop severing). Config overrides come from argv[2] (JSON), so we can sweep
 * bondStiffness / bondMaxStrain / damping etc. without recompiling.
 *
 *   pnpm tsx src/headless/cohesion-probe.ts '{"bondMaxStrain":3,"bondStiffness":2.2}'
 */
const overrides = (argv: string[]): Partial<Config> => {
  const raw = argv[2];
  if (!raw) return {};
  return JSON.parse(raw) as Partial<Config>;
};

const cfg = defaultConfig({ seed: 1, maxCells: 60_000, ...overrides(process.argv) });
const world = new World(cfg);
world.seedLife(20_000);

// Spawn 6 critters spread across the world so we sample several local crowding regimes.
const W = cfg.worldWidth;
const H = cfg.worldHeight;
const critters: Critter[] = [];
for (let k = 0; k < 6; k++) {
  const x = W * (0.2 + 0.12 * (k % 3));
  const y = H * (0.3 + 0.3 * ((k / 3) | 0));
  critters.push(spawnSwimmer(world, x, y, (k * Math.PI) / 3));
}

const cells = (c: Critter): number[] => [
  c.mover,
  c.sensorFwd,
  c.sensorLat,
  c.clockA,
  c.clockB,
  c.turn,
  c.thrust,
];

/** Distinct organism ids among a critter's 7 cells (1 = intact, >1 = fragmented). */
function fragments(c: Critter): number {
  const f = world.cells.fields;
  const ids = new Set<number>();
  for (const i of cells(c)) ids.add(f.organismId[i]!);
  return ids.size;
}

/** Surviving bonds whose BOTH endpoints are this critter's cells. */
function intactBonds(c: Critter): { count: number; maxStrain: number } {
  const f = world.cells.fields;
  const b = world.bonds;
  const own = new Set(cells(c));
  let count = 0;
  let maxStrain = 0;
  for (let k = 0; k < b.liveBondCount; k++) {
    const s = b.liveBonds[k]!;
    const a = b.cellA[s]!;
    const bb = b.cellB[s]!;
    if (!own.has(a) || !own.has(bb)) continue;
    count++;
    const dx = wrapDelta(f.posX[a]! - f.posX[bb]!, W);
    const dy = wrapDelta(f.posY[a]! - f.posY[bb]!, H);
    const d = Math.sqrt(dx * dx + dy * dy);
    const rl = b.restLen[s]!;
    const strain = rl > 0 ? (d - rl) / rl : 0;
    if (strain > maxStrain) maxStrain = strain;
  }
  return { count, maxStrain };
}

// Track the peak strain any critter bond ever reaches (drives the bondMaxStrain choice).
let globalPeakStrain = 0;
const report = (tick: number): void => {
  let intactCritters = 0;
  let totalBonds = 0;
  let tickPeak = 0;
  for (const c of critters) {
    if (fragments(c) === 1) intactCritters++;
    const ib = intactBonds(c);
    totalBonds += ib.count;
    if (ib.maxStrain > tickPeak) tickPeak = ib.maxStrain;
  }
  if (tickPeak > globalPeakStrain) globalPeakStrain = tickPeak;
  console.log(
    `t=${String(tick).padStart(4)}  intact=${intactCritters}/6  bonds=${String(totalBonds).padStart(2)}/90` +
      `  tickPeakStrain=${tickPeak.toFixed(2)}  everPeak=${globalPeakStrain.toFixed(2)}`,
  );
};

const f0 = world.cells.fields;
const startPos = critters.map((c) => ({ x: f0.posX[c.mover]!, y: f0.posY[c.mover]! }));

const TICKS = 1500;
report(0);
for (let t = 1; t <= TICKS; t++) {
  world.tick();
  // Sample every tick early (catch the spawn-transient strain spike that severs bonds),
  // then coarsely. globalPeakStrain accumulates across ALL sampled ticks.
  if (t <= 40 || t % 150 === 0) report(t);
}

// Locomotion: did the bodies move (toroidal distance travelled by each MOVER)?
let moved = 0;
for (let k = 0; k < critters.length; k++) {
  const c = critters[k]!;
  const dx = wrapDelta(f0.posX[c.mover]! - startPos[k]!.x, W);
  const dy = wrapDelta(f0.posY[c.mover]! - startPos[k]!.y, H);
  moved += Math.sqrt(dx * dx + dy * dy);
}

const intactFinal = critters.filter((c) => fragments(c) === 1).length;
console.log('---');
console.log(
  `CONFIG bondStiffness=${cfg.bondStiffness} bondMaxStrain=${cfg.bondMaxStrain} damping=${cfg.damping} degreeCap=${cfg.bondDegreeCap}`,
);
console.log(
  `RESULT intact=${intactFinal}/6  everPeakStrain=${globalPeakStrain.toFixed(2)}  meanMoverTravel=${(moved / 6).toFixed(0)}u`,
);
