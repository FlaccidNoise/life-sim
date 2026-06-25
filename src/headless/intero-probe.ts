/**
 * A1a measurement probe (own-SIZE / own-DIET interoceptive inputs). Read-only. Runs the demo config with
 * bodySense ON vs OFF from the same seed and reports, over the live population at the end:
 *   - pop (liveness)
 *   - the SIZE→motor relationship: bin creatures into SIZE terciles, report mean |turn| + mean forward
 *     thrust per bin. A bodySense-driven body-aware policy should show a DIFFERENT size→motor slope ON vs
 *     OFF (small bodies steering/fleeing differently from large ones). If ON ≈ OFF, the input is wired + live
 *     (the ablation test proves the forward pass runs) but evolution has NOT recruited it yet — REPORT THAT
 *     honestly (the senses-shipped-unused / E2-hungerSense risk), do not claim a behavioral win.
 * Run: npx tsx src/headless/intero-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

interface Bin { n: number; turnAbs: number; fwd: number; }

function measure(bodySense: boolean): { pop: number; bins: Bin[]; world: World } {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), bodySense });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes, heading, forceX, forceY } = s;
  // SIZE terciles over the live population.
  const sizes: number[] = [];
  for (let k = 0; k < liveCount; k++)
    sizes.push(scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.SIZE]!);
  sizes.sort((a, b) => a - b);
  const q1 = sizes[Math.floor(liveCount / 3)] ?? 0;
  const q2 = sizes[Math.floor((2 * liveCount) / 3)] ?? 0;
  const bins: Bin[] = [
    { n: 0, turnAbs: 0, fwd: 0 },
    { n: 0, turnAbs: 0, fwd: 0 },
    { n: 0, turnAbs: 0, fwd: 0 },
  ];
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    const bin = size <= q1 ? 0 : size <= q2 ? 1 : 2;
    const dx = Math.cos(heading[i]!);
    const dy = Math.sin(heading[i]!);
    const fwd = forceX[i]! * dx + forceY[i]! * dy; // forward thrust component
    bins[bin]!.n++;
    bins[bin]!.fwd += fwd;
    // turn magnitude proxy: |force lateral| (off-heading push) — a fleeing/casting body turns more.
    bins[bin]!.turnAbs += Math.abs(-forceX[i]! * dy + forceY[i]! * dx);
  }
  return { pop: liveCount, bins, world };
}

for (const bodySense of [false, true]) {
  const { pop, bins, world } = measure(bodySense);
  process.stdout.write(`bodySense ${bodySense ? 'ON ' : 'OFF'} — pop ${pop}\n`);
  bins.forEach((b, idx) => {
    const lbl = ['small', 'mid  ', 'large'][idx];
    const turn = b.n ? (b.turnAbs / b.n).toFixed(3) : 'n/a';
    const fwd = b.n ? (b.fwd / b.n).toFixed(3) : 'n/a';
    process.stdout.write(`   ${lbl} (n=${b.n}): mean|lat-force| ${turn}  mean fwd-thrust ${fwd}\n`);
  });
  // A1b density-wall readout: over the live population, how much crowding actually registers at demo scale.
  // senseCrowding is gated on bodySense, so this is 0 across the board when OFF (sanity), and the real
  // measurement when ON — does any creature have a neighbor inside crowdSenseRange at 8192²?
  if (bodySense) {
    const s = world.store;
    let sum = 0,
      max = 0,
      nonzero = 0;
    for (let k = 0; k < s.liveCount; k++) {
      const c = s.crowding[s.liveIndices[k]!]!;
      sum += c;
      if (c > max) max = c;
      if (c > 0) nonzero++;
    }
    process.stdout.write(
      `   crowding @range=${world.config.crowdSenseRange}: mean ${(sum / Math.max(1, s.liveCount)).toFixed(2)} ` +
        `max ${max} nonzero ${((100 * nonzero) / Math.max(1, s.liveCount)).toFixed(1)}% of ${s.liveCount}\n`,
    );
    // A1c fertility-under-foot readout: biomass at the body (summed over active channels) and the actual
    // normalized brain input min(fertHere/foodCap,1). Expected to be the first GENUINELY-live A1 input —
    // most creatures sit on SOME biomass. fertHere is gated on bodySense (0 when OFF), so this is the ON read.
    const cap = world.config.foodCap;
    let fsum = 0,
      fmax = 0,
      fnonzero = 0,
      nsum = 0;
    for (let k = 0; k < s.liveCount; k++) {
      const f = s.fertHere[s.liveIndices[k]!]!;
      fsum += f;
      if (f > fmax) fmax = f;
      if (f > 0) fnonzero++;
      nsum += Math.min(f / cap, 1);
    }
    process.stdout.write(
      `   fertHere: mean ${(fsum / Math.max(1, s.liveCount)).toFixed(2)} max ${fmax.toFixed(1)} ` +
        `nonzero ${((100 * fnonzero) / Math.max(1, s.liveCount)).toFixed(1)}% | normalized-input mean ` +
        `${(nsum / Math.max(1, s.liveCount)).toFixed(3)} (foodCap ${cap})\n`,
    );
  }
}
process.stdout.write(
  'INTERPRET: compare the small→large slope ON vs OFF. ON≈OFF ⇒ wired+live but not yet recruited — say so.\n' +
    'INTERPRET: crowding mean/nonzero% ≈ 0 ⇒ wired+live but INERT at 8192² (density wall: NND ≫ crowdSenseRange).\n' +
    'INTERPRET: fertHere nonzero% high + normalized-input mean ≫ 0 with spread ⇒ the first GENUINELY-LIVE A1\n' +
    '           input (the value REGISTERS). Whether evolution RECRUITS it into settle/leave is separate+unproven.\n',
);
