import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { defaultConfig } from './config';
import {
  Brain,
  BRAIN_GENES,
  BRAIN_CORE_GENES,
  NAMED_BRAIN_GENES,
  HiddenInput,
  HIDDEN_INPUTS,
  HIDDEN_UNITS,
  HIDDEN_OUTPUTS,
  HIDDEN_W1,
  HIDDEN_W2,
  GLOW_BIAS,
  seedGenome,
  mutateGenome,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
  seedScalarGenes,
  mutateScalarGenes,
  crossoverScalarGenes,
  scalarGeneGatedOff,
  geneUpkeep,
  geneticDistance,
} from './genome';
import { SCENT_CHANNELS } from './scent-field';

describe('unified brain layout (consolidation)', () => {
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.FERT_THRUST).toBe(52);
    expect(Brain.BITE_GATE_BIAS).toBe(53);
    expect(Brain.SCENT_GATE_BIAS).toBe(54); // A2b: brain-gated scent-deposit output bias
    expect(NAMED_BRAIN_GENES).toBe(55);
  });
  it('grows the hidden layer to 24 inputs and 5 outputs (turn/thrust/eatGate/biteGate/scentGate)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(24);
    expect(HIDDEN_OUTPUTS).toBe(5);
    expect(HiddenInput.BIAS).toBe(23);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 55
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 151
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 171
    expect(BRAIN_GENES).toBe(180);
  });
});

