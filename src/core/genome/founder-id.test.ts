import { describe, it, expect } from 'vitest';
import { GenomeStore, cloneGenome } from './genome';
import { buildForagerGenome } from './critter-genome';

describe('founderId', () => {
  it('assigns a fresh founder id to each founder at register, distinct and monotonic', () => {
    const store = new GenomeStore();
    const a = buildForagerGenome(6);
    const b = buildForagerGenome(6);
    expect(a.founderId).toBe(-1); // builders leave it unassigned
    store.register(a);
    store.register(b);
    expect(a.founderId).toBe(0);
    expect(b.founderId).toBe(1);
  });

  it('a clone inherits the parent founder id (so children stay in the lineage)', () => {
    const store = new GenomeStore();
    const parent = buildForagerGenome(6);
    store.register(parent); // parent.founderId = 0
    const child = cloneGenome(parent);
    expect(child.founderId).toBe(0); // inherited by the clone, BEFORE its own register
    store.register(child); // already >= 0 → register must NOT reassign
    expect(child.founderId).toBe(0);
  });

  it('does not reassign a genome that already carries a founder id', () => {
    const store = new GenomeStore();
    const g = buildForagerGenome(6);
    g.founderId = 7; // pretend it arrived pre-stamped
    store.register(g);
    expect(g.founderId).toBe(7);
  });
});
