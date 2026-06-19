import { describe, it, expect } from 'vitest';
import { applyLatchTether } from './latch-tether';
import { CellType } from '../cells/types';

// Two cells: predator i=0 latched to prey j=1. radius 3 each → rest length (contact) = 6.
function setup(dist: number) {
  const latchCell = Uint32Array.from([2, 0]); // i=0 latched to cell 1 → handle (1+1)=2; j has none
  const latchPrey = Uint32Array.from([2, 0]); // predator i=0 holds prey organism 2
  const cellType = Uint8Array.from([CellType.PREDATOR, CellType.NEURON]); // prey NEURON is flesh
  const organismId = Uint32Array.from([1, 2]); // predator org 1, prey org 2
  const radius = Float32Array.from([3, 3]);
  const posX = Float64Array.from([100, 100 + dist]);
  const posY = Float64Array.from([100, 100]);
  const forceX = new Float32Array(2);
  const forceY = new Float32Array(2);
  const live = Uint32Array.from([0, 1]);
  return { latchCell, latchPrey, cellType, organismId, radius, posX, posY, forceX, forceY, live };
}

describe('applyLatchTether', () => {
  it('pulls a separated predator and prey together (equal & opposite, toward contact)', () => {
    const s = setup(10); // dist 10 > rest 6 → attractive
    applyLatchTether(
      s.live,
      2,
      s.latchCell,
      s.latchPrey,
      s.cellType,
      s.organismId,
      s.radius,
      s.posX,
      s.posY,
      s.forceX,
      s.forceY,
      4096,
      4096,
      1.0,
      false,
    );
    // f = stiffness·(dist−rest)/dist · dx ; dx=+10 → predator pulled +x (toward prey), prey pulled −x.
    expect(s.forceX[0]!).toBeCloseTo(((1.0 * (10 - 6)) / 10) * 10, 5); // +4
    expect(s.forceX[1]!).toBeCloseTo(-s.forceX[0]!, 5); // Newton's 3rd
    expect(s.forceY[0]!).toBeCloseTo(0, 5);
  });

  it('applies no net force at the rest length (contact)', () => {
    const s = setup(6); // dist == rest → spring term 0
    applyLatchTether(
      s.live,
      2,
      s.latchCell,
      s.latchPrey,
      s.cellType,
      s.organismId,
      s.radius,
      s.posX,
      s.posY,
      s.forceX,
      s.forceY,
      4096,
      4096,
      1.0,
      false,
    );
    expect(s.forceX[0]!).toBeCloseTo(0, 5);
    expect(s.forceX[1]!).toBeCloseTo(0, 5);
  });

  it('does not tether to a non-flesh prey (died → MEAT/recycled)', () => {
    const s = setup(10);
    s.cellType[1] = CellType.MEAT; // prey corpse → drop the tether
    applyLatchTether(
      s.live,
      2,
      s.latchCell,
      s.latchPrey,
      s.cellType,
      s.organismId,
      s.radius,
      s.posX,
      s.posY,
      s.forceX,
      s.forceY,
      4096,
      4096,
      1.0,
      false,
    );
    expect(s.forceX[0]!).toBe(0);
    expect(s.forceX[1]!).toBe(0);
  });

  it('does not tether when the slot was recycled to a different organism (stale handle)', () => {
    const s = setup(10);
    s.organismId[1] = 7; // cell 1 is still flesh, but now belongs to org 7, not the held org 2
    applyLatchTether(
      s.live,
      2,
      s.latchCell,
      s.latchPrey,
      s.cellType,
      s.organismId,
      s.radius,
      s.posX,
      s.posY,
      s.forceX,
      s.forceY,
      4096,
      4096,
      1.0,
      false,
    );
    expect(s.forceX[0]!).toBe(0);
    expect(s.forceX[1]!).toBe(0);
  });

  it('is a no-op when latchCell is 0 (unlatched)', () => {
    const s = setup(10);
    s.latchCell[0] = 0;
    applyLatchTether(
      s.live,
      2,
      s.latchCell,
      s.latchPrey,
      s.cellType,
      s.organismId,
      s.radius,
      s.posX,
      s.posY,
      s.forceX,
      s.forceY,
      4096,
      4096,
      1.0,
      false,
    );
    expect(s.forceX[0]!).toBe(0);
  });

  it('herbivore latch (grazePhoto) tethers to a PHOTO plant cell, predator latch does not', () => {
    // A grazed plant cell is PHOTO (not flesh): the predator validity check would reject it, the
    // herbivore one accepts it. Same geometry, only grazePhoto differs.
    const photo = () => {
      const s = setup(10);
      s.cellType[0] = CellType.DIGESTIVE; // forager mouth
      s.cellType[1] = CellType.PHOTO; // grazed plant cell
      return s;
    };
    const sPred = photo();
    applyLatchTether(
      sPred.live,
      2,
      sPred.latchCell,
      sPred.latchPrey,
      sPred.cellType,
      sPred.organismId,
      sPred.radius,
      sPred.posX,
      sPred.posY,
      sPred.forceX,
      sPred.forceY,
      4096,
      4096,
      1.0,
      false, // predator validity: PHOTO is not flesh → no tether
    );
    expect(sPred.forceX[0]!).toBe(0);

    const sGraze = photo();
    applyLatchTether(
      sGraze.live,
      2,
      sGraze.latchCell,
      sGraze.latchPrey,
      sGraze.cellType,
      sGraze.organismId,
      sGraze.radius,
      sGraze.posX,
      sGraze.posY,
      sGraze.forceX,
      sGraze.forceY,
      4096,
      4096,
      1.0,
      true, // herbivore validity: PHOTO accepted → spring toward the plant
    );
    expect(sGraze.forceX[0]!).toBeCloseTo(((1.0 * (10 - 6)) / 10) * 10, 5); // +4 toward the plant
    expect(sGraze.forceX[1]!).toBeCloseTo(-sGraze.forceX[0]!, 5);
  });
});
