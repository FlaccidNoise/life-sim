import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { defaultConfig } from '../../core/config';
import {
  Brain,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
  BRAIN_GENES,
  GLOW_SENSE_LAT_TURN,
  GLOW_SENSE_FWD_TURN,
  GLOW_SENSE_LAT_THRUST,
  GLOW_SENSE_FWD_THRUST,
} from '../../core/genome';
import { SCENT_CHANNELS } from '../../core/scent-field';
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

  it('reproduces turn/thrust from the linear scent synapses (non-saturated, scent active)', () => {
    // Small scent-only weights so the motor does NOT saturate — a saturated motor would mask a missing
    // linear-scent term (both clamp to maxTurn). This pins the inspector to steer()'s scent contribution.
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.PHERO_C0_LAT_TURN] = 0.2;
    s.brain[b + Brain.PHERO_C0_FWD_TURN] = 0.1;
    s.brain[b + Brain.PHERO_C0_LAT_THRUST] = 0.15;
    s.brain[b + Brain.PHERO_C0_FWD_THRUST] = 0.25;
    s.scentSenseX[i * SCENT_CHANNELS + 0] = 0.5;
    s.scentSenseY[i * SCENT_CHANNELS + 0] = 0.3;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the scent path is actually exercised
  });

  it('reproduces turn/thrust from the linear glow-sense synapses (non-saturated, glow active)', () => {
    // Glow-sense (slice F3) is a LINEAR-only receiver; steer() sums it. Small weights so no saturation masks
    // a missing term. Pins the inspector to steer()'s glow-sense contribution.
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    const b = i * BRAIN_GENES;
    s.brain[b + GLOW_SENSE_LAT_TURN] = 0.2;
    s.brain[b + GLOW_SENSE_FWD_TURN] = 0.1;
    s.brain[b + GLOW_SENSE_LAT_THRUST] = 0.15;
    s.brain[b + GLOW_SENSE_FWD_THRUST] = 0.25;
    s.glowSenseX[i] = 0.5;
    s.glowSenseY[i] = 0.3;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the glow-sense path is actually exercised
  });

  it('adds own-SIZE + own-DIET nodes that match a real steer() run (A1a, non-saturated)', () => {
    // own-SIZE/own-DIET feed the linear map + hidden layer; small weights so no saturation masks a missing
    // term (the consolidation lesson). Pins the inspector to steer()'s body-sense contribution.
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    s.scalarGenes[base + ScalarGene.SIZE] = 12; // sizeN = 12/(2·cellRadius=12) = 1.0
    s.scalarGenes[base + ScalarGene.DIET] = 0.8;
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.SIZE_TURN] = 0.05;
    s.brain[b + Brain.DIET_THRUST] = 0.07;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    const sizeNode = st.inputs.find((n) => n.label === 'size')!;
    const dietNode = st.inputs.find((n) => n.label === 'diet')!;
    expect(sizeNode.value).toBeCloseTo(1.0, 10); // SIZE 12 / (2·cellRadius 6) = 1.0 (exact in Float32)
    // DIET is read from the Float32 scalarGenes store, so 0.8 round-trips to 0.80000001 — pin to the
    // stored value, not the literal (the inspector must surface exactly what steer() reads).
    expect(dietNode.value).toBeCloseTo(s.scalarGenes[base + ScalarGene.DIET]!, 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the size→turn path is actually exercised
  });

  it('adds a local-CROWDING node that matches a real steer() run (A1b, non-saturated)', () => {
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    s.crowding[i] = 4; // crowdN = min(4 / crowdSenseNorm(8), 1) = 0.5
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.CROWD_TURN] = 0.06;
    s.brain[b + Brain.CROWD_THRUST] = 0.04;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    const crowdNode = st.inputs.find((n) => n.label === 'crowd')!;
    expect(crowdNode.value).toBeCloseTo(0.5, 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the crowd→turn path is exercised
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
      'prey fwd',
      'prey lat',
      'pred fwd',
      'pred lat',
      'kin·c fwd',
      'kin·c lat',
      'kin·s fwd',
      'kin·s lat',
      'bias',
      'age',
      'ready',
      'size',
      'diet',
      'crowd',
      'glow fwd',
      'glow lat',
    ]);
    expect(st.inputs[16]!.value).toBe(1); // bias is constant 1 (after the 8 base + 8 scent inputs)
    expect(st.inputs[16]!.label).toBe('bias');
    expect(st.inputs[17]!.label).toBe('age'); // interoceptive maturity input (slice C)
    expect(st.inputs[18]!.label).toBe('ready'); // interoceptive repro-readiness input (slice D)
    expect(st.inputs.find((n) => n.label === 'prey fwd')).toBeDefined(); // 4-channel scent now drawn
    expect(st.inputs.find((n) => n.label === 'glow lat')).toBeDefined(); // glow-sense now drawn
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
      'prey fwd',
      'prey lat',
      'pred fwd',
      'pred lat',
      'kin·c fwd',
      'kin·c lat',
      'kin·s fwd',
      'kin·s lat',
      'bias',
      'hunger',
      'age',
      'ready',
      'size',
      'diet',
      'crowd',
      'glow fwd',
      'glow lat',
    ]);
    expect(st.inputs[17]!.label).toBe('hunger');
    expect(st.inputs[17]!.value).toBeCloseTo(0.5, 10); // fractional hunger drive, genuinely exercised (idx 17)
    // The hunger node must reproduce the turn/thrust steer() actually applies under the SAME mode.
    steer(s, false, hc.eligLambda, hc.motorSquash, hc);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
  });

  it('reports learning drift = Σ|learned − instinct|', () => {
    const s = setup();
    const st = computeBrainState(s, cfg, 0);
    // Each weight offset by 0.05; summing 101 Float32 diffs accumulates ~1e-6 rounding → tolerance 4dp.
    expect(st.drift).toBeCloseTo(0.05 * BRAIN_GENES, 4);
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
    // hiddenLayer off so the large setup() hidden weights don't saturate tanh; bodySense off so the A1a
    // size/diet linear terms don't add enough signal to tip tanh to EXACT 1.0 — isolate the squash mechanic.
    const sq = defaultConfig({ motorSquash: true, hiddenLayer: false, bodySense: false });
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
