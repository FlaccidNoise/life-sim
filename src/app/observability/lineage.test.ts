import { describe, it, expect } from 'vitest';
import { Lineage, type LineageStore } from './lineage';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

const MAXS = 16;

/** A minimal mutable fake store: set founders/births by slot, flip alive, snapshot hue/diet. */
function makeStore() {
  const hue = new Float32Array(MAXS);
  const scalarGenes = new Float32Array(MAXS * SCALAR_GENE_COUNT);
  const genId = new Uint32Array(MAXS);
  const liveIndices = new Uint32Array(MAXS);
  const aliveKeys = new Set<string>(); // `${slot}:${gen}`
  const store: LineageStore & { liveCount: number } = {
    hue,
    scalarGenes,
    genId,
    liveIndices,
    liveCount: 0,
    isAlive(slot: number, gen?: number): boolean {
      if (gen === undefined) return [...aliveKeys].some((k) => k.startsWith(`${slot}:`));
      return aliveKeys.has(`${slot}:${gen}`);
    },
  };
  /** Place a creature in a slot (alive) with a gen, hue, diet. */
  function put(slot: number, gen: number, h: number, diet: number): void {
    genId[slot] = gen;
    hue[slot] = h;
    scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.DIET] = diet;
    aliveKeys.add(`${slot}:${gen}`);
  }
  /** Mark the (slot,gen) individual dead. */
  function kill(slot: number, gen: number): void {
    aliveKeys.delete(`${slot}:${gen}`);
  }
  /** Set the live set (slots) for reset()'s founder snapshot. */
  function setLive(slots: number[]): void {
    for (let i = 0; i < slots.length; i++) liveIndices[i] = slots[i]!;
    store.liveCount = slots.length;
  }
  return { store, put, kill, setLive };
}

describe('Lineage recorder', () => {
  it('snapshots the seeded population as gen-0 founders', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    put(1, 1, 0.7, 0.9);
    setLive([0, 1]);
    const lin = new Lineage();
    lin.reset(store);
    expect(lin.size).toBe(2);
    const v = lin.queryBySlot(0, 1, store)!;
    expect(v.ancestors).toHaveLength(1);
    expect(v.ancestors[0]!.generation).toBe(0);
    expect(v.ancestors[0]!.birthTick).toBe(0);
    expect(v.founderKey).toBe('0:1');
    expect(v.children).toHaveLength(0);
    expect(v.dynasty).toBe(0);
  });

  it('attributes births child→parent and builds the ancestor spine', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    put(1, 1, 0.7, 0.9);
    setLive([0, 1]);
    const lin = new Lineage();
    lin.reset(store);

    // Founder 0:1 begets 2:1 at t100; 2:1 begets 3:1 at t200.
    put(2, 1, 0.21, 0.12);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 100);
    put(3, 1, 0.22, 0.13);
    lin.onBirth(2, 1, 3, 1);
    lin.commit(store, 200);

    const deep = lin.queryBySlot(3, 1, store)!;
    expect(deep.ancestors.map((r) => r.key)).toEqual(['0:1', '2:1', '3:1']);
    expect(deep.ancestors[2]!.generation).toBe(2);
    expect(deep.ancestors[2]!.birthTick).toBe(200);
    expect(deep.selectedKey).toBe('3:1');
    expect(deep.founderKey).toBe('0:1');

    const founder = lin.queryBySlot(0, 1, store)!;
    expect(founder.children.map((r) => r.key)).toEqual(['2:1']);
    expect(founder.directChildren).toBe(1);
    expect(founder.dynasty).toBe(2); // 2:1 + 3:1
  });

  it('reports alive=false for a recycled/dead node but still renders its tree', () => {
    const { store, put, kill, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    put(2, 1, 0.3, 0.4);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 50);
    kill(2, 1);
    const v = lin.queryBySlot(0, 1, store)!;
    expect(v.children[0]!.alive).toBe(false);
    expect(v.children[0]!.diet).toBeCloseTo(0.4); // birth-snapshot survives the slot dying
  });

  it('returns null for an unknown key', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    expect(lin.queryBySlot(9, 9, store)).toBeNull();
  });

  it('reset clears the forest before re-snapshotting', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    put(2, 1, 0.3, 0.4);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 50);
    expect(lin.size).toBe(2);
    lin.reset(store); // rebuild: only slot 0 is live again
    expect(lin.size).toBe(1);
    expect(lin.queryBySlot(2, 1, store)).toBeNull();
  });
});
