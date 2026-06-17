import { describe, it, expect } from 'vitest';
import { GenomeStore, cloneGenome } from './genome';
import { buildForagerGenome } from './critter-genome';
import { LineageLog, serializeLineageLog } from './lineage-log';

function child(store: GenomeStore, parentRef: number): number {
  const parent = store.get(parentRef)!;
  const c = cloneGenome(parent);
  c.parentRef = parentRef;
  c.generation = parent.generation + 1;
  return store.register(c);
}

describe('LineageLog', () => {
  it('lazily roots a founder when its first child is recorded, and links the child', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6)); // founder, founderId 0
    const cRef = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(cRef, 50);
    const nodes = log.list();
    expect(nodes.length).toBe(2); // founder root (lazy) + child
    const root = nodes.find((n) => n.ref === fRef)!;
    const kid = nodes.find((n) => n.ref === cRef)!;
    expect(root.parentRef).toBe(-1);
    expect(root.generation).toBe(0);
    expect(kid.parentRef).toBe(fRef);
    expect(kid.generation).toBe(1);
    expect(kid.founderId).toBe(0);
  });

  it('records death by stamping deathTick on the node', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const cRef = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(cRef, 50);
    log.recordDeath(cRef, 80);
    expect(log.list().find((n) => n.ref === cRef)!.deathTick).toBe(80);
  });

  it('recordDeath on an unknown ref is a no-op', () => {
    const store = new GenomeStore();
    const log = new LineageLog(store);
    expect(() => log.recordDeath(999, 10)).not.toThrow();
    expect(log.size).toBe(0);
  });

  it('prune removes dead subtrees (oldest first) but never a node with a live descendant', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const c1 = child(store, fRef);
    const c2 = child(store, fRef);
    const g1 = child(store, c1); // grandchild under c1
    const log = new LineageLog(store);
    log.recordBirth(c1, 10);
    log.recordBirth(c2, 20);
    log.recordBirth(g1, 30);
    // c2 dies (dead leaf); c1 dies but has a LIVE grandchild g1; founder root never dies.
    log.recordDeath(c2, 40);
    log.recordDeath(c1, 50);
    log.prune(3); // over cap (4 nodes) → must drop the dead leaf c2 first
    const refs = log.list().map((n) => n.ref);
    expect(refs).not.toContain(c2); // dead leaf pruned
    expect(refs).toContain(g1); // live node kept
    expect(refs).toContain(c1); // c1 kept: has a live descendant
    expect(refs).toContain(fRef); // root kept: has live descendants
  });

  it('serializes deterministically in ref order', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const c1 = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(c1, 10);
    const json = serializeLineageLog(log);
    expect(json).toBe(serializeLineageLog(log)); // stable
    const parsed = JSON.parse(json) as { ref: number }[];
    expect(parsed.map((n) => n.ref)).toEqual([...parsed.map((n) => n.ref)].sort((a, b) => a - b));
  });
});
