import { describe, it, expect } from 'vitest';
import { Parcels } from './parcels';
import { defaultConfig } from './config';
import { FlowField } from './flow-field';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { senseCreatures } from './sense';
import { eatParcels } from './economy';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

const W = 1000;
const H = 1000;

describe('Parcels (drifting sight-only food)', () => {
  it('spawn places a parcel deterministically via the forked parcelRng (independent of world.rng)', () => {
    const cfg = defaultConfig({
      parcelsEnabled: true,
      worldWidth: W,
      worldHeight: H,
      parcelCapacity: 8,
    });
    const a = new Parcels(cfg);
    const b = new Parcels(cfg);
    const sa = a.spawn();
    const sb = b.spawn();
    expect(sa).toBe(0);
    expect(sb).toBe(0);
    // Two pools with the same config produce byte-identical parcels (the forked stream is config-seeded).
    expect(a.x[0]).toBe(b.x[0]);
    expect(a.y[0]).toBe(b.y[0]);
    expect(a.alive[0]).toBe(1);
    expect(a.count).toBe(1);
    // Position is inside the world.
    expect(a.x[0]!).toBeGreaterThanOrEqual(0);
    expect(a.x[0]!).toBeLessThan(W);
    // A different seed gives a different parcel (the seed actually drives the stream).
    const c = new Parcels(defaultConfig({ ...cfg, seed: 999 }));
    c.spawn();
    expect(c.x[0]).not.toBe(a.x[0]);
  });

  it('reset re-seeds the spawn RNG so the sequence reproduces construction', () => {
    const cfg = defaultConfig({ parcelsEnabled: true, worldWidth: W, worldHeight: H });
    const p = new Parcels(cfg);
    const x0 = [p.spawn(), p.x[0]!, (p.spawn(), p.x[1]!)];
    p.reset();
    expect(p.count).toBe(0);
    expect(p.alive[0]).toBe(0);
    p.spawn();
    p.spawn();
    expect(p.x[0]).toBe(x0[1]);
    expect(p.x[1]).toBe(x0[2]);
  });

  it('drift advects live parcels by the flow velocity (RNG-free, repeatable)', () => {
    const cfg = defaultConfig({
      parcelsEnabled: true,
      worldWidth: W,
      worldHeight: H,
      flowStrength: 0.2,
      parcelDriftMult: 1,
      parcelDecay: 0, // isolate drift from decay
    });
    const flow = new FlowField(W, H, cfg.foodCols, cfg.foodRows, cfg);
    const p = new Parcels(cfg);
    p.spawn();
    const x0 = p.x[0]!;
    const y0 = p.y[0]!;
    const expectVx = flow.sampleX(x0, y0);
    const expectVy = flow.sampleY(x0, y0);
    p.step(flow, 1);
    // Moved by exactly the local flow velocity (× driftMult × dt), toroidal.
    expect(p.x[0]! - x0).toBeCloseTo(expectVx, 10);
    expect(p.y[0]! - y0).toBeCloseTo(expectVy, 10);
    // With no flow it stays put.
    const q = new Parcels(cfg);
    q.spawn();
    const qx = q.x[0]!;
    q.step(null, 1);
    expect(q.x[0]).toBe(qx);
  });

  it('decay / lifetime expire a parcel and free its slot', () => {
    const cfg = defaultConfig({
      parcelsEnabled: true,
      worldWidth: W,
      worldHeight: H,
      parcelEnergy: 5,
      parcelDecay: 2,
      parcelLifetime: 1000, // long → energy decay is what kills it
    });
    const p = new Parcels(cfg);
    p.spawn();
    expect(p.count).toBe(1);
    p.step(null, 1); // 5 → 3
    expect(p.alive[0]).toBe(1);
    p.step(null, 1); // 3 → 1
    expect(p.alive[0]).toBe(1);
    p.step(null, 1); // 1 → -1 → expire
    expect(p.alive[0]).toBe(0);
    expect(p.count).toBe(0);

    // Lifetime expiry (no decay): expires after parcelLifetime ticks.
    const cfg2 = defaultConfig({
      parcelsEnabled: true,
      worldWidth: W,
      worldHeight: H,
      parcelDecay: 0,
      parcelLifetime: 3,
    });
    const q = new Parcels(cfg2);
    q.spawn();
    q.step(null, 1); // life 3 → 2
    q.step(null, 1); // 2 → 1
    expect(q.alive[0]).toBe(1);
    q.step(null, 1); // 1 → 0 → expire
    expect(q.alive[0]).toBe(0);
    // A freed slot is reused by the next spawn.
    const s = q.spawn();
    expect(s).toBe(0);
  });

  it('maybeSpawn fires on the interval up to capacity', () => {
    const cfg = defaultConfig({
      parcelsEnabled: true,
      worldWidth: W,
      worldHeight: H,
      parcelCapacity: 2,
      parcelSpawnInterval: 5,
    });
    const p = new Parcels(cfg);
    p.maybeSpawn(0); // tick 0 % 5 === 0 → spawn
    expect(p.count).toBe(1);
    p.maybeSpawn(1); // off-interval → no-op
    expect(p.count).toBe(1);
    p.maybeSpawn(5); // → spawn (now at cap 2)
    expect(p.count).toBe(2);
    p.maybeSpawn(10); // at cap → no-op
    expect(p.count).toBe(2);
  });

  it('nearestTo returns the closest live parcel within range, else -1', () => {
    const cfg = defaultConfig({ parcelsEnabled: true, worldWidth: W, worldHeight: H });
    const p = new Parcels(cfg);
    p.spawn();
    p.spawn();
    p.x[0] = 100;
    p.y[0] = 100;
    p.x[1] = 130;
    p.y[1] = 100;
    expect(p.nearestTo(105, 100, 50)).toBe(0); // slot 0 is closer
    expect(p.nearestTo(125, 100, 50)).toBe(1); // slot 1 is closer
    expect(p.nearestTo(500, 500, 10)).toBe(-1); // nothing in range
    p.consume(0);
    expect(p.nearestTo(105, 100, 50)).toBe(1); // dead slot 0 skipped
  });

  it('hashInto mixes only live parcels (slot order) — different state, different hash', () => {
    const cfg = defaultConfig({ parcelsEnabled: true, worldWidth: W, worldHeight: H });
    const collect = (mut: (p: Parcels) => void): string => {
      const p = new Parcels(cfg);
      mut(p);
      let out = '';
      const h = {
        f: (v: number) => {
          out += v.toFixed(6) + ',';
        },
        u32: (v: number) => {
          out += (v >>> 0) + '|';
        },
      };
      p.hashInto(h);
      return out;
    };
    const base = collect((p) => {
      p.spawn();
      p.spawn();
    });
    const same = collect((p) => {
      p.spawn();
      p.spawn();
    });
    expect(same).toBe(base); // deterministic
    const moved = collect((p) => {
      p.spawn();
      p.spawn();
      p.x[0] = p.x[0]! + 1; // perturb one position
    });
    expect(moved).not.toBe(base);
    const fewer = collect((p) => {
      p.spawn();
    });
    expect(fewer).not.toBe(base); // count is hashed
  });
});

