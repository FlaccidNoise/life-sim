import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from './genome';
import { steer, learn } from './brain';

/** Set a creature's genome brain weights (slot), seed generous movement genes (so steer's per-creature
 *  maxTurn/maxThrust clamps + the efficiency multiplier don't interfere), and sync the runtime brain. */
function setBrain(
  s: OrganismStore,
  slot: number,
  w: Partial<Record<keyof typeof Brain, number>>,
): void {
  const b = slot * BRAIN_GENES;
  for (const [k, v] of Object.entries(w)) s.brain[b + Brain[k as keyof typeof Brain]] = v;
  const sg = slot * SCALAR_GENE_COUNT;
  s.scalarGenes[sg + ScalarGene.MAX_TURN] = 1; // generous turn ceiling
  s.scalarGenes[sg + ScalarGene.MAX_THRUST] = 5; // generous thrust ceiling
  s.scalarGenes[sg + ScalarGene.METAB_EFF] = 1; // efficiency 1 → thrust unscaled
  s.scalarGenes[sg + ScalarGene.REPRO_THRESHOLD] = 60; // learn gate floor
  s.scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD] = 100; // learn gate ceiling
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
    steer(s, false, 0.2, false);
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
      steer(s, false, 0.2, false);
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
    steer(s, false, 0.2, false);
    expect(s.heading[i]).toBe(0.5); // no turn
    expect(s.forceX[i]!).toBe(0);
    expect(s.forceY[i]!).toBe(0);
  });

  it('clamps the heading change to the per-creature MAX_TURN gene', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 0;
    s.senseY[i] = 1; // strong lateral gradient
    setBrain(s, i, { LAT_TURN: 5 }); // wants a big turn (would be 5 rad unclamped)
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN] = 0.05; // tiny ceiling
    s.rebuildLive();
    steer(s, false, 0.2, false);
    expect(s.heading[i]).toBeCloseTo(0.05); // clamped to the gene, not 5
  });

  it('clamps thrust to the per-creature MAX_THRUST gene', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // force lands on +x
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 5 }); // wants thrust 5
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_THRUST] = 0.5; // small ceiling
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF] = 1;
    s.rebuildLive();
    steer(s, false, 0.2, false);
    expect(Math.hypot(s.forceX[i]!, s.forceY[i]!)).toBeCloseTo(0.5); // clamped to maxThrust·eff(1)
  });

  it('steers on the sight vector (thrusts along it when SIGHT_FWD_THRUST > 0)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x
    s.senseX[i] = 0;
    s.senseY[i] = 0; // no food gradient — isolate sight
    s.sightX[i] = 1;
    s.sightY[i] = 0; // sight points +x (toward prey ahead)
    setBrain(s, i, { SIGHT_FWD_THRUST: 2 });
    s.rebuildLive();
    steer(s, false, 0.2, false);
    expect(Math.hypot(s.forceX[i]!, s.forceY[i]!)).toBeCloseTo(2); // thrust = SIGHT_FWD_THRUST·sFwd·eff
  });

  it('metabolic efficiency scales thrust (the thrust half of the tradeoff)', () => {
    const force = (eff: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1;
      setBrain(s, i, { FWD_THRUST: 1, THRUST_BIAS: 0.3 }); // thrust output 1.3 (< generous maxThrust 5)
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF] = eff;
      s.rebuildLive();
      steer(s, false, 0.2, false);
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(force(1.5)).toBeCloseTo(1.3 * 1.5); // strong (high-e) body pushes harder
    expect(force(0.5)).toBeCloseTo(1.3 * 0.5); // thrifty (low-e) body pushes weaker
    expect(force(1.5)).toBeCloseTo(force(0.5) * 3); // scales linearly with efficiency
  });
});

