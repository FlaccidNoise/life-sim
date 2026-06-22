/**
 * wf-encounter — ENCOUNTER ECONOMICS probe. Quantifies WHY predators are marginal at the shipped
 * 8192² archipelago scale: spatial spread (NND, occupancy), the predator hunting-opportunity rate
 * (predEncounter, preyInVision), and the resulting per-tick energy balance for a representative
 * predator. Read-only over the sim state; uses defaultConfig (the one shipped config).
 *
 * Formulas cited inline against src/core/economy.ts.
 */
import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT as SGC, geneUpkeep } from '../core/genome';

const W = 8192;
const H = 8192;
const SEEDS = [1, 2, 5];
const TICKS = 10000;
const SAMPLE = 5000;
const BITE_RANGE = 16;

function wrap(d: number, size: number): number {
  d = Math.abs(d);
  return d > size / 2 ? size - d : d;
}

interface Snap {
  t: number;
  pop: number;
  pred: number;
  prey: number;
  nndPrey: number;
  predEncounter: number;
  preyInVision: number;
  occ256: number;
  hashOccPct: number;
  maxBucket: number;
  // representative-predator energy balance terms
  repDiet: number;
  repDamage: number;
  repMetabEff: number;
  repUpkeep: number;
  grazeIncome: number;
  huntIncome: number;
  basal: number;
  net: number;
}

function measure(world: World, t: number, cfg: ReturnType<typeof defaultConfig>): Snap {
  const s = world.store;
  const sg = s.scalarGenes;
  const n = s.liveCount;

  const predIdx: number[] = [];
  const preyIdx: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    const diet = sg[i * SGC + ScalarGene.DIET]!;
    if (diet >= 0.5) predIdx.push(i);
    else preyIdx.push(i);
  }

  // NND_prey: mean nearest toroidal distance prey→other prey (brute O(prey^2))
  let nndPrey = 0;
  if (preyIdx.length > 1) {
    let acc = 0;
    for (let a = 0; a < preyIdx.length; a++) {
      const ia = preyIdx[a]!;
      const xa = s.x[ia]!;
      const ya = s.y[ia]!;
      let best = Infinity;
      for (let b = 0; b < preyIdx.length; b++) {
        if (b === a) continue;
        const ib = preyIdx[b]!;
        const dx = wrap(xa - s.x[ib]!, W);
        const dy = wrap(ya - s.y[ib]!, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      acc += Math.sqrt(best);
    }
    nndPrey = acc / preyIdx.length;
  }

  // predEncounter: fraction of predators with >=1 EDIBLE prey within biteRange (16u).
  // "edible" = size < predatorSize/huntSizeRatio (economy.ts:73,92). Brute over prey per predator.
  // preyInVision: mean edible prey within each predator's VISION_RANGE gene.
  let withBite = 0;
  let visAcc = 0;
  const hsr = cfg.huntSizeRatio;
  for (const ip of predIdx) {
    const sizeP = sg[ip * SGC + ScalarGene.SIZE]!;
    const maxPrey = sizeP / hsr;
    const visRange = sg[ip * SGC + ScalarGene.VISION_RANGE]!;
    const vis2 = visRange * visRange;
    const xa = s.x[ip]!;
    const ya = s.y[ip]!;
    let haveBite = false;
    let visCount = 0;
    for (let k = 0; k < n; k++) {
      const j = s.liveIndices[k]!;
      if (j === ip) continue;
      if (sg[j * SGC + ScalarGene.SIZE]! > maxPrey) continue; // too big to eat
      // cannibalism gate (economy.ts:93): with cannibalism on, no diet filter
      if (!cfg.cannibalism && sg[j * SGC + ScalarGene.DIET]! >= sg[ip * SGC + ScalarGene.DIET]!)
        continue;
      const dx = wrap(xa - s.x[j]!, W);
      const dy = wrap(ya - s.y[j]!, H);
      const d2 = dx * dx + dy * dy;
      if (d2 <= BITE_RANGE * BITE_RANGE) haveBite = true;
      if (d2 <= vis2) visCount++;
    }
    if (haveBite) withBite++;
    visAcc += visCount;
  }
  const predEncounter = predIdx.length ? withBite / predIdx.length : 0;
  const preyInVision = predIdx.length ? visAcc / predIdx.length : 0;

  // occ256: occupied 256x256u grid cells
  const cols256 = Math.ceil(W / 256);
  const occSet = new Set<number>();
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    const cx = Math.min(cols256 - 1, Math.floor(s.x[i]! / 256));
    const cy = Math.min(cols256 - 1, Math.floor(s.y[i]! / 256));
    occSet.add(cy * cols256 + cx);
  }
  const occ256 = occSet.size;

  const hs = world.hash.stats();
  const hashOccPct = (hs.occupied / hs.buckets) * 100;

  // Representative predator energy balance. Pick the median-diet predator (or synthesize a founder-
  // style predator if none): use its actual genes; kill probability = MEASURED predEncounter.
  let repDiet = 0.9;
  let repDamage = cfg.damage;
  let repMetabEff = 1;
  let repUpkeep = 0;
  if (predIdx.length) {
    const sorted = [...predIdx].sort(
      (a, b) => sg[a * SGC + ScalarGene.DIET]! - sg[b * SGC + ScalarGene.DIET]!,
    );
    const rep = sorted[Math.floor(sorted.length / 2)]!;
    repDiet = sg[rep * SGC + ScalarGene.DIET]!;
    repDamage = sg[rep * SGC + ScalarGene.DAMAGE]!;
    repMetabEff = sg[rep * SGC + ScalarGene.METAB_EFF]!;
    repUpkeep = geneUpkeep(sg, rep, cfg);
  }

  // graze income (economy.ts:136-137): eatRate*(1-diet)^herbivoryExp, ASSUMING food available (upper
  // bound — between pockets it's 0). We report the unconstrained graze term for the rep predator.
  const eatRateRep = predIdx.length ? sg[predIdx[0]! * SGC + ScalarGene.EAT_RATE]! : cfg.eatRate;
  const herbivory = (1 - repDiet) ** cfg.herbivoryExp;
  const grazeIncome = eatRateRep * herbivory;
  // hunt income (economy.ts:105,111): drain*predationGain, drain=DAMAGE*diet; expected = P(bite)*drain*gain
  const huntIncome = predEncounter * repDamage * repDiet * cfg.predationGain;
  // costs (economy.ts:145): basalCost*metabEff + geneUpkeep (+ moveCost*speed^2, ignored here = optimistic)
  const basal = cfg.basalCost * repMetabEff;
  const net = grazeIncome + huntIncome - basal - repUpkeep;

  return {
    t,
    pop: n,
    pred: predIdx.length,
    prey: preyIdx.length,
    nndPrey,
    predEncounter,
    preyInVision,
    occ256,
    hashOccPct,
    maxBucket: hs.maxBucket,
    repDiet,
    repDamage,
    repMetabEff,
    repUpkeep,
    grazeIncome,
    huntIncome,
    basal,
    net,
  };
}

