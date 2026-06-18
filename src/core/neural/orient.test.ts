import { describe, it, expect } from 'vitest';
import { NeuralNetwork, SensorChannel } from './network';
import { SenseSource, SightTarget } from '../cells/sense-source';
import { orientSensors } from './orient';

describe('orientSensors', () => {
  it('copies the organism MOVER heading to its SENSOR cells', () => {
    const net = new NeuralNetwork(8, 8, 8);
    // sensors at slots 2, 3; mover at slot 1; all organism 5.
    net.addSensor(2, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    net.addSensor(3, SensorChannel.LAT_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    const organismId = Uint32Array.from([0, 5, 5, 5]);
    const organismMover = Int32Array.from([-1, -1, -1, -1, -1, 1]); // mover[5] = slot 1
    const heading = Float32Array.from([0, 1.2, 0, 0]); // mover heading 1.2
    orientSensors(net, organismId, organismMover, heading);
    expect(heading[2]).toBeCloseTo(1.2, 5);
    expect(heading[3]).toBeCloseTo(1.2, 5);
  });

  it('leaves a sensor untouched when its organism has no mover (-1) or is free (0)', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.addSensor(2, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    net.addSensor(3, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    const organismId = Uint32Array.from([0, 0, 0 /*free*/, 9 /*no mover*/]);
    const organismMover = Int32Array.from([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1]); // mover[9] = -1
    const heading = Float32Array.from([0, 0, 0.7, 0.8]);
    orientSensors(net, organismId, organismMover, heading);
    expect(heading[2]).toBeCloseTo(0.7, 5); // org 0 → skip
    expect(heading[3]).toBeCloseTo(0.8, 5); // mover -1 → skip
  });
});