describe('Baldwin within-life learning (reward-modulated)', () => {
  // learn(store, learningRate, weightDecay, maxLearnDeviation, rewardClamp). reward = energy − prevEnergy.

  it('a reward (energy GAIN) reinforces recently-active synapses; genome stays fixed', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // forward gradient → FWD_THRUST synapse active (pre·post > 0)
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.prevEnergy[i] = 50;
    s.energy[i] = 60; // reward +10 (clamped to +5)
    s.rebuildLive();
    steer(s, true, 0.5, false); // lay eligibility
    learn(s, 0.2, 0.0, 4, 5);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeGreaterThan(1.0); // reinforced
    expect(s.brain[b + Brain.FWD_THRUST]!).toBe(1.0); // genome (instinct) unchanged
  });

  it('a penalty (energy LOSS) weakens the recently-active synapses', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // same active synapse as above…
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.prevEnergy[i] = 60;
    s.energy[i] = 50; // reward −10 → the behavior gets UNlearned
    s.rebuildLive();
    steer(s, true, 0.5, false);
    learn(s, 0.2, 0.0, 4, 5);
    expect(s.learnedBrain[i * BRAIN_GENES + Brain.FWD_THRUST]!).toBeLessThan(1.0); // weakened below instinct
  });

  it('zero reward leaves only the decay term (relaxes deviation toward instinct)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 0; // no new eligibility either
    setBrain(s, i, { FWD_THRUST: 1.0 }); // genome instinct = 1.0
    s.prevEnergy[i] = 100;
    s.energy[i] = 100; // reward = 0
    s.rebuildLive();
    const b = i * BRAIN_GENES;
    s.learnedBrain[b + Brain.FWD_THRUST] = 2.0; // a learned deviation away from instinct
    learn(s, 0.2, 0.1, 4, 5); // decay 0.1
    const w = s.learnedBrain[b + Brain.FWD_THRUST]!;
    expect(w).toBeCloseTo(1.0 + 1.0 * 0.9); // genome + deviation·(1−decay), no reward term
  });

  it('bounds the learned DEVIATION from instinct to ±maxLearnDeviation', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 }); // genome instinct = 1.0
    s.rebuildLive();
    const b = i * BRAIN_GENES;
    for (let t = 0; t < 200; t++) {
      s.prevEnergy[i] = 50;
      s.energy[i] = 60; // sustained reward each tick (learn() resets prevEnergy, so re-set it)
      steer(s, true, 0.5, false);
      learn(s, 1.0, 0.0, 0.5, 5); // hard reinforcement, deviation bound 0.5
    }
    // Can't run off to a saturated controller: it stays within ±0.5 of instinct.
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeGreaterThan(1.0); // it did consolidate, just bounded
  });

  it('does NOT make the bias synapses plastic (the spin runaway is removed)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // strong constant input → big motor output → bias eligibility accumulates
    setBrain(s, i, { FWD_THRUST: 1.0, TURN_BIAS: 0.2, THRUST_BIAS: 0.3 });
    s.rebuildLive();
    const b = i * BRAIN_GENES;
    for (let t = 0; t < 200; t++) {
      s.prevEnergy[i] = 50;
      s.energy[i] = 60;
      steer(s, true, 0.5, false);
      learn(s, 1.0, 0.0, 0.5, 5);
    }
    // Biases stay at instinct no matter how hard/long we reinforce (Float32-exact equality to the seed).
    expect(s.learnedBrain[b + Brain.TURN_BIAS]!).toBe(s.brain[b + Brain.TURN_BIAS]!);
    expect(s.learnedBrain[b + Brain.THRUST_BIAS]!).toBe(s.brain[b + Brain.THRUST_BIAS]!);
  });

  it('resetLearned restores the runtime brain to the genome (no Lamarck across birth)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.prevEnergy[i] = 50;
    s.energy[i] = 60;
    s.rebuildLive();
    steer(s, true, 0.5, false);
    learn(s, 0.2, 0.0, 4, 5);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).not.toBeCloseTo(1.0); // it drifted
    s.resetLearned(i); // simulate the child's birth-time reset
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBe(1.0); // snapped back to the genome
    expect(s.elig[b + Brain.FWD_THRUST]!).toBe(0); // traces cleared
  });
});

describe('motorSquash (smooth tanh saturation — the legibility knob)', () => {
  // Off (default) = hard clamp (every test above passes `false`). On = out = max·tanh(raw/max): a strong
  // signal EASES into the per-creature limit instead of snapping to it (kills the saturated-rudder spin).
  it('a strong turn signal SNAPS to MAX_TURN when off, but eases in when on', () => {
    const headingAfter = (squash: boolean): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0; // facing +x → lateral gradient is the +y component
      s.senseX[i] = 0;
      s.senseY[i] = 1; // lat = 1
      setBrain(s, i, { LAT_TURN: 2 }); // turnRaw = 2 (overshoots the limit)
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN] = 1; // limit M = 1
      s.rebuildLive();
      steer(s, false, 0.2, squash);
      return s.heading[i];
    };
    expect(headingAfter(false)).toBeCloseTo(1.0); // hard clamp: snaps to MAX_TURN
    expect(headingAfter(true)).toBeCloseTo(Math.tanh(2)); // squash: 1·tanh(2) ≈ 0.964 — below the limit
    expect(headingAfter(true)).toBeLessThan(headingAfter(false)); // graded, not bang-bang
    expect(headingAfter(true)).toBeGreaterThan(0);
  });

  it('a sub-limit signal is ~unchanged by squash (slope→1 near zero, so it does not distort)', () => {
    const headingAfter = (squash: boolean): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 0;
      s.senseY[i] = 1;
      setBrain(s, i, { LAT_TURN: 0.1 }); // turnRaw = 0.1, well below the limit
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN] = 1;
      s.rebuildLive();
      steer(s, false, 0.2, squash);
      return s.heading[i];
    };
    expect(headingAfter(true)).toBeCloseTo(headingAfter(false), 2); // ≈ identical for small signals
  });

  it('thrust eases into MAX_THRUST under squash instead of clamping', () => {
    const force = (squash: boolean): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1; // fwd = 1
      setBrain(s, i, { FWD_THRUST: 3 }); // thrustRaw = 3 (overshoots)
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_THRUST] = 1; // limit 1
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF] = 1;
      s.rebuildLive();
      steer(s, false, 0.2, squash);
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(force(false)).toBeCloseTo(1.0); // clamped to MAX_THRUST
    expect(force(true)).toBeCloseTo(Math.tanh(3)); // 1·tanh(3) ≈ 0.995, eased below the limit
    expect(force(true)).toBeLessThan(force(false));
  });

  it('negative thrust stays floored at 0 under squash (no reverse thrust)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: -3 }); // thrustRaw = −3 (would be reverse)
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_THRUST] = 1;
    s.rebuildLive();
    steer(s, false, 0.2, true);
    expect(s.forceX[i]!).toBe(0); // floored, not negative
    expect(s.forceY[i]!).toBe(0);
  });
});
