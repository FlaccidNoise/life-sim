import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';

describe('OrganismStore', () => {
  it('allocates ascending slots from a fresh store', () => {
    const s = new OrganismStore(8);
    expect(s.alloc()).toBe(0);
    expect(s.alloc()).toBe(1);
    expect(s.alloc()).toBe(2);
  });

  it('returns -1 when full', () => {
    const s = new OrganismStore(2);
    expect(s.alloc()).toBe(0);
    expect(s.alloc()).toBe(1);
    expect(s.alloc()).toBe(-1);
  });

  it('bumps genId on slot reuse (stale-reference guard)', () => {
    const s = new OrganismStore(4);
    const slot = s.alloc();
    const gen0 = s.genId[slot]!;
    expect(s.isAlive(slot, gen0)).toBe(true);
    s.free(slot);
    expect(s.isAlive(slot, gen0)).toBe(false); // freed
    const reused = s.alloc();
    expect(reused).toBe(slot); // LIFO reuse
    expect(s.genId[slot]!).not.toBe(gen0); // generation advanced
    expect(s.isAlive(slot, gen0)).toBe(false); // old reference is stale
    expect(s.isAlive(slot, s.genId[slot])).toBe(true);
  });

  it('rebuildLive lists live slots in ascending order', () => {
    const s = new OrganismStore(8);
    for (let i = 0; i < 6; i++) s.alloc();
    s.free(1);
    s.free(4);
    s.rebuildLive();
    const live = Array.from(s.liveIndices.subarray(0, s.liveCount));
    expect(live).toEqual([0, 2, 3, 5]);
  });

  it('rebuildLive captures liveGen parallel to liveIndices → guards a slot recycled mid-iteration', () => {
    // The exact reproduce() hazard: a slot live at rebuildLive is freed (cull) then re-allocated as a
    // newborn the SAME tick. The captured generation must flag the recycled slot as no-longer-the-original,
    // so reproduce's isAlive(p, parentGens[k]) skips it instead of re-breeding the newborn as a parent.
    const s = new OrganismStore(4);
    for (let i = 0; i < 3; i++) s.alloc(); // slots 0,1,2 live
    s.rebuildLive();
    const k = 1;
    const slot = s.liveIndices[k]!;
    const capturedGen = s.liveGen[k]!;
    expect(s.isAlive(slot, capturedGen)).toBe(true); // still the original creature
    s.free(slot); // culled this tick
    const child = s.alloc(); // newborn recycles the freed slot (LIFO)
    expect(child).toBe(slot);
    expect(s.isAlive(slot)).toBe(true); // bare check: alive (the newborn) — what the OLD buggy guard saw
    expect(s.isAlive(slot, capturedGen)).toBe(false); // generation guard: correctly stale → newborn skipped
  });

  it('clear() empties and resets allocation to ascending', () => {
    const s = new OrganismStore(4);
    s.alloc();
    s.alloc();
    s.clear();
    s.rebuildLive();
    expect(s.liveCount).toBe(0);
    expect(s.alloc()).toBe(0);
  });

  it('alloc resets breedCooldownLeft so a recycled slot is breeding-ready', () => {
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.breedCooldownLeft[a] = 99; // simulate a creature mid-refractory
    s.free(a);
    const b = s.alloc(); // LIFO → reuses the same slot
    expect(b).toBe(a);
    expect(s.breedCooldownLeft[b]!).toBe(0); // the new occupant starts ready, not inheriting stale cooldown
  });

  it('alloc resets huntCooldownLeft so a recycled slot is hunt-ready (Type-II refractory)', () => {
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.huntCooldownLeft[a] = 99; // simulate a predator mid handling-time refractory
    s.free(a);
    const b = s.alloc(); // LIFO → reuses the same slot
    expect(b).toBe(a);
    expect(s.huntCooldownLeft[b]!).toBe(0); // the new occupant starts hunt-ready, not inheriting stale cooldown
  });
});
