import { wrapDelta } from '../math/vec2';

/**
 * Bond-spring forces (§4.4): `F = -stiffnessScale · stiffness[s] · (dist − restLen)/dist`
 * along the shortest toroidal separation, applied equal-and-opposite to both endpoints
 * (SCATTER — the bond edge list is explicit, so we keep Newton's 3rd law; the gather
 * form is reserved for the neighbour-repulsion broad phase). Accumulates into the force
 * buffer (like computeRepulsion); reset by integrate. Allocation-free. Runs in the FORCES
 * phase (§4.3 step 5), after repulsion + thrust, before integrate.
 *
 * STABILITY: because `fx = ddx·f` and `|ddx| = dist`, the `/dist` cancels and the
 * EFFECTIVE Hookean constant is `k_eff = stiffnessScale · stiffness[s]` (independent of
 * restLen). Under the semi-implicit Euler integrator (dt=1, damping=0.5, mass=1) the
 * two-free-mass stability ceiling is `k_eff ≈ 3`; a multi-spoke hub (the MOVER) is
 * tighter. Keep `cfg.bondStiffness ≤ ~2.5` (config.test gates this) or bonded bodies
 * diverge to Inf/NaN. Do NOT raise stiffness for rigidity — that comes from bracing
 * geometry + a low `bondMaxStrain`.
 */
export function computeBondForces(
  liveBonds: Uint32Array,
  count: number,
  cellA: Uint32Array,
  cellB: Uint32Array,
  restLen: Float32Array,
  stiffness: Float32Array,
  posX: Float64Array,
  posY: Float64Array,
  forceX: Float32Array,
  forceY: Float32Array,
  stiffnessScale: number,
  width: number,
  height: number,
): void {
  for (let k = 0; k < count; k++) {
    const s = liveBonds[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ddx = wrapDelta(posX[a]! - posX[b]!, width);
    const ddy = wrapDelta(posY[a]! - posY[b]!, height);
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < 1e-18) continue; // coincident — no defined direction
    const d = Math.sqrt(d2);
    const f = (-stiffnessScale * stiffness[s]! * (d - restLen[s]!)) / d;
    const fx = ddx * f;
    const fy = ddy * f;
    forceX[a] = forceX[a]! + fx;
    forceY[a] = forceY[a]! + fy;
    forceX[b] = forceX[b]! - fx;
    forceY[b] = forceY[b]! - fy;
  }
}
