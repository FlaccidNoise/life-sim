import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

function census(w: World) {
  const s = w.store;
  let pred = 0, herb = 0, dietSum = 0, predE = 0, herbE = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    dietSum += diet;
    if (diet >= 0.5) { pred++; predE += s.energy[i]!; }
    else { herb++; herbE += s.energy[i]!; }
  }
  return { pop: s.liveCount, pred, herb, meanDiet: dietSum / Math.max(1, s.liveCount),
           predE: pred ? predE / pred : 0, herbE: herb ? herbE / herb : 0 };
}

for (const seed of [1, 2, 5]) {
  const cfg = defaultConfig({ seed });
  const w = new World(cfg);
  const c0 = census(w);
  console.log(`\n=== seed ${seed} (world ${cfg.worldWidth}sq, initPop ${cfg.initialPopulation}, predFrac ${cfg.predatorFraction}) ===`);
  console.log(`t=0     pop=${c0.pop} pred=${c0.pred} herb=${c0.herb}`);
  const marks = [25, 50, 100, 200, 400, 800, 1500, 3000, 6000, 10000];
  let mi = 0, predGone = -1;
  for (let t = 1; t <= 10000; t++) {
    w.step();
    const c = census(w);
    if (c.pred === 0 && predGone < 0) predGone = t;
    if (mi < marks.length && t === marks[mi]) {
      console.log(`t=${String(t).padEnd(6)} pop=${String(c.pop).padEnd(5)} pred=${String(c.pred).padEnd(4)} herb=${String(c.herb).padEnd(5)} meanDiet=${c.meanDiet.toFixed(2)} predE=${c.predE.toFixed(1)} herbE=${c.herbE.toFixed(1)} births=${w.totalBirths} deaths=${w.totalDeaths}`);
      mi++;
    }
  }
  console.log(predGone >= 0 ? `>>> predators (diet>=0.5) hit ZERO at t=${predGone}` : `>>> predators survived to t=10000`);
}
