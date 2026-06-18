import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';
import { NeuralNetwork, SensorChannel } from './network';
import { SenseSource, SightTarget } from '../cells/sense-source';
import { think } from './think';

/** Tick once: think writes actNxt, then swap so actCur holds a(t). */
function step(net: NeuralNetwork, store: CellStore): void {
  const f = store.fields;
  think(net, f.cellType, f.senseX, f.senseY, f.heading);
  net.swap();
}

describe('think — recurrent forward pass', () => {
  it('feed-forward: known weights + injected sensor → known tanh activations', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const sIn = store.alloc(); // 0 SENSOR (FWD_GRAD)
    const hOut = store.alloc(); // 1 NEURON
    f.cellType[sIn] = CellType.SENSOR;
    f.cellType[hOut] = CellType.NEURON;
    f.heading[sIn] = 0; // body faces +x → fwd = senseX
    f.senseX[sIn] = 0.5;
    f.senseY[sIn] = 0;

    const net = new NeuralNetwork(4, 4, 4);
    net.addSensor(sIn, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    net.bias[hOut] = 0.1;
    net.addSynapse(sIn, f.generation[sIn]!, hOut, f.generation[hOut]!, 2);
    net.rebuildLive(store);

    // Tick 1: sensor injected = 0.5 into actCur[sIn] (after swap). hOut reads a(t−1)=0
    //         → actNxt[hOut] = tanh(0.1 + 2*0) = tanh(0.1).
    step(net, store);
    expect(net.actCur[sIn]).toBeCloseTo(0.5, 5);
    expect(net.actCur[hOut]).toBeCloseTo(Math.tanh(0.1), 5);

    // Tick 2: hOut now reads a(t−1)=sensor 0.5 → tanh(0.1 + 2*0.5)=tanh(1.1).
    step(net, store);
    expect(net.actCur[hOut]).toBeCloseTo(Math.tanh(1.1), 5);
  });

  it('recurrence: a self-synapse evolves a(t)=tanh(bias + w·a(t−1))', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const j = store.alloc();
    f.cellType[j] = CellType.NEURON;
    const net = new NeuralNetwork(2, 2, 2);
    net.bias[j] = 0.3;
    net.addSynapse(j, f.generation[j]!, j, f.generation[j]!, 0.8); // self-loop
    net.rebuildLive(store);

    // Oracle uses Math.fround to mirror the kernel's Float32 activation storage, so the
    // comparison stays exact even as more steps accumulate (digit-5 is safe at 3 steps;
    // fround keeps longer/future recurrence tests from drifting flaky — audit minor #1).
    let a = 0;
    for (let t = 0; t < 3; t++) {
      step(net, store);
      a = Math.fround(Math.tanh(0.3 + 0.8 * a));
      expect(net.actCur[j]).toBeCloseTo(a, 5);
    }
  });

  it('LAT_GRAD sensor projects the gradient onto the body lateral axis', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const s = store.alloc();
    f.cellType[s] = CellType.SENSOR;
    f.heading[s] = Math.PI / 2; // body faces +y
    f.senseX[s] = 1; // gradient points +x → lateral (right of a +y heading) = -1
    f.senseY[s] = 0;
    const net = new NeuralNetwork(2, 2, 2);
    net.addSensor(s, SensorChannel.LAT_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    net.rebuildLive(store);
    step(net, store);
    // lat = -senseX*sin(h) + senseY*cos(h) = -1*1 + 0 = -1
    expect(net.actCur[s]).toBeCloseTo(-1, 5);
  });

  it('skips a live-neuron slot whose cellType is no longer neural', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const j = store.alloc();
    f.cellType[j] = CellType.NEURON;
    const net = new NeuralNetwork(2, 2, 2);
    net.bias[j] = 0.5;
    net.rebuildLive(store);
    // Mutate the slot to a non-neural type AFTER the snapshot (simulates recycle).
    f.cellType[j] = CellType.PHOTO;
    step(net, store);
    expect(net.actCur[j]).toBe(0); // not written
  });
});
