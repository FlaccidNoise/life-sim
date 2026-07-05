/**
 * Parallel driver for the predator boom-bust A/B (predator-damping.ts). Spawns ONE child process per
 * (variant, seed) so a full sweep saturates all cores, parses each child's RESULT_JSON line, and prints
 * per-variant means across seeds plus a winner verdict.
 *
 * Winner = lowest mean peak predator% WITH predators surviving on ALL seeds (final predator% > 0) AND
 * mean final diet σ ≥ 0.2 (diversity is welded to predator persistence — a predator-death state is a
 * monoculture). If nothing qualifies, it says so: predationGain alone can't damp the boom.
 *
 * Run: npx tsx src/headless/predator-damping-sweep.ts [ticks] [seeds] [variants] [--jobs N]
 *   ticks    default 50000
 *   seeds    "1-5" · "1,2,3"        (default "1-5")
 *   variants comma list             (default: baseline,gain-2,gain-2.25,gain-2.5,gain-2.25-h4)
 */
import { spawn } from 'node:child_process';

const ARGS = process.argv.slice(2);
const flag = (name: string, dflt: number): number => {
  const i = ARGS.indexOf(name);
  return i >= 0 ? Number(ARGS[i + 1]) : dflt;
};
const POS = ARGS.filter((a, i) => !a.startsWith('--') && ARGS[i - 1] !== '--jobs');

const TICKS = Number(POS[0] ?? 50000);
const JOBS = flag('--jobs', 12);

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1, 2, 3, 4, 5];
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return s.split(',').map(Number);
}
const SEEDS = parseSeeds(POS[1]);
const VARIANTS = (POS[2] ?? 'baseline,gain-2,gain-2.25,gain-2.5,gain-2.25-h4').split(',');

interface Rec {
  variant: string;
  seed: number;
  extinct: boolean;
  peakPredFrac: number;
  peakTick: number;
  troughPredFrac: number;
  finalPredFrac: number;
  finalPop: number;
  finalDietSigma: number;
  backHalfSigmaOfPredFrac: number;
}

/**
 * Spawn one child = one (variant, seed) run; resolve with its parsed RESULT_JSON record, or null on
 * failure (logged). A failure must NOT reject: a rejected promise would abort Promise.all, discard every
 * sibling's already-completed record, and orphan the in-flight children — losing a multi-hour sweep to
 * one flaky run. Each child is independent, so a lost run is a lost cell, not a lost sweep.
 */
function runChild(variant: string, seed: number): Promise<Rec | null> {
  return new Promise((resolve) => {
    const fail = (msg: string): void => {
      console.error(`  ✗ [${variant} seed ${seed}] FAILED: ${msg}`);
      resolve(null);
    };
    const child = spawn(
      'npx',
      ['tsx', 'src/headless/predator-damping.ts', String(TICKS), String(seed), variant],
      { cwd: process.cwd() },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => fail(e.message));
    child.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT_JSON '));
      if (!line) {
        fail(`no RESULT_JSON (exit ${code})\n${err.slice(-400) || out.slice(-400)}`);
        return;
      }
      resolve(JSON.parse(line.slice('RESULT_JSON '.length)) as Rec);
    });
  });
}

/** Fixed-size worker pool over the (variant, seed) grid. */
async function runPool(jobs: Array<[string, number]>, size: number): Promise<Rec[]> {
  const out: Rec[] = [];
  let next = 0;
  let done = 0;
  const total = jobs.length;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++;
      const [v, s] = jobs[i]!;
      const rec = await runChild(v, s);
      done++;
      if (!rec) continue; // failure already logged by runChild; keep the pool going
      out.push(rec);
      console.log(
        `  [${done}/${total}] ${v} seed ${s}: peak ${(100 * rec.peakPredFrac).toFixed(0)}% → ` +
          `trough ${(100 * rec.troughPredFrac).toFixed(0)}% → final ${(100 * rec.finalPredFrac).toFixed(0)}% ` +
          `(dietσ ${rec.finalDietSigma.toFixed(2)})`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, () => worker()));
  return out;
}