describe('Parcels feed the SIGHT vector', () => {
  const cfg = defaultConfig({ parcelsEnabled: true, worldWidth: W, worldHeight: H });
  const setVision = (s: OrganismStore, slot: number, range: number, acuity: number): void => {
    const sg = slot * SCALAR_GENE_COUNT;
    s.scalarGenes[sg + ScalarGene.VISION_RANGE] = range;
    s.scalarGenes[sg + ScalarGene.VISION_FOV] = 1.5;
    s.scalarGenes[sg + ScalarGene.VISION_ACUITY] = acuity;
  };
  /** one creature at (100,100) facing +x; one parcel placed at px,py. */
  const setup = (
    range: number,
    acuity: number,
    px: number,
    py: number,
  ): { s: OrganismStore; p: Parcels } => {
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.heading[a] = 0; // +x
    setVision(s, a, range, acuity);
    s.rebuildLive();
    const p = new Parcels(cfg);
    p.spawn();
    p.x[0] = px;
    p.y[0] = py;
    return { s, p };
  };
  const hashOf = (s: OrganismStore): SpatialHash => {
    const h = new SpatialHash(W, H, 12, 2);
    h.build(s);
    return h;
  };

  it('a sighted creature is pulled TOWARD a parcel ahead', () => {
    const { s, p } = setup(40, 1, 120, 100); // parcel 20u ahead (+x)
    senseCreatures(s, hashOf(s), cfg, null, p);
    expect(s.sightX[0]!).toBeGreaterThan(0); // pulled toward +x
    expect(Math.abs(s.sightY[0]!)).toBeLessThan(1e-9); // on-axis
  });

  it('a BLIND creature (visionRange 0) cannot perceive a parcel', () => {
    const { s, p } = setup(0, 1, 120, 100);
    senseCreatures(s, hashOf(s), cfg, null, p);
    expect(s.sightX[0]!).toBe(0);
    expect(s.sightY[0]!).toBe(0);
  });

  it('a parcel out of vision range is not perceived', () => {
    const { s, p } = setup(10, 1, 120, 100); // 20u away > range 10
    senseCreatures(s, hashOf(s), cfg, null, p);
    expect(s.sightX[0]!).toBe(0);
  });

  it('ablation: passing null parcels leaves the sight vector unchanged (vs no parcels)', () => {
    const { s } = setup(40, 1, 120, 100);
    senseCreatures(s, hashOf(s), cfg, null, null); // parcels OFF
    expect(s.sightX[0]!).toBe(0); // nothing else in view → exactly zero
    expect(s.sightY[0]!).toBe(0);
  });
});