describe('genome', () => {
  it('DISPLAY and PREFERENCE are seeded in range and counted', () => {
    expect(SCALAR_GENE_COUNT).toBe(27);
    expect(ScalarGene.DISPLAY).toBe(24);
    expect(ScalarGene.PREFERENCE).toBe(25);
    const cfg = defaultConfig({ seed: 1 });
    const genes = new Float32Array(8 * SCALAR_GENE_COUNT);
    const rng = new Rng(1);
    for (let s = 0; s < 8; s++) seedScalarGenes(genes, s, rng, cfg);
    for (let s = 0; s < 8; s++) {
      const d = genes[s * SCALAR_GENE_COUNT + ScalarGene.DISPLAY]!;
      const p = genes[s * SCALAR_GENE_COUNT + ScalarGene.PREFERENCE]!;
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('seedGenome spreads founder brains around the seed (initial variation)', () => {
    const brain = new Float32Array(10 * BRAIN_GENES);
    const hue = new Float32Array(10);
    const rng = new Rng(1);
    for (let s = 0; s < 10; s++) seedGenome(brain, hue, s, rng, 0.3, false, false, false, false);
    // founders differ from one another (not all identical)
    const firstGene = (s: number): number => brain[s * BRAIN_GENES]!;
    const allSame = Array.from({ length: 10 }, (_, s) => firstGene(s)).every(
      (v) => v === firstGene(0),
    );
    expect(allSame).toBe(false);
    // hues populated in [0,1)
    for (let s = 0; s < 10; s++) {
      expect(hue[s]!).toBeGreaterThanOrEqual(0);
      expect(hue[s]!).toBeLessThan(1);
    }
  });

  it('mutateGenome copies the parent with small drift (heredity + variation)', () => {
    const brain = new Float32Array(4 * BRAIN_GENES);
    const hue = new Float32Array(4);
    const rng = new Rng(2);
    // parent (slot 0) with known weights
    for (let g = 0; g < BRAIN_GENES; g++) brain[g] = g + 1;
    hue[0] = 0.5;
    // all gates ON → every brain gene (core + wall + flow + hunger) drifts, so the assertion below holds
    mutateGenome(brain, hue, 1, 0, rng, 0.05, 0.02, true, true, true, true);
    for (let g = 0; g < BRAIN_GENES; g++) {
      const diff = Math.abs(brain[BRAIN_GENES + g]! - brain[g]!);
      expect(diff).toBeLessThan(0.5); // close to parent (small σ)
      expect(diff).toBeGreaterThan(0); // but mutated (not identical)
    }
    expect(hue[1]!).toBeGreaterThanOrEqual(0);
    expect(hue[1]!).toBeLessThan(1);
    expect(Math.abs(hue[1]! - 0.5)).toBeLessThan(0.2); // inherited near the parent's hue
  });

  it('seedGenome with hungerSense OFF draws the IDENTICAL RNG sequence as the pre-E2 core (E2 ablation)', () => {
    // The gotcha: if the 2 hunger synapses drew RNG when off, every downstream rng.state — and the whole
    // seeded world — would shift. Mirror: `a` seeds a genome (hungerSense false); `b` draws exactly the
    // pre-E2 sequence (BRAIN_CORE_GENES gaussians + 1 hue float). Identical seed ⇒ identical end state.
    const a = new Rng(7);
    const b = new Rng(7);
    const brain = new Float32Array(BRAIN_GENES);
    const hue = new Float32Array(1);
    seedGenome(brain, hue, 0, a, 0.3, false, false, false, false);
    for (let g = 0; g < BRAIN_CORE_GENES; g++) b.gaussian(0, 0.3);
    // eat-gate block (slice B) is ALWAYS drawn (on-by-default policy, not gated) — eat-gate (5) + age (2) + readiness (2) + hidden (92) + glow (5) + glow-sense (4), always-drawn, after the core.
    for (let g = Brain.EAT_GATE_BIAS; g < BRAIN_GENES; g++) b.gaussian(0, 0.3);
    b.float();
    expect(a.state).toBe(b.state);
    // and the unused hunger weights are left at their founder 0
    expect(brain[Brain.HUNGER_TURN]!).toBe(0);
    expect(brain[Brain.HUNGER_THRUST]!).toBe(0);
  });

  it('mutateGenome with hungerSense OFF draws the IDENTICAL RNG sequence as the pre-E2 core (E2 ablation)', () => {
    const a = new Rng(11);
    const b = new Rng(11);
    const brain = new Float32Array(2 * BRAIN_GENES);
    const hue = new Float32Array(2);
    mutateGenome(brain, hue, 1, 0, a, 0.05, 0.02, false, false, false, false);
    for (let g = 0; g < BRAIN_CORE_GENES; g++) b.gaussian(0, 0.05);
    // eat-gate block (slice B) is ALWAYS drawn (on-by-default policy, not gated) — eat-gate (5) + age (2) + readiness (2) + hidden (92) + glow (5) + glow-sense (4), always-drawn, after the core.
    for (let g = Brain.EAT_GATE_BIAS; g < BRAIN_GENES; g++) b.gaussian(0, 0.05);
    b.gaussian(0, 0.02); // hue mutation draw
    expect(a.state).toBe(b.state);
  });

  it('hue mutation wraps into [0,1)', () => {
    const brain = new Float32Array(4 * BRAIN_GENES);
    const hue = new Float32Array(4);
    hue[0] = 0.99;
    // large hue σ so it likely crosses the 1.0 boundary; result must still be in range
    for (let t = 0; t < 50; t++) {
      mutateGenome(brain, hue, 1, 0, new Rng(t), 0.05, 0.5, false, false, false, false);
      expect(hue[1]!).toBeGreaterThanOrEqual(0);
      expect(hue[1]!).toBeLessThan(1);
    }
  });

  it('geneticDistance: 0 for identical, symmetric, DIET-dominated, display-blind', () => {
    const cfg = defaultConfig({ mateDietWeight: 5 });
    const N = SCALAR_GENE_COUNT;
    const genes = new Float32Array(4 * N);
    // slot 0 and 1 identical grazers; slot 2 = grazer differing only in DISPLAY; slot 3 = predator (DIET 1).
    for (let s = 0; s < 4; s++) {
      genes[s * N + ScalarGene.DIET] = 0;
      genes[s * N + ScalarGene.MAX_SPEED] = 5;
    }
    genes[2 * N + ScalarGene.DISPLAY] = 1; // only the sexual axis differs
    genes[3 * N + ScalarGene.DIET] = 1; // predator
    expect(geneticDistance(genes, 0, 1, cfg)).toBe(0);
    expect(geneticDistance(genes, 0, 1, cfg)).toBe(geneticDistance(genes, 1, 0, cfg)); // symmetric
    expect(geneticDistance(genes, 0, 2, cfg)).toBe(0); // DISPLAY weighted 0 → same species
    expect(geneticDistance(genes, 0, 3, cfg)).toBeGreaterThan(2); // predator vs prey ≫ threshold (~0.6)
  });
});

describe('env-sense brain genes (wall + flow — RNG-gated)', () => {
  it('env-sense weights are 0 and consume NO rng when gated off', () => {
    const brain = new Float32Array(BRAIN_GENES);
    const hue = new Float32Array(1);
    const a = new Rng(5);
    const b = new Rng(5);
    seedGenome(brain, hue, 0, a, 0.3, false, false, false, false); // all gated off
    for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) expect(brain[g]).toBe(0);
    // a parallel rng that draws the 10 base weights + the always-drawn eat-gate + age + readiness + hidden + glow + glow-sense blocks + hue → SAME state.
    for (let g = 0; g < 10; g++) b.gaussian(0, 0.3);
    for (let g = Brain.EAT_GATE_BIAS; g < BRAIN_GENES; g++) b.gaussian(0, 0.3);
    b.float();
    expect(a.state).toBe(b.state); // gated blocks skip when off; eat-gate (always on) is drawn
  });

  it('env-sense weights ARE drawn when gated on', () => {
    const brain = new Float32Array(BRAIN_GENES);
    const hue = new Float32Array(1);
    seedGenome(brain, hue, 0, new Rng(5), 0.3, true, true, false, false);
    let nonzero = 0;
    for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++)
      if (brain[g] !== 0) nonzero++;
    expect(nonzero).toBeGreaterThan(0);
  });
});

describe('scalar genes (evolvable per-creature traits)', () => {
  const cfg = defaultConfig();

  it('seeds founders around each config center with spread', () => {
    const g = new Float32Array(40 * SCALAR_GENE_COUNT);
    const rng = new Rng(1);
    for (let s = 0; s < 40; s++) seedScalarGenes(g, s, rng, cfg);
    const speedOf = (s: number): number => g[s * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
    expect(Array.from({ length: 40 }, (_, s) => speedOf(s)).every((v) => v === speedOf(0))).toBe(
      false,
    ); // there is spread
    const mean = Array.from({ length: 40 }, (_, s) => speedOf(s)).reduce((a, b) => a + b, 0) / 40;
    expect(mean).toBeGreaterThan(cfg.maxSpeed - 2);
    expect(mean).toBeLessThan(cfg.maxSpeed + 2); // mean sits near the center
  });

  it('seed + mutation keep every gene within its clamp range', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    const wild = defaultConfig({ founderSigma: 50, mutationSigma: 50 }); // huge → would blow past range
    const rng = new Rng(3);
    for (let t = 0; t < 200; t++) {
      seedScalarGenes(g, 0, rng, wild);
      mutateScalarGenes(g, 1, 0, rng, wild);
      for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) {
        const spec = SCALAR_GENE_SPECS[gi]!;
        const seeded = g[gi]!;
        const mutated = g[SCALAR_GENE_COUNT + gi]!;
        const eps = 1e-4; // genes are stored Float32 → a clamped bound can round a hair past it
        expect(seeded).toBeGreaterThanOrEqual(spec.min - eps);
        expect(seeded).toBeLessThanOrEqual(spec.max + eps);
        expect(mutated).toBeGreaterThanOrEqual(spec.min - eps);
        expect(mutated).toBeLessThanOrEqual(spec.max + eps);
      }
    }
  });

  it('mutation inherits the parent with small drift', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    g[ScalarGene.MAX_SPEED] = 6;
    g[ScalarGene.EAT_RATE] = 2;
    mutateScalarGenes(g, 1, 0, new Rng(2), cfg);
    const childSpeed = g[SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
    expect(Math.abs(childSpeed - 6)).toBeLessThan(3); // near the parent
    expect(Math.abs(childSpeed - 6)).toBeGreaterThan(0); // but mutated
  });

  it('geneUpkeep charges only for costed genes ABOVE their center; metab-eff is exempt', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) g[gi] = cfg[SCALAR_GENE_SPECS[gi]!.centerKey];
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(0); // all at center → no cost
    g[ScalarGene.MAX_SPEED] = cfg.maxSpeed - 2; // below center → still free
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(0);
    g[ScalarGene.MAX_SPEED] = cfg.maxSpeed + 3;
    g[ScalarGene.EAT_RATE] = cfg.eatRate + 2;
    g[ScalarGene.METAB_EFF] = cfg.metabolicEfficiency + 0.4; // exempt — must NOT add upkeep
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(3 * cfg.maxSpeedCost + 2 * cfg.eatRateCost);
  });

  it('charges upkeep for the vision genes (no free eyes — the every-gene-costed principle)', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) g[gi] = cfg[SCALAR_GENE_SPECS[gi]!.centerKey];
    g[ScalarGene.VISION_RANGE] = cfg.visionRange + 5;
    g[ScalarGene.VISION_FOV] = cfg.visionFov + 0.4;
    g[ScalarGene.VISION_ACUITY] = cfg.visionAcuity + 1;
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(
      5 * cfg.visionRangeCost + 0.4 * cfg.visionFovCost + 1 * cfg.visionAcuityCost,
    );
  });

  it('FORAGE_PREF carries no upkeep (costKey null — preference is free)', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) g[gi] = cfg[SCALAR_GENE_SPECS[gi]!.centerKey];
    g[ScalarGene.FORAGE_PREF] = 1; // hard channel-B specialist — must add nothing to upkeep
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(0);
  });
});

