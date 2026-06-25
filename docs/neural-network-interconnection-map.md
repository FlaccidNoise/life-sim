# Neural-network interconnection map — orphaned-code audit (2026-06-24)

The mission: every gene, world-field, and action must be **(1) decision-wired** — an NN INPUT (the brain
perceives it), an OUTPUT (the brain acts through it), or both — **and (2) visible** — on the radar chart
(`radar-view.ts` LENSES), the brain view (`brain-view.ts`), or the creature's appearance (`renderer.ts`).
This audit tables every gene/field/action against both axes and lists the gaps. Verified against `main`
@ `6e20282` (post brain-consolidation). Cite-checked; re-verify before acting — `main` moves.

**Method:** four parallel read-only auditor passes (genes / brain-I/O+fields / visibility / actions),
cross-checked, plus direct verification of the two load-bearing claims (glow-sense inspector divergence;
flow/scent/hunger config defaults). Supersedes the 2026-06-23 map (predated scent + sexual-repro).

---

## 0. Headline findings

1. **0 of 26 scalar genes are decision-wired.** The brain's inputs are *derived signals* (food/sight/
   wall/flow/scent/glow gradients + 3 interoceptive scalars hunger/age/readiness computed from energy/age
   state) — **no scalar gene value is ever an NN input or an NN-modulated output.** The genuinely useful
   gaps: own-SIZE, own-DIET, own-locomotor-capacity as interoceptive inputs (the creature is blind to its
   own body), and PHERO_DEPOSIT/DAMAGE as brain-modulated outputs.
2. **3 of 11 candidate actions are brain-decided** (MOVE, EAT-throttle, GLOW). **BITE, BREED, SCENT-DEPOSIT
   are pure reflexes** — the hidden layer emits only {turn, thrust, eatGate} (+ a glow head). No bite/breed/
   scent output neuron exists.
3. **`hungerSense` is OFF in BOTH `defaultConfig` (config.ts:808) AND the live demo** (main.ts does not
   override it). The HUNGER synapses (18–19) + HiddenInput.HUNGER (16) are dead weight in every shipped
   config. The handoff's "flip hungerSense ON" is real and unaddressed.
4. **`glow-sense` bypasses the hidden layer** — it's the lone sense wired to the linear map only (no
   HiddenInput slot). It can't participate in conditional logic.
5. **Two inspector-parity bugs (same class)** — `computeBrainState` omitted the 16 linear scent synapses
   AND all 4 glow-sense synapses from its turn/thrust sum, so the brain-view motor silently diverged from
   `steer()` whenever scent/glow was active. **Both fixed** (scent in brain-consolidation; glow-sense in
   this audit) with non-saturated parity tests.
6. **Config-default vs demo divergence:** scent (pheromoneEnabled) and flow (flowStrength) are OFF in
   `defaultConfig` → their synapses are inert by default, LIVE only in the demo (main.ts). The brain's
   "richness" is a demo property, not a default-config one.
7. **No `src/render/detail/` trait-module registry exists on main** — the handoff's trait-module
   description is from the un-merged `worktree-creature-visuals` branch. Appearance = the WebGL dot pass in
   `renderer.ts` (size/shape/hue/saturation/brightness/glow) + the selection overlay.

---

## A. Scalar genes (genome.ts `ScalarGene`, 26) — decision-wired? + visible?

decision-wired: INPUT / OUTPUT / BOTH / **NO** (pure body/economy param). visible: radar / appearance /
brain / **NO**. "geometry/gain" = the gene shapes an NN input's *construction* (sample radius, appeal sign)
but its value is never itself a synapse.

