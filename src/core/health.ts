/**
 * Health / invariant scanner — a read-only sweep over the live population that flags state the sim
 * core should NEVER produce, so subtle breakage surfaces instead of silently corrupting a run. It is
 * the per-state half of safeguard #3 (the trajectory half — extinction / zero-births / flatline —
 * lives in the headless `--report`, which has the time-series this single snapshot can't see).
 *
 * The invariants checked are HARD guarantees of the core, not soft preferences:
 *   - nonfinite: every kinematic field, gene, and brain weight must be finite (NaN/±Inf = a bug).
 *   - oob: integrate() wraps toroidally, so a live creature's position is always in [0,world).
 *   - energy: cullDead() removes anything ≤0 each tick, but reproduce() runs AFTER the cull and can spend
 *           a parent down to exactly 0 giving birth (a valid transient — it grazes back up or is culled
 *           next tick). So NEGATIVE energy is the bug; exactly 0 on a live creature is allowed.
 *   - gene: every scalar gene is hard-clamped to [spec.min, spec.max] at seed AND every mutation,
 *           so a live value outside its range means the clamp was bypassed or memory was corrupted.
 *
 * Pure + DOM-free + allocation-bounded (the violation list is capped); reading state only, it can run
 * in headless, in tests, and from the browser console (`window.sim.health()`) against the same core.
 */
import { type World } from './world';
import { SCALAR_GENE_COUNT, SCALAR_GENE_SPECS, BRAIN_GENES } from './genome';

export type HealthViolationKind = 'nonfinite' | 'oob' | 'energy' | 'gene';

export interface HealthViolation {
  kind: HealthViolationKind;
  slot: number;
  field: string; // which array/gene tripped (e.g. 'vx', 'gene[3]=size', 'brain[2]')
  value: number;
}

export interface HealthReport {
  tick: number;
  population: number;
  ok: boolean; // true ⇔ no violations
  violations: HealthViolation[]; // capped at maxViolations
  violationCount: number; // total found (may exceed violations.length)
  byKind: Record<HealthViolationKind, number>; // total per kind (uncapped)
  energy: { min: number; mean: number; max: number; total: number };
  speed: { min: number; mean: number; max: number };
}

const GENE_NAMES = [
  'maxSpeed',
  'eatRate',
  'senseRange',
  'size',
  'maxTurn',
  'maxThrust',
  'metabEff',
  'reproThreshold',
  'satiatedThreshold',
  'birthEnergy',
  'diet',
  'damage',
  'visionRange',
  'visionFov',
  'visionAcuity',
  'shelterDrive',
  'cohesionDrive',
  'foragePref',
  'foragePrefC',
  'senseRangeB',
  'senseRangeC',
  'pheroDeposit',
  'maturityAge',
  'senescenceAge',
  'display',
  'preference',
  'damping',
] as const;

// Float32 storage can nudge a hard-clamped gene a hair past its (double) bound — e.g. 0.98 stores
// as 0.98000001907. Tolerate that tiny epsilon so the clamp's own rounding isn't a false violation.
const GENE_BOUNDS_EPS = 1e-4;

/**
 * Sweep the live population for invariant violations. `maxViolations` caps the returned list (the full
 * count is still reported in violationCount/byKind) so a fully-corrupt world can't blow up memory.
 */
export function scanHealth(world: World, maxViolations = 50): HealthReport {
  const s = world.store;
  const { worldWidth, worldHeight } = world.config;
  const { liveIndices, liveCount, x, y, vx, vy, heading, energy, scalarGenes, brain } = s;

  const violations: HealthViolation[] = [];
  const byKind: Record<HealthViolationKind, number> = { nonfinite: 0, oob: 0, energy: 0, gene: 0 };
  let violationCount = 0;

  const add = (kind: HealthViolationKind, slot: number, field: string, value: number): void => {
    byKind[kind]++;
    violationCount++;
    if (violations.length < maxViolations) violations.push({ kind, slot, field, value });
  };

  let eMin = Infinity;
  let eMax = -Infinity;
  let eTotal = 0;
  let spMin = Infinity;
  let spMax = -Infinity;
  let spTotal = 0;

  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;

    // ── nonfinite: kinematics ──
    const xi = x[i]!;
    const yi = y[i]!;
    const vxi = vx[i]!;
    const vyi = vy[i]!;
    const hi = heading[i]!;
    const ei = energy[i]!;
    if (!Number.isFinite(xi)) add('nonfinite', i, 'x', xi);
    if (!Number.isFinite(yi)) add('nonfinite', i, 'y', yi);
    if (!Number.isFinite(vxi)) add('nonfinite', i, 'vx', vxi);
    if (!Number.isFinite(vyi)) add('nonfinite', i, 'vy', vyi);
    if (!Number.isFinite(hi)) add('nonfinite', i, 'heading', hi);
    if (!Number.isFinite(ei)) add('nonfinite', i, 'energy', ei);

    // ── oob: positions must stay inside the toroidal world ──
    if (Number.isFinite(xi) && (xi < 0 || xi >= worldWidth)) add('oob', i, 'x', xi);
    if (Number.isFinite(yi) && (yi < 0 || yi >= worldHeight)) add('oob', i, 'y', yi);

    // ── energy: NEGATIVE is a bug (cull floor is ≤0); exactly 0 is a valid post-reproduce transient ──
    if (Number.isFinite(ei) && ei < 0) add('energy', i, 'energy', ei);

    // ── gene: finite + within its hard clamp range ──
    const gb = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
      const v = scalarGenes[gb + g]!;
      const name = `gene[${g}]=${GENE_NAMES[g]}`;
      if (!Number.isFinite(v)) {
        add('nonfinite', i, name, v);
        continue;
      }
      const spec = SCALAR_GENE_SPECS[g]!;
      if (v < spec.min - GENE_BOUNDS_EPS || v > spec.max + GENE_BOUNDS_EPS) add('gene', i, name, v);
    }

    // ── nonfinite: brain weights (unclamped, but must stay finite) ──
    const bb = i * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++) {
      const w = brain[bb + g]!;
      if (!Number.isFinite(w)) add('nonfinite', i, `brain[${g}]`, w);
    }

    // ── summary stats (only over finite values, so one NaN doesn't poison the aggregates) ──
    if (Number.isFinite(ei)) {
      if (ei < eMin) eMin = ei;
      if (ei > eMax) eMax = ei;
      eTotal += ei;
    }
    if (Number.isFinite(vxi) && Number.isFinite(vyi)) {
      const sp = Math.hypot(vxi, vyi);
      if (sp < spMin) spMin = sp;
      if (sp > spMax) spMax = sp;
      spTotal += sp;
    }
  }

  const n = liveCount;
  return {
    tick: world.tick,
    population: n,
    ok: violationCount === 0,
    violations,
    violationCount,
    byKind,
    energy: {
      min: n ? eMin : 0,
      mean: n ? eTotal / n : 0,
      max: n ? eMax : 0,
      total: eTotal,
    },
    speed: {
      min: n ? spMin : 0,
      mean: n ? spTotal / n : 0,
      max: n ? spMax : 0,
    },
  };
}
