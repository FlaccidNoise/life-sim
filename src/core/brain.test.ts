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
    steer(s, false, 0.2);
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
      steer(s, false, 0.2);
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
    steer(s, false, 0.2);
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
    steer(s, false, 0.2);
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
    steer(s, false, 0.2);
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
    steer(s, false, 0.2);
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
      steer(s, false, 0.2);
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(force(1.5)).toBeCloseTo(1.3 * 1.5); // strong (high-e) body pushes harder
    expect(force(0.5)).toBeCloseTo(1.3 * 0.5); // thrifty (low-e) body pushes weaker
    expect(force(1.5)).toBeCloseTo(force(0.5) * 3); // scales linearly with efficiency
  });
});

describe('Baldwin within-life learning (energy-gated)', () => {
  // learn(store, learningRate, weightDecay, weightClamp) — the repro/satiated bars are read per-creature
  // from the genes (setBrain seeds REPRO=60 / SAT=100 below).
  const REPRO = 60;
  const SAT = 100;

  it('a well-fed (satiated) creature reinforces recently-active synapses; genome stays fixed', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // forward gradient → FWD_THRUST synapse active (pre·post > 0)
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.energy[i] = SAT; // satiated → learn gate = 1
    s.rebuildLive();
    steer(s, true, 0.5); // lay eligibility
    learn(s, 0.2, 0.0, 4);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeGreaterThan(1.0); // consolidated
    expect(s.brain[b + Brain.FWD_THRUST]!).toBe(1.0); // genome (instinct) unchanged
  });

  it('a creature in SURVIVAL mode does not learn (gate ≤ 0 freezes the runtime brain)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.energy[i] = REPRO - 10; // below the repro bar → survival → gate 0
    s.rebuildLive();
    steer(s, true, 0.5); // eligibility is warm…
    learn(s, 0.2, 0.0, 4); // …but it must be ignored
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBe(1.0); // untouched
  });

  it('the learn gate ramps with energy (more drift higher in the band)', () => {
    const drift = (energy: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1;
      setBrain(s, i, { FWD_THRUST: 1.0 });
      s.energy[i] = energy;
      s.rebuildLive();
      steer(s, true, 0.5);
      learn(s, 0.2, 0.0, 4);
      return s.learnedBrain[i * BRAIN_GENES + Brain.FWD_THRUST]! - 1.0;
    };
    expect(drift(SAT)).toBeGreaterThan(drift(80)); // satiated learns more than mid-band
    expect(drift(80)).toBeGreaterThan(drift(REPRO + 1)); // mid-band more than just above the bar
  });

  it('decay relaxes the learned deviation back toward the genome instinct', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 0; // no gradient → no new eligibility, isolate the decay term
    setBrain(s, i, { FWD_THRUST: 1.0 }); // genome instinct = 1.0
    s.energy[i] = SAT; // gate = 1 so decay is active
    s.rebuildLive();
    const b = i * BRAIN_GENES;
    s.learnedBrain[b + Brain.FWD_THRUST] = 2.0; // a learned deviation away from instinct
    learn(s, 0.2, 0.1, 4); // decay 0.1
    const w = s.learnedBrain[b + Brain.FWD_THRUST]!;
    expect(w).toBeLessThan(2.0); // relaxed toward…
    expect(w).toBeGreaterThan(1.0); // …but not past the instinct anchor
    expect(w).toBeCloseTo(1.0 + 1.0 * 0.9); // genome + deviation·(1−decay)
  });

  it('clamps learned weights to ±weightClamp', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.energy[i] = SAT;
    s.rebuildLive();
    for (let t = 0; t < 200; t++) {
      steer(s, true, 0.5);
      learn(s, 1.0, 0.0, 1.5); // hard reinforcement, clamp 1.5
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
    s.energy[i] = SAT;
    s.rebuildLive();
    steer(s, true, 0.5);
    learn(s, 0.2, 0.0, 4);
    const b = i * BRAIN_GENES;
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).not.toBeCloseTo(1.0); // it drifted
    s.resetLearned(i); // simulate the child's birth-time reset
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBe(1.0); // snapped back to the genome
    expect(s.elig[b + Brain.FWD_THRUST]!).toBe(0); // traces cleared
  });

  it('the MIN_BAND guard keeps the learn gate finite when satiated gene ≤ repro gene', () => {
    // If the two bars invert (satiated == repro), the un-guarded gate denominator is 0 → NaN weights
    // that propagate forever. The guard reads satiated as max(satiatedGene, reproGene+MIN_BAND).
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 0; // no gradient → elig stays 0; an un-guarded Inf·0 would be NaN
    setBrain(s, i, { FWD_THRUST: 1.0 });
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD] = 60;
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SATIATED_THRESHOLD] = 60; // inverted/zero band
    s.energy[i] = 70; // above the repro bar
    s.rebuildLive();
    steer(s, true, 0.5);
    learn(s, 0.2, 0.0, 4);
    const b = i * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++)
      expect(Number.isFinite(s.learnedBrain[b + g]!)).toBe(true);
  });
});
