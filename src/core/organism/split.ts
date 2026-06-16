import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';

/**
 * Split-on-break (§4.8). After a bond `(a, b)` of one organism is removed, run a
 * dual-frontier BFS from `a` and `b` over the current bond adjacency, expanding one
 * cell per side per round. If the frontiers meet → still connected (return −1). If one
 * frontier closes (queue empties) before meeting → that side is a separate, smaller-or-
 * equal component → relabel its cells with a fresh organism id and migrate the MOVER if
 * it moved. Bounded by the smaller side; allocation-free (pre-allocated queues + a visit
 * epoch so no per-call clearing). Neighbour expansion is ascending-adjacency order
 * (deterministic). Returns the new organism id, or −1 if no split.
 *
 * The `epoch` is a monotonic counter compared against Int32Array entries; correct for the
 * < 2^31 check() calls any realistic M5 run makes (organism cells are lifecycle-exempt, so
 * splits are rare strain-break events). Determinism is unaffected. A future milestone with
 * frequent splits should mask the increment + stamp.fill(0) on wrap.
 */
export class SplitChecker {
  private readonly maxCells: number;
  private readonly queueA: Int32Array;
  private readonly queueB: Int32Array;
  private readonly stamp: Int32Array;
  private readonly side: Uint8Array; // 1 = A, 2 = B
  private epoch: number;

  constructor(maxCells: number) {
    this.maxCells = maxCells;
    this.queueA = new Int32Array(maxCells);
    this.queueB = new Int32Array(maxCells);
    this.stamp = new Int32Array(maxCells);
    this.side = new Uint8Array(maxCells);
    this.epoch = 0;
  }

  check(
    bonds: BondNetwork,
    organismId: Uint32Array,
    organisms: OrganismTable,
    a: number,
    b: number,
  ): number {
    const cap = bonds.degreeCap;
    const adj = bonds.adj;
    const degree = bonds.degree;
    const cellA = bonds.cellA;
    const cellB = bonds.cellB;
    const stamp = this.stamp;
    const side = this.side;
    const qA = this.queueA;
    const qB = this.queueB;
    const e = ++this.epoch;
    const org0 = organismId[a]!; // a and b shared this org before the break

    let headA = 0;
    let tailA = 0;
    let headB = 0;
    let tailB = 0;
    stamp[a] = e;
    side[a] = 1;
    qA[tailA++] = a;
    stamp[b] = e;
    side[b] = 2;
    qB[tailB++] = b;

    while (headA < tailA && headB < tailB) {
      // Expand one cell from side A.
      {
        const c = qA[headA++]!;
        const off = c * cap;
        const d = degree[c]!;
        for (let k = 0; k < d; k++) {
          const s = adj[off + k]!;
          const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
          if (stamp[nb] === e) {
            if (side[nb] === 2) return -1; // frontiers met → still connected
            continue;
          }
          stamp[nb] = e;
          side[nb] = 1;
          qA[tailA++] = nb;
        }
      }
      // Expand one cell from side B.
      {
        const c = qB[headB++]!;
        const off = c * cap;
        const d = degree[c]!;
        for (let k = 0; k < d; k++) {
          const s = adj[off + k]!;
          const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
          if (stamp[nb] === e) {
            if (side[nb] === 1) return -1; // met
            continue;
          }
          stamp[nb] = e;
          side[nb] = 2;
          qB[tailB++] = nb;
        }
      }
    }

    // One frontier closed without meeting → split. The closed side (whichever queue
    // emptied) is the smaller component — relabel it.
    const newOrg = organisms.alloc();
    if (newOrg < 0) return -1; // organism pool exhausted → leave merged (safe, degraded)

    let q: Int32Array;
    let count: number;
    if (headA >= tailA) {
      q = qA;
      count = tailA;
    } else {
      q = qB;
      count = tailB;
    }
    for (let i = 0; i < count; i++) organismId[q[i]!] = newOrg;

    // Migrate the MOVER if it moved to the relabelled side.
    const m = organisms.mover[org0]!;
    if (m >= 0 && organismId[m] === newOrg) {
      organisms.mover[newOrg] = m;
      organisms.mover[org0] = -1;
    }
    return newOrg;
  }
}