describe('FORAGE_PREF gene (lever B — two-channel niche axis, RNG-gated)', () => {
  // gaussian() is stateless (2 float draws per call), so "no extra draw" is verifiable by comparing the
  // RNG state to a reference that draws one gaussian per NON-FORAGE gene.
  it('is inert when single-channel: pinned at center, consumes no RNG (the determinism gate)', () => {
    const single = defaultConfig({ foodChannels: 1 });
    const N = 8;
    const g = new Float32Array(N * SCALAR_GENE_COUNT);
    const rng = new Rng(7);
    for (let s = 0; s < N; s++) seedScalarGenes(g, s, rng, single);
    // Every founder's FORAGE_PREF is EXACTLY the center — no gaussian → no spread.
    for (let s = 0; s < N; s++)
      expect(g[s * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]).toBe(single.foragePref);
    // The RNG advanced by exactly one gaussian per NON-gated gene per founder — the SAME stream as the
    // pre-feature engine. At foodChannels=1 every tail-gated gene (FORAGE_PREF + the F1/F2 genes) is skipped,
    // which is what makes single-channel byte-identical to before those genes existed.
    const ref = new Rng(7);
    for (let s = 0; s < N; s++)
      for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++)
        if (!scalarGeneGatedOff(gi, single)) ref.gaussian(0, 1);
    expect(rng.state).toBe(ref.state);
  });

  it('inherits verbatim with no mutation draw when single-channel (birth stream unperturbed)', () => {
    const single = defaultConfig({ foodChannels: 1 });
    const g = new Float32Array(2 * SCALAR_GENE_COUNT);
    g[ScalarGene.FORAGE_PREF] = 0.83; // a non-center parent value
    const rng = new Rng(4);
    mutateScalarGenes(g, 1, 0, rng, single);
    // Child === parent's STORED value (Float32) — copied verbatim, no drift. (Compare to the stored
    // value, not the JS double 0.83, which Float32 rounds to 0.8299999833106995.)
    expect(g[SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]).toBe(g[ScalarGene.FORAGE_PREF]);
    const ref = new Rng(4);
    for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++)
      if (!scalarGeneGatedOff(gi, single)) ref.gaussian(0, 1);
    expect(rng.state).toBe(ref.state); // tail-gated genes draw nothing at foodChannels=1
  });

  it('evolves when two-channel: seeded with spread and mutates around the parent', () => {
    const dual = defaultConfig({ foodChannels: 2 });
    const N = 40;
    const g = new Float32Array(N * SCALAR_GENE_COUNT);
    const rng = new Rng(1);
    for (let s = 0; s < N; s++) seedScalarGenes(g, s, rng, dual);
    const prefOf = (s: number): number => g[s * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    // There IS spread now — the gaussian is drawn — and every value is clamped to [0,1].
    expect(Array.from({ length: N }, (_, s) => prefOf(s)).every((v) => v === prefOf(0))).toBe(
      false,
    );
    for (let s = 0; s < N; s++) {
      expect(prefOf(s)).toBeGreaterThanOrEqual(0);
      expect(prefOf(s)).toBeLessThanOrEqual(1);
    }
    // Mutation drifts the child near (but not equal to) the parent.
    const child = new Float32Array(2 * SCALAR_GENE_COUNT);
    child[ScalarGene.FORAGE_PREF] = 0.4;
    mutateScalarGenes(child, 1, 0, new Rng(9), dual);
    const c = child[SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    expect(Math.abs(c - 0.4)).toBeGreaterThan(0);
    expect(Math.abs(c - 0.4)).toBeLessThan(0.5);
  });

  it('crossoverScalarGenes: each child gene is near one parent allele, clamped', () => {
    const cfg = defaultConfig({ mutationSigma: 0 }); // no mutation → child gene EXACTLY one parent's
    const N = SCALAR_GENE_COUNT;
    const genes = new Float32Array(3 * N);
    for (let g = 0; g < N; g++) {
      genes[0 * N + g] = SCALAR_GENE_SPECS[g]!.min; // mom = min allele
      genes[1 * N + g] = SCALAR_GENE_SPECS[g]!.max; // dad = max allele
    }
    const rng = new Rng(42);
    crossoverScalarGenes(genes, 2, 0, 1, rng, cfg);
    let fromMom = 0;
    let fromDad = 0;
    for (let g = 0; g < N; g++) {
      const v = genes[2 * N + g]!;
      const spec = SCALAR_GENE_SPECS[g]!;
      const min = Math.fround(spec.min); // parent alleles round-trip through Float32 storage
      const max = Math.fround(spec.max);
      expect(v === min || v === max).toBe(true); // exactly one parent (sigma 0)
      if (v === min) fromMom++;
      else fromDad++;
    }
    expect(fromMom).toBeGreaterThan(0); // mixes both parents (not all from one)
    expect(fromDad).toBeGreaterThan(0);
  });

  it('crossoverScalarGenes is deterministic for a given rng state', () => {
    const cfg = defaultConfig({});
    const N = SCALAR_GENE_COUNT;
    const a = new Float32Array(3 * N);
    const b = new Float32Array(3 * N);
    for (let g = 0; g < N; g++) {
      a[g] = b[g] = 1;
      a[N + g] = b[N + g] = 2;
    }
    crossoverScalarGenes(a, 2, 0, 1, new Rng(7), cfg);
    crossoverScalarGenes(b, 2, 0, 1, new Rng(7), cfg);
    for (let g = 0; g < N; g++) expect(a[2 * N + g]).toBe(b[2 * N + g]);
  });
});

