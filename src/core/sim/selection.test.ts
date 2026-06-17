import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome, buildHandicappedForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { type Genome } from '../genome/genome';

const FIT = 1.5;
const UNFIT = 0.2;
const PAIRS = 12; // FIT + UNFIT foragers each
const PLANTS = 2500;
const TICKS = 3000;
const SAMPLE_FROM = 1200; // start sampling after the first boom-bust bottleneck has separated the alleles
const SAMPLE_EVERY = 100;

function spawn(w: World, genome: Genome, x: number, y: number): void {
  const cfg = w.config;
  const ref = w.genomes.register(genome);
  const body = develop(genome, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    0,
    cfg.worldWidth,
    cfg.worldHeight,
    w.instantiateScratch,
  );
}

/**
 * Bucket live genome-organisms by their sensorLat→turn weight (preGene 2 → postGene 3).
 * Mutation is OFF, so clones preserve the founder's weight exactly — attribution is exact.
 */
function countByFitness(w: World): { fit: number; unfit: number } {
  const o = w.organisms;
  let fit = 0;
  let unfit = 0;
  for (let org = 1; org < o.maxOrganisms; org++) {
    if (!o.isAlive(org) || o.cellCount[org]! === 0) continue;
    const ref = o.genomeRef[org]!;
    if (ref < 0) continue;
    const g = w.genomes.get(ref);
    if (!g) continue;
    const c = g.connectionRules.find((r) => r.preGene === 2 && r.postGene === 3);
    if (!c) continue;
    if (c.weight >= 1.0) fit++;
    else unfit++;
  }
  return { fit, unfit };
}

describe('economic selection (no fitness function)', () => {
  it('fit foragers out-reproduce unfit competing in the same scarce economy', () => {
    const cfg = defaultConfig({
      seed: 4,
      maxCells: 6000,
      worldWidth: 512,
      worldHeight: 512,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
      reproThreshold: 700,
      reproParentFloor: 120,
      organismDeathFloor: 0,
      lightRegen: 0.07, // scarcity — the binding constraint that makes steering-toward-food selectable
      // mutation OFF (defaults) — clones preserve the steering weight, so attribution is exact.
    });
    const w = new World(cfg, false);
    w.seedLife(PLANTS);
    // Interleave fit/unfit at mirrored positions so neither gets a spatial advantage.
    for (let k = 0; k < PAIRS; k++) {
      const x = cfg.worldWidth * (0.12 + 0.76 * (k / PAIRS));
      spawn(w, buildForagerGenome(cfg.cellRadius, 100), x, cfg.worldHeight * 0.4);
      spawn(w, buildHandicappedForagerGenome(cfg.cellRadius, 100, UNFIT), x, cfg.worldHeight * 0.6);
    }
    // Accumulate counts over the post-bottleneck back-half. A single endpoint snapshot is
    // boom-bust cycle-phase noise; integrating over many samples is what makes the signal robust.
    let sumFit = 0;
    let sumUnfit = 0;
    let fitEverExtinct = false;
    for (let t = 1; t <= TICKS; t++) {
      w.tick();
      if (t === 1) {
        // Founder non-vacuity, checked after the first tick's aggregation pass populates
        // cellCount (instantiateBody leaves it 0 until tick() runs aggregateOrganisms): all
        // PAIRS fit + PAIRS unfit are present and bucketed correctly before selection acts.
        const start = countByFitness(w);
        expect(start.fit).toBe(PAIRS);
        expect(start.unfit).toBe(PAIRS);
      }
      if (t > SAMPLE_FROM && t % SAMPLE_EVERY === 0) {
        const c = countByFitness(w);
        sumFit += c.fit;
        sumUnfit += c.unfit;
        if (c.fit === 0) fitEverExtinct = true;
      }
    }

    // Non-vacuity: both alleles were actually present to compete (the unfit lineage didn't
    // vanish at t=0), and the fit lineage never drift-extincted.
    expect(sumUnfit).toBeGreaterThan(0);
    expect(fitEverExtinct).toBe(false);
    // Selection: integrated over the cycle, the fit lineage out-reproduces the unfit one by a
    // comfortable margin (observed ratio ≈2.98× — the 1.5× bar leaves wide headroom).
    expect(sumFit).toBeGreaterThan(sumUnfit * 1.5);
    void FIT;
  }, 30000); // 3000 ticks on a 6000-cell forager world exceeds the 5s default (cf. reproducibility.test.ts)
});
