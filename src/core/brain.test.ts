import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { defaultConfig, type Config } from './config';
import {
  Brain,
  BRAIN_GENES,
  ScalarGene,
  SCALAR_GENE_COUNT,
  HiddenInput,
  HIDDEN_UNITS,
  HIDDEN_OUTPUTS,
  HIDDEN_W1,
  HIDDEN_W2,
  GLOW_BIAS,
  GLOW_HID,
} from './genome';
import { SCENT_CHANNELS, Scent } from './scent-field';
import { steer, learn } from './brain';
import { satiatedBar } from './economy';

// Default config for the motor-mechanics steer() tests below. brainGatedEating is OFF here to ISOLATE
// turn/thrust from the eat-immobilize penalty (slice B) — the eat-gate has its own test block that opts in.
// minTurnRadius is 0 here too: the speed-bounded turn has its own block below, and leaving it on would
// silently cap every turn in this file at the stationary turnFloor.
const CFG = defaultConfig({ brainGatedEating: false, minTurnRadius: 0 });

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
    steer(s, false, 0.2, false, CFG);
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
      steer(s, false, 0.2, false, CFG);
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
    steer(s, false, 0.2, false, CFG);
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
    steer(s, false, 0.2, false, CFG);
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
    steer(s, false, 0.2, false, CFG);
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
    steer(s, false, 0.2, false, CFG);
    expect(Math.hypot(s.forceX[i]!, s.forceY[i]!)).toBeCloseTo(2); // thrust = SIGHT_FWD_THRUST·sFwd·eff
  });

  it('reverses (backward force) when thrust intent is negative, capped at reverseThrustFraction·maxThrust', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x → backward force is -x
    setBrain(s, i, { THRUST_BIAS: -10 }); // strong negative thrust intent (maxThrust 5 from setBrain)
    s.rebuildLive();
    steer(s, false, 0.2, false, CFG); // CFG.reverseThrustFraction = 0.5
    expect(s.forceX[i]!).toBeCloseTo(-2.5); // backward, capped at 0.5·5·eff(1)
    expect(s.forceY[i]!).toBeCloseTo(0);
  });

  it('reverseThrustFraction=0 reproduces forward-only (negative thrust intent → zero force)', () => {
    const cfg0 = defaultConfig({ reverseThrustFraction: 0 });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { THRUST_BIAS: -10 });
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg0);
    expect(s.forceX[i]!).toBe(0);
    expect(s.forceY[i]!).toBe(0);
  });

  it('reverse cap also applies under motorSquash', () => {
    const cfg = defaultConfig({ reverseThrustFraction: 0.5, brainGatedEating: false }); // isolate reverse
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { THRUST_BIAS: -100 }); // tanh saturates toward -maxThrust, then floored at -0.5·max
    s.rebuildLive();
    steer(s, false, 0.2, true, cfg); // motorSquash = true
    expect(s.forceX[i]!).toBeCloseTo(-2.5); // floored at 0.5·5
    expect(s.forceY[i]!).toBeCloseTo(0);
  });

  it('a stopped creature turns at most turnFloor per tick (minTurnRadius bound)', () => {
    // Gates pinned off: this test is about the kinematic bound, and a fresh store has energy 0, which the
    // default hunger gate would exempt.
    const cfg = defaultConfig({
      brainGatedEating: false,
      minTurnRadius: 6,
      turnFloor: 0.05,
      turnBoundThreatGate: 0,
      turnBoundHungerGate: 0,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.vx[i] = 0;
    s.vy[i] = 0; // stopped → no kinematic turn budget, only the floor
    setBrain(s, i, { TURN_BIAS: 10 }); // wants a huge turn (MAX_TURN gene is 1 from setBrain)
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg);
    expect(s.heading[i]).toBeCloseTo(0.05); // turnFloor, not MAX_TURN
  });

  it('a moving creature turns at most speed/minTurnRadius per tick, both directions', () => {
    const turnOf = (bias: number): number => {
      const cfg = defaultConfig({
        brainGatedEating: false,
        minTurnRadius: 6,
        turnFloor: 0.05,
        turnBoundThreatGate: 0,
        turnBoundHungerGate: 0,
      });
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.vx[i] = 1.2; // speed 1.2 → cap 1.2/6 = 0.2 rad/tick, well above the 0.05 floor
      s.vy[i] = 0;
      setBrain(s, i, { TURN_BIAS: bias });
      s.rebuildLive();
      steer(s, false, 0.2, false, cfg);
      return s.heading[i]!;
    };
    expect(turnOf(10)).toBeCloseTo(0.2);
    expect(turnOf(-10)).toBeCloseTo(-0.2);
  });

  it('minTurnRadius=0 leaves the turn bounded only by the MAX_TURN gene', () => {
    const cfg = defaultConfig({ brainGatedEating: false, minTurnRadius: 0 });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // stopped, so the bound would otherwise cap this at turnFloor
    setBrain(s, i, { TURN_BIAS: 10 });
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN] = 0.3;
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg);
    expect(s.heading[i]).toBeCloseTo(0.3);
  });

  it('lifts the turn bound for a creature under predator-scent threat', () => {
    const mk = (threat: number): number => {
      const cfg = defaultConfig({
        brainGatedEating: false,
        minTurnRadius: 6,
        turnFloor: 0.05,
        turnBoundThreatGate: 0.0025,
        turnBoundHungerGate: 0, // isolate the threat gate
      });
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0; // stopped → bounded at turnFloor unless exempt
      setBrain(s, i, { TURN_BIAS: 10 }); // MAX_TURN gene is 1, so an exempt creature turns a full radian
      s.scentSenseX[i * SCENT_CHANNELS + Scent.PRED] = threat;
      s.rebuildLive();
      steer(s, false, 0.2, false, cfg);
      return s.heading[i]!;
    };
    expect(mk(0.001)).toBeCloseTo(0.05); // below the gate → bounded at turnFloor
    expect(mk(0.01)).toBeCloseTo(1); // above the gate → free to turn, capped only by MAX_TURN
  });

  it('lifts the turn bound for a hungry creature', () => {
    const mk = (energy: number): number => {
      const cfg = defaultConfig({
        brainGatedEating: false,
        minTurnRadius: 6,
        turnFloor: 0.05,
        turnBoundThreatGate: 0, // isolate the hunger gate
        turnBoundHungerGate: 0.5,
      });
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      setBrain(s, i, { TURN_BIAS: 10 });
      // setBrain sets SATIATED_THRESHOLD 100, so hunger = 1 − energy/satiatedBar.
      s.energy[i] = energy;
      s.rebuildLive();
      steer(s, false, 0.2, false, cfg);
      const bar = satiatedBar(s.scalarGenes, i, cfg);
      const hunger = bar > 0 ? Math.min(1, Math.max(0, 1 - energy / bar)) : 1;
      expect(hunger > 0.5).toBe(energy < 1); // guard: the two cases really do straddle the gate
      return s.heading[i]!;
    };
    expect(mk(0)).toBeCloseTo(1); // starving → exempt, free to turn
    expect(mk(1e9)).toBeCloseTo(0.05); // full → bounded at turnFloor
  });

  it('both gates at 0 leave the bound applying to everyone', () => {
    const cfg = defaultConfig({
      brainGatedEating: false,
      minTurnRadius: 6,
      turnFloor: 0.05,
      turnBoundThreatGate: 0,
      turnBoundHungerGate: 0,
    });
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { TURN_BIAS: 10 });
    s.energy[i] = 0; // starving AND under threat — neither exempts while the gates are off
    s.scentSenseX[i * SCENT_CHANNELS + Scent.PRED] = 1;
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg);
    expect(s.heading[i]).toBeCloseTo(0.05);
  });

  it('turnGainRatio=1 reproduces the original squash; >1 widens the graded region', () => {
    const squashed = (turnGainRatio: number): number => {
      const cfg = defaultConfig({ brainGatedEating: false, minTurnRadius: 0, turnGainRatio });
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      setBrain(s, i, { TURN_BIAS: 0.5 }); // MAX_TURN gene 1 → turn = tanh(0.5/ratio); 0.5 is exact in f32
      s.rebuildLive();
      steer(s, false, 0.2, true, cfg); // motorSquash = true
      return s.heading[i]!;
    };
    expect(squashed(1)).toBe(Math.tanh(0.5)); // exactly the pre-knob formula
    expect(squashed(4)).toBeCloseTo(Math.tanh(0.125)); // same ceiling, quarter the gain
    expect(squashed(4)).toBeLessThan(squashed(1));
  });

  it('eating slows the body (eat-gate thrust penalty) when brainGatedEating is on', () => {
    const cruise = (cfg: Config): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      setBrain(s, i, { THRUST_BIAS: 1, EAT_GATE_BIAS: 10 }); // gate≈1 (head down, eating) + cruise thrust
      s.rebuildLive();
      steer(s, false, 0.2, false, cfg);
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    const on = cruise(defaultConfig({ eatMovePenalty: 0.4 }));
    const off = cruise(defaultConfig({ brainGatedEating: false }));
    expect(on).toBeLessThan(off); // eating costs mobility
    expect(on).toBeCloseTo(off * (1 - 0.4)); // gate≈1 → thrust ×(1−penalty)
  });

  it('a threat ahead lowers the eat-gate (lift the head → regain mobility)', () => {
    const gateWith = (sightFwd: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0; // facing +x → sFwd === sightX
      s.sightX[i] = sightFwd; // appeal-signed sight fwd: negative = threat ahead
      s.sightY[i] = 0;
      setBrain(s, i, { EAT_GATE_BIAS: 4, EAT_GATE_SIGHT_FWD: 2 }); // founder-style seed
      s.rebuildLive();
      steer(s, false, 0.2, false, defaultConfig());
      return s.eatGate[i]!;
    };
    expect(gateWith(-2)).toBeLessThan(gateWith(0)); // threat ahead drops the gate (stop eating)
    expect(gateWith(-2)).toBeLessThan(0.6); // and meaningfully so
  });

  it('brainGatedEating off leaves thrust unpenalized (legacy motor)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { THRUST_BIAS: 1, EAT_GATE_BIAS: 10 });
    s.rebuildLive();
    steer(s, false, 0.2, false, defaultConfig({ brainGatedEating: false }));
    expect(Math.hypot(s.forceX[i]!, s.forceY[i]!)).toBeCloseTo(1); // full cruise, no eat penalty
  });

  it('feeds maturity (min(age/ageNorm,1)) as an interoceptive input when ageSense is on', () => {
    const thrustAtAge = (ageTicks: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.age[i] = ageTicks;
      setBrain(s, i, { AGE_THRUST: 1.0 }); // older → more thrust
      s.rebuildLive();
      // brainGatedEating off to isolate the age term from the eat-immobilize penalty; ageNorm = 1000.
      steer(s, false, 0.2, false, defaultConfig({ brainGatedEating: false, ageNorm: 1000 }));
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(thrustAtAge(1000)).toBeGreaterThan(thrustAtAge(0)); // a mature creature thrusts more
    expect(thrustAtAge(0)).toBe(0); // a newborn (aged 0) gets no age contribution
  });

  it('ageSense off → age does not affect the motor', () => {
    const mk = (ageTicks: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.age[i] = ageTicks;
      setBrain(s, i, { AGE_THRUST: 1.0 });
      s.rebuildLive();
      steer(s, false, 0.2, false, defaultConfig({ ageSense: false, brainGatedEating: false }));
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(mk(1000)).toBe(mk(0)); // age ignored entirely when off
  });

  it('feeds repro-readiness (progress through the breeding band) when readinessSense is on', () => {
    const thrustAtEnergy = (e: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.energy[i] = e;
      setBrain(s, i, { READINESS_THRUST: 1.0 }); // readier → more thrust (for the test)
      s.rebuildLive();
      steer(s, false, 0.2, false, defaultConfig({ brainGatedEating: false }));
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    // setBrain seeds REPRO_THRESHOLD 60 → energy below the repro bar gives readiness 0; well above the bar
    // saturates readiness at 1. So a near-breeding creature thrusts more than a just-surviving one.
    expect(thrustAtEnergy(30)).toBe(0); // below the repro bar → readiness 0
    expect(thrustAtEnergy(200)).toBeGreaterThan(thrustAtEnergy(30)); // near/over the breeding bar → readiness up
  });

  it('readinessSense off → breeding energy does not affect the motor', () => {
    const mk = (e: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.energy[i] = e;
      setBrain(s, i, { READINESS_THRUST: 1.0 });
      s.rebuildLive();
      steer(
        s,
        false,
        0.2,
        false,
        defaultConfig({ readinessSense: false, brainGatedEating: false }),
      );
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(mk(200)).toBe(mk(30)); // readiness ignored entirely when off
  });

  it('hidden layer adds a tanh nonlinear contribution on top of the linear map (skip-connection)', () => {
    const mk = (hidden: boolean): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1; // food fwd = 1 (HiddenInput.FOOD_FWD = 0)
      setBrain(s, i, {});
      const b = i * BRAIN_GENES;
      s.brain[b + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0] = 2; // input0 → hidden0, weight 2 → h0 = tanh(2·1)
      s.brain[b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 1] = 3; // hidden0 → thrust, weight 3
      s.resetLearned(i);
      s.rebuildLive();
      steer(s, false, 0.2, false, defaultConfig({ hiddenLayer: hidden, brainGatedEating: false }));
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(mk(false)).toBe(0); // hidden off + no linear thrust weights → zero
    expect(mk(true)).toBeCloseTo(3 * Math.tanh(2)); // hidden on → thrust = W2 · tanh(W1·input)
  });

  it('hidden layer learns output-side only: hidden→output (W2) drifts, input→hidden (W1) stays frozen', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // food fwd drives hidden unit 0
    setBrain(s, i, { THRUST_BIAS: 1 }); // a nonzero motor output so the W2 eligibility (pre·post) is live
    const b = i * BRAIN_GENES;
    s.brain[b + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0] = 1; // input0 → hidden0 (a live hidden unit)
    s.resetLearned(i);
    s.rebuildLive();
    const w1Idx = b + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0;
    const w2Idx = b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 1; // hidden0 → thrust
    for (let t = 0; t < 200; t++) {
      s.prevEnergy[i] = 50;
      s.energy[i] = 60; // sustained reward
      steer(s, true, 0.5, false, defaultConfig({ brainGatedEating: false }));
      learn(s, 1.0, 0.0, 0.5, 5);
    }
    expect(s.learnedBrain[w1Idx]!).toBe(s.brain[w1Idx]!); // input→hidden frozen (evolved-only, no credit path)
    expect(s.learnedBrain[w2Idx]!).not.toBe(s.brain[w2Idx]!); // hidden→output consolidated within life
  });

  it('mood-glow output = sigmoid of the hidden layer (display-only, does not move the body); off → 0', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // drives hidden unit 0
    setBrain(s, i, {});
    const b = i * BRAIN_GENES;
    s.brain[b + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0] = 2; // input0 → hidden0 → h0 = tanh(2)
    s.brain[b + GLOW_BIAS] = 0; // clean baseline for the expected value (override the dim default)
    s.brain[b + GLOW_HID + 0] = 3; // hidden0 → glow, weight 3
    s.resetLearned(i);
    s.rebuildLive();
    const fx0 = s.forceX[i];
    steer(s, false, 0.2, false, defaultConfig({ moodGlow: true }));
    expect(s.glow[i]!).toBeCloseTo(1 / (1 + Math.exp(-3 * Math.tanh(2)))); // sigmoid(GLOW_BIAS + h0·3)
    // glow is display-only — it must not have perturbed the motor relative to a no-glow run.
    const sNoGlow = new OrganismStore(4);
    const k = sNoGlow.alloc();
    sNoGlow.heading[k] = 0;
    sNoGlow.senseX[k] = 1;
    setBrain(sNoGlow, k, {});
    sNoGlow.brain[k * BRAIN_GENES + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0] = 2;
    sNoGlow.resetLearned(k);
    sNoGlow.rebuildLive();
    steer(sNoGlow, false, 0.2, false, defaultConfig({ moodGlow: false }));
    expect(s.forceX[i]!).toBe(sNoGlow.forceX[k]!); // motor identical with glow on vs off
    expect(fx0).toBe(0);
    // off → glow not computed (stays 0)
    s.glow[i] = 0;
    steer(s, false, 0.2, false, defaultConfig({ moodGlow: false }));
    expect(s.glow[i]!).toBe(0);
  });

  it('different hidden→glow weights glow differently for the same state (lineage divergence)', () => {
    const glowWith = (w: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1;
      setBrain(s, i, {});
      const b = i * BRAIN_GENES;
      s.brain[b + HIDDEN_W1 + 0 * HIDDEN_UNITS + 0] = 2; // same hidden encoding…
      s.brain[b + GLOW_HID + 0] = w; // …different glow wiring
      s.resetLearned(i);
      s.rebuildLive();
      steer(s, false, 0.2, false, defaultConfig({ moodGlow: true }));
      return s.glow[i]!;
    };
    expect(glowWith(3)).not.toBeCloseTo(glowWith(-3)); // opposite glow triggers → different glow
  });

  it('a positive WALL_FWD_THRUST weight converts a forward wall-gradient into forward thrust', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x
    s.wallSenseX[i] = 1;
    s.wallSenseY[i] = 0; // wall-gradient points +x (ahead in the heading frame)
    setBrain(s, i, { WALL_FWD_THRUST: 2 });
    s.rebuildLive();
    steer(s, false, 0.2, false, CFG);
    expect(s.forceX[i]!).toBeGreaterThan(0); // forward wall-gradient drives forward thrust
  });

  it('wall/flow terms contribute nothing when their senses + weights are 0 (all-off ablation)', () => {
    // With wallSense/flowSense = 0 and the 8 wall/flow weights = 0, steer must produce EXACTLY the
    // force the food + sight terms alone produce — the new terms are 0·0 and vanish.
    const force = (withSenses: boolean): readonly [number, number] => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 1; // forward food gradient
      s.senseY[i] = 0;
      s.sightX[i] = 0;
      s.sightY[i] = 1; // lateral sight
      setBrain(s, i, { FWD_THRUST: 1, SIGHT_LAT_THRUST: 0.5, LAT_TURN: 0.3 });
      if (withSenses) {
        // Non-zero wall/flow inputs, but their weights stay 0 → still no contribution.
        s.wallSenseX[i] = 0.7;
        s.wallSenseY[i] = -0.4;
        s.flowSenseX[i] = -0.2;
        s.flowSenseY[i] = 0.9;
      }
      s.rebuildLive();
      steer(s, false, 0.2, false, CFG);
      return [s.forceX[i]!, s.forceY[i]!];
    };
    const off = force(false);
    const on = force(true);
    expect(on[0]).toBe(off[0]); // wall/flow inputs with 0 weights change nothing
    expect(on[1]).toBe(off[1]);
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
      steer(s, false, 0.2, false, CFG);
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
    steer(s, true, 0.5, false, CFG); // lay eligibility
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
    steer(s, true, 0.5, false, CFG);
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
      steer(s, true, 0.5, false, CFG);
      learn(s, 1.0, 0.0, 0.5, 5); // hard reinforcement, deviation bound 0.5
    }
    // Can't run off to a saturated controller: it stays within ±0.5 of instinct.
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(s.learnedBrain[b + Brain.FWD_THRUST]!).toBeGreaterThan(1.0); // it did consolidate, just bounded
  });

  it('leaves the evolve-only blocks (W1, glow bias + hidden→glow) exactly at the genome', () => {
    // steer() writes no eligibility for the W1 input→hidden matrix (the Hebbian rule cannot credit-assign
    // reward back through a hidden unit) or for the glow output bias and its hidden weights. resetLearned
    // syncs learnedBrain to brain at birth, so their deviation is identically 0 forever — 101 of 185
    // weights that learn() no longer walks. Assert the invariant that makes skipping them safe.
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: 1.0 });
    const b = i * BRAIN_GENES;
    for (let g = HIDDEN_W1; g < BRAIN_GENES; g++) s.brain[b + g] = 0.3 + 0.001 * g; // non-zero instinct
    s.resetLearned(i);
    s.rebuildLive();
    for (let t = 0; t < 50; t++) {
      s.prevEnergy[i] = 50;
      s.energy[i] = 60; // sustained reward, so anything plastic WILL move
      steer(s, true, 0.5, false, CFG);
      learn(s, 1.0, 0.1, 0.5, 5); // decay 0.1: a walked-but-dead weight would still be pinned to instinct
    }
    for (let g = HIDDEN_W1; g < HIDDEN_W2; g++) expect(s.learnedBrain[b + g]).toBe(s.brain[b + g]); // W1 input→hidden
    for (let g = GLOW_BIAS; g < GLOW_HID + HIDDEN_UNITS; g++)
      expect(s.learnedBrain[b + g]).toBe(s.brain[b + g]); // glow bias + hidden→glow
    expect(s.learnedBrain[b + Brain.FWD_THRUST]).not.toBe(s.brain[b + Brain.FWD_THRUST]); // non-vacuity
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
      steer(s, true, 0.5, false, CFG);
      learn(s, 1.0, 0.0, 0.5, 5);
    }
    // Biases stay at instinct no matter how hard/long we reinforce (Float32-exact equality to the seed).
    expect(s.learnedBrain[b + Brain.TURN_BIAS]!).toBe(s.brain[b + Brain.TURN_BIAS]!);
    expect(s.learnedBrain[b + Brain.THRUST_BIAS]!).toBe(s.brain[b + Brain.THRUST_BIAS]!);
  });

  it('does NOT make EAT_GATE_BIAS plastic either (slice B — same constant-input runaway guard)', () => {
    const cfgEat = defaultConfig({ brainGatedEating: true }); // eat-gate ON so its elig path is exercised
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1; // food fwd = 1 → eat-gate FWD weight has a live input to consolidate on
    setBrain(s, i, { EAT_GATE_BIAS: 1.0 });
    s.rebuildLive();
    const b = i * BRAIN_GENES;
    for (let t = 0; t < 200; t++) {
      s.prevEnergy[i] = 50;
      s.energy[i] = 60;
      steer(s, true, 0.5, false, cfgEat);
      learn(s, 1.0, 0.0, 0.5, 5);
    }
    expect(s.learnedBrain[b + Brain.EAT_GATE_BIAS]!).toBe(s.brain[b + Brain.EAT_GATE_BIAS]!); // pinned
    // …while a non-bias eat-gate weight DID consolidate, proving the elig path is live (not vacuous).
    expect(s.learnedBrain[b + Brain.EAT_GATE_FWD]!).not.toBe(s.brain[b + Brain.EAT_GATE_FWD]!);
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
    steer(s, true, 0.5, false, CFG);
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
      steer(s, false, 0.2, squash, CFG);
      return s.heading[i]!;
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
      steer(s, false, 0.2, squash, CFG);
      return s.heading[i]!;
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
      steer(s, false, 0.2, squash, CFG);
      return Math.hypot(s.forceX[i]!, s.forceY[i]!);
    };
    expect(force(false)).toBeCloseTo(1.0); // clamped to MAX_THRUST
    expect(force(true)).toBeCloseTo(Math.tanh(3)); // 1·tanh(3) ≈ 0.995, eased below the limit
    expect(force(true)).toBeLessThan(force(false));
  });

  it('negative thrust stays floored at 0 under squash when reverse is OFF (reverseThrustFraction=0)', () => {
    const cfg0 = defaultConfig({ reverseThrustFraction: 0 }); // reverse disabled → legacy forward-only motor
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    s.senseX[i] = 1;
    setBrain(s, i, { FWD_THRUST: -3 }); // thrustRaw = −3 (would be reverse if enabled)
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_THRUST] = 1;
    s.rebuildLive();
    steer(s, false, 0.2, true, cfg0);
    expect(s.forceX[i]!).toBe(0); // floored, not negative
    expect(s.forceY[i]!).toBe(0);
  });
});

