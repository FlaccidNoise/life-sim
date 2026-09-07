import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { defaultConfig, type Config } from './config';
import { parasiteStep } from './economy';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from './genome';

const W = 128;
const H = 128;

function genes(
  s: OrganismStore,
  slot: number,
  cfg: Config,
  overrides: Record<number, number> = {},
): void {
  const base = slot * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++)
    s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
  s.scalarGenes[base + ScalarGene.DIET] = 0;
  for (const [idx, v] of Object.entries(overrides)) s.scalarGenes[base + Number(idx)] = v;
}

function hashOf(s: OrganismStore): SpatialHash {
  const h = new SpatialHash(W, H, 12, 64);
  h.build(s);
  return h;
}

/**
 * The parasite's host link is a RAW SLOT INDEX, so `alive[host]` alone cannot tell "my host" from "a
 * newborn that was allocated into my dead host's slot". cullDead frees and reproduce reallocates within
 * the SAME tick, and the free list is LIFO, so that reuse is the common case rather than a rare race.
 * store.hostGen pins the host's genId at attach time to make the recycle detectable.
 */
describe('parasiteStep host recycling (ABA)', () => {
  const cfg = defaultConfig({
    parasiteEnabled: true,
    parasiteDrain: 1,
    parasiteGain: 1,
    parasiteAttachRange: 40,
    parasiteSizeRatio: 1.2,
    worldWidth: W,
    worldHeight: H,
  });

  /** Attach one parasite to one host, both sitting at the same spot. Returns their slots. */
  function attached(s: OrganismStore): { host: number; para: number } {
    const host = s.alloc();
    const para = s.alloc();
    for (const i of [host, para]) {
      s.x[i] = 20;
      s.y[i] = 20;
      s.energy[i] = 100;
    }
    genes(s, host, cfg, { [ScalarGene.SIZE]: 10, [ScalarGene.PARASITISM]: 0 });
    genes(s, para, cfg, { [ScalarGene.SIZE]: 4, [ScalarGene.PARASITISM]: 1 });
    s.rebuildLive();
    parasiteStep(s, hashOf(s), cfg);
    return { host, para };
  }

  it('attaches to a qualifying host and stamps its generation', () => {
    const s = new OrganismStore(8);
    const { host, para } = attached(s);
    expect(s.hostSlot[para]).toBe(host);
    expect(s.hostGen[para]).toBe(s.genId[host]);
    expect(s.parasiteCount[host]).toBe(1);
  });

  it('detaches instead of draining a newborn that reused the dead host slot', () => {
    const s = new OrganismStore(8);
    const { host, para } = attached(s);

    // The host dies and its slot is immediately handed to a newborn — LIFO guarantees the same slot.
    s.free(host);
    const newborn = s.alloc();
    expect(newborn).toBe(host); // the scenario is only meaningful if the slot really was reused
    s.x[newborn] = 20;
    s.y[newborn] = 20;
    s.energy[newborn] = 100;
    // Make the newborn an INELIGIBLE host (too small) so any drain must come from the stale link, not a
    // fresh legitimate attach.
    genes(s, newborn, cfg, { [ScalarGene.SIZE]: 1, [ScalarGene.PARASITISM]: 0 });
    s.rebuildLive();

    parasiteStep(s, hashOf(s), cfg);

    expect(s.hostSlot[para]).toBe(-1); // stale link dropped
    expect(s.energy[newborn]).toBe(100); // the stranger was never drained
    expect(s.parasiteCount[newborn]).toBe(0); // and its own count was not corrupted by the detach
  });

  it('keeps draining a host whose slot was never recycled', () => {
    const s = new OrganismStore(8);
    const { host, para } = attached(s);
    const before = s.energy[host]!;

    parasiteStep(s, hashOf(s), cfg);

    expect(s.hostSlot[para]).toBe(host); // still attached
    expect(s.energy[host]).toBeCloseTo(before - cfg.parasiteDrain);
  });

  it('will not attach a second parasite to an occupied host', () => {
    const s = new OrganismStore(8);
    const { host } = attached(s);
    const second = s.alloc();
    s.x[second] = 20;
    s.y[second] = 20;
    s.energy[second] = 100;
    genes(s, second, cfg, { [ScalarGene.SIZE]: 4, [ScalarGene.PARASITISM]: 1 });
    s.rebuildLive();

    parasiteStep(s, hashOf(s), cfg);

    expect(s.hostSlot[second]).toBe(-1);
    expect(s.parasiteCount[host]).toBe(1);
  });
});
