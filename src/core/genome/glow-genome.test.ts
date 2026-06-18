import { describe, it, expect } from 'vitest';
import { develop } from './develop';
import { type Genome } from './genome';
import { CellType } from '../cells/types';

/**
 * A tiny genome with a glow NEURON: MOVER seed + one NEURON child with glowGain=0.7.
 */
function glowGenome(glowGain: number): Genome {
  return {
    seedGene: 0,
    genes: [
      {
        innovation: 0,
        cellType: CellType.MOVER,
        radius: 6,
        mass: 2,
        initialEnergy: 100,
        bias: 0,
        sensorChannel: -1,
        glowGain: 0,
        senseSource: 0,
        sightTarget: 0,
      },
      {
        innovation: 1,
        cellType: CellType.NEURON,
        radius: 6,
        mass: 2,
        initialEnergy: 100,
        bias: 0.5,
        sensorChannel: -1,
        glowGain,
        senseSource: 0,
        sightTarget: 0,
      },
    ],
    divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 24, stiffness: 1, repeat: 1 }],
    bondRules: [],
    connectionRules: [],
    motorRules: [],
    parentRef: -1,
    generation: 0,
    founderId: -1,
  };
}

describe('glow genome development', () => {
  it('emits a glow binding when a NEURON gene has glowGain > 0', () => {
    const body = develop(glowGenome(0.7), 256, 16);
    expect(body.glow).toHaveLength(1);
    expect(body.glow[0]!.gain).toBe(0.7);
    // The NEURON is gene index 1, which is the second cell emitted (BFS order: seed=0, then child=1).
    expect(body.glow[0]!.cell).toBe(1);
    expect(body.cellType[body.glow[0]!.cell]).toBe(CellType.NEURON);
  });

  it('emits no glow binding when glowGain is 0', () => {
    const body = develop(glowGenome(0), 256, 16);
    expect(body.glow).toHaveLength(0);
  });
});