describe('DAMPING gene', () => {
  it('is the 27th scalar gene at the tail', () => {
    expect(SCALAR_GENE_COUNT).toBe(27);
    expect(ScalarGene.DAMPING).toBe(26);
  });

  it('is an uncosted physics gene clamped to [0.6, 0.98]', () => {
    const spec = SCALAR_GENE_SPECS[ScalarGene.DAMPING]!;
    expect(spec.centerKey).toBe('damping');
    expect(spec.costKey).toBeNull();
    expect(spec.min).toBe(0.6);
    expect(spec.max).toBe(0.98);
  });

  it('seeds founders around the config damping center (0.9), within clamp', () => {
    const cfg = defaultConfig({ seed: 1 });
    const genes = new Float32Array(8 * SCALAR_GENE_COUNT);
    const rng = new Rng(1);
    for (let s = 0; s < 8; s++) seedScalarGenes(genes, s, rng, cfg);
    for (let s = 0; s < 8; s++) {
      const d = genes[s * SCALAR_GENE_COUNT + ScalarGene.DAMPING]!;
      const eps = 1e-4; // genes are stored Float32 → a clamped bound can round a hair past it
      expect(d).toBeGreaterThanOrEqual(0.6 - eps);
      expect(d).toBeLessThanOrEqual(0.98 + eps);
    }
  });
});
