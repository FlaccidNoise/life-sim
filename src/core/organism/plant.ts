import { type CellStore } from '../memory/cell-store';
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { CellType } from '../cells/types';
import { hashFloat3 } from '../math/rng';
import { wrap, wrapDelta } from '../math/vec2';

/**
 * Sessile chain-plant lifecycle (the sessilePlants model). A plant is an organism of PHOTO cells:
 * a pinned tough BASE (`anchored=1`) + a bonded chain of up to `plantMaxChain` cells. These steps
 * reuse the existing bond/organism/photosynthesis machinery — they only add structural transitions:
 *   - severEatenChainCells: a drained chain/base PHOTO cell severs; cells cut off from every base
 *     become MEAT (the only per-cell plant death path; organism cells stay lifecycle-exempt).
 *   - growPlants: a plant with spare organism energy grows one PHOTO tip cell along its base→tip axis.
 *   - producePlantSpores: a mature plant ejects ONE free PHOTO spore with a deterministic impulse.
 *   - settleSpores: a free PHOTO spore that has slowed below plantSettleSpeed anchors into a new base.
 *
 * All steps iterate the live set in ascending slot order; the only randomness is hashFloat3
 * (RNG-free); the caller rebuilds the live-bond set after any structural change. `anchored` is on
 * the determinism contract because it drives physics (integrator pins anchored cells).
 *
 * Scratch buffers (stamp + queue, both length ≥ maxCells) are reused across calls via an
 * epoch-stamped visited set (no per-call clear), exactly like SplitChecker. One monotonic epoch
 * per severEatenChainCells call; correct for < 2^31 calls.
 */
export class PlantSystem {
  private readonly stamp: Int32Array;
  private readonly queue: Int32Array;
  private epoch: number;

  constructor(maxCells: number) {
    this.stamp = new Int32Array(maxCells);
    this.queue = new Int32Array(maxCells);
    this.epoch = 0;
  }

  /**
   * Sever drained plant PHOTO cells and free anything cut off from a base to MEAT.
   *
   * A chain or base PHOTO cell of a plant organism drained to `energy <= 0` (by a grazing
   * heterotroph) is severed: all its bonds are stripped and it becomes MEAT. After all drained
   * cells are severed this tick, a multi-source reachability flood from every anchored base (over
   * PHOTO cells only, so creatures are never touched) frees any plant cell not reached from a base
   * to MEAT — the chain above a cut drifts off. Draining the BASE frees the whole remaining chain
   * (the base is no longer a seed → the rest is unreachable → plant dies). One rebuildLive after.
   *
   * `bondsBrokeThisTick` forces the reachability reap even when nothing was drained: a plant chain
   * bond that over-stretches is removed by breakStrainedBonds, which then relabels the detached
   * fragment to a FRESH organism id (split-on-break) — a baseless, immortal, photosynthesising plant
   * fragment that leaks organism ids and inflates the PHOTO field until the economy cascades. Reusing
   * the base-reachability reap collapses any such fragment to MEAT, regardless of HOW it was cut.
   *
   * Cheap early-out: when nothing was drained AND no bond broke, there is no new disconnection, so
   * the BFS is skipped.
   */
  severEatenChainCells(
    cells: CellStore,
    bonds: BondNetwork,
    live: Uint32Array,
    n: number,
    meatEnergyOnDeath: number,
    bondsBrokeThisTick: boolean,
  ): void {
    const f = cells.fields;
    const cap = bonds.degreeCap;

    // Pass 1: sever every drained plant PHOTO cell (chain or base) into MEAT.
    let severed = 0;
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      if (f.cellType[i]! !== CellType.PHOTO) continue;
      if (f.organismId[i]! === 0) continue; // free PHOTO = unsettled spore, not a plant cell
      if (f.energy[i]! > 0) continue;
      this.meatify(f, bonds, cap, i, meatEnergyOnDeath);
      severed++;
    }
    if (severed === 0 && !bondsBrokeThisTick) return;

