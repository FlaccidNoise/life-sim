import { describe, it, expect } from 'vitest';
import { GlowEffectors, computeGlow } from './glow';
import { NeuralNetwork } from './network';
import { CellType } from '../cells/types';
import { type CellArrays } from '../memory/cell-store';

/** Minimal GlowField stub matching GlowDepositTarget for tests. */
class StubGlow {
  constructor(readonly data: number[] = []) {}
  depositAt(_x: number, _y: number, amount: number): void {
    this.data.push(amount);
  }
}

/** Build a partial CellArrays-like object with just the fields computeGlow reads. */
function makeCellArrays(posX: number[], posY: number[], cellType: number[]): CellArrays {
  return {
    posX: Float64Array.from(posX),
    posY: Float64Array.from(posY),
    cellType: Uint8Array.from(cellType),
  } as unknown as CellArrays;
}

describe('GlowEffectors', () => {
  it('starts empty, grows with addEffector, and effectorCount reflects count', () => {
    const ge = new GlowEffectors(8);
    expect(ge.effectorCount).toBe(0);
    expect(ge.addEffector(3, 1, 1.0)).toBe(0);
    expect(ge.effectorCount).toBe(1);
    expect(ge.neuronCell[0]).toBe(3);
    expect(ge.neuronGen[0]).toBe(1);
    expect(ge.gain[0]).toBe(1.0);
  });

  it('swap-removes effectors via removeFor rearranging array', () => {
    const ge = new GlowEffectors(8);
    ge.addEffector(10, 1, 0.5);
    ge.addEffector(20, 2, 0.8);
    ge.addEffector(30, 3, 1.2);
    expect(ge.effectorCount).toBe(3);
    ge.removeFor(20);
    expect(ge.effectorCount).toBe(2);
    // The removed slot (index 1) was swap-filled from the end (index 2: cell 30).
    // So surviving entries: [10, 30] or [30, 10] depending on order. Just check set.
    const cells = [ge.neuronCell[0], ge.neuronCell[1]].sort();
    expect(cells).toEqual([10, 30]);
  });

  it('removeFor handles no match gracefully', () => {
    const ge = new GlowEffectors(4);
    ge.addEffector(5, 1, 1);
    ge.removeFor(99);
    expect(ge.effectorCount).toBe(1);
  });

  it('addEffector returns -1 when pool is full', () => {
    const ge = new GlowEffectors(2);
    expect(ge.addEffector(1, 1, 1)).toBe(0);
    expect(ge.addEffector(2, 1, 1)).toBe(1);
    expect(ge.addEffector(3, 1, 1)).toBe(-1);
    expect(ge.effectorCount).toBe(2);
  });

  it('effectorCount stays accurate after removeFor + re-add (free-list reuse)', () => {
    const ge = new GlowEffectors(4);
    ge.addEffector(1, 1, 1);
    const k = ge.addEffector(2, 1, 2);
    ge.removeFor(1);
    expect(ge.effectorCount).toBe(1);
    const reused = ge.addEffector(3, 1, 3);
    expect(ge.effectorCount).toBe(2);
    // k was the index for cell 2; reused should be the freed slot from cell 1.
    expect(reused).not.toBe(k);
    expect(reused).toBe(0); // single removed was at index 0 → free list gives it back
  });
});

describe('computeGlow — neuron activation → glow deposit', () => {
  it('deposits glowGain * activation * effectorGain into the glow field', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.actCur[1] = 0.8; // neuron at slot 1, activation 0.8
    net.actCur[2] = 0.5;
    const ge = new GlowEffectors(4);
    ge.addEffector(1, 1, 1.0);
    ge.addEffector(2, 1, 2.0);
    const glow = new StubGlow();
    const f = makeCellArrays([0, 10, 20], [0, 30, 40], [
      CellType.NEURON,
      CellType.NEURON,
      CellType.NEURON,
    ]);
    computeGlow(net, glow, ge, f, 0.5, 0);
    // effector 0: 0.5 * 0.8 * 1.0 = 0.4
    // effector 1: 0.5 * 0.5 * 2.0 = 0.5
    expect(glow.data.length).toBe(2);
    expect(glow.data[0]).toBeCloseTo(0.4, 5);
    expect(glow.data[1]).toBeCloseTo(0.5, 5);
  });

  it('skips effectors with zero or negative activation', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.actCur[1] = 0.0;
    net.actCur[2] = -0.1;
    const ge = new GlowEffectors(4);
    ge.addEffector(1, 1, 1.0);
    ge.addEffector(2, 1, 1.0);
    const glow = new StubGlow();
    const f = makeCellArrays([0, 10, 20], [0, 30, 40], [
      CellType.NEURON,
      CellType.NEURON,
      CellType.NEURON,
    ]);
    computeGlow(net, glow, ge, f, 1.0, 0);
    expect(glow.data).toEqual([]);
  });

  it('skips recycled (non-NEURON) slots', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.actCur[1] = 0.9;
    net.actCur[2] = 0.3;
    const ge = new GlowEffectors(4);
    ge.addEffector(1, 1, 1.0);
    ge.addEffector(2, 1, 1.0);
    const glow = new StubGlow();
    // slot 1 recycled into DIGESTIVE; slot 2 still NEURON
    const f = makeCellArrays([0, 10, 20], [0, 30, 40], [
      CellType.NEURON,
      CellType.DIGESTIVE,
      CellType.NEURON,
    ]);
    computeGlow(net, glow, ge, f, 1.0, 0);
    // slot 1 is DIGESTIVE (recycled), skipped; only slot 2 fires (0.3 * 1.0 * 1.0 = 0.3)
    expect(glow.data.length).toBe(1);
    expect(glow.data[0]).toBeCloseTo(0.3, 5);
  });
});