describe('interoceptive hunger input (lever E2)', () => {
  // hunger = clamp(1 − energy/satiatedBar, 0, 1): empty body → ~1, full → 0. Gated on cfg.hungerSense:
  // when off, the synapse is dead and energy level cannot influence steering (the ablation contract).
  const HUNGER_ON = defaultConfig({ hungerSense: true });

  // No food/sight input → motor output is THRUST_BIAS + (HUNGER_THRUST·hunger, only when the lever is on).
  const thrustAt = (energy: number, cfg: Config): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { THRUST_BIAS: 0.2, HUNGER_THRUST: 2 });
    s.energy[i] = energy;
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg);
    return Math.hypot(s.forceX[0]!, s.forceY[0]!);
  };

  it('a hungry creature thrusts harder than a full one when HUNGER_THRUST > 0', () => {
    // energy 0 → hunger 1 (full drive); huge energy → hunger clamps to 0 (no drive), for any satiatedBar>0.
    expect(thrustAt(0, HUNGER_ON)).toBeGreaterThan(thrustAt(1e6, HUNGER_ON));
  });

  it('with hungerSense OFF the hunger synapse is dead — energy level changes nothing (ablation)', () => {
    expect(thrustAt(0, CFG)).toBe(thrustAt(1e6, CFG)); // identical: hunger term never computed
  });

  it('drives a turn via HUNGER_TURN only when the lever is on', () => {
    const headingAfter = (cfg: Config): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      setBrain(s, i, { HUNGER_TURN: 0.5 });
      s.energy[i] = 0; // empty → hunger ≈ 1
      s.rebuildLive();
      steer(s, false, 0.2, false, cfg);
      return s.heading[i]!;
    };
    expect(headingAfter(HUNGER_ON)).toBeGreaterThan(0); // hunger turns the heading
    expect(headingAfter(CFG)).toBe(0); // off → no turn at all
  });

  it('lays an eligibility trace on the hunger synapses when learning + hungerSense are both on', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { HUNGER_TURN: 0.5, HUNGER_THRUST: 2 }); // resetLearned zeros elig
    s.energy[i] = 0; // empty → hunger ≈ 1 → both hunger synapses fire
    s.rebuildLive();
    steer(s, true, 0.5, false, HUNGER_ON); // learn=true lays the trace
    const b = i * BRAIN_GENES;
    expect(s.elig[b + Brain.HUNGER_THRUST]!).not.toBe(0); // pre·post = hunger·thrustRaw ≠ 0
    expect(s.elig[b + Brain.HUNGER_TURN]!).not.toBe(0);
  });

  it('lays NO hunger eligibility when hungerSense is off, even while learning (ablation)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0;
    setBrain(s, i, { HUNGER_TURN: 0.5, HUNGER_THRUST: 2 });
    s.energy[i] = 0;
    s.rebuildLive();
    steer(s, true, 0.5, false, CFG); // hungerSense OFF → the elig block is gated out
    const b = i * BRAIN_GENES;
    expect(s.elig[b + Brain.HUNGER_THRUST]!).toBe(0); // trace untouched
    expect(s.elig[b + Brain.HUNGER_TURN]!).toBe(0);
  });
});

