/**
 * Per-creature debug overlay geometry. Builds colored line segments that make ONE selected creature's
 * decision legible on screen: where it's looking (vision cone), where it can bite, which way it faces
 * vs. actually drifts (heading vs. velocity), what it smells + sees (food-gradient + sight vectors),
 * and the prey it's about to bite. Pure math over the store — no GL, no DOM — so it's testable and the
 * renderer that consumes it stays a dumb line-drawer.
 *
 * Output is a flat interleaved vertex buffer [x, y, r, g, b] per vertex, consumed as gl.LINES (each
 * consecutive PAIR of vertices is one segment). The function fills a caller-owned scratch buffer and
 * returns the vertex count, so it allocates nothing per frame.
 *
 * SCALE NOTE — two kinds of geometry are drawn together, by design:
 *   - TO-SCALE (real world units): the vision cone (VISION_RANGE/FOV genes) and the bite ring
 *     (cfg.biteRange) + the line to the actual bite target — these are true reach.
 *   - DIRECTION-ONLY (fixed display length): heading, velocity, smell, and sight arrows — their
 *     LENGTH is a legibility constant, only their DIRECTION is meaningful (raw magnitudes span orders
 *     of magnitude and would be invisible or off-screen).
 */
import { type OrganismStore } from '../core/store';
import { type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

// Display lengths for the direction-only arrows (world units).
const HEADING_LEN = 14;
const VELOCITY_SCALE = 4; // velocity is small (≈ maxSpeed); scale it up to a visible arrow
const DIR_LEN = 11; // normalized smell / sight arrows

// Colors (r,g,b in [0,1]).
const C_SELECT: readonly [number, number, number] = [1, 1, 1]; // selection ring — white
const C_HEADING: readonly [number, number, number] = [0.3, 0.9, 1]; // cyan
const C_VELOCITY: readonly [number, number, number] = [0.95, 0.85, 0.3]; // yellow
const C_VISION: readonly [number, number, number] = [0.4, 0.6, 1]; // soft blue
const C_BITE: readonly [number, number, number] = [1, 0.35, 0.35]; // red ring
const C_SMELL: readonly [number, number, number] = [0.5, 1, 0.5]; // green
const C_SIGHT: readonly [number, number, number] = [1, 0.45, 1]; // magenta
const C_TARGET: readonly [number, number, number] = [1, 0.1, 0.1]; // bright red — about to bite

/** Shortest signed delta a→b on a torus (so seam-crossing arrows point the right way). */
function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

/**
 * Fill `out` with the overlay line vertices for `slot` and return the vertex count (always even). If
 * the slot isn't live, returns 0. `out` must be sized for at least ~200 vertices (1000 floats).
 */
export function buildOverlaySegments(
  store: OrganismStore,
  slot: number,
  cfg: Config,
  out: Float32Array,
): number {
  if (!store.isAlive(slot)) return 0;

  const cap = Math.floor(out.length / 5);
  let n = 0;
  const push = (x: number, y: number, c: readonly [number, number, number]): void => {
    if (n >= cap) return;
    const o = n * 5;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = c[0]!;
    out[o + 3] = c[1]!;
    out[o + 4] = c[2]!;
    n++;
  };
  const seg = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    c: readonly [number, number, number],
  ): void => {
    push(ax, ay, c);
    push(bx, by, c);
  };
  const arrow = (
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    c: readonly [number, number, number],
  ): void => {
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return;
    const tx = ox + dx;
    const ty = oy + dy;
    seg(ox, oy, tx, ty, c);
    // Two barbs at the tip: rotate the back-pointing unit vector by ±0.5 rad, scale to a short head.
    const ux = -dx / len;
    const uy = -dy / len;
    const hl = Math.min(len * 0.35, 4);
    const ca = Math.cos(0.5);
    const sa = Math.sin(0.5);
    seg(tx, ty, tx + (ux * ca - uy * sa) * hl, ty + (ux * sa + uy * ca) * hl, c);
    seg(tx, ty, tx + (ux * ca + uy * sa) * hl, ty + (-ux * sa + uy * ca) * hl, c);
  };
  const ring = (
    ox: number,
    oy: number,
    rad: number,
    segs: number,
    c: readonly [number, number, number],
  ): void => {
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      seg(
        ox + Math.cos(a0) * rad,
        oy + Math.sin(a0) * rad,
        ox + Math.cos(a1) * rad,
        oy + Math.sin(a1) * rad,
        c,
      );
    }
  };

  const sg = slot * SCALAR_GENE_COUNT;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const h = store.heading[slot]!;
  const hx = Math.cos(h);
  const hy = Math.sin(h);
  const size = store.scalarGenes[sg + ScalarGene.SIZE]!;
  const diet = store.scalarGenes[sg + ScalarGene.DIET]!;

  // ── selection ring (locate the inspected creature) ──
  ring(x, y, Math.max(3, size * 1.6), 24, C_SELECT);

  // ── vision cone (to scale): edges at heading ± FOV out to VISION_RANGE, with an arc ──
  const vRange = store.scalarGenes[sg + ScalarGene.VISION_RANGE]!;
  const vAcuity = store.scalarGenes[sg + ScalarGene.VISION_ACUITY]!;
  const vFov = store.scalarGenes[sg + ScalarGene.VISION_FOV]!;
  if (vRange > 0 && vAcuity > 0) {
    const eA = h - vFov;
    const eB = h + vFov;
    seg(x, y, x + Math.cos(eA) * vRange, y + Math.sin(eA) * vRange, C_VISION);
    seg(x, y, x + Math.cos(eB) * vRange, y + Math.sin(eB) * vRange, C_VISION);
    const arcSegs = 16;
    for (let k = 0; k < arcSegs; k++) {
      const a0 = eA + ((eB - eA) * k) / arcSegs;
      const a1 = eA + ((eB - eA) * (k + 1)) / arcSegs;
      seg(
        x + Math.cos(a0) * vRange,
        y + Math.sin(a0) * vRange,
        x + Math.cos(a1) * vRange,
        y + Math.sin(a1) * vRange,
        C_VISION,
      );
    }
  }

  // ── bite ring (to scale) + line to the prey it's about to bite — predators only (diet > 0) ──
  if (diet > 0) {
    ring(x, y, cfg.biteRange, 28, C_BITE);
    // Replicate hunt's target pick: nearest OTHER live creature within biteRange (brute over live —
    // once per frame for one creature, so O(n) is fine even at demo scale).
    const { liveIndices, liveCount, x: xs, y: ys } = store;
    let best = -1;
    let bestD = cfg.biteRange * cfg.biteRange;
    let tdx = 0;
    let tdy = 0;
    for (let k = 0; k < liveCount; k++) {
      const j = liveIndices[k]!;
      if (j === slot) continue;
      const ddx = wrapDelta(xs[j]! - x, cfg.worldWidth);
      const ddy = wrapDelta(ys[j]! - y, cfg.worldHeight);
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < bestD) {
        bestD = d2;
        best = j;
        tdx = ddx;
        tdy = ddy;
      }
    }
    if (best >= 0) seg(x, y, x + tdx, y + tdy, C_TARGET); // draw via wrapped delta (seam-correct)
  }

  // ── heading vs. velocity (direction-only) ──
  arrow(x, y, hx * HEADING_LEN, hy * HEADING_LEN, C_HEADING);
  arrow(x, y, store.vx[slot]! * VELOCITY_SCALE, store.vy[slot]! * VELOCITY_SCALE, C_VELOCITY);

  // ── smell (food gradient) + sight, normalized to a fixed display length (direction-only) ──
  const senseLen = Math.hypot(store.senseX[slot]!, store.senseY[slot]!);
  if (senseLen > 1e-12)
    arrow(
      x,
      y,
      (store.senseX[slot]! / senseLen) * DIR_LEN,
      (store.senseY[slot]! / senseLen) * DIR_LEN,
      C_SMELL,
    );
  const sightLen = Math.hypot(store.sightX[slot]!, store.sightY[slot]!);
  if (sightLen > 1e-12)
    arrow(
      x,
      y,
      (store.sightX[slot]! / sightLen) * DIR_LEN,
      (store.sightY[slot]! / sightLen) * DIR_LEN,
      C_SIGHT,
    );

  return n;
}
