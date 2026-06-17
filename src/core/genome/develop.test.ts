import { describe, it, expect } from 'vitest';
import { type Genome } from './genome';
import { develop } from './develop';
import { CellType } from '../cells/types';

function gene(
  cellType: number,
  over: Partial<{
    radius: number;
    mass: number;
    initialEnergy: number;
    bias: number;
    sensorChannel: number;
  }> = {},
) {
  return {
    innovation: 0,
    cellType,
    radius: 6,
    mass: 2,
    initialEnergy: 100,
    bias: 0,
    sensorChannel: -1,
    ...over,
  };
}

describe('develop — cells + tree bonds (pure, deterministic)', () => {
  it('emits the seed then one child per division rule, bonded parent→child', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.PHOTO), gene(CellType.DIGESTIVE, { initialEnergy: 50 })],
      divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 15, stiffness: 1, repeat: 1 }],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const b = develop(g, 256, 16);
    expect(b.count).toBe(2);
    expect(b.cellType).toEqual([CellType.PHOTO, CellType.DIGESTIVE]);
    expect(b.localX[0]).toBeCloseTo(0, 9);
    expect(b.localX[1]).toBeCloseTo(15, 9); // angle 0, dist 15 → (15, 0)
    expect(b.localY[1]).toBeCloseTo(0, 9);
    expect(b.bonds).toEqual([{ a: 0, b: 1, stiffness: 1 }]);
    expect(b.totalEnergy).toBeCloseTo(150, 6); // 100 + 50
    expect(b.truncated).toBe(false);
  });

  it('places a child by turtle graphics (parentHeading + angle)', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.MOVER), gene(CellType.SENSOR)],
      divisionRules: [
        { parentGene: 0, childGene: 1, angle: Math.PI / 2, dist: 10, stiffness: 1, repeat: 1 },
      ],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const b = develop(g, 256, 16);
    expect(b.localX[1]).toBeCloseTo(0, 9); // cos(π/2)·10 ≈ 0
    expect(b.localY[1]).toBeCloseTo(10, 9); // sin(π/2)·10 = 10
    expect(b.localHeading[1]).toBeCloseTo(Math.PI / 2, 9);
  });

  it('repeat spreads instances evenly around the parent', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.PHOTO), gene(CellType.PHOTO)],
      divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 10, stiffness: 1, repeat: 4 }],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const b = develop(g, 256, 16);
    expect(b.count).toBe(5); // seed + 4
    expect(b.bonds.length).toBe(4);
    // 4 around: angles 0, π/2, π, 3π/2.
    expect(b.localX[1]).toBeCloseTo(10, 6);
    expect(b.localY[2]).toBeCloseTo(10, 6);
    expect(b.localX[3]).toBeCloseTo(-10, 6);
    expect(b.localY[4]).toBeCloseTo(-10, 6);
  });

  it('is deterministic — the same genome develops into an identical body', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.PHOTO), gene(CellType.PHOTO)],
      divisionRules: [
        { parentGene: 0, childGene: 1, angle: 0.5, dist: 12, stiffness: 1, repeat: 3 },
      ],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    expect(develop(g, 256, 16)).toEqual(develop(g, 256, 16));
  });

  it('caps cells (a self-producing rule) and flags truncated', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.PHOTO)],
      divisionRules: [
        { parentGene: 0, childGene: 0, angle: 0.3, dist: 8, stiffness: 1, repeat: 1 },
      ],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const b = develop(g, 10, 1000);
    expect(b.count).toBe(10); // capped
    expect(b.truncated).toBe(true);
  });

  it('caps recursion depth and flags truncated', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [gene(CellType.PHOTO)],
      divisionRules: [
        { parentGene: 0, childGene: 0, angle: 0.3, dist: 8, stiffness: 1, repeat: 1 },
      ],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const b = develop(g, 1000, 3);
    expect(b.count).toBe(4); // seed (depth 0) + depths 1,2,3
    expect(b.truncated).toBe(true);
  });
});
