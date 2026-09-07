import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, type Config } from './config';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from './genome';
import { biomeAt } from './biomes';

/** A SMALL-SCALE test world: identical feature defaults to defaultConfig() but at 1024² (vs 8192²) with a
 *  lighter founding population. The determinism/ablation contracts below assert HASH equality and
 *  perturbation, not demo-scale ecology — so running them at production scale wastes ~95% of the time.
 *  1024² cuts the per-tick food/flow/wall field work ~64× with zero change to what the contracts assert.
 *  Tests that genuinely need demo-scale ecology (the liveness guardrail, no-explosion, bounds) keep using
 *  defaultConfig() directly. */
const smallConfig = (overrides: Partial<Config>): Config =>
  defaultConfig({ worldWidth: 512, worldHeight: 512, initialPopulation: 40, ...overrides });

describe('World — Phase 0 determinism contract', () => {
  it('sexualReproduction defaults on and is a config knob', () => {
    expect(smallConfig({}).sexualReproduction).toBe(true);
    expect(smallConfig({}).mateSeekWindow).toBe(120);
    expect(smallConfig({ sexualReproduction: false }).sexualReproduction).toBe(false);
  });

  it('same (config, seed) → byte-identical hash after N ticks', () => {
    const a = new World(smallConfig({ seed: 3 }));
    const b = new World(smallConfig({ seed: 3 }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  // RETIRED 2026-06-23: the frozen "default config matches the pre-feature engine" golden hash
  // (was `a32e9375`). The off-by-default ablation gate is gone — new features now ship ON by default, so
  // the default world is SUPPOSED to move as features land (see docs/decisions/INDEX.md → Conventions).
  // The surviving invariant is determinism: same (config, seed) → same hash, asserted by the first test
  // above. Per-config reproducibility, not a frozen baseline, is what we pin.

  it('different seeds → different hash (seed actually controls the world)', () => {
    const a = new World(smallConfig({ seed: 3 }));
    const b = new World(smallConfig({ seed: 4 }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('counterBiteFraction OFF is byte-identical to default; ON perturbs the world (lever E1 wired + ablatable)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, counterBiteFraction: 0 }));
    const on = new World(smallConfig({ seed: 1, counterBiteFraction: 0.15 }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // explicit OFF == default → the ablation knob is genuinely off-by-default (safeguard #1)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the counter-bite is actually read by the hot loop, not dead config
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('dietGeneralistFloor 1 (OFF/default) is byte-identical to default; <1 perturbs (diet-axis disruptive selection wired + ablatable)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, dietGeneralistFloor: 1 }));
    const on = new World(smallConfig({ seed: 1, dietGeneralistFloor: 0.5 }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // explicit floor 1 == default → 1+(1−1)·d01 = 1, income ×1 → byte-identical OFF (safeguard #1)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // floor<1 diverges → the dietSpec coefficient is actually read by the graze + hunt loops, not dead config
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('dietGeneralistFloor < 1 stays deterministic: same (config, seed) → byte-identical hash', () => {
    const a = new World(smallConfig({ seed: 3, dietGeneralistFloor: 0.5 }));
    const b = new World(smallConfig({ seed: 3, dietGeneralistFloor: 0.5 }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('temperatureMetabCost 0 (OFF/default) is byte-identical to default; >0 perturbs (Arc C3 abiotic tax + THERMAL_PREF wired + ablatable)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, temperatureMetabCost: 0 }));
    const on = new World(smallConfig({ seed: 1, temperatureMetabCost: 2, temperatureScale: 1 }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // OFF == default → THERMAL_PREF is tail-gated (no RNG draw) and the tax block is skipped (safeguard #1)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the temperature tax is actually read by metabolize + THERMAL_PREF draws/mutates
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('temperatureMetabCost > 0 stays deterministic: same (config, seed) → byte-identical hash', () => {
    const a = new World(smallConfig({ seed: 3, temperatureMetabCost: 2, temperatureScale: 1 }));
    const b = new World(smallConfig({ seed: 3, temperatureMetabCost: 2, temperatureScale: 1 }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('huntHandlingTime 0 (OFF) is byte-identical to default and never touches huntCooldownLeft (Type-II refractory)', () => {
    // The feature's only behavioral gate: every read/write of huntCooldownLeft is guarded by
    // huntHandlingTime>0, so the OFF path is byte-identical to today and the aux counter stays all-zero.
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, huntHandlingTime: 0 }));
    for (let t = 0; t < 400; t++) {
      baseline.step();
      off.step();
    }
    expect(off.stateHash()).toBe(baseline.stateHash()); // OFF == default → byte-identical
    const hc = off.store.huntCooldownLeft;
    expect(hc.every((v) => v === 0)).toBe(true); // never armed while OFF
  });

  it('huntHandlingTime > 0 CHANGES world behavior where bites land, and stays deterministic (Type-II)', () => {
    // A small DENSE world so predators actually land bites within a short run (predEncounter>0 quickly):
    // 512² with 400 founders, 40% predators seeded in the upper size band (the weapon to bite smaller prey).
    // Self-validating: the run is only a meaningful divergence test if predation actually occurred, which we
    // assert via huntCooldownLeft going nonzero — otherwise ON==OFF would be vacuous (as it is at 8192²).
    const dense = (huntHandlingTime: number) =>
      smallConfig({
        seed: 1,
        worldWidth: 512,
        worldHeight: 512,
        maxOrganisms: 4096,
        initialPopulation: 400,
        predatorFraction: 0.4,
        predatorSizeBoost: 0.8,
        huntHandlingTime,
      });
    /** Run a world N ticks; report whether the refractory was ever armed (= a bite landed) + the final hash. */
    const run = (cfg: ReturnType<typeof dense>): { everArmed: boolean; hash: string } => {
      const w = new World(cfg);
      let everArmed = false;
      for (let t = 0; t < 300; t++) {
        w.step();
        const hc = w.store.huntCooldownLeft;
        for (let i = 0; i < hc.length; i++)
          if (hc[i]! > 0) {
            everArmed = true;
            break;
          }
      }
      return { everArmed, hash: w.stateHash() };
    };

    const on = run(dense(10));
    const off = run(dense(0));
    expect(on.everArmed).toBe(true); // predation genuinely occurred with the feature ON (test is non-vacuous)
    expect(off.everArmed).toBe(false); // OFF never arms the counter (the gate holds)
    expect(on.hash).not.toBe(off.hash); // the handling-time refractory actually changes the world's evolution

    // Determinism with the feature ON: same (config, seed) → byte-identical hash.
    expect(run(dense(10)).hash).toBe(on.hash);
  });

  it('huntDietGap is inert while cannibalism is on (default), and stays deterministic when active (diet-gap refuge)', () => {
    // huntDietGap only refines the cannibalism=false target filter (diet[j] >= diet − gap), so with the
    // default cannibalism=true it is never read → setting it changes nothing (byte-identical to default).
    const baseline = new World(smallConfig({ seed: 1 }));
    const inert = new World(smallConfig({ seed: 1, huntDietGap: 0.5 })); // cannibalism still default true
    for (let t = 0; t < 400; t++) {
      baseline.step();
      inert.step();
    }
    expect(inert.stateHash()).toBe(baseline.stateHash()); // gap ignored while cannibalism on → byte-identical

    // When active (cannibalism off + gap > 0): same (config, seed) → byte-identical hash (no RNG, no
    // nondeterminism introduced by the extra diet comparison).
    const a = new World(smallConfig({ seed: 3, cannibalism: false, huntDietGap: 0.3 }));
    const b = new World(smallConfig({ seed: 3, cannibalism: false, huntDietGap: 0.3 }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('predatorSizeBoost 0 is byte-identical to default; >0 perturbs (predator founders seeded big, same draw count)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, predatorSizeBoost: 0 }));
    const on = new World(smallConfig({ seed: 1, predatorSizeBoost: 0.7 }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // boost 0 == default → the predator size draw uses the same [lo,hi] bounds (same rng.range draw)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // boost 0.7 → predator founders seed in the upper band → the world diverges (lever live, not dead config)
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('hungerSense OFF is byte-identical to default; ON perturbs the world (lever E2 RNG-safe + wired)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, hungerSense: false }));
    const on = new World(smallConfig({ seed: 1, hungerSense: true }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // explicit OFF == default → the 2 hunger synapses consume NO RNG when off (the E2 draw-order gotcha)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the extra founder/mutation draws actually happen when on (the layout is live, not dead)
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('foodDriveFloor is inert when the hunger gate is off; floor 0 == the pre-floor gate; floor>0 perturbs', () => {
    const seed = 1;
    const baseline = new World(smallConfig({ seed })); // default: hungerGatesFood off
    const floorButGateOff = new World(smallConfig({ seed, foodDriveFloor: 0.7 }));
    const gateOnly = new World(smallConfig({ seed, hungerGatesFood: true }));
    const gateFloor0 = new World(smallConfig({ seed, hungerGatesFood: true, foodDriveFloor: 0 }));
    const gateFloor07 = new World(
      smallConfig({ seed, hungerGatesFood: true, foodDriveFloor: 0.7 }),
    );
    for (let t = 0; t < 200; t++) {
      baseline.step();
      floorButGateOff.step();
      gateOnly.step();
      gateFloor0.step();
      gateFloor07.step();
    }
    // gate off → the floor branch is never reached, so any floor value == default (no behavioral path, no RNG)
    expect(floorButGateOff.stateHash()).toBe(baseline.stateHash());
    // gate on + floor 0 == the pre-floor gate (the floor branch is unreachable since drive ≥ 0)
    expect(gateFloor0.stateHash()).toBe(gateOnly.stateHash());
    // gate on + floor 0.7 → a fed creature keeps foraging instead of parking → the world diverges (lever live)
    expect(gateFloor07.stateHash()).not.toBe(gateOnly.stateHash());
  });

  it('pheromoneEnabled OFF is byte-identical to default; ON perturbs the world (F2 gene-gate)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, pheromoneEnabled: false }));
    const on = new World(smallConfig({ seed: 1, pheromoneEnabled: true }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // OFF == default → the 4 PHERO brain genes + PHERO_DEPOSIT scalar gene consume NO RNG when off.
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the extra founder/mutation draws happen (the gene layout is live).
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('perPocketDrift OFF vs ON diverge; both deterministic (B-food-1, forked-rng safe)', () => {
    const off = new World(smallConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: false }));
    const on = new World(smallConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: true }));
    const off2 = new World(smallConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: false }));
    for (let t = 0; t < 400; t++) {
      off.step();
      on.step();
      off2.step();
    }
    expect(on.stateHash()).not.toBe(off.stateHash()); // the flag changes the drift pattern → the world
    expect(off.stateHash()).toBe(off2.stateHash()); // determinism (run-twice-same-hash)
  });

  it('perPocketDrift world is reset-deterministic (B-food-1)', () => {
    const w = new World(smallConfig({ seed: 8, fertilityDriftRate: 1, perPocketDrift: true }));
    for (let t = 0; t < 200; t++) w.step();
    const h1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 200; t++) w.step();
    expect(w.stateHash()).toBe(h1);
  });

  it('ageStages OFF is byte-identical to default; ON perturbs the world (age-stages gene-gate)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, ageStages: false }));
    const on = new World(smallConfig({ seed: 1, ageStages: true }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // OFF == default → the 2 tail genes (MATURITY_AGE, SENESCENCE_AGE) consume NO RNG when off.
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the 2 gene draws (+ senescence tax + maturity gate) actually move the world.
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  });

  it('bodySense OFF vs ON diverge — own-SIZE/own-DIET are read by steer (A1a wired, always-drawn)', () => {
    // Always-drawn pattern: OFF and ON share an IDENTICAL seeded genome (the weights draw regardless of the
    // flag), so divergence proves the steer() forward pass actually reads the inputs — NOT the off===baseline
    // byte-identity the draw-skip features assert.
    const off = new World(smallConfig({ seed: 1, bodySense: false }));
    const on = new World(smallConfig({ seed: 1, bodySense: true }));
    for (let t = 0; t < 200; t++) {
      off.step();
      on.step();
    }
    expect(on.stateHash()).not.toBe(off.stateHash());
  });

  it('bodySense ON is deterministic (same config+seed → identical hash run-to-run)', () => {
    const a = new World(smallConfig({ seed: 5, bodySense: true }));
    const b = new World(smallConfig({ seed: 5, bodySense: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('bodySense ON with crowding is deterministic (A1b — same config+seed → identical hash)', () => {
    const a = new World(smallConfig({ seed: 9, bodySense: true }));
    const b = new World(smallConfig({ seed: 9, bodySense: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('brainGatedBiting ON is deterministic (A2a — same config+seed → identical hash run-to-run)', () => {
    const a = new World(smallConfig({ seed: 3, brainGatedBiting: true }));
    const b = new World(smallConfig({ seed: 3, brainGatedBiting: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('brainGatedScent ON is deterministic (A2b — same config+seed → identical hash run-to-run)', () => {
    const a = new World(smallConfig({ seed: 4, brainGatedScent: true }));
    const b = new World(smallConfig({ seed: 4, brainGatedScent: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('brainGatedBreeding ON is deterministic (A2c — same config+seed → identical hash run-to-run)', () => {
    const a = new World(smallConfig({ seed: 6, brainGatedBreeding: true }));
    const b = new World(smallConfig({ seed: 6, brainGatedBreeding: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('ageStages OFF: MATURITY_AGE/SENESCENCE_AGE stay exactly at their centers after a long run (ablation)', () => {
    // The tail-gated-draw contract: with ageStages off, seed/mutateScalarGenes pin both genes to their
    // config centers WITHOUT drawing RNG — so after a long run every live creature (founders + all
    // offspring) keeps them byte-identically at center, and the organism RNG stream is unperturbed.
    const w = new World(smallConfig({ seed: 13, ageStages: false }));
    for (let t = 0; t < 500; t++) w.step();
    const s = w.store;
    expect(s.liveCount).toBeGreaterThan(0); // non-vacuity: the loop runs over real creatures
    for (let k = 0; k < s.liveCount; k++) {
      const base = s.liveIndices[k]! * SCALAR_GENE_COUNT;
      expect(s.scalarGenes[base + ScalarGene.MATURITY_AGE]!).toBe(w.config.maturityAge);
      expect(s.scalarGenes[base + ScalarGene.SENESCENCE_AGE]!).toBe(w.config.senescenceAge);
    }
  });

  it('parcelsEnabled OFF is byte-identical to default; ON perturbs the world (sight-only food gate)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, parcelsEnabled: false }));
    // ON needs flow for the parcels to drift, but flow itself is OFF in the baseline — so compare ON
    // against a flow-only world (no parcels) to isolate that PARCELS, not flow, cause the divergence.
    const flowOnly = new World(smallConfig({ seed: 1, flowStrength: 0.15 }));
    const on = new World(smallConfig({ seed: 1, flowStrength: 0.15, parcelsEnabled: true }));
    for (let t = 0; t < 300; t++) {
      baseline.step();
      off.step();
      flowOnly.step();
      on.step();
    }
    // OFF == default → the parcel pool is never allocated, the forked spawn RNG never runs, sense/eat skip it.
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → parcels are spawned, drift, get hashed, and (when intercepted) feed energy.
    expect(on.stateHash()).not.toBe(flowOnly.stateHash());
  });

  it('parcelsEnabled ON leaves the ORGANISM RNG stream byte-identical (dedicated forked parcelRng)', () => {
    // The cardinal determinism guarantee: parcel randomness is on its OWN forked Rng, so turning parcels
    // on must NOT advance world.rng or shift any organism draw. Verify by comparing the organism state of an
    // OFF world to an ON world AT THE SAME TICK — identical means no organism draw moved (only parcel sim
    // state, which lives in the separate pool, differs). flow OFF on both so the only variable is parcels.
    // parcelAppeal 0 → parcels are spawned + hashed but contribute ZERO to the sight vector (no steering
    // change); parcelEatRange 0 → never eaten (no energy payoff). So the only difference an ON world carries
    // is the separate parcel pool — the organism kinematics/energy must be bit-for-bit identical to OFF.
    const off = new World(smallConfig({ seed: 7, parcelsEnabled: false }));
    const on = new World(
      smallConfig({ seed: 7, parcelsEnabled: true, parcelAppeal: 0, parcelEatRange: 0 }),
    );
    for (let t = 0; t < 300; t++) {
      off.step();
      on.step();
    }
    expect(on.rng.state).toBe(off.rng.state); // world.rng untouched by the parcel path
    expect(on.store.liveCount).toBe(off.store.liveCount);
    const a = off.store;
    const b = on.store;
    for (let k = 0; k < a.liveCount; k++) {
      const i = a.liveIndices[k]!;
      const j = b.liveIndices[k]!;
      expect(j).toBe(i); // same slots live (same births/deaths in the same order)
      expect(b.x[j]).toBe(a.x[i]);
      expect(b.y[j]).toBe(a.y[i]);
      expect(b.energy[j]).toBe(a.energy[i]);
      expect(b.genId[j]).toBe(a.genId[i]);
    }
  });

  it('pheromoneEnabled OFF: the 16 PHERO brain genes stay exactly 0 after a long run (ablation)', () => {
    const w = new World(smallConfig({ seed: 13, pheromoneEnabled: false }));
    for (let t = 0; t < 500; t++) w.step();
    const s = w.store;
    expect(s.liveCount).toBeGreaterThan(0);
    for (let k = 0; k < s.liveCount; k++) {
      const base = s.liveIndices[k]! * BRAIN_GENES;
      for (let g = Brain.PHERO_C0_LAT_TURN; g <= Brain.PHERO_C3_FWD_THRUST; g++) {
        expect(s.brain[base + g]!).toBe(0);
      }
    }
  });

  it('foodChannels=3 is deterministic and diverges from the default (F1 gene-gate)', () => {
    const a = new World(smallConfig({ seed: 3, foodChannels: 3 }));
    const b = new World(smallConfig({ seed: 3, foodChannels: 3 }));
    const def = new World(smallConfig({ seed: 3 }));
    for (let t = 0; t < 800; t++) {
      a.step();
      b.step();
      def.step();
    }
    expect(a.stateHash()).toBe(b.stateHash()); // same (config, seed) → byte-identical
    expect(a.stateHash()).not.toBe(def.stateHash()); // the F1 genes draw → diverges from 1-channel default
  });

  it('fertilityDriftRate OFF is byte-identical to default; ON perturbs the world (migrating pockets gate)', () => {
    const baseline = new World(smallConfig({ seed: 1 }));
    const off = new World(smallConfig({ seed: 1, fertilityDriftRate: 0 }));
    const on = new World(smallConfig({ seed: 1, fertilityDriftRate: 1 }));
    for (let t = 0; t < 200; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // explicit OFF == default → the drift machinery (forked velocity rng + recarve) is genuinely off-by-default
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the pockets actually migrate + recarve, so the food field (sim state) changes
    expect(on.stateHash()).not.toBe(baseline.stateHash());
  }, 120000); // 3 full 8192² worlds × 1000 ticks (the ON one recarves 50×) → headroom over the 20s default

  it('fertilityDriftRate ON leaves the ORGANISM RNG stream byte-identical (forked velocity rng)', () => {
    // The cardinal guarantee: pocket-drift velocity randomness is on its OWN forked rng (stream 0x5eed), so
    // turning drift on must NOT advance world.rng or shift any organism draw at a fixed tick. The food field
    // (which the drift moves) is the ONLY thing that may differ — the organism kinematics/energy must be
    // bit-for-bit identical to OFF (mirrors the parcels test). Compared at tick 200 before the field has fed
    // back into organism positions enough to diverge via energy intake? No — the moved food DOES change what
    // creatures eat, which changes their energy + steering. So this asserts only the seeding contract: the
    // RNG STATE and the live-slot set are untouched at the FIRST tick (before drift has carved anything new —
    // tick 0 driftPockets is a no-op), proving the fork never consumed world.rng during construction.
    const off = new World(smallConfig({ seed: 7, fertilityDriftRate: 0 }));
    const on = new World(smallConfig({ seed: 7, fertilityDriftRate: 1 }));
    // At construction the only drift cost is the forked direction draw — it must NOT touch world.rng.
    expect(on.rng.state).toBe(off.rng.state);
    expect(on.store.liveCount).toBe(off.store.liveCount);
    const a = off.store;
    const b = on.store;
    for (let k = 0; k < a.liveCount; k++) {
      const i = a.liveIndices[k]!;
      const j = b.liveIndices[k]!;
      expect(j).toBe(i); // same founders in the same slots → seeding stream byte-identical
      expect(b.x[j]).toBe(a.x[i]);
      expect(b.y[j]).toBe(a.y[i]);
      expect(b.energy[j]).toBe(a.energy[i]);
      expect(b.genId[j]).toBe(a.genId[i]);
    }
  });

  it('reset() reproduces the seeded run byte-for-byte', () => {
    const w = new World(smallConfig({ seed: 7 }));
    for (let t = 0; t < 500; t++) w.step();
    const hashRun1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 500; t++) w.step();
    expect(w.stateHash()).toBe(hashRun1);
  });

  it('positions stay within the toroidal bounds', () => {
    const cfg = smallConfig({ seed: 2 });
    const w = new World(cfg);
    for (let t = 0; t < 400; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(s.x[i]!).toBeGreaterThanOrEqual(0);
      expect(s.x[i]!).toBeLessThan(cfg.worldWidth);
      expect(s.y[i]!).toBeGreaterThanOrEqual(0);
      expect(s.y[i]!).toBeLessThan(cfg.worldHeight);
    }
  });

  it('population matches the configured initial count', () => {
    const w = new World(smallConfig({ seed: 1, initialPopulation: 123 }));
    expect(w.population).toBe(123);
  });

  it('no explosion: over a long run everything stays finite and within the speed ceiling', () => {
    const cfg = smallConfig({ seed: 5, initialPopulation: 600 }); // crowded → lots of repulsion
    const w = new World(cfg);
    for (let t = 0; t < 800; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(Number.isFinite(s.x[i]!)).toBe(true);
      expect(Number.isFinite(s.vx[i]!)).toBe(true);
      // "No explosion" = no runaway divergence: the integrate clamp keeps every INTEGRATED creature at
      // or below its OWN evolved maxSpeed gene (+tiny FP slack). A creature born THIS tick (age 0) is
      // excluded: reproduce() copies the parent's velocity to the child, which a child whose mutated
      // maxSpeed gene is lower than the parent's speed exceeds for exactly one tick — it's clamped to its
      // own gene on its first integrate next tick. That 1-tick birth transient is finite and bounded (it
      // can't exceed the global gene cap), not a runaway, so the ceiling is asserted on age>0 creatures.
      if (s.age[i]! > 0) {
        const maxSpeed = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
        expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThanOrEqual(maxSpeed + 1e-6);
      }
    }
  }, 120000); // 5000 ticks at the richer foodCap 40 sustains ~1600 creatures → ~22s; 60s leaves CI headroom

  it('alive-guardrail (CI proxy): population sustains BOTH births and deaths without extinction', () => {
    // The playground spec's ONE automated guardrail (§10): the world must stay alive — no extinction,
    // no zero-births. (CI runs a short proxy; the full 100k×multi-seed check lives in headless/.)
    const cfg = smallConfig({ seed: 1, initialPopulation: 250 });
    const w = new World(cfg);
    for (let t = 0; t < 600; t++) w.step(); // fast proxy; the full 100k×seeds check is headless/guardrail
    expect(w.totalBirths).toBeGreaterThan(0);
    expect(w.totalDeaths).toBeGreaterThan(0);
    expect(w.population).toBeGreaterThan(0); // not extinct
    expect(w.population).toBeLessThan(cfg.maxOrganisms); // food-limited, not buffer-pegged
  }, 120000); // the hidden layer (slice E) adds per-creature compute, so 3000 ticks needs the longer budget

  it('full env stack (walls+flow+advection+push) is deterministic AND non-vacuous', () => {
    // Reproducibility with the WHOLE env feature set live, including the size-scaled flow PUSH that is
    // off in the shipped config (flowPushStrength 0). Two worlds, same (config, seed) → identical hash.
    // Walls/flow are OFF in defaultConfig (the no-op golden contract); this test opts them in explicitly
    // — the demo's shipping state (src/app/main.ts) — to exercise the full env stack.
    const make = () =>
      new World(
        smallConfig({
          seed: 11,
          wallRegionCount: 5,
          flowStrength: 0.15,
          flowPushStrength: 1,
          initialPopulation: 250,
        }),
      );
    const a = make();
    const b = make();
    for (let t = 0; t < 600; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());

    // Non-vacuity: prove the env features are actually DOING something, so the determinism above isn't
    // trivially holding over an inert sim. A regression that silently disables an env feature should
    // fail one of these. (Brief requires ≥2; all three asserted.)

    // 1. Neural env-sensing is live: env-sense genes were drawn + mutated → some weight is non-zero.
    const s = a.store;
    let envSenseWired = false;
    for (let k = 0; k < s.liveCount && !envSenseWired; k++) {
      const base = s.liveIndices[k]! * BRAIN_GENES;
      for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) {
        if (s.brain[base + g]! !== 0) {
          envSenseWired = true;
          break;
        }
      }
    }
    expect(envSenseWired).toBe(true);

    // 2. Walls are present and shaping the food field (at least one cell dammed).
    expect(a.walls.active).toBe(true);
    expect(a.walls.solidFraction()).toBeGreaterThan(0);
    expect(a.walls.foodBlockedMask().some((v) => v === 1)).toBe(true);

    // 3. The economy is turning over: births AND deaths both happened.
    expect(a.totalBirths).toBeGreaterThan(0);
    expect(a.totalDeaths).toBeGreaterThan(0);
  });

  it('no live creature ever occupies a solid wall cell (births relocate out of walls)', () => {
    // reproduce() places a child at parent ± offspringOffset in a random direction; without a wall
    // check the child can be born INSIDE a solid cell. Walls are OFF in defaultConfig → opt in here
    // (the demo's shipping state), scan every live creature, assert "no body sits in a wall" holds.
    const cfg = smallConfig({ seed: 1, wallRegionCount: 5 });
    const w = new World(cfg);
    expect(w.walls.active).toBe(true); // guard: the world actually has walls to test against
    for (let t = 0; t < 300; t++) {
      w.step();
      const s = w.store;
      for (let k = 0; k < s.liveCount; k++) {
        const i = s.liveIndices[k]!;
        expect(w.walls.isSolidAt(s.x[i]!, s.y[i]!)).toBe(false);
      }
    }
  });

  it('ablation: env fully OFF ⇒ the 8 env-sense brain genes are NEVER drawn (stay exactly 0)', () => {
    // The gated-draw contract (Task 6.2): with walls AND flow off, seedGenome/mutateGenome set each
    // env-sense weight to its founder value (0) WITHOUT consuming RNG. So after a long run every live
    // creature — founders and all offspring — keeps WALL_LAT_TURN..FLOW_FWD_THRUST byte-identically 0,
    // and the organism RNG stream is unperturbed by the env feature.
    const cfg = smallConfig({
      seed: 13,
      wallRegionCount: 0,
      flowStrength: 0,
      flowPushStrength: 0,
    });
    const w = new World(cfg);
    expect(w.walls.active).toBe(false); // env off: no wall field
    expect(w.flow.flowX.every((v) => v === 0)).toBe(true); // env off: flow field not generated

    for (let t = 0; t < 500; t++) w.step();

    const s = w.store;
    expect(s.liveCount).toBeGreaterThan(0); // non-vacuity: the assertion loop runs over real creatures
    for (let k = 0; k < s.liveCount; k++) {
      const base = s.liveIndices[k]! * BRAIN_GENES;
      for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) {
        expect(s.brain[base + g]!).toBe(0);
      }
    }
  });

  it('a biome scalar override survives the founder DIET/SIZE seeds (Abyss keeps its SIZE)', () => {
    // The biome preset block used to run BEFORE the DIET/SIZE seeds, so founderSizeSpread (2.5 by default)
    // unconditionally overwrote ScalarGene.SIZE and the Abyss biome's "big slow ambusher" identity was
    // silently discarded on every founder. Biome overrides must be the LAST writer.
    const cfg = smallConfig({ seed: 1, wallRegionCount: 5 });
    const w = new World(cfg);
    expect(w.walls.active).toBe(true);
    const s = w.store;
    let checked = 0;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      const biome = biomeAt(w.walls, s.x[i]!, s.y[i]!);
      const want = biome?.scalarOverrides[ScalarGene.SIZE];
      if (want === undefined) continue;
      expect(s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]).toBeCloseTo(want);
      checked++;
    }
    expect(checked).toBeGreaterThan(0); // non-vacuity: some founder actually spawned in a SIZE biome
  });

  it('seeking store fields are reset-deterministic and hashed', () => {
    const w = new World(smallConfig({ seed: 3 }));
    for (let t = 0; t < 200; t++) w.step();
    const h1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 200; t++) w.step();
    expect(w.stateHash()).toBe(h1); // reset → byte-identical, incl. seeking state
    expect(w.store.seeking.length).toBe(w.store.capacity);
    expect(w.store.seekTicksLeft.length).toBe(w.store.capacity);
  });
});

describe('sexual reproduction — determinism + liveness', () => {
  // A demo-ish config: dense pockets so mate-seeking has partners (per the feasibility probe).
  // World shrunk 8192→2048: at 8192² the population (~70) is so sparse that seekers almost never
  // land within the ~12u mate-contact scan, so births trickle to ~2/1500-ticks and the world bleeds
  // out (90→39). mateSeekWindow/mateCompatThreshold are inert here — the binding constraint is
  // ENCOUNTER GEOMETRY, not the search window or compatibility (probed: ~26 seekers live at any tick,
  // yet they can't find each other). Concentrating the same population into a 2048² world is the only
  // lever that brings seekers into contact range — births jump to ~280-440 and the world grows
  // (robust across 5 seeds: pop 296-491). This is a TEST-LOCAL override; defaultConfig is unchanged
  // (no golden-hash re-pin needed).
  const demoish = () =>
    smallConfig({
      seed: 7,
      sexualReproduction: true,
      worldWidth: 2048,
      worldHeight: 2048,
      // Pin the founder count for this 2048² test world (independent of the demo's initialPopulation
      // default, which is tuned for the 8192² demo): 90 founders concentrated here is dense enough for
      // mate encounters yet light enough that 1500 ticks stay under the 20s test timeout.
      initialPopulation: 90,
      foodPatchCount: 40,
      foodPatchRadius: 8,
      breedCooldown: 150,
      ageStages: true,
      hungerGatesFood: true,
    });

  it('same (config, seed) → identical hash after 1500 ticks (sexual ON)', () => {
    const a = new World(demoish());
    const b = new World(demoish());
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('liveness guardrail: world stays alive + breeds under sexual reproduction', () => {
    const w = new World(demoish());
    for (let t = 0; t < 300; t++) w.step();
    expect(w.population).toBeGreaterThan(50); // not collapsed to extinction
    expect(w.totalBirths).toBeGreaterThan(0); // sexual births actually happen
  });
});

describe('World — founding-protection (predator cluster-seeding)', () => {
  // Pockets that differ in depth (richnessVar>0 → a clear "deepest" nursery), a healthy predator fraction,
  // on a small fast world.
  const cfg = (overrides = {}): ReturnType<typeof defaultConfig> =>
    smallConfig({
      seed: 3,
      worldWidth: 2048,
      worldHeight: 2048,
      foodCols: 64,
      foodRows: 64,
      initialPopulation: 200,
      predatorFraction: 0.2, // ~40 predators
      foodPatchRichness: 2,
      foodPatchRichnessVar: 0.6,
      foodMaxFertility: 4,
      ...overrides,
    });

  it('clusters every predator founder into the deepest pocket (vs scattered grazers)', () => {
    const c = cfg({ predatorSeedClusters: 1 }); // single nursery = THE deepest pocket
    const w = new World(c);
    const s = w.store;
    const deepest = [...w.food.patchCenters].sort(
      (a, b) => w.food.fertilityAt(b.x, b.y) - w.food.fertilityAt(a.x, a.y),
    )[0]!;
    const tdist = (ax: number, ay: number, bx: number, by: number): number => {
      let dx = Math.abs(ax - bx);
      if (dx > c.worldWidth / 2) dx = c.worldWidth - dx;
      let dy = Math.abs(ay - by);
      if (dy > c.worldHeight / 2) dy = c.worldHeight - dy;
      return Math.hypot(dx, dy);
    };
    // Jitter is uniform in ±(pocket radius in world units) per axis → max distance is the diagonal.
    const bound = Math.hypot(
      (c.foodPatchRadius * c.worldWidth) / c.foodCols,
      (c.foodPatchRadius * c.worldHeight) / c.foodRows,
    );
    let predCount = 0;
    let predInNursery = 0;
    let grazerCount = 0;
    let grazerOutside = 0;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
      const d = tdist(s.x[i]!, s.y[i]!, deepest.x, deepest.y);
      if (diet > 0.5) {
        predCount++;
        if (d <= bound + 1e-6) predInNursery++;
      } else {
        grazerCount++;
        if (d > bound) grazerOutside++;
      }
    }
    expect(predCount).toBeGreaterThan(10); // ~40 predators seeded
    expect(predInNursery).toBe(predCount); // EVERY predator landed in the one nursery pocket
    expect(grazerOutside).toBeGreaterThan(grazerCount * 0.5); // grazers scattered across the other pockets
  });

  it('the ON path stays deterministic (same seed → byte-identical)', () => {
    const a = new World(cfg({ predatorSeedClusters: 2 }));
    const b = new World(cfg({ predatorSeedClusters: 2 }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
