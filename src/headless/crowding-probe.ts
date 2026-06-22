/**
 * Lever D ablation probe (one-off experiment, not a standing job). Lever D drains energy per local
 * neighbor above crowdThreshold (density-dependent mortality), so the LOCALLY-DOMINANT clump gets
 * knocked back via the existing energy<=0 cull. The hypothesis: this turns a flat damped equilibrium
 * into a BOOM-BUST oscillation (a clump overshoots → crowding thins it → it regrows), WITHOUT killing
 * the sparse predator side (whose nearest-neighbour distance ≫ crowdRadius → it sits under the free
 * band and pays nothing). Note crowding is a NEGATIVE-feedback brake on local density, so the naive
 * expectation could equally be the OPPOSITE — a SMOOTHER, lower-amplitude population — which is exactly
 * what this probe is here to settle empirically rather than assert.
 *
 * Read-only: it never mutates the sim; it runs regimes to the same tick count across 3 seeds and reports,
 * over the BACK HALF of the run (post-transient), for the whole population:
 *   - pop      final live population (or EXTINCT@tick)
 *   - popMean  mean population over the back half
 *   - popCV    stddev/mean of population over the back half — the BOOM-BUST signal. Higher = more
 *              oscillation. The win condition for lever D is popCV(ON) > popCV(OFF control).
 *   - predMean mean predator count (diet ≥ 0.5) over the back half — the survival check. The free band
 *              must spare the sparse hunters: predMean(ON) should stay > 0 (ideally ≈ the OFF control).
 *
 * Regimes: an OFF control, then a crowdRADIUS sweep at a fixed strength. crowdRadius is the lever that
 * decides whether the drain fires at all: the default 12 (= 2·cellRadius) coincides with the REPULSION
 * cutoff, which holds creatures at ~12u spacing, so neighbors sit at/just past the crowd radius and are
 * never counted (the first run of this probe was byte-identical to OFF for exactly this reason). A crowd
 * radius spanning 2–4 repulsion shells (24/36/48) is needed before a creature has neighbors inside it. If
 * even the wide radii stay byte-identical to OFF, local density at 8192² is genuinely too low for any
 * density-dependent mechanic to engage — the SAME sparse-scale wall predation hit (encounter=0, NND≫reach)
 * and lever C hit (no local-K coupling).
 *
 * FINDING (8000t / seeds 1·2·5, the table this prints) — lever D FAILS its design goal:
 *   - crowdRadius 12 (= repulsion cutoff) is byte-identical to OFF: repulsion holds creatures at ~12u, so
 *     neighbors sit just OUTSIDE the radius and are never counted. The lever only engages at rad ≥ 24.
 *   - Where it engages, popCV shows NO boom-bust — it stays at noise level (~0.02–0.06) and its
 *     DIRECTION is inconsistent across seeds: it DROPS on seeds 1·2 (s1 0.057→0.021, s2 0.059→0.023 at
 *     rad24) but RISES trivially on seed 5 (0.021→0.034 at rad24, 0.041 at rad48). No setting produces a
 *     controllable oscillation. Density-dependent mortality acts as a NEGATIVE-FEEDBACK BRAKE that damps
 *     where it dominates; boom-bust cycles need delayed / overcompensating feedback, which a per-tick
 *     proportional drain lacks. The boom-bust intuition was simply wrong.
 *   - It destabilises the trophic balance ERRATICALLY: predators crash on seed 1 (228→3 at rad24, 228→2
 *     at rad36) while the SAME setting RAISES predators on seed 2 — not the "free band spares the sparse
 *     hunters" story; a chaotic perturbation. The only predator-safe setting (rad48/thr12) barely fires.
 *   CONCLUSION: the mechanic is correct (economy.test.ts) and reachable, but produces damping + erratic
 *   predator collapse, NOT diversity. Shipped OFF by default; not promoted. Verdict lives in life-sim-cu0o.
 *
 * Run: pnpm tsx src/headless/crowding-probe.ts [ticks]
 */
import { defaultConfig, type Config } from '../core/config';
import { runHeadless, type SamplePoint } from './harness';

const ticks = Number(process.argv[2] ?? 8000);
const SAMPLE_EVERY = 100;
const SEEDS = [1, 2, 5];
const REGIMES: { label: string; o: Partial<Config> }[] = [
  { label: 'OFF (control)', o: { crowdingMortality: 0 } },
  { label: 'rad=24 thr=4', o: { crowdingMortality: 0.3, crowdRadius: 24, crowdThreshold: 4 } },
  { label: 'rad=36 thr=8', o: { crowdingMortality: 0.3, crowdRadius: 36, crowdThreshold: 8 } },
  { label: 'rad=48 thr=12', o: { crowdingMortality: 0.3, crowdRadius: 48, crowdThreshold: 12 } },
];

/** Mean + coefficient of variation (stddev/mean) of a sample; cv 0 when the mean is 0 (extinct/flat). */
function meanCV(xs: number[]): { mean: number; cv: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, cv: 0 };
  let mean = 0;
  for (const v of xs) mean += v;
  mean /= n;
  if (mean === 0) return { mean: 0, cv: 0 };
  let v = 0;
  for (const x of xs) {
    const d = x - mean;
    v += d * d;
  }
  return { mean, cv: Math.sqrt(v / n) / mean };
}

/** Back half of the sample series (drops the start-up transient before measuring oscillation). */
function backHalf(series: SamplePoint[]): SamplePoint[] {
  return series.slice(Math.floor(series.length / 2));
}

console.log(
  `=== lever D crowding probe: ${ticks} ticks, seeds ${SEEDS.join('/')}, world 8192² ===`,
);
console.log(
  'popCV = stddev/mean of population over the back half (the boom-bust signal; higher = more oscillation).',
);
console.log(
  'TESTING: popCV(ON) > popCV(OFF) AND predMean(ON) > 0. (Both fail — see the FINDING in the file header.)\n',
);
const header =
  'regime'.padEnd(18) +
  'seed'.padStart(6) +
  ['pop', 'popMean', 'popCV', 'predMean'].map((h) => h.padStart(11)).join('');
console.log(header);
console.log('-'.repeat(header.length));

for (const regime of REGIMES) {
  for (const seed of SEEDS) {
    const r = runHeadless(defaultConfig({ seed, ...regime.o }), ticks, SAMPLE_EVERY);
    const bh = backHalf(r.series);
    const cells =
      r.finalPopulation === 0
        ? [`EXTINCT@${r.extinctAtTick}`, '', '', '']
        : (() => {
            const pop = meanCV(bh.map((s) => s.population));
            const pred = meanCV(bh.map((s) => s.predators));
            return [
              `${r.finalPopulation}`,
              pop.mean.toFixed(0),
              pop.cv.toFixed(3),
              pred.mean.toFixed(1),
            ];
          })();
    console.log(
      regime.label.padEnd(18) + `${seed}`.padStart(6) + cells.map((v) => v.padStart(11)).join(''),
    );
  }
  console.log('-'.repeat(header.length));
}
