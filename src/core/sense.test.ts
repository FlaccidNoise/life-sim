import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { senseFood } from './sense';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

const W = 256;
const H = 256;
const COLS = 32;
const ROWS = 32;
const K = 10;

/** Sculpt a smooth +x food gradient: B(col) ≈ K·col/(cols−1), increasing toward +x. */
function gradientField(): FoodField {
  const f = new FoodField(W, H, COLS, ROWS, K, 1); // start full
  const cellW = W / COLS;
  const cellH = H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const target = (K * c) / (COLS - 1);
      f.grazeAt(c * cellW + cellW / 2, r * cellH + cellH / 2, K - target);
    }
  }
  return f;
}

describe('senseFood', () => {
  it('senses a gradient pointing toward higher food (+x here)', () => {
    const f = gradientField();
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = W / 2;
    s.y[i] = H / 2;
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE] = W / COLS; // sample one cell apart
    s.rebuildLive();
    senseFood(s, f, W, H);
    expect(s.senseX[i]!).toBeGreaterThan(0); // points toward +x (more food)
    expect(Math.abs(s.senseY[i]!)).toBeLessThan(Math.abs(s.senseX[i]!)); // ~no y component
  });
});
