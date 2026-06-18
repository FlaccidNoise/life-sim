import { allocateSoa, type SoaLayout } from './buffers';

/** Bit 0 of `flags` marks a slot as alive. */
export const FLAG_ALIVE = 1;

/** Concrete typed view of the cell SoA — each field with its real element type. */
export interface CellArrays {
  posX: Float64Array;
  posY: Float64Array;
  velX: Float32Array;
  velY: Float32Array;
  forceX: Float32Array;
  forceY: Float32Array;
  radius: Float32Array;
  mass: Float32Array;
  energy: Float32Array;
  cellType: Uint8Array;
  organismId: Uint32Array;
  genomeRef: Uint32Array;
  brainRef: Uint32Array;
  age: Uint32Array;
  heading: Float32Array;
  senseX: Float32Array;
  senseY: Float32Array;
  thrust: Float32Array;
  flags: Uint8Array;
  generation: Uint32Array;
  /** Local cell density = number of live cells sharing this cell's coarse density-grid bucket,
   *  recomputed each tick (World.fillDensity) before lifecycle. Drives the density-dependent PHOTO
   *  divide cap (a logistic carrying capacity). Derived — NOT on the byte-identical determinism
   *  contract. Only filled when the cap is enabled. */
  localDensity: Uint16Array;
  /** Predation LATCH: for a PREDATOR cell, the organismId it is currently latched onto (0 = unlatched).
   *  A latched predator keeps draining the SAME prey organism each tick (sustained kill) instead of
   *  re-acquiring a fresh target, so a contact converts to a kill even as the mobile prey moves —
   *  fixing the "≤1 cell/tick on an escaping body" pursuit problem. Only written when predLatchRange>0
   *  (else the predator branch degenerates to the old single-bite behaviour); 0 for all non-predators. */
  latchPrey: Uint32Array;
  /** Predation LATCH tether handle: the prey CELL index a latched predator drained this tick, stored
   *  as (cellIndex + 1) so 0 = none (typed arrays zero-init). Consumed by applyLatchTether in the next
   *  tick's force pass to spring the predator to its prey (the physical "attachment"). 0 when unlatched. */
  latchCell: Uint32Array;
  /** 1 ⇒ this cell is a pinned, tough plant BASE (the integrator zeroes its velocity/force each tick so
   *  it never moves); 0 ⇒ everything else (chain cells, creatures, spores, MEAT). Set deterministically
   *  (base-seeding, spore-settle) and ON the byte-identical determinism contract because it drives physics. */
  anchored: Uint8Array;
}

const CELL_FIELDS = [
  { name: 'posX', ctor: Float64Array },
  { name: 'posY', ctor: Float64Array },
  { name: 'velX', ctor: Float32Array },
  { name: 'velY', ctor: Float32Array },
  { name: 'forceX', ctor: Float32Array },
  { name: 'forceY', ctor: Float32Array },
  { name: 'radius', ctor: Float32Array },
  { name: 'mass', ctor: Float32Array },
  { name: 'energy', ctor: Float32Array },
  { name: 'cellType', ctor: Uint8Array },
  { name: 'organismId', ctor: Uint32Array },
  { name: 'genomeRef', ctor: Uint32Array },
  { name: 'brainRef', ctor: Uint32Array },
  { name: 'age', ctor: Uint32Array },
  { name: 'heading', ctor: Float32Array },
  { name: 'senseX', ctor: Float32Array },
  { name: 'senseY', ctor: Float32Array },
  { name: 'thrust', ctor: Float32Array },
  { name: 'flags', ctor: Uint8Array },
  { name: 'generation', ctor: Uint32Array },
  { name: 'localDensity', ctor: Uint16Array },
  { name: 'latchPrey', ctor: Uint32Array },
  { name: 'latchCell', ctor: Uint32Array },
  { name: 'anchored', ctor: Uint8Array },
] as const;

export type CellField = (typeof CELL_FIELDS)[number]['name'];

/**
 * Struct-of-arrays store of cells. Slots are recycled via a free-list; each slot
 * carries a `generation` (its own parallel Uint32 array, NOT bit-packed — spec
 * §4.2) so stale references can be detected after recycling.
 *
 * Canonical iteration order is ascending slot index over alive slots, which is
 * deterministic given a seed (the free-list evolves identically across runs).
 */
export class CellStore {
  readonly capacity: number;
  readonly soa: SoaLayout<CellField>;
  aliveCount: number;
  /**
   * (highest live slot index + 1), or 0 when empty. Every live slot is in [0, highWaterMark),
   * so a live-set scan only needs to cover that prefix instead of the full capacity — the LIFO
   * free-list keeps live slots packed low, so this stays ~O(peak live) even at large capacity.
   * Maintained in alloc/free; do not mutate externally.
   */
  highWaterMark: number;

  private readonly freeStack: Int32Array;
  private freeTop: number;

  constructor(capacity: number, preferShared = true) {
    this.capacity = capacity;
    this.soa = allocateSoa<CellField>(CELL_FIELDS, capacity, preferShared);
    this.aliveCount = 0;
    this.highWaterMark = 0;

    // Fill so that pops return 0, 1, 2, … ascending.
    this.freeStack = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeStack[i] = capacity - 1 - i;
    this.freeTop = capacity;
  }

  get fields(): CellArrays {
    return this.soa.fields as unknown as CellArrays;
  }

  /** Allocate a slot, or -1 if at capacity. */
  alloc(): number {
    if (this.freeTop === 0) return -1;
    const i = this.freeStack[--this.freeTop]!;
    this.soa.fields.flags[i]! |= FLAG_ALIVE;
    // Wipe the predation latch so a recycled slot never inherits a stale prey handle (the force-pass
    // tether reads latchCell before the new cell's first metabolize — stale data would mis-tether it).
    this.soa.fields.latchPrey[i] = 0;
    this.soa.fields.latchCell[i] = 0;
    // Wipe anchored so a recycled slot never inherits a stale base/settled-spore pin — an un-wiped
    // anchored=1 would freeze the new occupant (spore/creature cell) in place forever via the integrator.
    this.soa.fields.anchored[i] = 0;
    this.aliveCount++;
    if (i >= this.highWaterMark) this.highWaterMark = i + 1;
    return i;
  }

  /** Free a slot, bumping its generation so old handles become invalid. */
  free(i: number): void {
    const flags = this.soa.fields.flags;
    if ((flags[i]! & FLAG_ALIVE) === 0) return;
    flags[i]! &= ~FLAG_ALIVE;
    const gen = this.soa.fields.generation;
    gen[i] = (gen[i]! + 1) >>> 0;
    this.freeStack[this.freeTop++] = i;
    this.aliveCount--;
    // Keep the mark tight: if the top live slot was freed, walk down past any now-dead trailing slots.
    if (i === this.highWaterMark - 1) {
      let h = this.highWaterMark;
      while (h > 0 && (flags[h - 1]! & FLAG_ALIVE) === 0) h--;
      this.highWaterMark = h;
    }
  }

  isAlive(i: number): boolean {
    return (this.soa.fields.flags[i]! & FLAG_ALIVE) !== 0;
  }

  /** True if slot `i` is alive and still at generation `gen`. */
  validate(i: number, gen: number): boolean {
    return this.isAlive(i) && this.soa.fields.generation[i] === gen;
  }
}
