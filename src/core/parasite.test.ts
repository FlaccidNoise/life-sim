import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { defaultConfig, type Config } from './config';
import { parasiteStep, metabolize } from './economy';
import { FoodField } from './food-field';
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

/** An empty food field — metabolize needs one, but these tests set eatRate 0 so nothing is grazed. */
function emptyFood(): FoodField {
  return new FoodField(W, H, 16, 16, 0, 1);
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

/**
 * syncParasites copies the host's velocity into an attached parasite so the renderer doesn't smear it,
 * but that velocity is the HOST's locomotion. Charging metabolize's moveCost·speed² against it made the
 * rider pay ~3× what its drain earns, so the morph was selected against exactly when it worked.
 */
describe('metabolize rider move cost', () => {
  const cfg = defaultConfig({
    parasiteEnabled: true,
    parasiteDrain: 0,
    parasiteAttachRange: 40,
    parasiteSizeRatio: 1.2,
    basalCost: 0,
    moveCost: 1,
    sizeMoveCostExp: 0,
    eatRate: 0,
    worldWidth: W,
    worldHeight: H,
  });

  /** One free-living and one attached creature, both moving at the same speed, both otherwise costless. */
  function pair(attach: boolean): { s: OrganismStore; host: number; para: number } {
    const s = new OrganismStore(8);
    const host = s.alloc();
    const para = s.alloc();
    for (const i of [host, para]) {
      s.x[i] = 20;
      s.y[i] = 20;
      s.energy[i] = 100;
      s.vx[i] = 3;
      s.vy[i] = 4; // speed² = 25
    }
    // Same parasite either way; only the host's size decides whether it is big enough to attach to, so
    // the two runs differ ONLY in attachment (identical gene upkeep on the parasite).
    genes(s, host, cfg, { [ScalarGene.SIZE]: attach ? 10 : 4, [ScalarGene.PARASITISM]: 0 });
    genes(s, para, cfg, { [ScalarGene.SIZE]: 4, [ScalarGene.PARASITISM]: 1 });
    s.rebuildLive();
    if (attach) parasiteStep(s, hashOf(s), cfg);
    return { s, host, para };
  }

  it('an attached parasite pays NO move cost for the velocity it copied from its host', () => {
    const free = pair(false);
    const rider = pair(true);
    expect(rider.s.hostSlot[rider.para]).toBeGreaterThanOrEqual(0);
    expect(free.s.hostSlot[free.para]).toBe(-1);
    metabolize(free.s, emptyFood(), hashOf(free.s), cfg);
    metabolize(rider.s, emptyFood(), hashOf(rider.s), cfg);
    // Identical genes and velocity; the ONLY difference is the attachment, so the gap is the speed² cost.
    expect(rider.s.energy[rider.para]! - free.s.energy[free.para]!).toBeCloseTo(cfg.moveCost * 25);
  });

  it('the host itself still pays its own move cost', () => {
    const still = pair(true);
    still.s.vx[still.host] = 0;
    still.s.vy[still.host] = 0;
    const moving = pair(true);
    metabolize(still.s, emptyFood(), hashOf(still.s), cfg);
    metabolize(moving.s, emptyFood(), hashOf(moving.s), cfg);
    expect(still.s.energy[still.host]! - moving.s.energy[moving.host]!).toBeCloseTo(
      cfg.moveCost * 25,
    );
  });
});
