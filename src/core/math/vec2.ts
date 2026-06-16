export function lenSq(x: number, y: number): number {
  return x * x + y * y;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Wrap a coordinate into [0, span). */
export function wrap(v: number, span: number): number {
  const r = v % span;
  return r < 0 ? r + span : r;
}

/** Shortest signed delta between two coordinates on a torus of the given span. */
export function wrapDelta(d: number, span: number): number {
  const half = span * 0.5;
  if (d > half) return d - span;
  if (d < -half) return d + span;
  return d;
}

/** Euclidean distance between two points on a toroidal plane. */
export function torusDist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  height: number,
): number {
  return len(wrapDelta(bx - ax, width), wrapDelta(by - ay, height));
}
