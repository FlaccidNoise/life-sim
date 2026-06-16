import { allocateSoa, type SoaLayout, type TypedArray } from './buffers';

/** Bit 0 of `flags` marks a slot as alive. */
export const FLAG_ALIVE = 1;

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
  { name: 'flags', ctor: Uint8Array },
  { name: 'generation', ctor: Uint32Array },
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

  private readonly freeStack: Int32Array;
  private freeTop: number;

  constructor(capacity: number, preferShared = true) {
    this.capacity = capacity;
    this.soa = allocateSoa<CellField>(CELL_FIELDS, capacity, preferShared);
    this.aliveCount = 0;

    // Fill so that pops return 0, 1, 2, … ascending.
    this.freeStack = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeStack[i] = capacity - 1 - i;
    this.freeTop = capacity;
  }

  get fields(): Readonly<Record<CellField, TypedArray>> {
    return this.soa.fields;
  }

  /** Allocate a slot, or -1 if at capacity. */
  alloc(): number {
    if (this.freeTop === 0) return -1;
    const i = this.freeStack[--this.freeTop]!;
    this.soa.fields.flags[i]! |= FLAG_ALIVE;
    this.aliveCount++;
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
  }

  isAlive(i: number): boolean {
    return (this.soa.fields.flags[i]! & FLAG_ALIVE) !== 0;
  }

  /** True if slot `i` is alive and still at generation `gen`. */
  validate(i: number, gen: number): boolean {
    return this.isAlive(i) && this.soa.fields.generation[i] === gen;
  }
}
