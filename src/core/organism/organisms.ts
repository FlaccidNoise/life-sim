/**
 * Per-organism aggregates (§4.8). Ids are allocated from a free-list; id 0 is
 * reserved for free/food cells (`organismId === 0`). The first `alloc()` returns 1,
 * so a freshly-constructed World's first critter gets organism id 1 (determinism;
 * matches the M4 critter). `mover` records each organism's MOVER slot for sensor
 * orientation (−1 = none).
 */
export class OrganismTable {
  readonly maxOrganisms: number;
  readonly energy: Float32Array;
  readonly cellCount: Uint32Array;
  readonly centroidX: Float32Array;
  readonly centroidY: Float32Array;
  /** The organism's MOVER cell slot for orientation (−1 = none). */
  readonly mover: Int32Array;
  /** The organism's genome store ref (−1 = none — never reproduces). */
  readonly genomeRef: Int32Array;
  /** The tick the organism was born (−1 = founder/unknown), for the adulthood metric. */
  readonly birthTick: Int32Array;
  /** 1 once the organism first reached reproThreshold (births-reaching-adulthood, §8 M6). */
  readonly reachedAdulthood: Uint8Array;
  /** 1 if the organism is a PREDATOR (its developed body has a PREDATOR mouth). Set at instantiate.
   *  Routes its sensors to the prey-scent field and gates prey-scent deposit (predators aren't prey
   *  in v1). Structural diet flag — NOT lineage/fitness. */
  readonly carnivore: Uint8Array;

  private readonly orgAlive: Uint8Array;
  private readonly orgFree: Int32Array;
  private orgFreeTop: number;

  constructor(maxOrganisms: number) {
    this.maxOrganisms = maxOrganisms;
    this.energy = new Float32Array(maxOrganisms);
    this.cellCount = new Uint32Array(maxOrganisms);
    this.centroidX = new Float32Array(maxOrganisms);
    this.centroidY = new Float32Array(maxOrganisms);
    this.mover = new Int32Array(maxOrganisms).fill(-1);
    this.genomeRef = new Int32Array(maxOrganisms).fill(-1);
    this.birthTick = new Int32Array(maxOrganisms).fill(-1);
    this.reachedAdulthood = new Uint8Array(maxOrganisms);
    this.carnivore = new Uint8Array(maxOrganisms);
    this.orgAlive = new Uint8Array(maxOrganisms);
    // Free-list of ids 1..maxOrganisms-1 (0 reserved). Pop returns 1, 2, 3, … ascending.
    const n = maxOrganisms - 1;
    this.orgFree = new Int32Array(n);
    for (let i = 0; i < n; i++) this.orgFree[i] = n - i; // [n, n-1, …, 1]; pop from top → 1 first
    this.orgFreeTop = n;
  }

  /** Allocate a fresh organism id (≥1), or -1 if exhausted (refuse-new). */
  alloc(): number {
    if (this.orgFreeTop === 0) return -1;
    const id = this.orgFree[--this.orgFreeTop]!;
    this.orgAlive[id] = 1;
    this.mover[id] = -1;
    this.genomeRef[id] = -1;
    this.birthTick[id] = -1;
    this.reachedAdulthood[id] = 0;
    this.carnivore[id] = 0;
    this.energy[id] = 0;
    this.cellCount[id] = 0;
    return id;
  }

  /** Free an organism id (M5: on a merge — currently unused; M6 uses it on extinction). */
  free(id: number): void {
    if (this.orgAlive[id] === 0) return;
    this.orgAlive[id] = 0;
    this.mover[id] = -1;
    this.genomeRef[id] = -1;
    this.birthTick[id] = -1;
    this.reachedAdulthood[id] = 0;
    this.carnivore[id] = 0;
    this.orgFree[this.orgFreeTop++] = id;
  }

  isAlive(id: number): boolean {
    return this.orgAlive[id] === 1;
  }
}

/**
 * Recompute per-organism aggregates from the current live set in one O(live) pass
 * (§4.8). Exact and allocation-free; centroid is a plain mean (toroidal-seam handling
 * deferred — hand-built organisms are small and placed away from the seam). The split
 * relabels `organismId` incrementally; this pass is the authority for the numbers.
 */
export function aggregateOrganisms(
  live: Uint32Array,
  n: number,
  organismId: Uint32Array,
  energy: Float32Array,
  posX: Float64Array,
  posY: Float64Array,
  organisms: OrganismTable,
): void {
  const oe = organisms.energy;
  const oc = organisms.cellCount;
  const ox = organisms.centroidX;
  const oy = organisms.centroidY;
  oe.fill(0);
  oc.fill(0);
  ox.fill(0);
  oy.fill(0);

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const org = organismId[i]!;
    if (org === 0) continue;
    oe[org] = oe[org]! + energy[i]!;
    oc[org] = oc[org]! + 1;
    ox[org] = ox[org]! + posX[i]!;
    oy[org] = oy[org]! + posY[i]!;
  }

  const m = organisms.maxOrganisms;
  for (let org = 1; org < m; org++) {
    const c = oc[org]!;
    if (c > 0) {
      ox[org] = ox[org]! / c;
      oy[org] = oy[org]! / c;
    }
  }
}
