import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { defaultConfig } from '../../core/config';
import {
  Brain,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
  BRAIN_GENES,
} from '../../core/genome';
import { steer } from '../../core/brain';
import { satiatedBar } from '../../core/economy';
import { computeBrainState } from './brain-view';

const cfg = defaultConfig();

/** One creature with centered genes + a chosen brain, sense, sight, wall, and flow. */
function setup(): OrganismStore {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0.7;
  s.senseX[i] = 0.4;
  s.senseY[i] = -0.2;
  s.sightX[i] = 0.6;
  s.sightY[i] = 0.1;
  s.wallSenseX[i] = -0.3;
  s.wallSenseY[i] = 0.5;
  s.flowSenseX[i] = 0.2;
  s.flowSenseY[i] = -0.4;
  const base = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++)
    s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
  // Distinct brain weights so each edge is exercised; learnedBrain set differently to test drift.
  for (let g = 0; g < BRAIN_GENES; g++) {
    s.brain[i * BRAIN_GENES + g] = 0.1 * (g + 1);
    s.learnedBrain[i * BRAIN_GENES + g] = 0.1 * (g + 1) + 0.05;
  }
  s.rebuildLive();
  return s;
}

describe('computeBrainState', () => {
  it('reproduces the turn and thrust that steer() applies', () => {
    const s = setup();
    const i = 0;
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    // Run the REAL steer (no learning, so eligibility isn't touched) and compare.
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    const appliedTurn = s.heading[i]! - h0;
    const appliedThrust = Math.hypot(s.forceX[i]!, s.forceY[i]!);
    expect(st.turn).toBeCloseTo(appliedTurn, 10);
    expect(st.thrust).toBeCloseTo(appliedThrust, 10); // brain-view thrust already includes ×efficiency
  });

  it('exposes the base inputs incl. age in the documented order with their live values', () => {
    const s = setup();
    const st = computeBrainState(s, cfg, 0); // default cfg: ageSense on, hungerSense off
    expect(st.inputs.map((n) => n.label)).toEqual([
      'food fwd',
      'food lat',
      'sight fwd',
      'sight lat',
      'wall fwd',
      'wall lat',
      'flow fwd',
      'flow lat',
      'bias',
      'age',
    ]);
    expect(st.inputs[8]!.value).toBe(1); // bias is constant 1
    expect(st.inputs[9]!.label).toBe('age'); // interoceptive maturity input (slice C)
  });

  it('exposes the eat-gate output (slice B): 1 when off, the sigmoid of its inputs when on', () => {
    const s = new OrganismStore(2);
    const i = s.alloc();
    s.heading[i] = 0; // heading 0 → fwd = senseX, sFwd = sightX
    s.senseX[i] = 1;
    s.senseY[i] = 0;
    s.sightX[i] = -1; // appeal-signed sight: negative = threat ahead
    s.sightY[i] = 0;
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.EAT_GATE_BIAS] = 4;
    s.brain[b + Brain.EAT_GATE_SIGHT_FWD] = 2; // threat ahead pulls the gate down
    s.resetLearned(i);
    s.rebuildLive();
    // Off → no throttle, gate reads 1.
    expect(computeBrainState(s, defaultConfig({ brainGatedEating: false }), i).eatGate).toBe(1);
    // On → sigmoid(EAT_GATE_BIAS + EAT_GATE_SIGHT_FWD·sFwd) = sigmoid(4 + 2·(−1)) = sigmoid(2).
    expect(computeBrainState(s, defaultConfig({ brainGatedEating: true }), i).eatGate).toBeCloseTo(
      1 / (1 + Math.exp(-2)),
      10,
    );
  });

  it('adds a 6th hunger input that matches a real steer() run when hungerSense is on', () => {
    const hc = defaultConfig({ hungerSense: true });
    const s = setup();
    const i = 0;
    // Half-full → a FRACTIONAL hunger (0.5), not the degenerate hunger=1 of an empty body. setup()
    // already supplies nonzero food + sight, so this pins the picture in the genuine combined case.
    s.energy[i] = 0.5 * satiatedBar(s.scalarGenes, i, hc);
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, hc, i);
    expect(st.inputs.map((n) => n.label)).toEqual([
      'food fwd',
      'food lat',
      'sight fwd',
      'sight lat',
      'wall fwd',
      'wall lat',
      'flow fwd',
      'flow lat',
      'bias',
      'hunger',
      'age',
    ]);
    expect(st.inputs[9]!.value).toBeCloseTo(0.5, 10); // fractional drive, genuinely exercised (idx 9 = hunger)
    // The hunger node must reproduce the turn/thrust steer() actually applies under the SAME mode.
    steer(s, false, hc.eligLambda, hc.motorSquash, hc);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
  });

  it('reports learning drift = Σ|learned − instinct|', () => {
    const s = setup();
    const st = computeBrainState(s, cfg, 0);
    expect(st.drift).toBeCloseTo(0.05 * BRAIN_GENES, 6); // each weight offset by 0.05
  });

  it('clamps turn to the maxTurn gene', () => {
    const s = setup();
    const i = 0;
    // Force a huge turn signal via the bias weight; turn must clamp to ±maxTurn.
    s.learnedBrain[i * BRAIN_GENES + 4] = 999; // TURN_BIAS
    const st = computeBrainState(s, cfg, i);
    expect(st.turn).toBeCloseTo(s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!, 10);
    expect(st.turnRaw).toBeGreaterThan(st.turn); // raw exceeds the clamp
  });

  it('matches steer() under motorSquash and eases below the limit (ON-mode contract)', () => {
    const sq = defaultConfig({ motorSquash: true });
    const s = setup();
    const i = 0;
    // Drive turn into the saturation region so the tanh path (not the ~linear toe) is exercised.
    s.learnedBrain[i * BRAIN_GENES + 4] = 5; // TURN_BIAS
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, sq, i);
    // The picture must match a REAL squashed steer() run — the no-drift contract under the ON mode too.
    steer(s, false, sq.eligLambda, sq.motorSquash, sq);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    // Squash EASES into the limit (never snaps): raw overshoots maxTurn, applied stays strictly inside it.
    const maxTurn = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!;
    expect(st.turnRaw).toBeGreaterThan(maxTurn);
    expect(Math.abs(st.turn)).toBeLessThan(maxTurn);
  });
});
