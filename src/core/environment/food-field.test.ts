import { describe, it, expect } from 'vitest';
import { FoodField } from './food-field';

describe('FoodField', () => {
  it('starts empty and deposits into the patch under a position', () => {
    const food = new FoodField(4, 4, 400, 400); // 100-unit patches
    expect(food.sampleAt(50, 50)).toBe(0);
    food.depositAt(50, 50, 2);
    expect(food.sampleAt(50, 50)).toBe(2);
    expect(food.sampleAt(150, 50)).toBe(0); // different patch untouched
  });

  it('patchW/patchH are world units per patch', () => {
    const food = new FoodField(4, 4, 400, 200);
    expect(food.patchW).toBe(100);
    expect(food.patchH).toBe(50);
  });

  it('step() decays and diffuses toward neighbours (toroidal); mass spreads, decays', () => {
    const food = new FoodField(4, 4, 400, 400);
    food.depositAt(150, 150, 16); // single spike at patch (1,1)
    const before = food.sampleAt(150, 150);
    food.step(0.2, 0.1);
    expect(food.sampleAt(150, 150)).toBeLessThan(before);
    expect(food.sampleAt(50, 150)).toBeGreaterThan(0); // left neighbour received flux
  });

  it('step() conserves nothing exactly but never goes negative', () => {
    const food = new FoodField(4, 4, 400, 400);
    food.depositAt(50, 50, 5);
    for (let i = 0; i < 50; i++) food.step(0.2, 0.1);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        expect(food.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
  });

  it('a PERSISTENT source builds a multi-patch gradient (the field is NOT cleared per tick)', () => {
    // Mirrors World.tick: re-deposit at the same patch every tick and accumulate (no clear()).
    const food = new FoodField(16, 16, 1600, 1600); // 100-unit patches
    for (let t = 0; t < 300; t++) {
      food.depositAt(800, 800, 4); // centre patch (col 8, row 8)
      food.step(0.22, 0.03);
    }
    const centre = food.sampleAt(800, 800);
    const oneOut = food.sampleAt(900, 800); // +1 patch
    const threeOut = food.sampleAt(1100, 800); // +3 patches
    expect(centre).toBeGreaterThan(oneOut);
    expect(oneOut).toBeGreaterThan(threeOut);
    expect(threeOut).toBeGreaterThan(0); // smell reaches >=3 patches — a climbable long-range gradient
  });
});