describe('scent feeds the hidden layer (consolidation mandate 1)', () => {
  // The 4 identity scent channels must reach the NONLINEAR hidden layer, not just the linear synapses.
  // Wire ONLY a hidden path: SCENT_C0_FWD → hidden unit 0 (W1=1) → turn (W2=1). All linear synapses 0.
  const turnFromScentC0 = (gradient: number): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x, so scentSenseX projects entirely onto the forward axis
    setBrain(s, i, {}); // all named synapses 0
    const b = i * BRAIN_GENES;
    // W1: SCENT_C0_FWD (HiddenInput row 8) → hidden unit 0
    s.brain[b + HIDDEN_W1 + HiddenInput.SCENT_C0_FWD * HIDDEN_UNITS + 0] = 1;
    // W2: hidden unit 0 → turn (output 0)
    s.brain[b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 0] = 1;
    s.resetLearned(i);
    s.scentSenseX[i * SCENT_CHANNELS + 0] = gradient; // PREY channel gradient ahead
    s.rebuildLive();
    steer(s, false, 0.2, false, CFG); // CFG has hiddenLayer on (default)
    return s.heading[i]!; // started at 0, so this IS the turn applied
  };

  it('a scent gradient drives the hidden layer → a turn (not a vestigial linear path)', () => {
    expect(turnFromScentC0(1)).toBeGreaterThan(0.5); // tanh(1)·1 ≈ 0.76 turn
  });
  it('with no scent gradient the hidden contribution is zero (baseline)', () => {
    expect(turnFromScentC0(0)).toBe(0);
  });
});