    // Pass 2: multi-source reachability from all anchored bases over PHOTO cells, on the
    // post-sever adjacency. Seed in ascending slot order (result is order-independent; ascending
    // honours the determinism contract).
    const stamp = this.stamp;
    const queue = this.queue;
    const adj = bonds.adj;
    const degree = bonds.degree;
    const cellA = bonds.cellA;
    const cellB = bonds.cellB;
    const e = ++this.epoch;
    let head = 0;
    let tail = 0;
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      if (f.cellType[i]! !== CellType.PHOTO) continue;
      if (f.anchored[i]! === 0) continue;
      if (f.organismId[i]! === 0) continue;
      if (stamp[i] === e) continue;
      stamp[i] = e;
      queue[tail++] = i;
    }
    while (head < tail) {
      const c = queue[head++]!;
      const off = c * cap;
      const d = degree[c]!;
      for (let kk = 0; kk < d; kk++) {
        const s = adj[off + kk]!;
        const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
        if (stamp[nb] === e) continue;
        if (f.cellType[nb]! !== CellType.PHOTO) continue; // PHOTO-only flood (plants only bond PHOTO)
        stamp[nb] = e;
        queue[tail++] = nb;
      }
    }

    // Pass 3: harvest — any plant PHOTO cell not reached from a base becomes MEAT.
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      if (f.cellType[i]! !== CellType.PHOTO) continue;
      if (f.organismId[i]! === 0) continue;
      if (stamp[i] === e) continue;
      this.meatify(f, bonds, cap, i, meatEnergyOnDeath);
    }

    bonds.rebuildLive(cells);
  }

  /** Convert plant cell `i` to free drifting MEAT (mirrors killStarvedOrganisms; PHOTO is non-neural
   *  so the neural-binding cleanup is a no-op and skipped). Strips all bonds; unanchors so debris
   *  can't re-root and the integrator stops pinning it. */
  private meatify(
    f: CellStore['fields'],
    bonds: BondNetwork,
    cap: number,
    i: number,
    meatEnergyOnDeath: number,
  ): void {
    while (bonds.degree[i]! > 0) bonds.removeBond(bonds.adj[i * cap]!);
    f.cellType[i] = CellType.MEAT;
    f.energy[i] = f.mass[i]! * meatEnergyOnDeath;
    f.organismId[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.thrust[i] = 0;
    f.anchored[i] = 0;
  }

  /**
   * Grow one PHOTO tip cell on each plant with room (organism cell count < plantMaxChain) and spare
   * organism energy (≥ plantGrowthThreshold). The new cell is placed one bond length out from the
   * most-distal cell along the base→tip axis (deterministic hashFloat3 jitter), bonded to that tip,
   * organismId = the plant, anchored = 0. Costs plantGrowthCost, deducted from the base. One
   * rebuildLive after if anything grew.
   *
   * organism cell counts come from `organisms.cellCount` (refreshed by the tick's aggregateOrganisms,
   * which runs before this step); per-plant work scans the small live set for the base + tip.
   */
  growPlants(
    cells: CellStore,
    bonds: BondNetwork,
    organisms: OrganismTable,
    live: Uint32Array,
    n: number,
    seed: number,
    tick: number,
    worldWidth: number,
    worldHeight: number,
    plantMaxChain: number,
    plantGrowthThreshold: number,
    plantGrowthCost: number,
    plantBondLen: number,
  ): void {
    const f = cells.fields;
    let grew = false;

    for (let k = 0; k < n; k++) {
      const base = live[k]!;
      if (f.anchored[base]! === 0) continue; // only a base drives growth (one anchored cell per plant)
      if (f.cellType[base]! !== CellType.PHOTO) continue;
      const org = f.organismId[base]!;
      if (org === 0) continue;
      if (organisms.cellCount[org]! >= plantMaxChain) continue;
      if (organisms.energy[org]! < plantGrowthThreshold) continue;
      if (f.energy[base]! < plantGrowthCost) continue; // the cost is paid from the base

      // Most-distal cell from the base (BFS over the small chain), ascending-slot tiebreak via the
      // ascending neighbour push + first-found-at-max-depth wins on equal depth.
      const tip = this.mostDistalCell(bonds, base);

      const child = cells.alloc();
      if (child < 0) break; // at capacity — refuse-new
      // Axis = base→tip direction; for a 1-cell plant (tip === base) use a hashed angle.
      let ax: number;
      let ay: number;
      if (tip === base) {
        const angle = hashFloat3(seed, tick, base) * Math.PI * 2;
        ax = Math.cos(angle);
        ay = Math.sin(angle);
      } else {
        const dx = wrapDelta(f.posX[tip]! - f.posX[base]!, worldWidth);
        const dy = wrapDelta(f.posY[tip]! - f.posY[base]!, worldHeight);
        const dlen = Math.sqrt(dx * dx + dy * dy) || 1;
        ax = dx / dlen;
        ay = dy / dlen;
      }
      const jitter = (hashFloat3(seed, tick, child) - 0.5) * 0.5;
      const ca = Math.cos(jitter);
      const sa = Math.sin(jitter);
      const jx = ax * ca - ay * sa;
      const jy = ax * sa + ay * ca;

      f.posX[child] = wrap(f.posX[tip]! + jx * plantBondLen, worldWidth);
      f.posY[child] = wrap(f.posY[tip]! + jy * plantBondLen, worldHeight);
      f.velX[child] = 0;
      f.velY[child] = 0;
      f.forceX[child] = 0;
      f.forceY[child] = 0;
      f.radius[child] = f.radius[base]!;
      f.mass[child] = f.mass[base]!;
      f.energy[child] = 0;
      f.cellType[child] = CellType.PHOTO;
      f.organismId[child] = org;
      f.genomeRef[child] = 0;
      f.brainRef[child] = 0;
      f.age[child] = 0;
      f.heading[child] = 0;
      f.senseX[child] = 0;
      f.senseY[child] = 0;
      f.thrust[child] = 0;
      f.anchored[child] = 0;
      f.localDensity[child] = 0;

      bonds.addBond(tip, f.generation[tip]!, child, f.generation[child]!, plantBondLen, 1);
      f.energy[base] = f.energy[base]! - plantGrowthCost;
      grew = true;
    }

    if (grew) bonds.rebuildLive(cells);
  }

  /** BFS over the plant's small bond graph from `base`; returns the deepest cell (the growth tip).
   *  Ascending neighbour order + first-at-max-depth keeps the choice deterministic. */
  private mostDistalCell(bonds: BondNetwork, base: number): number {
    const stamp = this.stamp;
    const queue = this.queue;
    const adj = bonds.adj;
    const degree = bonds.degree;
    const cellA = bonds.cellA;
    const cellB = bonds.cellB;
    const cap = bonds.degreeCap;
    const e = ++this.epoch;
    let head = 0;
    let tail = 0;
    stamp[base] = e;
    queue[tail++] = base;
    let deepest = base; // last cell popped == a deepest-layer cell (BFS visits by depth)
    while (head < tail) {
      const c = queue[head++]!;
      deepest = c;
      const off = c * cap;
      const d = degree[c]!;
      for (let k = 0; k < d; k++) {
        const s = adj[off + k]!;
        const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
        if (stamp[nb] === e) continue;
        stamp[nb] = e;
        queue[tail++] = nb;
      }
    }
    return deepest;
  }

  /**
   * Emit ONE free PHOTO spore from each mature plant (organism cell count ≥ plantMaturityChain and
   * base energy ≥ plantSporeThreshold). The spore is a free PHOTO cell (organismId = 0, anchored = 0)
   * placed at the base with velocity plantSporeImpulse in a deterministic hashed direction; it drifts
   * (integrator carries residual velocity) until it slows below plantSettleSpeed and anchors. Costs
   * plantSporeCost from the base. No bond → no rebuildLive needed (the new cell is unbonded).
   */
  producePlantSpores(
    cells: CellStore,
    organisms: OrganismTable,
    live: Uint32Array,
    n: number,
    seed: number,
    tick: number,
    worldWidth: number,
    worldHeight: number,
    plantMaturityChain: number,
    plantSporeThreshold: number,
    plantSporeCost: number,
    plantSporeImpulse: number,
  ): void {
    const f = cells.fields;

    for (let k = 0; k < n; k++) {
      const base = live[k]!;
      if (f.anchored[base]! === 0) continue;
      if (f.cellType[base]! !== CellType.PHOTO) continue;
      const org = f.organismId[base]!;
      if (org === 0) continue;
      if (organisms.cellCount[org]! < plantMaturityChain) continue;
      if (f.energy[base]! < plantSporeThreshold) continue;

      const spore = cells.alloc();
      if (spore < 0) break; // at capacity — refuse-new
      const angle = hashFloat3(seed, tick, base) * Math.PI * 2;
      f.posX[spore] = wrap(f.posX[base]! + Math.cos(angle) * f.radius[base]!, worldWidth);
      f.posY[spore] = wrap(f.posY[base]! + Math.sin(angle) * f.radius[base]!, worldHeight);
      f.velX[spore] = Math.cos(angle) * plantSporeImpulse;
      f.velY[spore] = Math.sin(angle) * plantSporeImpulse;
      f.forceX[spore] = 0;
      f.forceY[spore] = 0;
      f.radius[spore] = f.radius[base]!;
      f.mass[spore] = f.mass[base]!;
      f.energy[spore] = 0;
      f.cellType[spore] = CellType.PHOTO;
      f.organismId[spore] = 0;
      f.genomeRef[spore] = 0;
      f.brainRef[spore] = 0;
      f.age[spore] = 0;
      f.heading[spore] = angle;
      f.senseX[spore] = 0;
      f.senseY[spore] = 0;
      f.thrust[spore] = 0;
      f.anchored[spore] = 0;
      f.localDensity[spore] = 0;
      f.energy[base] = f.energy[base]! - plantSporeCost;
    }
  }

  /**
   * Anchor any free PHOTO spore that has slowed below plantSettleSpeed into a new 1-cell base:
   * anchored = 1, a fresh organisms.alloc() id, velocity zeroed. A spore that settles in darkness
   * gets ~0 photosynthesis and starves before maturing (pockets self-select). Reads post-integrate
   * velocity, so this runs after integrate (placed alongside growPlants). Iterates ascending so the
   * organisms.alloc() consumption order is identical across same-seed runs. No rebuildLive needed
   * (anchoring adds no bond; the next aggregateOrganisms picks up the new organismId).
   */
  settleSpores(
    cells: CellStore,
    organisms: OrganismTable,
    live: Uint32Array,
    n: number,
    plantSettleSpeed: number,
    plantBaseDensityCap: number,
  ): void {
    const f = cells.fields;
    const settleSq = plantSettleSpeed * plantSettleSpeed;

    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      if (f.cellType[i]! !== CellType.PHOTO) continue;
      if (f.organismId[i]! !== 0) continue; // only free PHOTO = spores
      if (f.anchored[i]! === 1) continue;
      const vx = f.velX[i]!;
      const vy = f.velY[i]!;
      if (vx * vx + vy * vy >= settleSq) continue;
      // Plant-base density cap: a slowed spore in an already-crowded bucket does NOT anchor — it keeps
      // drifting (settles later or starves), so a pocket stays discrete patches with open water instead
      // of a packed wall. localDensity is filled by World.fillDensity only when crowdDivideCap is on; when
      // off it's 0 so this never triggers (no-op). Default cap 65535 (Uint16 max) is also a no-op.
      if (f.localDensity[i]! > plantBaseDensityCap) continue;
      const org = organisms.alloc();
      if (org < 0) continue; // pool exhausted → keep drifting, retry next tick
      f.organismId[i] = org;
      f.anchored[i] = 1;
      f.velX[i] = 0;
      f.velY[i] = 0;
    }
  }
}