| Gene (idx) | decision-wired? | visible? | evidence / note |
|---|---|---|---|
| MAX_SPEED (0) | NO | NO | physics ceiling (integrate). Fully invisible. |
| EAT_RATE (1) | NO | NO | economy.ts:177 intake rate. Invisible. |
| SENSE_RANGE (2) | NO (geometry) | NO | sense.ts:45 food-gradient half-step. Invisible. |
| SIZE (3) | NO | radar + appearance | radar 'size'; dot diameter renderer.ts:741. Read on neighbors/self-compare (sense.ts) but never an own-value synapse. |
| MAX_TURN (4) | NO (actuator scale) | radar 'agility' | clamps turnRaw (brain.ts:264); brain can't modulate it. |
| MAX_THRUST (5) | NO (actuator scale) | NO | thrust ceiling. Invisible. |
| METAB_EFF (6) | NO (actuator scale) | radar 'econ' | scales thrust+basal. NOT a render cue (renderer uses VISION_RANGE for saturation). |
| REPRO_THRESHOLD (7) | NO* | radar 'r/K' | only NORMALIZES the readiness scalar (brain.ts:211), not sensed itself. |
| SATIATED_THRESHOLD (8) | NO* | radar 'satiety' | only normalizes hunger/readiness. |
| BIRTH_ENERGY (9) | NO | radar 'prov' | offspring provisioning. |
| DIET (10) | NO | radar 'diet' + appearance (shape glyph; diet color-mode) | sets sight appeal sign + income split; never an own-diet synapse. |
| DAMAGE (11) | NO (involuntary bite) | radar 'bite' | economy.ts:112 auto-bite drain. Not brain-gated. |
| VISION_RANGE (12) | NO (geometry) | radar 'vision' + appearance (saturation, renderer.ts:746) | sight scan radius. |
| VISION_FOV (13) | NO (geometry) | overlay only (selection) | vision cone half-angle. Not on radar/dot. |
| VISION_ACUITY (14) | NO (gain) | overlay only (selection) | sight signal gain. |
| SHELTER_DRIVE (15) | NO | NO | weights shelter into the sight vector (sense.ts:219). Invisible. |
| COHESION_DRIVE (16) | NO | NO | schooling into the sight vector (sense.ts:223). Invisible. |
| FORAGE_PREF (17) | NO (geometry) | appearance (forage color-mode only) | food-channel blend. No radar axis. |
| FORAGE_PREF_C (18) | NO (geometry) | appearance (forage color-mode only) | 2nd forage DOF. |
| SENSE_RANGE_B (19) | NO (geometry) | NO | channel-B smell range. Invisible. |
| SENSE_RANGE_C (20) | NO (geometry) | NO | channel-C smell range. Invisible. |
| PHERO_DEPOSIT (21) | NO (passive deposit, not an output) | NO | economy.ts:151 `gene×strength`, constant. Invisible + not brain-controlled. |
| MATURITY_AGE (22) | NO | NO | juvenile breed-gate (economy.ts:345). Invisible. |
| SENESCENCE_AGE (23) | NO | NO | senescence-tax onset. Invisible. |
| DISPLAY (24) | NO (mate-choice only) | **NO (all three)** | economy.ts:350. Ornament nothing can perceive; geneticDistance weights 0. |
| PREFERENCE (25) | NO (mate-choice only) | **NO (all three)** | economy.ts:338. Invisible + not an NN input. |

**Fully invisible heritable genes (0 of 3 surfaces):** MAX_SPEED, EAT_RATE, SENSE_RANGE, MAX_THRUST,
SHELTER_DRIVE, COHESION_DRIVE, SENSE_RANGE_B, SENSE_RANGE_C, PHERO_DEPOSIT, MATURITY_AGE, SENESCENCE_AGE,
DISPLAY, PREFERENCE (13). VISION_FOV/VISION_ACUITY visible only in the selection overlay.

---

## B. Brain I/O (genome.ts `Brain`/`HiddenInput`, brain.ts `steer()`)

### Inputs

| Input | slots | linear? | hidden? | LIVE default? | LIVE demo? | brain-view node? |
|---|---|---|---|---|---|---|
| Food grad (fwd/lat) | 0–3 | yes | yes | yes | yes | yes |
| Sight vector | 6–9 | yes | yes | yes | yes | yes |
| Wall proximity | 10–13 | yes | yes | only if walls present | yes | yes |
| Flow transient | 14–17 | yes | yes | **NO (flowStrength=0 default)** | yes (demo 0.35) | yes |
| Scent ch0–3 | 20–35 (+hidden 8–15) | yes | yes | **NO (pheromoneEnabled=false)** | yes | **NO — summed only, no node/edge** |
| Hunger | 18–19 (+hidden 16) | yes (gated) | yes | **NO (hungerSense=false)** | **NO (not overridden)** | only if hungerSense |
| Age | 41–42 (+hidden 17) | yes | yes | yes | yes | yes |
| Readiness | 43–44 (+hidden 18) | yes | yes | yes | yes | yes |
| Glow-sense ∇G | 142–145 | yes | **NO (linear-only)** | yes | yes | **NO (was omitted — now summed, still no node)** |
| Bias | 4–5 (+hidden 19) | yes | yes | yes (evolve-only) | yes | yes |

### Outputs

| Output | slots | real actuator? | brain-view node? |
|---|---|---|---|
| Turn | sum→heading | YES | yes |
| Thrust | sum→forceX/Y | YES (×eff, ×eat-penalty) | yes |
| Eat-gate | 36–40 (+hidden out 2) | YES — throttles intake (economy.ts:180) + costs mobility | yes |
| Mood-glow | GLOW_BIAS 137 + GLOW_HID 138–141 | display-only motor, but `glow[i]` IS the glow-field deposit source → real outbound comms | yes |

Hidden layer: HIDDEN_INPUTS=20, HIDDEN_UNITS=4, HIDDEN_OUTPUTS=3 {turn,thrust,eatGate}. W1 evolve-only,
W2 learns. **Glow-sense is the lone sense NOT fed to the hidden layer** (no HiddenInput slot).

---

## C. World fields (world.ts)