describe('hunger-gated food drive (satiation → stop seeking food)', () => {
  // cfg.hungerGatesFood scales the FOOD gradient by hunger = clamp(1−energy/satiatedBar, 0, 1): a full
  // creature (hunger→0) stops responding to food and steers on its other drives (→ wanders); a starving
  // one seeks at full strength. ONLY the food gradient is scaled (not sight/wall/flow). OFF = byte-identical.
  // brainGatedEating off so the motor output IS the (food-drive-gated) thrust, isolated from the orthogonal
  // eat-gate mobility penalty (which is on by default and would scale thrust by 1−eatGate·eatMovePenalty).
  const GATE_ON = defaultConfig({ hungerGatesFood: true, brainGatedEating: false });

  // Pure food-driven thrust (no bias/sight), so the motor output IS the (gated) food response.
  const foodThrust = (energy: number, cfg: Config): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x
    s.senseX[i] = 1; // food gradient straight ahead
    s.senseY[i] = 0;
    setBrain(s, i, { FWD_THRUST: 2 });
    s.energy[i] = energy;
    s.rebuildLive();
    steer(s, false, 0.2, false, cfg);
    return Math.hypot(s.forceX[0]!, s.forceY[0]!);
  };

  it('a full creature stops thrusting toward food; a starving one drives at full strength (gate on)', () => {
    expect(foodThrust(1e6, GATE_ON)).toBeCloseTo(0); // full → hunger 0 → food drive gated to nothing
    expect(foodThrust(0, GATE_ON)).toBeCloseTo(2); // empty → hunger 1 → full food drive (FWD_THRUST·1·1)
  });

  it('with the gate OFF the food response is identical regardless of energy (ablation/byte-clean)', () => {
    expect(foodThrust(0, CFG)).toBe(foodThrust(1e6, CFG)); // food gradient never scaled by energy
  });

  it('a still-hungry creature forages at FULL strength — the gate only eases off near satiation', () => {
    // satiatedBar floors at repro+MIN_BAND = 65 here (SIZE 0). energy 20 → hunger ≈ 0.69, well above the
    // 0.4 threshold → drive clamps to 1 (full). A raw-linear gate would throttle it to ~0.69·2; the
    // threshold shape must NOT. This is what keeps the income-poor majority foraging hard.
    expect(foodThrust(20, GATE_ON)).toBeCloseTo(2);
  });

  it('gates ONLY the food gradient — a full creature still steers on its sight vector', () => {
    const sightThrust = (energy: number): number => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.heading[i] = 0;
      s.senseX[i] = 0; // no food
      s.senseY[i] = 0;
      s.sightX[i] = 1; // prey straight ahead
      s.sightY[i] = 0;
      setBrain(s, i, { SIGHT_FWD_THRUST: 2 });
      s.energy[i] = energy;
      s.rebuildLive();
      steer(s, false, 0.2, false, GATE_ON);
      return Math.hypot(s.forceX[0]!, s.forceY[0]!);
    };
    expect(sightThrust(1e6)).toBeCloseTo(sightThrust(0)); // sight is NOT gated by hunger
    expect(sightThrust(1e6)).toBeCloseTo(2); // a full creature still chases on sight
  });

  it('foodGateThreshold ≤ 0 falls back to the raw-linear gate (drive = hunger)', () => {
    // threshold 0 → no saturating ramp: drive IS hunger. satiatedBar floors at 65 (SIZE 0), so energy 20
    // → hunger ≈ 0.69 → thrust ≈ FWD_THRUST(2)·0.69, i.e. linearly throttled (not the full 2 a ramp gives).
    const LINEAR = defaultConfig({
      hungerGatesFood: true,
      foodGateThreshold: 0,
      brainGatedEating: false,
    });
    expect(foodThrust(20, LINEAR)).toBeCloseTo(2 * (1 - 20 / 65), 1);
  });
});
