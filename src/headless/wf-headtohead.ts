// Head-to-head: baseline vs richer-cells (keep 8192) vs shrink — the two workflow winners.
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const TICKS = 12000;
const SEEDS = [1, 2, 5];

function toro(a: number, b: number, w: number) { let d = Math.abs(a - b); if (d > w / 2) d = w - d; return d; }

function snap(w: World) {
  const s = w.store; const cfg = w.config;
  const idx: number[] = [];
  for (let k = 0; k < s.liveCount; k++) idx.push(s.liveIndices[k]!);
  const diet = (i: number) => s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
  const size = (i: number) => s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
  const preds = idx.filter((i) => diet(i) >= 0.5);
  const prey = idx.filter((i) => diet(i) < 0.5);
  // NND among prey
  let nnd = 0, nndN = 0;
  for (const i of prey) {
    let best = Infinity;
    for (const j of prey) { if (j === i) continue; const dx = toro(s.x[i]!, s.x[j]!, cfg.worldWidth), dy = toro(s.y[i]!, s.y[j]!, cfg.worldHeight); const d2 = dx * dx + dy * dy; if (d2 < best) best = d2; }
    if (best < Infinity) { nnd += Math.sqrt(best); nndN++; }
  }
  // predEncounter: fraction of preds with >=1 edible prey within biteRange
  const br2 = cfg.biteRange * cfg.biteRange;
  let enc = 0;
  for (const i of preds) {
    const maxPrey = size(i) / cfg.huntSizeRatio;
    let found = false;
    for (const j of idx) { if (j === i) continue; if (size(j) > maxPrey) continue; const dx = toro(s.x[i]!, s.x[j]!, cfg.worldWidth), dy = toro(s.y[i]!, s.y[j]!, cfg.worldHeight); if (dx * dx + dy * dy <= br2) { found = true; break; } }
    if (found) enc++;
  }
  // vision mean
  let vr = 0; for (const i of idx) vr += s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.VISION_RANGE]!;
  return { pop: s.liveCount, pred: preds.length, prey: prey.length, nnd: nndN ? nnd / nndN : 0, enc: preds.length ? enc / preds.length : 0, vr: idx.length ? vr / idx.length : 0 };
}

const CASES: { label: string; o: Partial<Config> }[] = [
  { label: 'baseline 8192', o: {} },
  { label: 'richcells cap40+regen.06', o: { foodCap: 40, foodRegen: 0.06 } },
  { label: 'shrink 4096+pop140', o: { worldWidth: 4096, worldHeight: 4096, initialPopulation: 140 } },
];
const hdr = 'case'.padEnd(28) + ['seed', 'pop', 'pred', 'prey', 'NND', 'predEnc', 'vision', 'predGone'].map((h) => h.padStart(9)).join('');
console.log(hdr); console.log('-'.repeat(hdr.length));
for (const c of CASES) {
  for (const seed of SEEDS) {
    const w = new World(defaultConfig({ seed, ...c.o }));
    let gone = -1;
    for (let t = 1; t <= TICKS; t++) {
      w.step();
      if (gone < 0) { let p = 0; const s = w.store; for (let k = 0; k < s.liveCount; k++) { if (s.scalarGenes[s.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]! >= 0.5) { p++; break; } } if (p === 0) gone = t; }
    }
    const m = snap(w);
    console.log(c.label.padEnd(28) + [String(seed), String(m.pop), String(m.pred), String(m.prey), m.nnd.toFixed(0), m.enc.toFixed(3), m.vr.toFixed(0), gone < 0 ? 'survived' : String(gone)].map((v) => v.padStart(9)).join(''));
  }
  console.log('-'.repeat(hdr.length));
}
