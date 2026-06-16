import { describe, it, expect } from 'vitest';
import { NeuralNetwork, SensorChannel } from './network';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

describe('NeuralNetwork', () => {
  it('pre-allocates per-cell bias/activation buffers and synapse SoA, zero-init', () => {
    const net = new NeuralNetwork(8, 16, 8);
    expect(net.bias.length).toBe(8);
    expect(net.actCur.length).toBe(8);
    expect(net.actNxt.length).toBe(8);
    expect(net.weight.length).toBe(16);
    expect(net.bias[0]).toBe(0);
    expect(net.actCur[0]).toBe(0);
    expect(net.liveSynapseCount).toBe(0);
    expect(net.liveNeuronCount).toBe(0);
  });

  it('addSynapse stores endpoints + generation in separate arrays (not bit-packed)', () => {
    const net = new NeuralNetwork(8, 16, 8);
    const s = net.addSynapse(2, 5, 3, 9, 0.5);
    expect(s).toBe(0);
    expect(net.pre[s]).toBe(2);
    expect(net.preGen[s]).toBe(5);
    expect(net.post[s]).toBe(3);
    expect(net.postGen[s]).toBe(9);
    expect(net.weight[s]).toBeCloseTo(0.5, 6);
  });

  it('addSynapse refuses (returns -1) when the pool is full (refuse-new overflow policy)', () => {
    const net = new NeuralNetwork(8, 2, 8);
    expect(net.addSynapse(0, 0, 1, 0, 1)).toBe(0);
    expect(net.addSynapse(0, 0, 1, 0, 1)).toBe(1);
    expect(net.addSynapse(0, 0, 1, 0, 1)).toBe(-1); // full
  });

  it('rebuildLive collects alive neural cells (ascending) and gen-valid synapses', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc(); // 0 — SENSOR
    const b = store.alloc(); // 1 — NEURON
    const c = store.alloc(); // 2 — PHOTO (not neural)
    f.cellType[a] = CellType.SENSOR;
    f.cellType[b] = CellType.NEURON;
    f.cellType[c] = CellType.PHOTO;

    const net = new NeuralNetwork(8, 16, 8);
    const sGood = net.addSynapse(a, f.generation[a]!, b, f.generation[b]!, 1);
    // a synapse to a slot we then free → must be pruned by rebuildLive
    const d = store.alloc(); // 3
    f.cellType[d] = CellType.NEURON;
    const sBad = net.addSynapse(b, f.generation[b]!, d, f.generation[d]!, 1);
    store.free(d); // bumps generation[d]

    net.rebuildLive(store);
    // live neurons = a, b (ascending); c is PHOTO, d is dead
    expect(Array.from(net.liveNeurons.slice(0, net.liveNeuronCount))).toEqual([a, b]);
    // live synapses = only sGood (sBad dangles to the freed d)
    expect(net.liveSynapseCount).toBe(1);
    expect(net.liveSynapses[0]).toBe(sGood);
    expect(sBad).toBe(1);
  });

  it('swap() exchanges actCur/actNxt by reference (no copy)', () => {
    const net = new NeuralNetwork(4, 4, 4);
    const cur0 = net.actCur;
    const nxt0 = net.actNxt;
    net.actNxt[1] = 0.7;
    net.swap();
    expect(net.actCur).toBe(nxt0);
    expect(net.actNxt).toBe(cur0);
    expect(net.actCur[1]).toBeCloseTo(0.7, 6);
  });

  it('addSensor / addMotor register bindings', () => {
    const net = new NeuralNetwork(8, 16, 8);
    net.addSensor(4, SensorChannel.FWD_GRAD);
    net.addSensor(5, SensorChannel.LAT_GRAD);
    net.addMotor(6, 7, 8);
    expect(net.sensorCount).toBe(2);
    expect(net.sensorCell[0]).toBe(4);
    expect(net.sensorChannel[1]).toBe(SensorChannel.LAT_GRAD);
    expect(net.motorCount).toBe(1);
    expect(net.moverCell[0]).toBe(6);
    expect(net.turnNeuron[0]).toBe(7);
    expect(net.thrustNeuron[0]).toBe(8);
  });
});
