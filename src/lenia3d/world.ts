/**
 * Lenia 3D deterministic core. Each creature is a Particle-Lenia cluster: its body/gait EMERGE from
 * the kernel+growth dynamics, and a food-seeking CoM drift adds the ecological leg. Economy (eat →
 * energy → reproduce/die) + evolution (mutation at birth, pure-economic selection) drive the world.
 *
 * Determinism contract: the only entropy is the Rng, drawn ONLY at seed/birth/mutation/food-spawn —
 * never inside a per-tick force computation. A tick is a pure function of state. Renderer is one-way.
 */
import { Rng } from '../core/rng';
import { G, GENE_COUNT, seedGenome, mutateFrom } from './genome';

export interface LeniaConfig {
  seed: number;
  worldSize: number; // cube edge length (toroidal wrap)
  dt: number; // Lenia integration timestep
  maxCreatures: number;
  initialCreatures: number;
  foodCount: number; // target live food particles
  foodEnergy: number; // energy per food eaten
  basalCost: number; // per-tick base metabolism
  reproOverhead: number; // extra energy lost per birth
  initialEnergy: number; // energy seeded founders start with
  eatRadius: number; // food within this of CoM is eaten (world units)
  founderSigma: number;
  mutationSigma: number;
  foodSeekStrength: number; // global multiplier on the food-seeking drift
  particleStepClamp: number; // max per-particle displacement per tick (stability)
}

export function defaultLeniaConfig(over: Partial<LeniaConfig> = {}): LeniaConfig {
  return {
    seed: 1,
    worldSize: 120,
    dt: 0.1,
    maxCreatures: 240,
    initialCreatures: 40,
    foodCount: 800,
    foodEnergy: 18,
    basalCost: 0.06,
    reproOverhead: 8,
    initialEnergy: 90,
    eatRadius: 8,
    founderSigma: 0.12,
    mutationSigma: 0.1,
    foodSeekStrength: 3.5,
    particleStepClamp: 0.6,
    ...over,
  };
}

export interface Creature {
  id: number;
  gen: number;
  genes: Float32Array;
  n: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  energy: number;
  age: number;
  // cached CoM
  cx: number;
  cy: number;
  cz: number;
}

/** Toroidal delta on [0, size), returning the shortest signed wrap. */
function tdiff(a: number, b: number, size: number): number {
  let d = a - b;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}

export class World {
  cfg: LeniaConfig;
  rng: Rng;
  tick = 0;
  totalBirths = 0;
  totalDeaths = 0;
  private nextId = 1;
  creatures: Creature[] = [];

  // food (SoA — many particles, hot loop)
  foodCount: number;
  fx: Float32Array;
  fy: Float32Array;
  fz: Float32Array;
  fAlive: Uint8Array;

  constructor(cfg: LeniaConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.foodCount = cfg.foodCount;
    this.fx = new Float32Array(cfg.foodCount);
    this.fy = new Float32Array(cfg.foodCount);
    this.fz = new Float32Array(cfg.foodCount);
    this.fAlive = new Uint8Array(cfg.foodCount);
    this.seedWorld();
  }

  private makeCreature(genes: Float32Array, cx: number, cy: number, cz: number, energy: number, gen: number): Creature {
    const n = Math.round(genes[G.N]!) | 0;
    const muK = genes[G.MU_K]!;
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pz = new Float32Array(n);
    // Seed particles on a spherical shell of radius ~muK (on the kernel peak → best chance of
    // self-organizing into a stable form). Small jitter breaks symmetry so it isn't a degenerate ring.
    for (let i = 0; i < n; i++) {
      // Fibonacci sphere for even shell coverage + jitter.
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const r = muK * (0.85 + this.rng.float() * 0.3);
      px[i] = cx + r * Math.sin(phi) * Math.cos(theta);
      py[i] = cy + r * Math.sin(phi) * Math.sin(theta);
      pz[i] = cz + r * Math.cos(phi);
    }
    return {
      id: this.nextId++,
      gen,
      genes,
      n,
      px,
      py,
      pz,
      energy,
      age: 0,
      cx,
      cy,
      cz,
    };
  }

  private seedWorld(): void {
    for (let i = 0; i < this.cfg.initialCreatures; i++) {
      const genes = new Float32Array(GENE_COUNT);
      seedGenome(genes, this.rng, this.cfg.founderSigma);
      const s = this.cfg.worldSize;
      const c = this.makeCreature(
        genes,
        this.rng.float() * s,
        this.rng.float() * s,
        this.rng.float() * s,
        this.cfg.initialEnergy,
        0,
      );
      this.creatures.push(c);
    }
    for (let i = 0; i < this.foodCount; i++) this.spawnFood(i);
  }

