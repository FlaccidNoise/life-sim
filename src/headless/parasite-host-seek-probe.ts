/**
 * Parasite host-seeking A/B probe (item #5 verification).
 *
 * Same seed, same config, ONLY `parasiteHostSeekGain` differs: ON (1.0) vs OFF (0).
 * The neural sight pull is the ONLY thing that changes — parasiteStep's spatial
 * attach scan runs identically in both (gated on parasiteEnabled, not hostSeekGain).
 *
 * So if host-seeking WORKS: ON should attach more (higher rate) and sit closer to
 * compatible hosts (smaller mean free-parasite→nearest-host distance) than OFF.
 *
 * Usage: npx tsx src/headless/parasite-host-seek-probe.ts [ticks] [seed] [sampleEvery]
 *   ticks=8000 seed=3 sampleEvery=1000
 */
import { defaultConfig, type Config } from '../core/config';
import { livingWorldOverrides } from '../app/living-world-config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const ticks = Number(process.argv[2] ?? 8000);
const seed = Number(process.argv[3] ?? 3);
const sampleEvery = Number(process.argv[4] ?? 1000);

interface Sample {
  tick: number;
  parasites: number;
  attached: number;
  attachRate: number;
  freeParasitesSampled: number;
  meanDistNearestHost: number; // mean over sampled free parasites
  hostsAvail: number; // free creatures that qualify as a host for ≥1 parasite
}

function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

function sample(world: World, cfg: Config): Sample {
  const s = world.store;
  const { liveIndices, liveCount, x, y, scalarGenes, hostSlot, parasiteCount } = s;
  const { worldWidth, worldHeight, parasiteSizeRatio } = cfg;

  let parasites = 0;
  let attached = 0;
  // collect free parasite indices
  const freePara: number[] = [];
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const para = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.PARASITISM]!;
    if (para <= 0.5) continue;
    parasites++;
    if (hostSlot[i]! >= 0) attached++;
    else freePara.push(i);
  }
  const attachRate = parasites > 0 ? attached / parasites : 0;

  // For nearest-compatible-host distance: a host j is compatible if alive, NOT a parasite itself,
  // size[j] >= size[i]*parasiteSizeRatio, and parasiteCount[j]==0 (free — could accept this parasite).
  // Sample up to 250 free parasites (every Nth) to bound cost.
  const maxSample = 250;
  const step = freePara.length > maxSample ? Math.ceil(freePara.length / maxSample) : 1;
  let distSum = 0;
  let distN = 0;
  let hostsAvail = 0;
  // Precompute host-candidate sizes for the sampled parasites' compatibility.
  for (let si = 0; si < freePara.length; si += step) {
    const i = freePara[si]!;
    const sgI = i * SCALAR_GENE_COUNT;
    const sizeI = scalarGenes[sgI + ScalarGene.SIZE]!;
    const minHostSize = sizeI * parasiteSizeRatio;
    const xi = x[i]!;
    const yi = y[i]!;
    let bestD2 = Infinity;
    for (let k = 0; k < liveCount; k++) {
      const j = liveIndices[k]!;
      const jg = j * SCALAR_GENE_COUNT;
      // skip parasites as hosts (a parasite can't host another parasite here)
      if (scalarGenes[jg + ScalarGene.PARASITISM]! > 0.5) continue;
      if (scalarGenes[jg + ScalarGene.SIZE]! < minHostSize) continue;
      if (parasiteCount[j]! > 0) continue; // already has a parasite
      const ddx = wrapDelta(xi - x[j]!, worldWidth);
      const ddy = wrapDelta(yi - y[j]!, worldHeight);
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < bestD2) bestD2 = d2;
    }
    if (bestD2 < Infinity) {
      distSum += Math.sqrt(bestD2);
      distN++;
      hostsAvail++;
    }
  }
  return {
    tick: world.tick,
    parasites,
    attached,
    attachRate,
    freeParasitesSampled: distN,
    meanDistNearestHost: distN > 0 ? distSum / distN : NaN,
    hostsAvail,
  };
}

function run(hostSeekGain: number): Sample[] {
  const cfg: Config = defaultConfig({
    ...livingWorldOverrides,
    seed,
    parasiteHostSeekGain: hostSeekGain,
  });
  const world = new World(cfg);
  const out: Sample[] = [];
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (t % sampleEvery === 0) out.push(sample(world, cfg));
  }
  return out;
}

const ON = run(1.0);
const OFF = run(0.0);

console.log(
  `=== parasite host-seeking A/B: ticks=${ticks} seed=${seed} sampleEvery=${sampleEvery} ===\n`,
);
console.log(
  'tick |  ON: parasites attached rate  meanDist hostsAvail | OFF: parasites attached rate  meanDist hostsAvail | Δrate   Δdist',
);
console.log('-----|' + '-'.repeat(130));
for (let i = 0; i < ON.length; i++) {
  const a = ON[i]!;
  const b = OFF[i]!;
  const dr = a.attachRate - b.attachRate;
  const dd = a.meanDistNearestHost - b.meanDistNearestHost;
  const fmt = (s: Sample) =>
    `${String(s.parasites).padStart(5)} ${String(s.attached).padStart(5)} ${s.attachRate.toFixed(2).padStart(5)} ${String(s.meanDistNearestHost.toFixed(0)).padStart(7)} ${String(s.hostsAvail).padStart(4)}`;
  console.log(
    `${String(a.tick).padStart(4)} |  ON: ${fmt(a)} | OFF: ${fmt(b)} | ${dr >= 0 ? '+' : ''}${dr.toFixed(2).padStart(5)} ${dd >= 0 ? '+' : ''}${dd.toFixed(0).padStart(5)}`,
  );
}

// Verdict: ON should have higher attachRate and lower (more negative) meanDist (closer to hosts).
const lastA = ON[ON.length - 1]!;
const lastB = OFF[OFF.length - 1]!;
const avgRateON = ON.reduce((s, x) => s + x.attachRate, 0) / ON.length;
const avgRateOFF = OFF.reduce((s, x) => s + x.attachRate, 0) / OFF.length;
const avgDistON =
  ON.filter((x) => !isNaN(x.meanDistNearestHost)).reduce((s, x) => s + x.meanDistNearestHost, 0) /
  ON.filter((x) => !isNaN(x.meanDistNearestHost)).length;
const avgDistOFF =
  OFF.filter((x) => !isNaN(x.meanDistNearestHost)).reduce((s, x) => s + x.meanDistNearestHost, 0) /
  OFF.filter((x) => !isNaN(x.meanDistNearestHost)).length;

console.log('\n=== VERDICT (item #5: does neural host-seeking work?) ===');
console.log(
  `mean attachRate  ON=${avgRateON.toFixed(3)}  OFF=${avgRateOFF.toFixed(3)}  Δ=${(avgRateON - avgRateOFF).toFixed(3)}  ${avgRateON > avgRateOFF ? '(ON higher ✓ seeking helps attach)' : '(ON NOT higher ✗ seeking fails to attach)'}`,
);
console.log(
  `mean meanDist    ON=${avgDistON.toFixed(0)}  OFF=${avgDistOFF.toFixed(0)}  Δ=${(avgDistON - avgDistOFF).toFixed(0)}  ${avgDistON < avgDistOFF ? '(ON closer ✓ seeking steers toward hosts)' : '(ON NOT closer ✗ no steering)'}`,
);
console.log(`final parasites  ON=${lastA.parasites}  OFF=${lastB.parasites}`);
void lastA;
void lastB;
