/**
 * Life-history observer — runs the sim headless and watches EVERY individual over its WHOLE life, then
 * across many individuals over the whole run, then across MANY SEEDS to separate typical dynamics from
 * single-run flukes. Zero core changes: it reads the public World/store surface after each step() and
 * reconstructs per-creature life stories from observed state alone.
 *
 * Identity = (slot, genId): alloc() bumps genId, so a recycled slot is a DIFFERENT individual (store.ts).
 * A "birth" is a (slot,genId) key first seen after tick 1; a "death" is a tracked key that disappears.
 *
 * Reproduction is ground truth from the onBirth observation hook (config.ts/economy.ts): reproduce()
 * fires it once per real birth, mid-step, with exact parent→child (slot,genId) identity — no energy-drop
 * heuristic. We buffer the events and drain them at the next observe(), so each birth is attributed to
 * the exact tick and parent. The per-seed total is cross-checked against world.totalBirths (expect Δ 0).
 *
 * Run: npx tsx src/headless/life-history.ts [ticks] [seeds] [sampleStride] [--demo]
 *   seeds: "3" (one) · "1-5" (inclusive range) · "1,3,7" (explicit list).  Default "1-5".
 *   --demo: apply the LIVE-DEMO overrides (walls/flow/motorSquash/3-channel food/pheromones, per main.ts)
 *           instead of the byte-clean defaultConfig — measures the world the user actually watches.
 * Writes life-histories-seed{S}.md/.csv per seed, plus life-histories-multiseed.md (cross-seed aggregate).
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { satiatedBar } from '../core/economy';
import { computeBrainState } from '../app/observability/brain-view';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
const G = geneNames();

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

// Unicode sparkline over a numeric series; NaN entries render as a gap (generations with no individuals).
// Scaled to the series' own [min,max], so it shows SHAPE/trajectory (when a trait moves), not magnitude.
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(values: number[]): string {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return '';
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const span = hi - lo;
  return values
    .map((v) => {
      if (!Number.isFinite(v)) return ' ';
      const t = span < 1e-9 ? 0.5 : (v - lo) / span;
      return SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.round(t * (SPARK.length - 1))))];
    })
    .join('');
}

function keyOf(slot: number, gen: number): string {
  return `${slot}:${gen}`;
}

// ── Per-seed result (everything the cross-seed aggregate needs, plus the full per-seed markdown) ───────
interface SeedResult {
  seed: number;
  alive: boolean;
  finalPop: number;
  totalBirths: number;
  totalDeaths: number;
  hash: string;
  allCount: number;
  foundersCount: number;
  bornCount: number;
  bredPct: number;
  lsMed: number;
  lsMax: number;
  maxGen: number;
  genHist: number[]; // population by generation depth
  geneByGen: number[][]; // [gen][gene] mean birth-gene value among individuals at that depth
  earlyMeans: number[];
  lateMeans: number[];
  topDynasty: number; // transitive descendants of the most successful founder
  topDynastyShare: number; // topDynasty / bornCount (fraction of in-sim births in the dominant lineage)
  top1to2: number; // ratio of largest to 2nd-largest dynasty (monopoly sharpness; Inf if only one)
  unattributedBreeds: number;
  reportMd: string;
}

// Live-demo overrides — mirrors src/app/main.ts (the world the user actually watches). Kept here so the
// probe can measure the demo regime, not just the byte-clean default. Update if main.ts's config changes.
export const DEMO_OVERRIDES: Partial<Config> = {
  // Spatial structure + legibility.
  wallRegionCount: 5,
  flowStrength: 0.35,
  flowPushStrength: 0.25,
  motorSquash: true,
  // Density + two differentiated resources (channel A wall-tied, B drifting) + parcels (vision-revival).
  foodPatchCount: 40,
  foodPatchRadius: 8,
  foodChannels: 2,
  foodPocketChannelMode: 1,
  foodChannelAWallTied: true,
  foodChannelBDriftMult: 3,
  pheromoneEnabled: true,
  parcelsEnabled: true,
  parcelEnergy: 80,
  parcelSpawnInterval: 6,
  parcelCapacity: 120,
  visionFovCost: 0.02,
  visionAcuityCost: 0.02,
  // Lifespan + behavior depth (mirrors main.ts): softer starvation clock + satiation-driven wander +
  // breeding cooldown so creatures dwell well-fed. Override on the CLI to A/B against the old demo.
  basalCost: 0.08,
  hungerGatesFood: true,
  breedCooldown: 150,
  // Age / life stages (life-sim-bd8a): juvenile breed-lock + elder senescence tax + costed longevity gene.
  ageStages: true,
  // Sexual reproduction: compatibility-gated mating + display/preference genes (the feature under measurement).
  sexualReproduction: true,
};

// ── One seed: run the sim, observe every tick, build the per-seed report, return structured stats ──────
function runSeed(seed: number, ticks: number, stride: number, overrides: Partial<Config>): SeedResult {
  const config: Config = defaultConfig({ seed, ...overrides });
  const world = new World(config);

  const tracked = new Map<string, Life>(); // currently-alive individuals
  const completed: Life[] = []; // dead (or run-ended) individuals

  // Ground-truth breeding via the onBirth hook. reproduce() fires it once per real birth, mid-step
  // (before world.tick advances). We buffer events and drain them at the top of the NEXT observe() —
  // which runs right after this step() — so each birth is attributed to the exact tick, with exact
  // parent→child identity. childMeta carries the parent link forward so the child's Life (first seen
  // this same observe) is born knowing its lineage.
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
      if (tick % stride === 0 || life.obsCount === 1) {
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

  // ── Run ──
  for (let t = 1; t <= ticks; t++) {
    world.step();
    observe(world.tick);
  }
  // Flush survivors as run-end records (deathTick stays -1).
  for (const life of tracked.values()) completed.push(life);

  // ── Analysis ──
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
  const earlyCut = ticks * 0.2;
  const lateCut = ticks * 0.8;
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

  // Gene-by-generation: mean birth-gene value among individuals AT each generation depth. This is the
  // "generation vs gene" trajectory — it shows WHEN (at what lineage depth) a trait drifts, which the
  // birth-tick cohort split can't (a late tick mixes shallow founders' clones with deep descendants).
  const geneByGen: number[][] = Array.from({ length: maxGen + 1 }, () =>
    new Array<number>(SCALAR_GENE_COUNT).fill(0),
  );
  for (const l of all)
    for (let g = 0; g < SCALAR_GENE_COUNT; g++) geneByGen[l.generation]![g]! += l.birthGenes[g]!;
  for (let gg = 0; gg <= maxGen; gg++) {
    if (genHist[gg]! > 0)
      for (let g = 0; g < SCALAR_GENE_COUNT; g++) geneByGen[gg]![g]! /= genHist[gg]!;
  }

  // ── Report ──
  const L: string[] = [];
  const p = (s = '') => L.push(s);
  p(`# Life-history observation — seed ${seed}, ${ticks} ticks, world ${config.worldWidth}²`);
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

  // ── Generation-vs-gene plot ──
  // One sparkline per gene over generation depth (gen 0 → maxGen). The sparkline is scaled to that gene's
  // own range across generations, so it shows the SHAPE of drift — e.g. vision collapsing by gen N — and
  // the gen0→last numbers give magnitude. Generations with no individuals render as a gap.
  p(`## Generation-vs-gene plot (mean birth-gene at each generation depth)`);
  p(
    `Sparkline runs gen 0 (founders) → gen ${maxGen}. ▁ = that gene's min across generations, █ = its max. ` +
      `Reads WHEN a trait drifts as lineages deepen — complements the birth-tick cohort split above.`,
  );
  p('```');
  const popSeries = genHist.map((n) => (n > 0 ? n : NaN));
  p(
    `${'individuals/gen'.padEnd(20)} ${sparkline(popSeries)}   gen0=${genHist[0]} … gen${maxGen}=${genHist[maxGen]}`,
  );
  p(`${''.padEnd(20)} ${'·'.repeat(maxGen + 1)}`);
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const series = geneByGen.map((row, gg) => (genHist[gg]! > 0 ? row[g]! : NaN));
    const finite = series.filter((v) => Number.isFinite(v));
    const first = finite[0]!;
    const last = finite[finite.length - 1]!;
    const d = last - first;
    const arrow = Math.abs(d) < 1e-6 ? ' ' : d > 0 ? '↑' : '↓';
    p(
      `${G[g]!.padEnd(20)} ${sparkline(series)}   ${first.toFixed(2).padStart(7)} → ${last.toFixed(2).padStart(7)}  ${arrow}`,
    );
  }
  p('```');
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
    p(
      `- energy arc: ${wp.map((s) => `t${s.tick}:${s.energy.toFixed(0)}${s.mode[0]}`).join(' → ')}`,
    );
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

  // ── Per-seed artifacts ──
  const mdPath = `life-histories-seed${seed}.md`;
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
  const csvPath = `life-histories-seed${seed}.csv`;
  writeFileSync(csvPath, header + '\n' + rows.join('\n') + '\n');

  const top1 = dynasties[0]?.d ?? 0;
  const top2 = dynasties[1]?.d ?? 0;
  return {
    seed,
    alive: world.population > 0,
    finalPop: world.population,
    totalBirths: world.totalBirths,
    totalDeaths: world.totalDeaths,
    hash: world.stateHash(),
    allCount: all.length,
    foundersCount: founders.length,
    bornCount: born.length,
    bredPct: (100 * breeders.length) / (all.length || 1),
    lsMed: Number.isFinite(lsMed) ? lsMed! : 0,
    lsMax: Number.isFinite(lsMax) ? lsMax! : 0,
    maxGen,
    genHist,
    geneByGen,
    earlyMeans,
    lateMeans,
    topDynasty: top1,
    topDynastyShare: born.length > 0 ? top1 / born.length : 0,
    top1to2: top2 > 0 ? top1 / top2 : top1 > 0 ? Infinity : 0,
    unattributedBreeds,
    reportMd: report,
  };
}

// ── Seeds-spec parser: "3" | "1-5" | "1,3,7" ──────────────────────────────────────────────────────────
export function parseSeeds(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const t = part.trim();
    const m = t.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let s = Math.min(a, b); s <= Math.max(a, b); s++) out.push(s);
    } else if (/^\d+$/.test(t)) {
      out.push(Number(t));
    }
  }
  return out.length > 0 ? out : [1];
}

// ── Driver ────────────────────────────────────────────────────────────────────────────────────────────
// Only run the CLI when executed directly — importing this module (e.g. for DEMO_OVERRIDES) must be
// side-effect-free, or the importer would trigger a full life-history run on its own argv.
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DEMO = FLAGS.includes('--demo');
// Any `--key=value` flag (other than the valueless --demo) is a config override, applied ON TOP of the
// demo overrides: e.g. `--demo --hungerGatesFood=true --basalCost=0.08`. Coerces true/false/number.
const setOverrides: Record<string, unknown> = {};
for (const f of FLAGS) {
  const eq = f.indexOf('=');
  if (eq < 0) continue; // valueless flag (--demo)
  const key = f.slice(2, eq);
  const raw = f.slice(eq + 1);
  setOverrides[key] =
    raw === 'true' ? true : raw === 'false' ? false : /^-?\d*\.?\d+$/.test(raw) ? Number(raw) : raw;
}
const OVERRIDES: Partial<Config> = { ...(DEMO ? DEMO_OVERRIDES : {}), ...(setOverrides as Partial<Config>) };
const TICKS = Number(POS[0] ?? 6000);
const SEEDS = parseSeeds(POS[1] ?? '1-5');
const STRIDE = Number(POS[2] ?? 5); // store a full sample every STRIDE ticks (detection is per-tick)

const results: SeedResult[] = [];
for (const seed of SEEDS) {
  const ovStr = Object.keys(setOverrides).length ? ` ${JSON.stringify(setOverrides)}` : '';
  process.stderr.write(`[seed ${seed}] running ${TICKS} ticks${DEMO ? ' (DEMO config)' : ''}${ovStr}…\n`);
  const r = runSeed(seed, TICKS, STRIDE, OVERRIDES);
  results.push(r);
  process.stderr.write(
    `[seed ${seed}] ${r.alive ? 'ALIVE' : 'EXTINCT'} pop ${r.finalPop} · births ${r.totalBirths} · ` +
      `maxGen ${r.maxGen} · bred ${r.bredPct.toFixed(0)}% · topDynasty ${r.topDynasty} ` +
      `(${(100 * r.topDynastyShare).toFixed(0)}% of births) · Δbirths ${r.unattributedBreeds === 0 ? 'ok' : 'WARN'}\n`,
  );
}

// Single seed → the per-seed report IS the answer; print it (matches the old single-seed behavior).
if (results.length === 1) {
  console.log(results[0]!.reportMd);
  console.log(`\n[wrote life-histories-seed${SEEDS[0]}.md and .csv]`);
} else {
  // ── Cross-seed aggregate ──
  const A: string[] = [];
  const p = (s = '') => A.push(s);
  const n = results.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const fmtRange = (xs: number[], dp = 0) =>
    `${mean(xs).toFixed(dp)} [${Math.min(...xs).toFixed(dp)}–${Math.max(...xs).toFixed(dp)}]`;

  p(`# Life-history — cross-seed aggregate (${n} seeds: ${SEEDS.join(', ')}, ${TICKS} ticks each)`);
  p();
  p(
    `Separates typical dynamics from single-run flukes. Each seed is an independent world (different RNG, ` +
      `same config). Per-seed reports: life-histories-seed{S}.md.`,
  );
  p();
  p(`## Per-seed headline`);
  p('```');
  p('seed  state    pop   births  maxGen  bred%   topDyn  share%  top1:2');
  for (const r of results) {
    p(
      `${String(r.seed).padStart(4)}  ${(r.alive ? 'ALIVE' : 'EXTINCT').padEnd(7)} ` +
        `${String(r.finalPop).padStart(5)} ${String(r.totalBirths).padStart(7)} ` +
        `${String(r.maxGen).padStart(7)} ${r.bredPct.toFixed(0).padStart(5)}% ` +
        `${String(r.topDynasty).padStart(7)} ${(100 * r.topDynastyShare).toFixed(0).padStart(5)}% ` +
        `${(r.top1to2 === Infinity ? '∞' : r.top1to2.toFixed(1)).padStart(6)}`,
    );
  }
  p('```');
  p();
  p(`## Cross-seed summary (mean [min–max])`);
  p(`- Survived to run end: **${results.filter((r) => r.alive).length}/${n} seeds**`);
  p(`- Final population: ${fmtRange(results.map((r) => r.finalPop))}`);
  p(`- Total births: ${fmtRange(results.map((r) => r.totalBirths))}`);
  p(`- Deepest generation: ${fmtRange(results.map((r) => r.maxGen))}`);
  p(
    `- % ever reproduced: ${fmtRange(
      results.map((r) => r.bredPct),
      0,
    )}%`,
  );
  p(`- Median lifespan: ${fmtRange(results.map((r) => r.lsMed))} ticks`);
  p();
  p(`## Monopoly check — is one dynasty's dominance typical or a fluke?`);
  p(
    `Top dynasty = the single founder with the most transitive descendants. "share%" = that dynasty as a ` +
      `fraction of ALL in-sim births; "top1:2" = its size over the 2nd-largest dynasty (monopoly sharpness).`,
  );
  p(
    `- Top-dynasty share of births: **${fmtRange(
      results.map((r) => 100 * r.topDynastyShare),
      0,
    )}%**`,
  );
  const ratios = results.map((r) => r.top1to2).filter((x) => Number.isFinite(x));
  p(
    `- top1:2 ratio: ${ratios.length ? fmtRange(ratios, 1) : 'n/a'}` +
      `${ratios.length < n ? ` (${n - ratios.length} seed(s) had a single dynasty → ∞)` : ''}`,
  );
  const monopolySeeds = results.filter((r) => r.topDynastyShare >= 0.5).length;
  p(
    `- Verdict: ${monopolySeeds}/${n} seeds had a SINGLE dynasty owning ≥50% of births → ` +
      `${monopolySeeds >= Math.ceil(n / 2) ? 'monopoly dominance is **TYPICAL**, not a fluke.' : monopolySeeds === 0 ? 'no seed showed monopoly — the earlier single-run dominance was a **FLUKE**.' : 'mixed — monopoly happens in some seeds but is not the rule.'}`,
  );
  p();

  // Per-gene early→late drift consistency across seeds: a trend is robust only if most seeds agree on sign.
  p(`## Gene drift consistency (early→late cohort Δ, per seed)`);
  p(
    `For each gene: how many of the ${n} seeds moved it up vs down, and the mean Δ. A trend is only ` +
      `believable if the seeds AGREE on direction — split votes mean drift, not selection.`,
  );
  p('```');
  p(`gene                 ↑seeds ↓seeds  meanΔ   agree?`);
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const deltas = results.map((r) => r.lateMeans[g]! - r.earlyMeans[g]!);
    const up = deltas.filter((d) => d > 1e-6).length;
    const down = deltas.filter((d) => d < -1e-6).length;
    const md = mean(deltas);
    const agree = Math.max(up, down) >= Math.ceil((n * 2) / 3) ? (up >= down ? '↑↑' : '↓↓') : '··';
    p(
      `${G[g]!.padEnd(20)} ${String(up).padStart(6)} ${String(down).padStart(6)} ` +
        `${(md >= 0 ? '+' : '') + md.toFixed(2)}`.padStart(8) +
        `   ${agree}`,
    );
  }
  p('```');
  p(`(agree? = ↑↑/↓↓ when ≥⅔ of seeds share a direction; ·· = no consensus)`);
  p();

  // Pooled generation-vs-gene plot: combine all individuals across seeds by generation depth. Pooling is
  // sound because generation depth is comparable across seeds, and it suppresses the per-seed noise that
  // makes deep, low-n generations jump around — the clearest read on WHEN a trait drifts.
  const poolMaxGen = Math.max(...results.map((r) => r.maxGen));
  const poolGenN = new Array<number>(poolMaxGen + 1).fill(0);
  const poolGeneSum: number[][] = Array.from({ length: poolMaxGen + 1 }, () =>
    new Array<number>(SCALAR_GENE_COUNT).fill(0),
  );
  for (const r of results) {
    for (let gg = 0; gg <= r.maxGen; gg++) {
      const cnt = r.genHist[gg]!;
      if (cnt === 0) continue;
      poolGenN[gg]! += cnt;
      for (let g = 0; g < SCALAR_GENE_COUNT; g++)
        poolGeneSum[gg]![g]! += r.geneByGen[gg]![g]! * cnt; // weight by seed's n
    }
  }
  const poolGeneMean: number[][] = poolGeneSum.map((row, gg) =>
    poolGenN[gg]! > 0 ? row.map((s) => s / poolGenN[gg]!) : row.map(() => NaN),
  );
  p(`## Generation-vs-gene plot — POOLED across all ${n} seeds`);
  p(
    `Mean birth-gene at each generation depth, pooled (weighted by per-seed n). Sparkline gen 0 → gen ` +
      `${poolMaxGen}; ▁ = gene's min across generations, █ = its max. This is the robust read on WHEN a ` +
      `trait (e.g. vision) drifts as lineages deepen.`,
  );
  p('```');
  const poolPopSeries = poolGenN.map((c) => (c > 0 ? c : NaN));
  p(
    `${'individuals/gen'.padEnd(20)} ${sparkline(poolPopSeries)}   gen0=${poolGenN[0]} … gen${poolMaxGen}=${poolGenN[poolMaxGen]}`,
  );
  p(`${''.padEnd(20)} ${'·'.repeat(poolMaxGen + 1)}`);
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const series = poolGeneMean.map((row, gg) => (poolGenN[gg]! > 0 ? row[g]! : NaN));
    const finite = series.filter((v) => Number.isFinite(v));
    const first = finite[0]!;
    const last = finite[finite.length - 1]!;
    const d = last - first;
    const arrow = Math.abs(d) < 1e-6 ? ' ' : d > 0 ? '↑' : '↓';
    p(
      `${G[g]!.padEnd(20)} ${sparkline(series)}   ${first.toFixed(2).padStart(7)} → ${last.toFixed(2).padStart(7)}  ${arrow}`,
    );
  }
  p('```');
  p();

  const aggReport = A.join('\n');
  console.log(aggReport);
  const aggPath = 'life-histories-multiseed.md';
  writeFileSync(aggPath, aggReport + '\n');
  console.log(
    `\n[wrote ${aggPath} + ${n} per-seed life-histories-seed{${SEEDS.join(',')}}.md/.csv]`,
  );
}
} // end if (isMain)