  private spawnFood(i: number): void {
    const s = this.cfg.worldSize;
    this.fx[i] = this.rng.float() * s;
    this.fy[i] = this.rng.float() * s;
    this.fz[i] = this.rng.float() * s;
    this.fAlive[i] = 1;
  }

  get population(): number {
    return this.creatures.length;
  }

  /** Advance one tick: Lenia dynamics → economy → evolution. Pure function of state. */
  step(): void {
    this.tick++;
    const { dt, worldSize, foodSeekStrength, particleStepClamp } = this.cfg;
    const cap2 = particleStepClamp * particleStepClamp;
    const pending: Creature[] = []; // births queued during the loop, resolved after the death pass

    for (let ci = 0; ci < this.creatures.length; ci++) {
      const c = this.creatures[ci]!;
      const g = c.genes;
      const muK = g[G.MU_K]!, sigmaK = g[G.SIGMA_K]!, wK = g[G.W_K]!;
      const muG = g[G.MU_G]!, sigmaG = g[G.SIGMA_G]!, cRep = g[G.C_REP]!;
      const n = c.n;
      const px = c.px, py = c.py, pz = c.pz;

      // CoM (pre-step) for food-seeking direction.
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < n; i++) { sx += px[i]!; sy += py[i]!; sz += pz[i]!; }
      const cx = sx / n, cy = sy / n, cz = sz / n;

      // Nearest food → food-seeking DIRECTION. Applied as a RIGID translation after the Lenia step
      // (not a per-particle force): the emergent body form is shaped by pure Lenia dynamics, then the
      // whole cluster glides toward food — no force-distortion or clamp-wash-out. Capped by MAX_SPEED.
      let ffx = 0, ffy = 0, ffz = 0;
      let nbest = -1, nbestD = Infinity;
      for (let f = 0; f < this.foodCount; f++) {
        if (!this.fAlive[f]) continue;
        const dx = tdiff(cx, this.fx[f]!, worldSize);
        const dy = tdiff(cy, this.fy[f]!, worldSize);
        const dz = tdiff(cz, this.fz[f]!, worldSize);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nbestD) { nbestD = d2; nbest = f; }
      }
      if (nbest >= 0) {
        const dx = tdiff(this.fx[nbest]!, cx, worldSize);
        const dy = tdiff(this.fy[nbest]!, cy, worldSize);
        const dz = tdiff(this.fz[nbest]!, cz, worldSize);
        const d = Math.sqrt(nbestD) || 1;
        const mag = g[G.HUNGER]! * foodSeekStrength;
        ffx = (dx / d) * mag; ffy = (dy / d) * mag; ffz = (dz / d) * mag;
      }
      let fsx = dt * ffx, fsy = dt * ffy, fsz = dt * ffz;
      const maxStep = g[G.MAX_SPEED]!;
      const fm = fsx * fsx + fsy * fsy + fsz * fsz;
      if (fm > maxStep * maxStep) {
        const k = maxStep / Math.sqrt(fm);
        fsx *= k; fsy *= k; fsz *= k;
      }

