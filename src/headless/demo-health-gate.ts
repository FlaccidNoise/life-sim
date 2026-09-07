/**
 * DEMO HEALTH GATE — the methodology crosscut (Arc B-gate). The other gates certify the sim is not DEAD
 * (determinism holds, no NaN); none certify it is ALIVE. This one asserts the SHIPPED demo (living-world-
 * config.ts, loaded verbatim so it can never drift from what the browser runs) still produces the ecology
 * the plan promises: a bimodal grazer/hunter split that keeps turning over, not a static founder aquarium
 * or a grazer monoculture. Runs a few seeds headless and exits non-zero if any required seed regresses.
 *
 * Checks, per seed, at TICKS with a WARMUP grace:
 *   - not extinct        : live pop > 0
 *   - turning over       : births in (WARMUP, TICKS] ≥ MIN_POST_WARMUP_BIRTHS (selection still running)
 *   - predator floor     : fraction with DIET>0.5 ≥ PRED_FLOOR (a hunter layer persists, not just grazers)
 *   - above monoculture  : σ(DIET) ≥ SIGMA_FLOOR (the split is real, not collapsed to one niche)
 *
 * Run: npx tsx src/headless/demo-health-gate.ts [ticks] [seeds] [warmup]
 *   seeds "1" | "1,3,7" | "1-3".  ticks default 12000.  warmup default 6000.
 * Exit 0 iff every listed seed passes every check; else 1 with a per-seed FAIL breakdown.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';
import { writeSync } from 'node:fs';

// ── Health thresholds ────────────────────────────────────────────────────────────────────────────────────
// Grounded in the shipped-demo validation (this gate, 12k/warmup6k, seeds 1-3, floor 0.7 + B4 cap): pred%
// 48.5-61.1, σDIET 0.309-0.369, births>warmup 34591-43756, pop 3997-4612. Each floor sits well above the
// BROKEN state (predators ~0%, monoculture σ≤0.19, turnover-stalled ~0 births) and well below the measured
// healthy min, so the gate catches a real ecological regression without failing on ordinary seed variance.
const PRED_FLOOR = 0.1; // a hunter layer persists (DIET>0.5); broken=~0%, shipped=0.48-0.61
const SIGMA_FLOOR = 0.2; // σ(DIET) above the grazer-monoculture band (mate=12 baseline collapsed to 0.07-0.19)
const MIN_POST_WARMUP_BIRTHS = 1000; // real turnover after the bootstrap valley, not a frozen founder pool

const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TICKS = Number(POS[0] ?? 12000);
const WARMUP = Number(POS[2] ?? 6000);

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1, 2, 3];
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

interface SeedResult {
  seed: number;
  pop: number;
  predFrac: number;
  dietSigma: number;
  postWarmupBirths: number;
  fails: string[];
}

function runSeed(seed: number): SeedResult {
  let births = 0;
  let birthsAtWarmup = 0;
  const config = defaultConfig({
    seed,
    ...livingWorldOverrides,
    onBirth: () => {
      births++;
    },
  });
  const world = new World(config);
  const s = world.store;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (t === WARMUP) birthsAtWarmup = births;
  }
  const { liveIndices, liveCount, scalarGenes } = s;
  const diet: number[] = [];
  let pred = 0;
  for (let n = 0; n < liveCount; n++) {
    const d = scalarGenes[liveIndices[n]! * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    diet.push(d);
    if (d > 0.5) pred++;
  }
  const predFrac = liveCount ? pred / liveCount : 0;
  const dietSigma = sd(diet);
  const postWarmupBirths = births - birthsAtWarmup;

  const fails: string[] = [];
  if (liveCount === 0) fails.push('EXTINCT');
  if (postWarmupBirths < MIN_POST_WARMUP_BIRTHS)
    fails.push(`STALLED (${postWarmupBirths} births after t${WARMUP} < ${MIN_POST_WARMUP_BIRTHS})`);
  if (predFrac < PRED_FLOOR)
    fails.push(`NO PREDATORS (${(100 * predFrac).toFixed(1)}% < ${100 * PRED_FLOOR}%)`);
  if (dietSigma < SIGMA_FLOOR)
    fails.push(`MONOCULTURE (σDIET ${dietSigma.toFixed(3)} < ${SIGMA_FLOOR})`);

  return { seed, pop: liveCount, predFrac, dietSigma, postWarmupBirths, fails };
}

/** Write one line to stdout and flush it NOW. A demo-scale seed takes minutes to hours, and this run gets
 *  killed often enough (memory pressure) that a buffered report is a report you never see: a killed run used
 *  to leave nothing but the header. writeSync bypasses the async pipe buffer, so every completed seed is on
 *  disk before the next one starts. */
function emit(line: string): void {
  writeSync(1, line + '\n');
}

emit(`demo-health-gate · ${TICKS} ticks · warmup ${WARMUP} · seeds ${SEEDS.join(',')}`);
emit('seed    pop    pred%   σDIET   births>warm  verdict');
const results: SeedResult[] = [];
for (const seed of SEEDS) {
  const r = runSeed(seed);
  results.push(r);
  const verdict = r.fails.length === 0 ? 'PASS' : 'FAIL: ' + r.fails.join('; ');
  emit(
    `${String(r.seed).padEnd(8)}${String(r.pop).padEnd(7)}${(100 * r.predFrac).toFixed(1).padEnd(8)}` +
      `${r.dietSigma.toFixed(3).padEnd(8)}${String(r.postWarmupBirths).padEnd(13)}${verdict}`,
  );
}
const failed = results.filter((r) => r.fails.length > 0);
if (failed.length > 0) {
  console.error(`\n✗ demo health gate FAILED on ${failed.length}/${results.length} seed(s).`);
  process.exit(1);
}
console.log(`\n✓ demo health gate PASSED on all ${results.length} seeds.`);