if (!Number.isFinite(JOBS) || JOBS < 1) throw new Error(`--jobs must be >= 1, got ${JOBS}`);
if (!Number.isFinite(TICKS) || TICKS < 1) throw new Error(`ticks must be >= 1, got ${TICKS}`);
if (SEEDS.some((s) => !Number.isFinite(s))) throw new Error(`bad seeds: [${SEEDS.join(',')}]`);

const grid: Array<[string, number]> = [];
for (const v of VARIANTS) for (const s of SEEDS) grid.push([v, s]);
if (grid.length === 0) throw new Error('no (variant, seed) jobs — check seed/variant args');

console.log(
  `\n=== predationGain sweep · ${TICKS} ticks · seeds [${SEEDS.join(',')}] · ` +
    `${VARIANTS.length} variants · ${grid.length} runs · ${JOBS}-way parallel ===`,
);

const t0 = process.hrtime.bigint();
const recs = await runPool(grid, JOBS);
const wallSec = Number(process.hrtime.bigint() - t0) / 1e9;

const failed = grid.length - recs.length;
if (failed > 0)
  console.warn(
    `\n⚠ ${failed}/${grid.length} runs FAILED — means below are over surviving runs only.`,
  );
if (recs.length === 0) throw new Error('all runs failed — nothing to aggregate (see errors above)');

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

interface Agg {
  variant: string;
  meanPeak: number;
  meanTrough: number;
  meanFinal: number;
  meanDietSigma: number;
  predExtinctCount: number; // seeds where predators reached 0 by the end (may be a diet monoculture)
  collapseCount: number; // seeds where the WHOLE population hit 0 at some point (total collapse)
  n: number;
  finals: string; // per-seed final predator% (survival spread)
}
const aggs: Agg[] = VARIANTS.map((v) => {
  const rs = recs.filter((r) => r.variant === v).sort((a, b) => a.seed - b.seed);
  return {
    variant: v,
    meanPeak: mean(rs.map((r) => r.peakPredFrac)),
    meanTrough: mean(rs.map((r) => r.troughPredFrac)),
    meanFinal: mean(rs.map((r) => r.finalPredFrac)),
    meanDietSigma: mean(rs.map((r) => r.finalDietSigma)),
    predExtinctCount: rs.filter((r) => r.finalPredFrac === 0).length,
    collapseCount: rs.filter((r) => r.extinct).length,
    n: rs.length,
    finals: rs.map((r) => pct(r.finalPredFrac)).join('/'),
  };
});

console.log(`\n=== SUMMARY (mean across ${SEEDS.length} seeds, ${wallSec.toFixed(0)}s wall) ===`);
console.log('variant        peak%  trough%  final%  dietσ  predExtinct  collapse  per-seed final%');
for (const a of aggs) {
  console.log(
    `${a.variant.padEnd(14)} ${pct(a.meanPeak).padStart(4)}  ${pct(a.meanTrough).padStart(6)}  ` +
      `${pct(a.meanFinal).padStart(5)}  ${a.meanDietSigma.toFixed(2).padStart(5)}  ` +
      `${`${a.predExtinctCount}/${a.n}`.padStart(10)}  ${`${a.collapseCount}/${a.n}`.padStart(7)}  ${a.finals}`,
  );
}

// Winner: predators survive on ALL seeds AND mean diet σ ≥ 0.2, then lowest peak.
const robust = aggs
  .filter((a) => a.predExtinctCount === 0 && a.meanDietSigma >= 0.2)
  .sort((x, y) => x.meanPeak - y.meanPeak);
console.log('\n=== VERDICT ===');
if (robust.length === 0) {
  console.log(
    'NO ROBUST WINNER: no variant kept predators alive on all seeds with mean diet σ ≥ 0.2.\n' +
      'predationGain alone does not convert the boom-bust into a stable predator minority — the\n' +
      'boom-bust is structural (predation is the diversity engine; a stable minority needs stronger\n' +
      'negative frequency-dependence, not just a payoff cut).',
  );
} else {
  const w = robust[0]!;
  console.log(
    `WINNER: ${w.variant} — lowest peak (${pct(w.meanPeak)}) among variants with predators surviving ` +
      `all ${w.n} seeds and mean diet σ ${w.meanDietSigma.toFixed(2)} ≥ 0.2.`,
  );
}
