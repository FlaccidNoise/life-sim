import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { Scent, SCENT_CHANNELS } from './scent-field';

/**
 * Identity-bearing scent — determinism (the ONLY invariant), non-vacuity (the field populates), the
 * identity-vs-blind ablation diverges, and a liveness guardrail (on-by-default must not ship a dead world).
 * A smaller, denser world so the passive deposit populates the field within a short run.
 */
const SMALL = {
  seed: 7,
  worldWidth: 2048,
  worldHeight: 2048,
  foodCols: 64,
  foodRows: 64,
  initialPopulation: 200,
  pheromoneEnabled: true,
};

describe('World — identity-bearing scent', () => {
  it('ON path is deterministic (same config+seed → byte-identical)', () => {
    const a = new World(defaultConfig({ ...SMALL }));
    const b = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('field populates (non-vacuity): every channel has signal after a run', () => {
    const w = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 300; t++) w.step();
    expect(w.scent).not.toBeNull();
    let any = 0;
    for (let c = 0; c < SCENT_CHANNELS; c++) any += w.scent!.channel(c).total();
    expect(any).toBeGreaterThan(0);
    // PREY channel (grazers are the majority) must carry signal.
    expect(w.scent!.channel(Scent.PREY).total()).toBeGreaterThan(0);
  });

  it('identity vs identity-blind diverge (the information matters)', () => {
    const id = new World(defaultConfig({ ...SMALL, scentIdentity: true }));
    const blind = new World(defaultConfig({ ...SMALL, scentIdentity: false }));
    for (let t = 0; t < 300; t++) {
      id.step();
      blind.step();
    }
    expect(id.stateHash()).not.toBe(blind.stateHash());
  });

  it('LIVENESS guardrail: world stays alive + breeding at 2000 ticks with scent on', () => {
    const w = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 2000; t++) w.step();
    w.store.rebuildLive();
    expect(w.store.liveCount).toBeGreaterThan(10); // not collapsed/extinct
    expect(w.totalBirths).toBeGreaterThan(0); // reproduction occurred
  });
});
