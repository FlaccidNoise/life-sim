import { describe, it, expect } from 'vitest';
import { NeuralNetwork } from './network';
import { driveMovers } from './motor';

describe('driveMovers — motor neuron activations → MOVER thrust/turn', () => {
  it('turns heading by turnScale·a_turn and sets clamped thrust', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.addMotor(0 /*mover*/, 1 /*turn*/, 2 /*thrust*/);
    net.actCur[1] = 0.5; // turn activation
    net.actCur[2] = 1.0; // thrust activation
    const heading = Float32Array.from([0.2, 0, 0]);
    const thrust = new Float32Array(3);
    // turnScale 0.4, thrustScale 4, thrustBias 1, maxThrust 6; carnivore edge off (mult 1)
    driveMovers(
      net,
      heading,
      thrust,
      0.4,
      4,
      1,
      6,
      new Uint32Array(3),
      new Uint8Array(2),
      1,
      new Float32Array(3),
      1e9,
      0,
      0,
      0,
    );
    expect(heading[0]).toBeCloseTo(0.2 + 0.4 * 0.5, 6);
    expect(thrust[0]).toBeCloseTo(4 * 1.0 + 1, 6); // 5, under the cap
  });

  it('clamps thrust to maxThrust and floors at 0', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.addMotor(0, 1, 2);
    net.actCur[1] = 0;
    net.actCur[2] = 1; // 4*1+1 = 5, but cap 3 → 3
    const heading = new Float32Array(3);
    const thrust = new Float32Array(3);
    driveMovers(
      net,
      heading,
      thrust,
      0.4,
      4,
      1,
      3,
      new Uint32Array(3),
      new Uint8Array(2),
      1,
      new Float32Array(3),
      1e9,
      0,
      0,
      0,
    );
    expect(thrust[0]).toBeCloseTo(3, 6);

    net.actCur[2] = -1; // 4*-1+1 = -3 → floored to 0
    driveMovers(
      net,
      heading,
      thrust,
      0.4,
      4,
      1,
      3,
      new Uint32Array(3),
      new Uint8Array(2),
      1,
      new Float32Array(3),
      1e9,
      0,
      0,
      0,
    );
    expect(thrust[0]).toBe(0);
  });

  it('carnivore speed edge scales thrust and the cap for carnivore organisms only', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.addMotor(0, 1, 2);
    net.actCur[1] = 0;
    net.actCur[2] = 1; // base t = 4*1+1 = 5
    const heading = new Float32Array(3);
    const thrust = new Float32Array(3);
    // mover cell 0 → organism 1; organism 1 is carnivore. mult 1.5 → t=7.5, cap=6*1.5=9 (no clamp)
    const organismId = Uint32Array.from([1, 0, 0]);
    const carnivore = Uint8Array.from([0, 1]);
    driveMovers(
      net,
      heading,
      thrust,
      0.4,
      4,
      1,
      6,
      organismId,
      carnivore,
      1.5,
      new Float32Array(3),
      1e9,
      0,
      0,
      0,
    );
    expect(thrust[0]).toBeCloseTo(7.5, 6);

    // herbivore organism: no scaling, base t = 5 (< cap 6) passes through unscaled
    const herbId = Uint32Array.from([1, 0, 0]);
    const herb = Uint8Array.from([0, 0]);
    driveMovers(
      net,
      heading,
      thrust,
      0.4,
      4,
      1,
      6,
      herbId,
      herb,
      1.5,
      new Float32Array(3),
      1e9,
      0,
      0,
      0,
    );
    expect(thrust[0]).toBeCloseTo(5, 6);
  });
});