const results: Record<number, { mid?: Snap | undefined; final: Snap; predGone: number | string }> =
  {};

for (const seed of SEEDS) {
  const cfg = defaultConfig({ seed });
  const world = new World(cfg);
  let predGone: number | string = 'survived';
  let mid: Snap | undefined;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    // scan pred==0
    if (predGone === 'survived') {
      const s = world.store;
      let pred = 0;
      for (let k = 0; k < s.liveCount; k++) {
        if (s.scalarGenes[s.liveIndices[k]! * SGC + ScalarGene.DIET]! >= 0.5) {
          pred++;
          break;
        }
      }
      if (pred === 0) predGone = t;
    }
    if (t === SAMPLE) mid = measure(world, t, cfg);
  }
  const final = measure(world, TICKS, cfg);
  results[seed] = { mid, final, predGone };
}

function fmt(s: Snap): string {
  return [
    `pop=${s.pop}`,
    `pred=${s.pred}`,
    `prey=${s.prey}`,
    `NND_prey=${s.nndPrey.toFixed(1)}`,
    `predEnc=${s.predEncounter.toFixed(4)}`,
    `preyInVis=${s.preyInVision.toFixed(3)}`,
    `occ256=${s.occ256}`,
    `hashOcc%=${s.hashOccPct.toFixed(4)}`,
    `maxBucket=${s.maxBucket}`,
    `[rep diet=${s.repDiet.toFixed(2)} dmg=${s.repDamage.toFixed(1)} eff=${s.repMetabEff.toFixed(2)} upkeep=${s.repUpkeep.toFixed(3)}]`,
    `graze=${s.grazeIncome.toFixed(3)}`,
    `hunt=${s.huntIncome.toFixed(4)}`,
    `basal=${s.basal.toFixed(3)}`,
    `NET=${s.net.toFixed(4)}`,
  ].join('  ');
}

for (const seed of SEEDS) {
  const r = results[seed]!;
  console.log(`\n=== SEED ${seed}  (predGone=${r.predGone}) ===`);
  if (r.mid) console.log(`  t=5000:  ${fmt(r.mid)}`);
  console.log(`  t=10000: ${fmt(r.final)}`);
}