      // ── Particle-Lenia intra-cluster forces: dp/dt = ∇G − ∇R (first-order Euler, pure) ──────
      const invSigK2 = 1 / (sigmaK * sigmaK);
      const invSigG2 = 1 / (sigmaG * sigmaG);
      for (let i = 0; i < n; i++) {
        let U = 0, gx = 0, gy = 0, gz = 0, rx = 0, ry = 0, rz = 0;
        const xi = px[i]!, yi = py[i]!, zi = pz[i]!;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = tdiff(xi, px[j]!, worldSize);
          const dy = tdiff(yi, py[j]!, worldSize);
          const dz = tdiff(zi, pz[j]!, worldSize);
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const kd = muK - d;
          const K = wK * Math.exp(-(kd * kd) * invSigK2);
          U += K;
          const Kp = K * (-2 * kd) * invSigK2; // dK/dd
          const invd = 1 / d;
          gx += Kp * dx * invd; gy += Kp * dy * invd; gz += Kp * dz * invd;
          if (d < 1) {
            const f = cRep * (1 - d);
            rx += f * dx * invd; ry += f * dy * invd; rz += f * dz * invd;
          }
        }
        // ∇G = G'(U)·∇U; G'(u) = G(u)·(−2(u−muG)/sigmaG²).
        const ug = U - muG;
        const Gv = Math.exp(-(ug * ug) * invSigG2);
        const Gp = Gv * (-2 * ug) * invSigG2;
        let stepx = dt * (Gp * gx + rx);
        let stepy = dt * (Gp * gy + ry);
        let stepz = dt * (Gp * gz + rz);
        const m = stepx * stepx + stepy * stepy + stepz * stepz;
        if (m > cap2) {
          const s = particleStepClamp / Math.sqrt(m);
          stepx *= s; stepy *= s; stepz *= s;
        }
        // Lenia step + rigid food translation, then toroidal wrap.
        let nx = xi + stepx + fsx, ny = yi + stepy + fsy, nz = zi + stepz + fsz;
        if (nx < 0) nx += worldSize; else if (nx >= worldSize) nx -= worldSize;
        if (ny < 0) ny += worldSize; else if (ny >= worldSize) ny -= worldSize;
        if (nz < 0) nz += worldSize; else if (nz >= worldSize) nz -= worldSize;
        px[i] = nx; py[i] = ny; pz[i] = nz;
      }

      // CoM (post-step) for economy.
      sx = 0; sy = 0; sz = 0;
      for (let i = 0; i < n; i++) { sx += px[i]!; sy += py[i]!; sz += pz[i]!; }
      c.cx = sx / n; c.cy = sy / n; c.cz = sz / n;

      // ── Economy ─────────────────────────────────────────────────────────────────────────────
      c.age++;
      const comDriftSq = fsx * fsx + fsy * fsy + fsz * fsz;
      c.energy -= this.cfg.basalCost + g[G.MOVE_COST]! * comDriftSq * 100;

      // Eat nearest food within eatRadius of CoM.
      let best = -1;
      let bestD = this.cfg.eatRadius * this.cfg.eatRadius;
      for (let f = 0; f < this.foodCount; f++) {
        if (!this.fAlive[f]) continue;
        const dx = tdiff(c.cx, this.fx[f]!, worldSize);
        const dy = tdiff(c.cy, this.fy[f]!, worldSize);
        const dz = tdiff(c.cz, this.fz[f]!, worldSize);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD) { bestD = d2; best = f; }
      }
      if (best >= 0) {
        this.fAlive[best] = 0;
        c.energy += this.cfg.foodEnergy;
      }

      // Reproduce (asexual clone+mutate; sexual reproduction is a later brick). Births are QUEUED
      // and resolved after the death pass so the cap culls the globally-weakest (constant selection
      // even at saturation), not whoever happened to breed last.
      if (c.energy >= g[G.REPRO_THRESHOLD]! + g[G.BIRTH_ENERGY]! + this.cfg.reproOverhead) {
        const childGenes = mutateFrom(c.genes, this.rng, this.cfg.mutationSigma);
        const off = muK * 1.5;
        pending.push(
          this.makeCreature(
            childGenes,
            (c.cx + off) % worldSize,
            (c.cy + off) % worldSize,
            (c.cz + off) % worldSize,
            g[G.BIRTH_ENERGY]!,
            c.gen + 1,
          ),
        );
        c.energy -= g[G.BIRTH_ENERGY]! + this.cfg.reproOverhead;
        this.totalBirths++;
      }
    }

    // ── Deaths: energy≤0 → remove + corpse → food ─────────────────────────────────────────────
    for (let ci = this.creatures.length - 1; ci >= 0; ci--) {
      const c = this.creatures[ci]!;
      if (c.energy <= 0 || !Number.isFinite(c.cx)) {
        let placed = 0;
        for (let f = 0; f < this.foodCount && placed < c.n; f++) {
          if (!this.fAlive[f]) {
            this.fx[f] = c.px[placed]!;
            this.fy[f] = c.py[placed]!;
            this.fz[f] = c.pz[placed]!;
            this.fAlive[f] = 1;
            placed++;
          }
        }
        this.creatures.splice(ci, 1);
        this.totalDeaths++;
      }
    }

    // ── Resolve queued births: add each, culling the globally-weakest creature when at the cap ──
    // (constant selection at saturation — the weakest is outcompeted for the newborn's slot). Culled
    // creatures leave NO corpse food (outcompeted, not starved) to keep the food budget clean.
    for (let pi = 0; pi < pending.length; pi++) {
      if (this.creatures.length >= this.cfg.maxCreatures) {
        let minI = 0;
        let minE = Infinity;
        for (let k = 0; k < this.creatures.length; k++) {
          if (this.creatures[k]!.energy < minE) {
            minE = this.creatures[k]!.energy;
            minI = k;
          }
        }
        this.creatures.splice(minI, 1);
        this.totalDeaths++;
      }
      this.creatures.push(pending[pi]!);
    }

    // ── Food maintenance: drift + respawn to target count ─────────────────────────────────────
    for (let f = 0; f < this.foodCount; f++) {
      if (!this.fAlive[f]) {
        if (this.rng.float() < 0.08) this.spawnFood(f);
        continue;
      }
      this.fx[f] = (this.fx[f]! + (this.rng.float() - 0.5) * 0.3 + worldSize) % worldSize;
      this.fy[f] = (this.fy[f]! + (this.rng.float() - 0.5) * 0.3 + worldSize) % worldSize;
      this.fz[f] = (this.fz[f]! + (this.rng.float() - 0.5) * 0.3 + worldSize) % worldSize;
    }
  }
}
