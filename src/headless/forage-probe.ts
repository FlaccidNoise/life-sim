/**
 * Lever B ablation probe (one-off experiment, not a standing job). The monoculture root cause is a
 * SINGLE food resource → Gause competitive exclusion → one winning strategy. Lever B adds a second food
 * channel + a heritable FORAGE_PREF gene (0 = channel-A specialist … 1 = channel-B specialist) plus a
 * disruptive specialization bonus, so the resource can support a SPREAD of forage strategies instead of
 * one. (Total standing biomass is conserved across channel counts — the single pool is SPLIT, not added
 * — so any effect here is niche differentiation, not extra food.)
 *
 * This probe asks: does the gene actually spread under selection? It runs three regimes to the same tick
 * count across 3 seeds and reports, on the final population, FORAGE_PREF mean / variance / bimodality:
 *   - channels=1            CONTROL: one resource → FORAGE_PREF inert (pinned at center, var≈0). Baseline.
 *   - channels=2 bonus=0    split pool, NO specialization incentive — does the second channel ALONE
 *                           pull preferences apart, or do they drift to a generalist 0.5?
 *   - channels=2 bonus=0.5  the FULL lever: split pool + disruptive bonus rewarding commitment to one
 *                           channel. Expect variance to climb (the gene escapes the var≡0 monoculture).
 *
 * INTERPRETING bimodality: BC > 5/9 ≈ 0.555 is the textbook two-mode threshold, but a *hard* two-peak
 * {0,1} split would read var≈0.25 / BC≈1.0. Observed runs reach only var≈0.02–0.05 with BC straddling
 * the threshold — i.e. a BROAD POLYMORPHIC SPREAD with mild bias toward the extremes, NOT two distinct
 * specialist peaks. The honest win condition for lever B is therefore: the gene moves from a hard
 * monoculture (var≡0 under one channel) to a MAINTAINED polymorphism (var>0) that the disruptive bonus
 * measurably amplifies (var/bimodality higher at bonus=0.5 than bonus=0), while staying alive on every
 * seed — NOT a clean two-niche split. Note the population effect is seed-dependent and comes from the
 * 1.5× conversion windfall for specialists (bonus=0 actually depresses pop vs control — a real cost of
 * splitting a forager's budget across two half-cap channels). Run: pnpm tsx src/headless/forage-probe.ts [ticks]
 */
import { defaultConfig, type Config } from '../core/config';
import { runHeadless } from './harness';
import { ScalarGene } from '../core/genome';

const ticks = Number(process.argv[2] ?? 8000);
const SEEDS = [1, 2, 5];
const REGIMES: { label: string; o: Partial<Config> }[] = [
  { label: 'channels=1 (control)', o: { foodChannels: 1 } },
  { label: 'channels=2 bonus=0', o: { foodChannels: 2, forageSpecBonus: 0 } },
  { label: 'channels=2 bonus=0.5', o: { foodChannels: 2, forageSpecBonus: 0.5 } },
];

console.log(
  `=== lever B forage-niche probe: ${ticks} ticks, seeds ${SEEDS.join('/')}, world 8192² ===`,
);
console.log(
  'prefMean → center | var → spread (0 = monoculture, 0.25 = hard {0,1} split) | bimodality: >0.555 = pulled toward extremes\n',
);
const header =
  'regime'.padEnd(22) +
  'seed'.padStart(6) +
  ['pop', 'births', 'prefMean', 'prefVar', 'bimodal'].map((h) => h.padStart(10)).join('');
console.log(header);
console.log('-'.repeat(header.length));

for (const regime of REGIMES) {
  for (const seed of SEEDS) {
    // Sample only at the end (sampleEvery = ticks) — we want the converged distribution, not the trajectory.
    const r = runHeadless(defaultConfig({ seed, ...regime.o }), ticks, ticks);
    const last = r.series[r.series.length - 1];
    const cells =
      r.finalPopulation === 0 || !last
        ? [`EXTINCT@${r.extinctAtTick}`, '', '', '', '']
        : [
            `${r.finalPopulation}`,
            `${r.totalBirths}`,
            (last.geneMeans[ScalarGene.FORAGE_PREF] ?? 0).toFixed(3),
            last.foragePrefVar.toFixed(4),
            last.foragePrefBimodality.toFixed(3),
          ];
    console.log(
      regime.label.padEnd(22) + `${seed}`.padStart(6) + cells.map((v) => v.padStart(10)).join(''),
    );
  }
  console.log('-'.repeat(header.length));
}