describe('eatParcels payoff', () => {
  const cfg = defaultConfig({
    parcelsEnabled: true,
    worldWidth: W,
    worldHeight: H,
    parcelEatRange: 8,
    parcelEnergy: 60,
  });

  it('a creature within eat range consumes the parcel for a big payoff', () => {
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.energy[a] = 10;
    s.rebuildLive();
    const p = new Parcels(cfg);
    p.spawn();
    p.x[0] = 103; // 3u away < eatRange 8
    p.y[0] = 100;
    eatParcels(s, p, cfg);
    expect(s.energy[a]).toBe(70); // 10 + 60
    expect(p.alive[0]).toBe(0); // consumed
    expect(p.count).toBe(0);
  });

  it('a decayed parcel pays what it has LEFT, not the flat parcelEnergy', () => {
    // Parcels.step decays energy every tick. Paying the flat cfg.parcelEnergy made an almost-spent parcel
    // worth exactly as much as a fresh one, so parcelDecay had no effect on payoff at all.
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.energy[a] = 10;
    s.rebuildLive();
    const p = new Parcels(cfg);
    p.spawn();
    p.x[0] = 103;
    p.y[0] = 100;
    p.energy[0] = 12; // decayed from 60
    eatParcels(s, p, cfg);
    expect(s.energy[a]).toBe(22); // 10 + 12, not 10 + 60
  });

  it('a creature out of eat range does not consume the parcel', () => {
    const s = new OrganismStore(2);
    const a = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.energy[a] = 10;
    s.rebuildLive();
    const p = new Parcels(cfg);
    p.spawn();
    p.x[0] = 150; // 50u away > eatRange 8
    p.y[0] = 100;
    eatParcels(s, p, cfg);
    expect(s.energy[a]).toBe(10); // unchanged
    expect(p.alive[0]).toBe(1); // untouched
  });
});
