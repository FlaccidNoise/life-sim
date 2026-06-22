import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { defaultConfig } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS, BRAIN_GENES } from '../../core/genome';
import { steer } from '../../core/brain';
import { computeBrainState } from './brain-view';

const cfg = defaultConfig();

/** One creature with centered genes + a chosen brain, sense, and sight. */
function setup(): OrganismStore {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0.7;
  s.senseX[i] = 0.4;
  s.senseY[i] = -0.2;
  s.sightX[i] = 0.6;
  s.sightY[i] = 0.1;
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
    steer(s, false, cfg.eligLambda, cfg.motorSquash);
    const appliedTurn = s.heading[i]! - h0;
    const appliedThrust = Math.hypot(s.forceX[i]!, s.forceY[i]!);
    expect(st.turn).toBeCloseTo(appliedTurn, 10);
    expect(st.thrust).toBeCloseTo(appliedThrust, 10); // brain-view thrust already includes ×efficiency
  });

  it('exposes 5 inputs in the documented order with their live values', () => {
    const s = setup();
    const st = computeBrainState(s, cfg, 0);
    expect(st.inputs.map((n) => n.label)).toEqual([
      'food fwd',
      'food lat',
      'sight fwd',
      'sight lat',
      'bias',
    ]);
    expect(st.inputs[4]!.value).toBe(1); // bias is constant 1
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
    steer(s, false, sq.eligLambda, sq.motorSquash);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    // Squash EASES into the limit (never snaps): raw overshoots maxTurn, applied stays strictly inside it.
    const maxTurn = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!;
    expect(st.turnRaw).toBeGreaterThan(maxTurn);
    expect(Math.abs(st.turn)).toBeLessThan(maxTurn);
  });
});
