import { wrap } from '../math/vec2';

/**
 * Near-overdamped semi-implicit Euler integrator for a viscous medium.
 * Per live cell: v ← (v + (F/m)·dt)·damping; x ← wrap(x + v·dt). Positions are
 * Float64 so slow motion at large world coordinates is not quantised away.
 * Forces are reset to zero after integration.
 */
export function integrate(
  liveIndices: Uint32Array,
  liveCount: number,
  posX: Float64Array,
  posY: Float64Array,
  velX: Float32Array,
  velY: Float32Array,
  forceX: Float32Array,
  forceY: Float32Array,
  mass: Float32Array,
  dt: number,
  damping: number,
  width: number,
  height: number,
): void {
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const m = mass[i]! || 1;
    const vx = (velX[i]! + (forceX[i]! / m) * dt) * damping;
    const vy = (velY[i]! + (forceY[i]! / m) * dt) * damping;
    posX[i] = wrap(posX[i]! + vx * dt, width);
    posY[i] = wrap(posY[i]! + vy * dt, height);
    velX[i] = vx;
    velY[i] = vy;
    forceX[i] = 0;
    forceY[i] = 0;
  }
}
