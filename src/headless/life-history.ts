/**
 * Life-history observer — runs the sim headless and watches EVERY individual over its WHOLE life, then
 * across many individuals over the whole run. Zero core changes: it reads the public World/store surface
 * after each step() and reconstructs per-creature life stories from observed state alone.
 *
 * Identity = (slot, genId): alloc() bumps genId, so a recycled slot is a DIFFERENT individual (store.ts).
 * A "birth" is a (slot,genId) key first seen after tick 1; a "death" is a tracked key that disappears.
 *
 * Reproduction is detected from the individual's OWN energy trace (no parent→child hook needed): a parent
 * climbs to ≥ its satiated bar, then in one tick its energy drops by ≥ reproOverhead as it provisions a
 * child + pays overhead (economy.reproduce). Each such drop = exactly one offspring (reproduce breeds a
 * parent at most once per tick). The total is cross-checked against world.totalBirths.
 *
 * Run: npx tsx src/headless/life-history.ts [ticks] [seed] [sampleStride]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { satiatedBar } from '../core/economy';
import { computeBrainState } from '../app/observability/brain-view';
import { writeFileSync } from 'node:fs';

type Mode = 'survival' | 'reproductive' | 'satiated';

interface Sample {
  tick: number;
  age: number;
  energy: number;
  mode: Mode;
  speed: number;
  turn: number;
  thrust: number;
}

interface Life {
  id: string;
  slot: number;
  genId: number;
  isFounder: boolean;
  birthTick: number;
  birthEnergy: number;
  birthGenes: number[]; // snapshot of the 17 scalar genes at first sight
  birthHue: number;
  // running life aggregates
  maxEnergy: number;
  sumEnergy: number;
  obsCount: number;
  modeTicks: { survival: number; reproductive: number; satiated: number };
  breedings: number;
  breedTicks: number[];
  ageAtFirstBreed: number; // -1 if never
  // lineage (ground truth from the onBirth hook)
  generation: number; // founders = 0; child = parent.generation + 1
  parentId: string | null; // key of the parent (null for founders)
  childIds: string[]; // keys of this individual's direct offspring
  // last-seen state (energy arc + finalize)
  lastEnergy: number;
  // end of life
  lastTick: number;
  lastAge: number;
  lastEnergyFinal: number;
  deathTick: number; // -1 if still alive at run end
  // strided full trace (for featured life-stories)
  samples: Sample[];
}

function geneNames(): string[] {
  const names = new Array<string>(SCALAR_GENE_COUNT);
  for (const [k, v] of Object.entries(ScalarGene)) names[v as number] = k;
  return names;
}

function modeOf(energy: number, reproBar: number, satBar: number): Mode {
  if (energy >= satBar) return 'satiated';
  if (energy >= reproBar) return 'reproductive';
  return 'survival';
}

function quantiles(xs: number[], qs: number[]): number[] {
  if (xs.length === 0) return qs.map(() => NaN);
  const s = [...xs].sort((a, b) => a - b);
  return qs.map((q) => {
    const idx = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
    return s[idx]!;
  });
}

const TICKS = Number(process.argv[2] ?? 6000);
const SEED = Number(process.argv[3] ?? 1);
const STRIDE = Number(process.argv[4] ?? 5); // store a full sample every STRIDE ticks (detection is per-tick)

const config: Config = defaultConfig({ seed: SEED });
const world = new World(config);
const G = geneNames();

const tracked = new Map<string, Life>(); // currently-alive individuals
const completed: Life[] = []; // dead (or run-ended) individuals

function keyOf(slot: number, gen: number): string {
  return `${slot}:${gen}`;
}

// ── Ground-truth breeding via the onBirth hook (no energy-drop heuristic) ──────────────────────────
// reproduce() fires onBirth once per real birth, mid-step (before world.tick advances). We buffer the
// events and drain them at the top of the NEXT observe() — which runs right after this step() — so each
// birth is attributed to the exact tick it happened, with exact parent→child identity. childMeta carries
// the parent link forward so the child's Life (first seen this same observe) is born knowing its lineage.
const pendingBirths: Array<{ pk: string; ck: string; parentSlot: number }> = [];
const childMeta = new Map<string, { parentKey: string; generation: number }>();
let unattributedBreeds = 0; // births whose parent wasn't yet tracked (founder breeding at step 1) — expect 0
config.onBirth = (parentSlot, parentGen, childSlot, childGen) => {
  pendingBirths.push({
    pk: keyOf(parentSlot, parentGen),
    ck: keyOf(childSlot, childGen),
    parentSlot,
  });
};

function snapshotGenes(slot: number): number[] {
  const base = slot * SCALAR_GENE_COUNT;
  const g = new Array<number>(SCALAR_GENE_COUNT);
  for (let i = 0; i < SCALAR_GENE_COUNT; i++) g[i] = world.store.scalarGenes[base + i]!;
  return g;
}

function observe(tick: number): void {
  const s = world.store;

  // (1) Drain this step's births FIRST — ground truth from the hook. Attribute each to its parent's
  // Life and record the child→parent link so the child (first seen below) is born knowing its lineage.
  for (const b of pendingBirths) {
    const parent = tracked.get(b.pk);
    if (parent) {
      parent.breedings++;
      parent.breedTicks.push(tick);
      parent.childIds.push(b.ck);
      if (parent.ageAtFirstBreed < 0) parent.ageAtFirstBreed = s.age[b.parentSlot]!;
      childMeta.set(b.ck, { parentKey: b.pk, generation: parent.generation + 1 });
    } else {
      // Parent not yet tracked — only possible if a founder bred during step 1 (before the first
      // observe). Founders seed below their satiated bar, so this should never fire; counted as a guard.
      unattributedBreeds++;
      childMeta.set(b.ck, { parentKey: b.pk, generation: 1 });
    }
  }
  pendingBirths.length = 0;

  // (2) Walk the live set.
  const seenThisTick = new Set<string>();
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const gen = s.genId[i]!;
    const key = keyOf(i, gen);
    seenThisTick.add(key);
    const energy = s.energy[i]!;
    const age = s.age[i]!;
    const reproBar = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD]!;
    const satBar = satiatedBar(s.scalarGenes, i, config); // same bar the sim breeds on (size-scaled)
    const mode = modeOf(energy, reproBar, satBar);

    let life = tracked.get(key);
    if (life === undefined) {
      // First sighting → a new individual. Lineage comes from childMeta (set in step 1 above) if it was
      // born in-sim; otherwise it's a founder (gen 0, no parent) seen on the very first observed tick.
      const meta = childMeta.get(key);
      life = {
        id: key,
        slot: i,
        genId: gen,
        isFounder: meta === undefined && tick === 1,
        birthTick: meta === undefined && tick === 1 ? 0 : tick,
        birthEnergy: energy,
        birthGenes: snapshotGenes(i),
        birthHue: s.hue[i]!,
        maxEnergy: energy,
        sumEnergy: 0,
        obsCount: 0,
        modeTicks: { survival: 0, reproductive: 0, satiated: 0 },
        breedings: 0,
        breedTicks: [],
        ageAtFirstBreed: -1,
        generation: meta ? meta.generation : 0,
        parentId: meta ? meta.parentKey : null,
        childIds: [],
        lastEnergy: energy,
        lastTick: tick,
        lastAge: age,
        lastEnergyFinal: energy,
        deathTick: -1,
        samples: [],
      };
      tracked.set(key, life);
    }

    // Per-tick aggregates.
    life.maxEnergy = Math.max(life.maxEnergy, energy);
    life.sumEnergy += energy;
    life.obsCount++;
    life.modeTicks[mode]++;
    life.lastEnergy = energy;
    life.lastTick = tick;
    life.lastAge = age;
    life.lastEnergyFinal = energy;

    // Strided full sample (for printable life-stories).
    if (tick % STRIDE === 0 || life.obsCount === 1) {
      const bs = computeBrainState(s, config, i);
      life.samples.push({
        tick,
        age,
        energy,
        mode,
        speed: Math.hypot(s.vx[i]!, s.vy[i]!),
        turn: bs.turn,
        thrust: bs.thrust,
      });
    }
  }

  // Anyone tracked but not seen this tick has died → finalize.
  for (const [key, life] of tracked) {
    if (!seenThisTick.has(key)) {
      life.deathTick = tick;
      completed.push(life);
      tracked.delete(key);
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────
for (let t = 1; t <= TICKS; t++) {
  world.step();
  observe(world.tick);
}
// Flush survivors as run-end records (deathTick stays -1).
for (const life of tracked.values()) completed.push(life);

// ── Analysis ─────────────────────────────────────────────────────────────────────────────────────
const all = completed;
const founders = all.filter((l) => l.isFounder);
const born = all.filter((l) => !l.isFounder);
const lifespan = (l: Life) => (l.deathTick < 0 ? l.lastTick : l.deathTick) - l.birthTick;
const dead = all.filter((l) => l.deathTick >= 0);

const lifespans = dead.map(lifespan);
const [lsMin, lsP25, lsMed, lsP75, lsP90, lsMax] = quantiles(
  lifespans,
  [0, 0.25, 0.5, 0.75, 0.9, 1],
);
const lsMean = lifespans.reduce((a, b) => a + b, 0) / (lifespans.length || 1);

const breeders = all.filter((l) => l.breedings > 0);
const offspringCounts = breeders.map((l) => l.breedings);
const totalDetectedBreedings = all.reduce((a, l) => a + l.breedings, 0);
const maxFecund = all.reduce((m, l) => (l.breedings > m.breedings ? l : m), all[0]!);
const firstBreedAges = breeders.map((l) => l.ageAtFirstBreed);
const [, , fbMed] = quantiles(firstBreedAges, [0, 0, 0.5]);

// Evolution: early vs late cohort gene means (born in the first vs last 20% of the run).
const earlyCut = TICKS * 0.2;
const lateCut = TICKS * 0.8;
const earlyCohort = all.filter((l) => l.birthTick <= earlyCut);
const lateCohort = all.filter((l) => l.birthTick >= lateCut);
function cohortGeneMeans(cohort: Life[]): number[] {
  const m = new Array<number>(SCALAR_GENE_COUNT).fill(0);
  if (cohort.length === 0) return m;
  for (const l of cohort) for (let g = 0; g < SCALAR_GENE_COUNT; g++) m[g]! += l.birthGenes[g]!;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) m[g]! /= cohort.length;
  return m;
}
const earlyMeans = cohortGeneMeans(earlyCohort);
const lateMeans = cohortGeneMeans(lateCohort);

// Hue-lineage diversity: distinct hue bins (20 bins) among early vs late cohort.
function hueBins(cohort: Life[]): number {
  const bins = new Set<number>();
  for (const l of cohort) bins.add(Math.floor(l.birthHue * 20));
  return bins.size;
}

// Lineage (ground truth): generation depth, generation histogram, and dynasty sizes (transitive
// descendants per founder — the real measure of differential reproductive success / selection).
const byId = new Map(all.map((l) => [l.id, l]));
function descendantCount(root: Life): number {
  let n = 0;
  const stack = [...root.childIds];
  while (stack.length > 0) {
    const c = byId.get(stack.pop()!);
    if (c === undefined) continue;
    n++;
    for (const ck of c.childIds) stack.push(ck);
  }
  return n;
}
const maxGen = all.reduce((m, l) => Math.max(m, l.generation), 0);
const genHist = new Array<number>(maxGen + 1).fill(0);
for (const l of all) genHist[l.generation]!++;
const dynasties = founders.map((f) => ({ f, d: descendantCount(f) })).sort((a, b) => b.d - a.d);
const livingFounders = founders.filter((f) => f.deathTick < 0).length;

// ── Report ───────────────────────────────────────────────────────────────────────────────────────
const L: string[] = [];
const p = (s = '') => L.push(s);
p(`# Life-history observation — seed ${SEED}, ${TICKS} ticks, world ${config.worldWidth}²`);
p();
p(
  `Final pop ${world.population} · total births ${world.totalBirths} · deaths ${world.totalDeaths} · ` +
    `${world.population > 0 ? 'ALIVE' : 'EXTINCT'} · hash ${world.stateHash()}`,
);
p();
p(`## Cohort (every individual that ever lived)`);
p(
  `- Individuals tracked: **${all.length}**  (${founders.length} founders, ${born.length} born in-sim)`,
);
p(
  `- Still alive at run end: ${all.filter((l) => l.deathTick < 0).length} · died during run: ${dead.length}`,
);
p(
  `- Lifespan of the dead (ticks): min ${lsMin} · p25 ${lsP25} · median ${lsMed} · p75 ${lsP75} · p90 ${lsP90} · max ${lsMax} · mean ${lsMean.toFixed(0)}`,
);
p(
  `- Ever reproduced: **${breeders.length}/${all.length}** (${((100 * breeders.length) / all.length).toFixed(0)}%)`,
);
p(
  `- Offspring among breeders: median ${quantiles(offspringCounts, [0.5])[0]} · max ${quantiles(offspringCounts, [1])[0]} · mean ${(offspringCounts.reduce((a, b) => a + b, 0) / (breeders.length || 1)).toFixed(1)}`,
);
p(`- Age at first breed (breeders): median ${fbMed}`);
p(
  `- **Validation** (ground truth via onBirth hook): attributed breedings ${totalDetectedBreedings} + ` +
    `unattributed ${unattributedBreeds} = ${totalDetectedBreedings + unattributedBreeds} vs world.totalBirths ` +
    `${world.totalBirths} (Δ ${totalDetectedBreedings + unattributedBreeds - world.totalBirths})`,
);
p();
p(
  `## Evolution — birth-gene means, early cohort (born ≤t${earlyCut}) → late cohort (born ≥t${lateCut})`,
);
p(`Early cohort n=${earlyCohort.length}, late cohort n=${lateCohort.length}`);
p('```');
p('gene                 early    late    Δ');
for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
  const e = earlyMeans[g]!;
  const l = lateMeans[g]!;
  const d = l - e;
  const arrow = Math.abs(d) < 1e-6 ? ' ' : d > 0 ? '↑' : '↓';
  p(
    `${G[g]!.padEnd(20)} ${e.toFixed(2).padStart(7)} ${l.toFixed(2).padStart(7)} ${d >= 0 ? '+' : ''}${d.toFixed(2).padStart(6)} ${arrow}`,
  );
}
p('```');
p(
  `Hue-lineage bins (of 20): early ${hueBins(earlyCohort)} → late ${hueBins(lateCohort)} ` +
    `(${hueBins(lateCohort) < hueBins(earlyCohort) ? 'lineages CONVERGING — a few dynasties dominate' : 'lineages diversifying'})`,
);
p();
p(`## Lineage & generations (ground-truth child→parent links)`);
p(`- Deepest generation reached: **gen ${maxGen}** (founders = gen 0)`);
p(
  `- Founders: ${founders.length} seeded · ${dynasties.filter((x) => x.d > 0).length} left descendants · ` +
    `${livingFounders} still alive at run end`,
);
p('- Population by generation:');
p('```');
for (let g = 0; g <= maxGen; g++) {
  const n = genHist[g]!;
  const bar = '█'.repeat(Math.round((40 * n) / (all.length || 1)));
  p(`  gen ${String(g).padStart(2)}: ${String(n).padStart(5)}  ${bar}`);
}
p('```');
p('- Largest founding dynasties (transitive descendants):');
for (const { f, d } of dynasties.slice(0, 5)) {
  if (d === 0) break;
  p(
    `  - ${f.id} (hue ${f.birthHue.toFixed(2)}, ${f.birthGenes[ScalarGene.DIET]! < 0.5 ? 'grazer' : 'predator'}): ` +
      `**${d} descendants**, ${f.childIds.length} direct children, bred ${f.breedings}×`,
  );
}
p();

// ── Featured life-stories ──
// Effective breeding bar = the sim's satiatedBar() applied to this individual's birth genes (raw
// SATIATED_THRESHOLD gene is NOT the breeding bar once size-scaling is on — reuse the sim's own helper).
function effBreedBar(l: Life): number {
  const arr = new Float32Array(SCALAR_GENE_COUNT);
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) arr[g] = l.birthGenes[g]!;
  return satiatedBar(arr, 0, config);
}
function story(label: string, l: Life): void {
  const span = lifespan(l);
  const fate = l.deathTick < 0 ? `still alive at t${l.lastTick}` : `died t${l.deathTick}`;
  const diet = l.birthGenes[ScalarGene.DIET]!;
  p(`### ${label}: ${l.id} ${l.isFounder ? '(founder)' : `(born t${l.birthTick})`}`);
  p(
    `- gen ${l.generation}${l.parentId ? ` · parent ${l.parentId}` : ' · founding lineage'} · ` +
      `${l.childIds.length} direct children`,
  );
  p(
    `- lifespan ${span} ticks · ${fate} at age ${l.lastAge}, energy ${l.lastEnergyFinal.toFixed(1)}`,
  );
  p(
    `- ${diet < 0.5 ? 'GRAZER' : 'PREDATOR'} diet ${diet.toFixed(2)} · size ${l.birthGenes[ScalarGene.SIZE]!.toFixed(1)} · ` +
      `eff ${l.birthGenes[ScalarGene.METAB_EFF]!.toFixed(2)} · vision ${l.birthGenes[ScalarGene.VISION_RANGE]!.toFixed(0)}u · ` +
      `repro@${l.birthGenes[ScalarGene.REPRO_THRESHOLD]!.toFixed(0)}/breed@${effBreedBar(l).toFixed(0)} · hue ${l.birthHue.toFixed(2)}`,
  );
  p(
    `- reproduced **${l.breedings}×**${l.breedings > 0 ? ` (first at age ${l.ageAtFirstBreed}; ticks ${l.breedTicks.slice(0, 8).join(', ')}${l.breedTicks.length > 8 ? ', …' : ''})` : ' — never reached the breeding bar'}`,
  );
  p(
    `- mode split: survival ${l.modeTicks.survival} / reproductive ${l.modeTicks.reproductive} / satiated ${l.modeTicks.satiated} ticks · peak energy ${l.maxEnergy.toFixed(0)} · mean ${(l.sumEnergy / l.obsCount).toFixed(0)}`,
  );
  // Energy arc waypoints (every ~6th stored sample).
  const wp = l.samples.filter((_, idx) => idx % 6 === 0).slice(0, 10);
  p(`- energy arc: ${wp.map((s) => `t${s.tick}:${s.energy.toFixed(0)}${s.mode[0]}`).join(' → ')}`);
  p();
}

p(`## Featured life-stories`);
p();
const longest = dead.reduce((m, l) => (lifespan(l) > lifespan(m) ? l : m), dead[0] ?? all[0]!);
const medLife = [...dead].sort((a, b) => lifespan(a) - lifespan(b))[Math.floor(dead.length / 2)];
const neverBred = dead
  .filter((l) => l.breedings === 0)
  .sort((a, b) => lifespan(b) - lifespan(a))[0];
const aFounder = founders.sort((a, b) => b.breedings - a.breedings)[0];
story('Most fecund (the "patriarch")', maxFecund);
story('Longest-lived', longest);
if (aFounder) story('Most successful founder', aFounder);
if (medLife) story('Median lifespan (typical)', medLife);
if (neverBred) story('Longest life that never bred', neverBred);

const report = L.join('\n');
console.log(report);

// ── Artifacts ──
const mdPath = `life-histories-seed${SEED}.md`;
writeFileSync(mdPath, report + '\n');

const header = [
  'id',
  'slot',
  'genId',
  'isFounder',
  'generation',
  'parentId',
  'directChildren',
  'birthTick',
  'deathTick',
  'lifespan',
  'breedings',
  'ageAtFirstBreed',
  'maxEnergy',
  'meanEnergy',
  'birthHue',
  ...G,
].join(',');
const rows = all.map((l) =>
  [
    l.id,
    l.slot,
    l.genId,
    l.isFounder ? 1 : 0,
    l.generation,
    l.parentId ?? '',
    l.childIds.length,
    l.birthTick,
    l.deathTick,
    lifespan(l),
    l.breedings,
    l.ageAtFirstBreed,
    l.maxEnergy.toFixed(2),
    (l.sumEnergy / l.obsCount).toFixed(2),
    l.birthHue.toFixed(4),
    ...l.birthGenes.map((g) => g.toFixed(4)),
  ].join(','),
);
const csvPath = `life-histories-seed${SEED}.csv`;
writeFileSync(csvPath, header + '\n' + rows.join('\n') + '\n');

console.log(`\n[wrote ${mdPath} and ${csvPath} — ${all.length} individual life records]`);
