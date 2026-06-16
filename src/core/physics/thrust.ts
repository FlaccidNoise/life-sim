/**
 * Thrust force (§4.4): each mover applies a force of magnitude `thrust` along its
 * `heading`, accumulated into the force buffer AFTER repulsion (spec §4.3 FORCES =
 * repulsion + … + thrust + drag; drag lives in the integrator's damping). The
 * force passes through the integrator's F/m and damping → a terminal speed.
 * Raw-array, allocation-free; non-movers carry thrust=0 and are skipped.
 */
export function applyThrust(
  live: Uint32Array,
  n: number,
  heading: Float32Array,
  thrust: Float32Array,
  forceX: Float32Array,
  forceY: Float32Array,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const t = thrust[i]!;
    if (t === 0) continue;
    const a = heading[i]!;
    forceX[i] = forceX[i]! + t * Math.cos(a);
    forceY[i] = forceY[i]! + t * Math.sin(a);
  }
}