| Field | sensed? (input) | deposited-into? | deposit brain-controlled? | verdict |
|---|---|---|---|---|
| Food (FoodField) | YES → FOOD_* | consumed (eat) + passive regrow | eat = brain-gated (eatGate); regrow = env | sensed + eat-gated |
| Scent (ScentField ×4) | YES → PHERO_C* + hidden | YES (`depositScent`) | **NO — passive every tick, gene-scaled** | sensed; **deposit is reflex** |
| Glow (PheroField) | YES → GLOW_SENSE_* (linear only) | YES (source = `store.glow`) | **YES — mood-glow brain output** | closed brain→field→brain loop (the one good example) |
| Flow (FlowField) | YES → FLOW_* | n/a | passive env force | sensed only if flowStrength>0 (demo) |
| Walls (Walls) | YES → WALL_* + occludes sight/food | n/a (static) | structural | sensed if walls present |
| Parcels | via SIGHT only (no own input) | eaten (eatParcels) | passive spawn | **no dedicated brain channel — blind if vision→0** |

---

## D. Actions — decision vs reflex (economy.ts / world.ts)

| Action | brain-decided? | mechanism | gap |
|---|---|---|---|
| MOVE (turn/thrust) | DECISION | brain.ts:146–169, 279–303 | — |
| EAT / graze | PARTIAL | eatGate throttles intake (economy.ts:180); graze act + channel = economy | channel-choice could be an output (low value) |
| BITE / hunt | **REFLEX** | hunt() auto-bites nearest edible in range (economy.ts:63–128); reads NO brain state | **→ BITE_GATE output (HIGH)**; gate the drain at economy.ts:112 |
| BREED (asexual) | **REFLEX** | energy-threshold trigger (economy.ts:445–453) | **→ BREED_GATE output (HIGH)**; skip BEFORE rng/spawn (determinism) |
| Mate-seeking (sexual) | **REFLEX + sight-proxy** | `store.seeking` set by energy trigger (economy.ts:495); move toward mate is a sight side-effect; `findMate` proximity scan | route through kin-scent NN channel (handoff §2) |
| SCENT DEPOSIT | **REFLEX** | passive `gene×strength` every tick (economy.ts:151) | **→ scentGate output (MED)**; multiply deposit at economy.ts:151 |
| GLOW DEPOSIT | DECISION ✓ | mood-glow output → world.ts:313 | — (the model to copy) |
| EAT PARCELS | REFLEX (sight-steered) | auto-consume in range (economy.ts:303) | — |
| Metabolize / age / death / taxes | REFLEX | economy.ts:255, 291, 317 | by design |

---

## E. Prioritized gap list (the orphans to wire)

**Decision-wiring (mandate 1):**
1. **Interoceptive own-body inputs (HIGH)** — own-SIZE, own-DIET, local CROWDING (the hash scan already
   exists in metabolize), fertility-under-foot (sample the food value under the body). The brain is blind
   to its own body and density; these are the handoff's phase-4 inputs. None exist today.
2. **Flip `hungerSense` ON (HIGH, trivial)** — it's OFF in default AND demo; the synapses are built but dead.
3. **BITE_GATE output (HIGH)** — make predation a decision (uses DAMAGE). Hook: economy.ts:112.
4. **BREED_GATE output (HIGH)** — brain chooses WHEN; the viability gate enforces affordability. Hook:
   reproduce(), BEFORE the rng/spawn draws (determinism).
5. **scentGate output (MED)** — brain-modulated PHERO_DEPOSIT → a real comms transmit decision (glow already
   has this; scent doesn't). Hook: economy.ts:151.
6. **PREFERENCE as an NN input (MED)** — make mate choice a brain computation, not a fixed rule.
7. **Glow-sense → hidden layer (MED)** — currently linear-only; add a HiddenInput slot so glow can enter
   conditional logic.

**Visibility (mandate 2):**
8. **DISPLAY + PREFERENCE — invisible on all three surfaces (HIGH).** DISPLAY is an ornament nothing renders
   and nothing perceives, weighted 0 in geneticDistance — drive a visible appearance cue + a radar axis, or
   the sexual-selection machinery can never *show*.
9. **Scent (16 synapses + 4 channels) + glow-sense (4) — no brain-view nodes/edges.** The single largest
   invisible brain subsystem; summed into the motor but undrawn.
10. **13 fully-invisible heritable genes** (list in §A) — each wants a radar axis and/or an appearance cue.

---

## F. Bugs found + fixed (during the audit / consolidation)

- **`computeBrainState` omitted the 16 linear scent synapses** from turn/thrust → inspector motor diverged
  from `steer()` whenever scent was active. Fixed (brain-consolidation) + non-saturated parity test.
- **`computeBrainState` omitted all 4 glow-sense synapses** (same class) → divergence whenever glowSense
  active (default ON). Fixed this audit + a dedicated non-saturated glow-sense parity test.
- **Stale comment** genome.ts:84 falsely claimed "DISPLAY drives a render cue" — corrected to note it's a
  wired-but-invisible gap.

**Lesson:** a motor-parity test MUST use non-saturated weights — a saturated setup clamps both the inspector
and the sim to maxTurn, hiding any missing term. Both omissions hid behind the old saturated parity test.
