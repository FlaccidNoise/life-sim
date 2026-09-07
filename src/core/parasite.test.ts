import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { defaultConfig, type Config } from './config';
import { parasiteStep, metabolize, satiatedBar } from './economy';
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
 * One free-living and one attached parasite, both moving at speed² = 25, both otherwise costless.
 * Only the host's SIZE decides whether it is big enough to attach to, so the two runs differ ONLY in
 * attachment (identical genes, identical velocity, identical position, identical gene upkeep).
 */
function riderPair(cfg: Config, attach: boolean): { s: OrganismStore; host: number; para: number } {
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
  genes(s, host, cfg, { [ScalarGene.SIZE]: attach ? 10 : 4, [ScalarGene.PARASITISM]: 0 });
  genes(s, para, cfg, { [ScalarGene.SIZE]: 4, [ScalarGene.PARASITISM]: 1 });
  s.rebuildLive();
  if (attach) parasiteStep(s, hashOf(s), cfg);
  return { s, host, para };
}

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

  it('an attached parasite pays NO move cost for the velocity it copied from its host', () => {
    const free = riderPair(cfg, false);
    const rider = riderPair(cfg, true);
    expect(rider.s.hostSlot[rider.para]).toBeGreaterThanOrEqual(0);
    expect(free.s.hostSlot[free.para]).toBe(-1);
    metabolize(free.s, emptyFood(), hashOf(free.s), cfg);
    metabolize(rider.s, emptyFood(), hashOf(rider.s), cfg);
    // Identical genes and velocity; the ONLY difference is the attachment, so the gap is the speed² cost.
    expect(rider.s.energy[rider.para]! - free.s.energy[free.para]!).toBeCloseTo(cfg.moveCost * 25);
  });

  it('the host itself still pays its own move cost', () => {
    const still = riderPair(cfg, true);
    still.s.vx[still.host] = 0;
    still.s.vy[still.host] = 0;
    const moving = riderPair(cfg, true);
    metabolize(still.s, emptyFood(), hashOf(still.s), cfg);
    metabolize(moving.s, emptyFood(), hashOf(moving.s), cfg);
    expect(still.s.energy[still.host]! - moving.s.energy[moving.host]!).toBeCloseTo(
      cfg.moveCost * 25,
    );
  });
});

/**
 * The move-cost exemption must not leak into photosynthesis. Both read speed², but the rider is exempt
 * from paying for locomotion it never performed, NOT from physically moving — so the stillness factor
 * 1/(1 + photosynthStillnessK·speed²) has to see the host's real speed. Zeroing speed² at the source gave
 * every rider perfect photosynthesis while being carried at full speed.
 */
describe('metabolize rider photosynthesis stillness', () => {
  const cfg = defaultConfig({
    parasiteEnabled: true,
    parasiteDrain: 0,
    parasiteAttachRange: 40,
    parasiteSizeRatio: 1.2,
    basalCost: 0,
    moveCost: 0, // photosynthesis is then the ONLY term that reads speed²
    sizeMoveCostExp: 0,
    eatRate: 0,
    photosynthEnabled: true,
    photosynthGain: 1,
    photosynthStillnessK: 4,
    worldWidth: W,
    worldHeight: H,
  });
  const photo = { [ScalarGene.PHOTOSYNTH]: 1 };

  it('a carried rider harvests light at its host speed, not as if still', () => {
    const free = riderPair(cfg, false);
    const rider = riderPair(cfg, true);
    for (const p of [free, rider]) genes(p.s, p.para, cfg, { ...photo, [ScalarGene.SIZE]: 4 });
    metabolize(free.s, emptyFood(), hashOf(free.s), cfg);
    metabolize(rider.s, emptyFood(), hashOf(rider.s), cfg);
    expect(rider.s.energy[rider.para]).toBeCloseTo(free.s.energy[free.para]!);
  });

  it('and a genuinely still creature still out-harvests it', () => {
    const rider = riderPair(cfg, true);
    genes(rider.s, rider.para, cfg, { ...photo, [ScalarGene.SIZE]: 4 });
    const parked = riderPair(cfg, false);
    genes(parked.s, parked.para, cfg, { ...photo, [ScalarGene.SIZE]: 4 });
    parked.s.vx[parked.para] = 0;
    parked.s.vy[parked.para] = 0;
    metabolize(rider.s, emptyFood(), hashOf(rider.s), cfg);
    metabolize(parked.s, emptyFood(), hashOf(parked.s), cfg);
    // stillness 1 vs 1/(1+4·25) = 1/101, so at this light the parked creature gains 0.494 and the
    // carried rider 0.0049 — before the fix the rider scored the parked creature's rate exactly.
    expect(parked.s.energy[parked.para]! - rider.s.energy[rider.para]!).toBeGreaterThan(0.4);
  });
});

/**
 * The morph satiation cap: the three morph income channels stop paying a creature that is already full,
 * exactly as metabolize's graze-stop and hunt's B4 cap already do. Uncapped they mint past the breed bar
 * into a hoard reproduce never spends, which is what cost the demo its attractor.
 */
describe('morphSatiationCap', () => {
  const base = {
    parasiteEnabled: true,
    parasiteDrain: 1,
    parasiteGain: 1,
    parasiteAttachRange: 40,
    parasiteSizeRatio: 1.2,
    basalCost: 0,
    moveCost: 0,
    sizeMoveCostExp: 0,
    eatRate: 0,
    worldWidth: W,
    worldHeight: H,
  };

  it('a full parasite stops draining its host', () => {
    for (const cap of [false, true]) {
      const cfg = defaultConfig({ ...base, morphSatiationCap: cap });
      const p = riderPair(cfg, true);
      p.s.energy[p.para] = satiatedBar(p.s.scalarGenes, p.para, cfg) + 1;
      const hostBefore = p.s.energy[p.host]!;
      parasiteStep(p.s, hashOf(p.s), cfg);
      expect(hostBefore - p.s.energy[p.host]!).toBeCloseTo(cap ? 0 : 1);
    }
  });

  it('a full autotroph stops harvesting light', () => {
    for (const cap of [false, true]) {
      const cfg = defaultConfig({
        ...base,
        parasiteDrain: 0,
        photosynthEnabled: true,
        photosynthGain: 1,
        photosynthStillnessK: 0,
        morphSatiationCap: cap,
      });
      const p = riderPair(cfg, false);
      genes(p.s, p.para, cfg, { [ScalarGene.PHOTOSYNTH]: 1, [ScalarGene.SIZE]: 4 });
      const full = satiatedBar(p.s.scalarGenes, p.para, cfg) + 1;
      p.s.energy[p.para] = full;
      metabolize(p.s, emptyFood(), hashOf(p.s), cfg);
      const gained = p.s.energy[p.para]! - full;
      if (cap) expect(gained).toBeLessThan(0.001);
      else expect(gained).toBeGreaterThan(0.4);
    }
  });
});
