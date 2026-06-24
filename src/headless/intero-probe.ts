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

function measure(bodySense: boolean): { pop: number; bins: Bin[] } {
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
  return { pop: liveCount, bins };
}

for (const bodySense of [false, true]) {
  const { pop, bins } = measure(bodySense);
  process.stdout.write(`bodySense ${bodySense ? 'ON ' : 'OFF'} — pop ${pop}\n`);
  bins.forEach((b, idx) => {
    const lbl = ['small', 'mid  ', 'large'][idx];
    const turn = b.n ? (b.turnAbs / b.n).toFixed(3) : 'n/a';
    const fwd = b.n ? (b.fwd / b.n).toFixed(3) : 'n/a';
    process.stdout.write(`   ${lbl} (n=${b.n}): mean|lat-force| ${turn}  mean fwd-thrust ${fwd}\n`);
  });
}
process.stdout.write(
  'INTERPRET: compare the small→large slope ON vs OFF. ON≈OFF ⇒ wired+live but not yet recruited — say so.\n',
);
