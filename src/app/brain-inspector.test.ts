import { describe, it, expect } from 'vitest';
import { sensorLabel } from './brain-inspector';
import { SenseSource, SightTarget } from '../core/cells/sense-source';

function fakeNet(bindings: { cell: number; source: number; sightTarget: number }[]): {
  sensorCell: Uint32Array;
  sensorSource: Uint8Array;
  sensorSightTarget: Uint8Array;
  sensorCount: number;
} {
  const n = bindings.length;
  const net = {
    sensorCell: new Uint32Array(n),
    sensorSource: new Uint8Array(n),
    sensorSightTarget: new Uint8Array(n),
    sensorCount: n,
  };
  bindings.forEach((b, k) => {
    net.sensorCell[k] = b.cell;
    net.sensorSource[k] = b.source;
    net.sensorSightTarget[k] = b.sightTarget;
  });
  return net;
}

describe('sensorLabel', () => {
  it('labels a smell sensor Sm', () => {
    const net = fakeNet([{ cell: 7, source: SenseSource.SMELL, sightTarget: SightTarget.FOOD }]);
    expect(sensorLabel(net, 7)).toBe('Sm');
  });
  it('labels a hearing sensor He', () => {
    const net = fakeNet([{ cell: 7, source: SenseSource.HEARING, sightTarget: SightTarget.FOOD }]);
    expect(sensorLabel(net, 7)).toBe('He');
  });
  it('labels sight sensors by target class', () => {
    const net = fakeNet([
      { cell: 1, source: SenseSource.SIGHT, sightTarget: SightTarget.FOOD },
      { cell: 2, source: SenseSource.SIGHT, sightTarget: SightTarget.PREY },
      { cell: 3, source: SenseSource.SIGHT, sightTarget: SightTarget.PREDATOR },
    ]);
    expect(sensorLabel(net, 1)).toBe('Si:F');
    expect(sensorLabel(net, 2)).toBe('Si:Y');
    expect(sensorLabel(net, 3)).toBe('Si:P');
  });
  it('returns bare S for a cell with no sensor binding', () => {
    const net = fakeNet([{ cell: 7, source: SenseSource.SMELL, sightTarget: SightTarget.FOOD }]);
    expect(sensorLabel(net, 99)).toBe('S');
  });
});
