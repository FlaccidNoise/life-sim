import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildHandicappedForagerGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';

// M7 adaptation proof. Seed a HANDICAPPED forager (steering weights 0.2 vs the fit 1.5).
// Experimental run: weight mutation ON → mutants that steer better out-forage, out-reproduce,
// and drag the population-mean weight UP. Control: weight mutation OFF → clones stay at 0.2.
// PASS = experimental mean rises materially above control AND the population survives in both.
const HANDICAP = 0.2;
const TICKS = 12_000;
const SAMPLE = 1000;

function baseConfig(over: Partial<Config>): Config {
  return defaultConfig({
    seed: 7,
    maxCells: 40_000,
    worldWidth: 1024,
    worldHeight: 1024,
    initialPhotoFraction: 1,
    initialMotileFraction: 0,
    reproThreshold: 700,
    reproParentFloor: 120,
    organismDeathFloor: 0,
    ...over,
  });
}

function seedForagers(w: World, n: number): void {
  const cfg = w.config;
  for (let k = 0; k < n; k++) {
    const ref = w.genomes.register(buildHandicappedForagerGenome(cfg.cellRadius, 100, HANDICAP));
    const body = develop(
      buildHandicappedForagerGenome(cfg.cellRadius, 100, HANDICAP),
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
      cfg.worldWidth * (0.2 + 0.6 * (k / n)),
      cfg.worldHeight * 0.5,
      0,
      cfg.worldWidth,
      cfg.worldHeight,
      w.instantiateScratch,
    );
  }
}

function meanFwdThrustWeight(w: World): { mean: number; orgs: number; maxGen: number } {
  const o = w.organisms;
  let sum = 0;
  let n = 0;
  let maxGen = 0;
  for (let org = 1; org < o.maxOrganisms; org++) {
    if (!o.isAlive(org) || o.cellCount[org]! === 0) continue;
    const ref = o.genomeRef[org]!;
    if (ref < 0) continue;
    const g = w.genomes.get(ref);
    if (!g) continue;
    const c = g.connectionRules.find((r) => r.preGene === 1 && r.postGene === 4);
    if (!c) continue;
    sum += c.weight;
    n++;
    if (g.generation > maxGen) maxGen = g.generation;
  }
  return { mean: n > 0 ? sum / n : 0, orgs: n, maxGen };
}

function run(label: string, cfg: Config): { mean: number; orgs: number; maxGen: number } {
  const w = new World(cfg, false);
  w.seedLife(8000);
  seedForagers(w, 20);
  console.log(`\n[${label}] tick   foragers   meanWeight   maxGen   plants`);
  let last = meanFwdThrustWeight(w);
  for (let t = 1; t <= TICKS; t++) {
    w.tick();
    if (t % SAMPLE === 0) {
      last = meanFwdThrustWeight(w);
      console.log(
        `        ${String(t).padStart(5)}   ${String(last.orgs).padStart(8)}   ${last.mean.toFixed(3).padStart(10)}   ${String(last.maxGen).padStart(6)}   ${String(w.metrics.photo).padStart(6)}`,
      );
    }
  }
  return last;
}

const exp = run(
  'EXPERIMENT mutation ON',
  baseConfig({ mutationWeightRate: 0.5, mutationWeightSigma: 0.15 }),
);
const ctl = run(
  'CONTROL  mutation OFF',
  baseConfig({ mutationWeightRate: 0, mutationWeightSigma: 0 }),
);

const delta = exp.mean - ctl.mean;
console.log(
  `\nfinal: experiment meanWeight=${exp.mean.toFixed(3)} (orgs ${exp.orgs}, gen ${exp.maxGen})  ` +
    `control meanWeight=${ctl.mean.toFixed(3)} (orgs ${ctl.orgs})  Δ=${delta.toFixed(3)}`,
);
const survived = exp.orgs > 0 && ctl.orgs > 0;
console.log(
  survived && delta > 0.4
    ? '→ ADAPTATION: economic selection raised the steering weight well above the no-mutation control.'
    : survived
      ? `→ WEAK/NO adaptation (Δ=${delta.toFixed(3)} ≤ 0.4). Tune economy pressure (higher basalCost / lower seedLife) — NOT a fitness function — and re-run. Document the result.`
      : '→ EXTINCTION confound: a population died out. Lower mutation σ / soften the economy and re-run.',
);
