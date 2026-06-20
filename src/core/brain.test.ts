import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { Brain, BRAIN_GENES } from './genome';
import { steer, learn } from './brain';

/** Set a creature's genome brain weights (slot) and sync them into the runtime brain steer() reads. */
function setBrain(
  s: OrganismStore,
  slot: number,
  w: Partial<Record<keyof typeof Brain, number>>,
): void {
  const b = slot * BRAIN_GENES;
  for (const [k, v] of Object.entries(w)) s.brain[b + Brain[k as keyof typeof Brain]] = v;
  s.resetLearned(slot); // runtime brain := genome brain
}

describe('steer (per-creature brain)', () => {
  it('turns toward lateral food when LAT_TURN > 0', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x; "left" (perp) is +y
    s.senseX[i] = 0;
    s.senseY[i] = 1; // food gradient toward +y (to the left)
    setBrain(s, i, { LAT_TURN: 1.5 });
    s.rebuildLive();
    steer(s, 0.35, 1, false, 0.2);
    expect(s.heading[i]).toBeGreaterThan(0); // turned toward the food (left)
  });

  it('thrusts harder up-gradient when FWD_THRUST > 0', () => {
    const mk = (fwdGrad: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = fwdGrad; // gradient straight ahead (+x)
      s.senseY[i] = 0;
      setBrain(s, i, { FWD_THRUST: 1.5, THRUST_BIAS: 0.3 });
      s.rebuildLive();
      steer(s, 0.35, 5, false, 0.2);
      return Math.hypot(s.forceX[0]!, s.forceY[0]!);
    };
    expect(mk(1)).toBeGreaterThan(mk(0)); // food ahead → more thrust than cruise alone
  });

  it('a zero brain produces no turn and no thrust', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0.5;
    s.senseX[i] = 1;
    s.senseY[i] = 1;
    // brain weights default to 0
    s.rebuildLive();
    steer(s, 0.35, 1, false, 0.2);
    expect(s.heading[i]).toBe(0.5); // no turn
    expect(s.forceX[i]!).toBe(0);
    expect(s.forceY[i]!).toBe(0);
  });
});

describe('Baldwin within-life learning', () => {
  it('learning off leaves the runtime brain untouched (pure instinct)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // gradient ahead → non-zero pre·post
    setBrain(s, i, { FWD_THRUST: 1.0, THRUST_BIAS: 0.3 });
    s.rebuildLive();
    s.rewardEma[i] = 1; // strong positive reward
    steer(s, 0.35, 5, false, 0.2); // learn=false → no eligibility accrues
    learn(s, 0.1, 0.0, 2, 4);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeCloseTo(1.0);
    expect(s.learnedBrain[b + Brain.THRUST_BIAS]!).toBeCloseTo(0.3);
  });

  it('positive reward strengthens recently-active synapses; the genome stays fixed', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // forward gradient = +1 → FWD_THRUST synapse is active (pre·post > 0)
    setBrain(s, i, { FWD_THRUST: 1.0, THRUST_BIAS: 0.3 });
    s.rebuildLive();
    s.rewardEma[i] = 2; // reward saturates to +1 at rewardScale 2
    steer(s, 0.35, 5, true, 0.5); // lay eligibility
    learn(s, 0.2, 0.0, 2, 4); // apply the weight update
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeGreaterThan(1.0); // reinforced
    expect(s.brain[b + Brain.FWD_THRUST]!).toBe(1.0); // genome (instinct) unchanged
  });

  it('negative reward weakens recently-active synapses', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.rebuildLive();
    s.rewardEma[i] = -2; // starving → negative reward
    steer(s, 0.35, 5, true, 0.5);
    learn(s, 0.2, 0.0, 2, 4);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeLessThan(1.0); // suppressed
  });

  it('clamps learned weights to ±weightClamp', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.rebuildLive();
    s.rewardEma[i] = 100;
    // Hammer many ticks of strong reinforcement; weight must not exceed the clamp.
    for (let t = 0; t < 200; t++) {
      steer(s, 0.35, 5, true, 0.5);
      learn(s, 1.0, 0.0, 2, 1.5);
    }
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeLessThanOrEqual(1.5);
  });

  it('resetLearned restores the runtime brain to the genome (no Lamarck across birth)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.rebuildLive();
    s.rewardEma[i] = 2;
    steer(s, 0.35, 5, true, 0.5);
    learn(s, 0.2, 0.0, 2, 4);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).not.toBeCloseTo(1.0); // it drifted
    s.resetLearned(i); // simulate the child's birth-time reset
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBe(1.0); // snapped back to the genome
    expect(s.elig[b + Brain.FWD_THRUST]!).toBe(0); // traces cleared
    expect(s.rewardEma[i]).toBe(0);
  });
});
