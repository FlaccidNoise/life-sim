/**
 * Evolution-aliveness probe — the metrics long-run.ts doesn't report: generational TURNOVER depth and
 * realized DIVERSITY, which are what tell you whether this is a live evolution playground or a static
 * aquarium of long-lived founders.
 *
 * Runs the EXACT live-demo config (living-world-config.ts) and, at each sample, reports:
 *   - founder%       : share of the standing pop that are original gen-0 founders (age == tick)
 *   - genμ / genMax  : mean / max LINEAGE generation of the standing pop (tracked via the onBirth hook,
 *                      gen[child] = gen[mom] + 1) — the true "how deep has the gene pool turned over" number
 *   - diet histogram : 5 bins over [0,1] (grazer … hunter) + a bimodality flag
 *   - trait spread   : σ of diet / forage / size / vision across the standing pop (realized diversity)
 *
 * Run: npx tsx src/headless/evolve-probe.ts [ticks] [seeds] [stride]
 *   seeds "1" | "1,3,7" | "1-4".  ticks default 20000.  stride default 5000.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';

const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const TICKS = Number(POS[0] ?? 20000);
const STRIDE = Number(POS[2] ?? 5000);
// Optional lever overrides for experiments, e.g. --mate=36 --initPop=2000. Applied on top of the demo.
const OVERRIDES: Record<string, number> = {};
for (const f of FLAGS) {
  const m = /^--(\w+)=(-?\d+(?:\.\d+)?)$/.exec(f);
  if (m) {
    const key = {
      mate: 'mateContactRange',
      initPop: 'initialPopulation',
      compat: 'mateCompatThreshold',
    }[m[1]!];
    if (key) OVERRIDES[key] = Number(m[2]);
  }
}

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1];
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return s.split(',').map(Number);
}
const SEEDS = parseSeeds(POS[1]);

function sd(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function runSeed(seed: number): void {
  // Track lineage generation per slot via the read-only onBirth hook (determinism-safe — pure observation).
  const cap = 32768;
  const gen = new Int32Array(cap); // slot -> lineage generation; founders stay 0, recycled slots overwritten
  const config = defaultConfig({
    seed,
    ...livingWorldOverrides,
    ...OVERRIDES,
    onBirth: (mom: number, _momGen: number, child: number) => {
      gen[child] = gen[mom]! + 1; // child is one generation deeper than its mother
    },
  });
  const world = new World(config);
  const s = world.store;

  const ov = Object.keys(OVERRIDES).length ? ` · ${JSON.stringify(OVERRIDES)}` : '';
  console.log(`\n=== seed ${seed} · ${TICKS} ticks · demo config${ov} ===`);
  console.log(
    'tick     pop    found%  genμ  genMax | diet[g..h histo]        dietσ forageσ sizeσ  visμ  |bimodal',
  );

  const geneCol = (g: number): number[] => {
    const { liveIndices, liveCount, scalarGenes } = s;
    const stride = scalarGenes.length / s.capacity;
    const out: number[] = [];
    for (let n = 0; n < liveCount; n++) out.push(scalarGenes[liveIndices[n]! * stride + g]!);
    return out;
  };

  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (t % STRIDE === 0 || t === TICKS) {
      const { liveIndices, liveCount } = s;
      let founders = 0;
      const gens: number[] = [];
      for (let n = 0; n < liveCount; n++) {
        const i = liveIndices[n]!;
        if (s.age[i]! >= t) founders++;
        gens.push(gen[i]!);
      }
      const diet = geneCol(ScalarGene.DIET);
      const bins = [0, 0, 0, 0, 0];
      for (const d of diet) bins[Math.min(4, Math.floor(d * 5))]!++;
      const histo = bins.map((b) => Math.round((100 * b) / Math.max(1, diet.length)));
      // crude bimodality: mass in the top diet bins (hunters) AND the bottom (grazers), thin middle
      const bimodal = histo[0]! > 15 && histo[3]! + histo[4]! > 8 && histo[2]! < histo[0]! * 0.6;
      const foundPct = ((100 * founders) / Math.max(1, liveCount)).toFixed(0);
      const line =
        `${String(t).padEnd(8)}${String(liveCount).padEnd(7)}${foundPct.padEnd(7)}` +
        `${mean(gens).toFixed(1).padEnd(6)}${String(Math.max(0, ...gens)).padEnd(8)}| ` +
        `${histo.map((h) => String(h).padStart(3)).join(' ')}   ` +
        `${sd(diet).toFixed(2)}  ${sd(geneCol(ScalarGene.FORAGE_PREF)).toFixed(2)}    ` +
        `${sd(geneCol(ScalarGene.SIZE)).toFixed(1).padEnd(5)}  ${mean(geneCol(ScalarGene.VISION_RANGE)).toFixed(0).padEnd(5)} |${bimodal ? ' YES' : ' no'}`;
      console.log(line);
    }
  }
}

for (const seed of SEEDS) runSeed(seed);
