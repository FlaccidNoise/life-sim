import { describe, it, expect } from 'vitest';
import { carveCA } from './ca';
import { Rng } from '../rng';

const fraction = (solid: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < solid.length; i++) if (solid[i]) n++;
  return n / solid.length;
};

describe('carveCA', () => {
  // CA smoothing erodes specks, so the final fraction settles BELOW the input density. At input 0.45
  // the measured fraction across seeds lands ~0.26-0.34. The upper bound is 0.4 (< the 0.45 input) so the
  // test PROVES the smoothing eroded the fill — a no-op smoothing pass would land ~0.45 and FAIL here.
  it('lands in a sane solid-fraction band BELOW the input after smoothing', () => {
    const solid = new Uint8Array(64 * 64);
    carveCA(solid, 64, 64, 0.45, new Rng(1));
    const f = fraction(solid);
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThan(0.4);
  });

  it('is deterministic from the same Rng seed', () => {
    const a = new Uint8Array(64 * 64);
    const b = new Uint8Array(64 * 64);
    carveCA(a, 64, 64, 0.45, new Rng(7));
    carveCA(b, 64, 64, 0.45, new Rng(7));
    expect(a).toEqual(b);
  });

  it('wraps toroidally — left edge column matches interior density (no seam)', () => {
    const cols = 64;
    const rows = 64;
    const solid = new Uint8Array(cols * rows);
    carveCA(solid, cols, rows, 0.45, new Rng(42));
    let edge = 0;
    let interior = 0;
    for (let r = 0; r < rows; r++) {
      if (solid[r * cols]) edge++;
      for (let c = 1; c < cols - 1; c++) if (solid[r * cols + c]) interior++;
    }
    const edgeFrac = edge / rows;
    const interiorFrac = interior / (rows * (cols - 2));
    // A non-toroidal generator under-counts neighbours at the edge, leaving the column all-open (or a
    // hard wall). Wrapping makes the edge statistically the same as the interior.
    expect(edgeFrac).toBeGreaterThan(0.1);
    expect(edgeFrac).toBeLessThan(0.6);
    expect(Math.abs(edgeFrac - interiorFrac)).toBeLessThan(0.2);
  });
});
