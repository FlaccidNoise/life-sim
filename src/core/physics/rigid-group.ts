/**
 * Kinematic rigid grouping (M4 stand-in for M5 bond physics). Each passenger cell
 * is snapped, after INTEGRATE (§4.3 step 6), to its body's position plus a fixed
 * body-frame offset rotated by the body heading, and inherits the body heading.
 * Velocity and force are zeroed so the dynamic integrate pass on the passenger
 * slot is overridden (passengers are kinematic; only the MOVER body integrates).
 * Positions wrap toroidally. Raw-array, allocation-free.
 */
export function repositionPassengers(
  passenger: Uint32Array,
  body: Uint32Array,
  offX: Float32Array,
  offY: Float32Array,
  n: number,
  posX: Float64Array,
  posY: Float64Array,
  heading: Float32Array,
  velX: Float32Array,
  velY: Float32Array,
  forceX: Float32Array,
  forceY: Float32Array,
  worldWidth: number,
  worldHeight: number,
): void {
  for (let k = 0; k < n; k++) {
    const p = passenger[k]!;
    const b = body[k]!;
    const h = heading[b]!;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const ox = offX[k]!;
    const oy = offY[k]!;
    let x = posX[b]! + (ox * cos - oy * sin);
    let y = posY[b]! + (ox * sin + oy * cos);
    x = ((x % worldWidth) + worldWidth) % worldWidth;
    y = ((y % worldHeight) + worldHeight) % worldHeight;
    posX[p] = x;
    posY[p] = y;
    heading[p] = h;
    velX[p] = 0;
    velY[p] = 0;
    forceX[p] = 0;
    forceY[p] = 0;
  }
}
