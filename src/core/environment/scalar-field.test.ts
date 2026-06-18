import { describe, it, expect } from 'vitest';
import { ScalarField } from './scalar-field';
import { Rng } from '../math/rng';

// Expose protected members for white-box testing.
class TestField extends ScalarField {
  seed(rng: Rng, cap: Float32Array, count: number, radius: number, lo: number, hi: number): void {
    this.seedPatches(rng, cap, count, radius, lo, hi);
  }
  buf(): Float32Array {
    return this.a;
  }
  gsum(
    cx: Float64Array,
    cy: Float64Array,
    rad: Float64Array,
    amp: Float64Array,
    n: number,
    out: Float32Array,
    lo: number,
    hi: number,
  ): void {
    this.gaussianSum(cx, cy, rad, amp, n, out, lo, hi);
  }
}

// Independent reference: the exact pre-refactor seedPatches math.
function referenceSeed(
  cols: number,
  rows: number,
  draws: Array<[number, number, number]>,
  radius: number,
  lo: number,
  hi: number,
): Float32Array {
  const buf = new Float32Array(cols * rows);
  const sigma2 = 2 * radius * radius;
  for (const [pcx, pcy, amp] of draws) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let dx = Math.abs(c - pcx);
        if (dx > cols / 2) dx = cols - dx;
        let dy = Math.abs(r - pcy);
        if (dy > rows / 2) dy = rows - dy;
        buf[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
      }
    }
  }
  let max = 0;
  for (const v of buf) if (v > max) max = v;
  const range = hi - lo;
  const scale = max > 0 ? range / max : 0;
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * scale + lo;
  return buf;
}

describe('ScalarField.gaussianSum / seedPatches refactor', () => {
  it('seedPatches is byte-identical to the pre-refactor formula', () => {
    const cols = 16,
      rows = 16,
      count = 5,
      radius = 4,
      lo = 0,
      hi = 1;
    // Re-draw with the SAME rng + SAME draw order to build the reference.
    const rngRef = new Rng(42);
    const draws: Array<[number, number, number]> = [];
    for (let p = 0; p < count; p++) {
      const pcx = rngRef.range(0, cols);
      const pcy = rngRef.range(0, rows);
      const amp = rngRef.range(0.5, 1);
      draws.push([pcx, pcy, amp]);
    }
    const expected = referenceSeed(cols, rows, draws, radius, lo, hi);

    const f = new TestField(cols, rows, 256, 256);
    const cap = new Float32Array(cols * rows);
    f.seed(new Rng(42), cap, count, radius, lo, hi);

    expect(Array.from(f.buf())).toEqual(Array.from(expected));
    expect(Array.from(cap)).toEqual(Array.from(expected));
  });
});
