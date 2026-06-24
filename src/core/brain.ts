/**
 * THINK + ACT step + within-life (Baldwin) learning — each creature runs its OWN brain (a heritable
 * per-creature genome, §genome.ts). The brain is a minimal linear sensor→motor map: the food gradient
 * in the heading frame (forward, lateral) → turn + thrust.
 *
 * Two weight sets per creature:
 *  - `brain` (genome): the heritable INSTINCT, copied + mutated at birth. Never changes within a life.
 *  - `learnedBrain` (runtime): what steer() actually reads. Reset to `brain` at birth, then drifts via
 *    reward-modulated Hebbian plasticity (§5.2). Learning dies with the individual — children copy the
 *    genome, never the learned weights, so there is no Lamarckian leak.
 *
 * Because the genome is heritable + mutated, behavior EVOLVES; because the runtime brain learns,
 * behavior also improves WITHIN a single life (and over generations the instinct assimilates what
 * learning keeps discovering, since selection favors genomes that start closer to it).
 */
import { type OrganismStore } from './store';
import { type Config } from './config';
import { satiatedBar } from './economy';
import {
  Brain,
  BRAIN_GENES,
  ScalarGene,
  SCALAR_GENE_COUNT,
  HiddenInput,
  HIDDEN_UNITS,
  HIDDEN_INPUTS,
  HIDDEN_OUTPUTS,
  HIDDEN_W1,
  HIDDEN_W2,
  GLOW_BIAS,
  GLOW_HID,
  GLOW_SENSE_LAT_TURN,
  GLOW_SENSE_FWD_TURN,
  GLOW_SENSE_LAT_THRUST,
  GLOW_SENSE_FWD_THRUST,
} from './genome';
import { SCENT_CHANNELS } from './scent-field';

/**
 * Run each creature's runtime brain: food gradient (heading frame) → turn + thrust. Turns the heading
 * and SETS the force buffer (repulsion += on top afterward). Turn + thrust are clamped to this
 * creature's OWN evolved MAX_TURN / MAX_THRUST genes, and the resulting force is scaled by its
 * metabolic-efficiency gene (thrifty bodies push weaker). When `learn` is true, also accumulates the
 * per-synapse eligibility trace (pre·post, blended by `eligLambda`) for the later weight update — the
 * trace bridges the gap between a steering decision and the energy reward it earns ticks later.
 *
 * When `cfg.hungerSense` is on, an extra interoceptive input is mixed in: hunger = clamp(1 −
 * energy/satiatedBar, 0, 1) (0 = full, 1 = empty), gated on two evolvable synapses (interoception
 * lever E2 — a creature sensing its OWN energy state; NOT a coevolutionary/Red Queen mechanism). It is
 * purely additive and OFF-gated — with hungerSense off, the hunger term and its eligibility are NOT
 * computed, so turn/thrust (and the determinism hash) are byte-identical to pre-E2.
 */
export function steer(
  store: OrganismStore,
  learn: boolean,
  eligLambda: number,
  motorSquash: boolean,
  cfg: Config,
): void {
  const {
    liveIndices,
    liveCount,
    heading,
    senseX,
    senseY,
    sightX,
    sightY,
    forceX,
    forceY,
    eatGate,
    glow,
    age,
    crowding,
    fertHere,
  } = store;
  const { wallSenseX, wallSenseY, flowSenseX, flowSenseY, scentSenseX, scentSenseY } = store;
  const { glowSenseX, glowSenseY } = store;
  const { learnedBrain, elig, energy } = store;
  const genes = store.scalarGenes;
  const hungerSense = cfg.hungerSense;
  const hungerGatesFood = cfg.hungerGatesFood;
  const foodGateThreshold = cfg.foodGateThreshold;
  const reverseFrac = cfg.reverseThrustFraction; // 0 = forward-only (legacy); 0.5 = back away at half power
  const brainGatedEating = cfg.brainGatedEating; // eatGate output throttles intake + costs mobility
  const eatMovePenalty = cfg.eatMovePenalty; // thrust ×= 1 − eatGate·penalty while eating
  const ageSense = cfg.ageSense; // feed maturity = min(age/ageNorm,1) as an interoceptive input
  const ageNorm = cfg.ageNorm;
  const readinessSense = cfg.readinessSense; // feed repro-readiness (clamped to the breeding band)
  const bodySense = cfg.bodySense; // A1a: feed own-SIZE/own-DIET as interoceptive inputs
  const cellRadius = cfg.cellRadius; // SIZE normalization divisor (2·cellRadius)
  const crowdSenseNorm = cfg.crowdSenseNorm; // A1b: local-crowding count → [0,1] divisor
  const foodCap = cfg.foodCap; // A1c: fertility-under-foot normalization divisor (local biomass → [0,1])
  const hiddenLayer = cfg.hiddenLayer; // nonlinear tanh layer (conditional logic) on top of the linear map
  const moodGlow = cfg.moodGlow; // bioluminescence output read from the hidden "mood" layer (display + signal)
  // Per-creature scratch for the hidden layer (reused each iteration — no per-creature allocation).
  const hidIn = new Float64Array(HIDDEN_INPUTS);
  const hAct = new Float64Array(HIDDEN_UNITS);
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const maxTurn = genes[sg + ScalarGene.MAX_TURN]!;
    const maxThrust = genes[sg + ScalarGene.MAX_THRUST]!;
    const efficiency = genes[sg + ScalarGene.METAB_EFF]!;
    const h = heading[i]!;
    const dx = Math.cos(h);
    const dy = Math.sin(h);
    const gx = senseX[i]!;
    const gy = senseY[i]!;
    let fwd = gx * dx + gy * dy; // food gradient ahead
    let lat = -gx * dy + gy * dx; // food gradient to the left
    // Hunger scalar = clamp(1 − energy/satiatedBar, 0, 1): 0 = full, 1 = empty. Shared by the food-drive
    // gate (below) and the interoceptive hunger synapses (further down). Computed ONCE, only when a consumer
    // is on, so the all-off path never consults satiatedBar and stays byte-identical to pre-feature.
    let hunger = 0;
    if (hungerSense || hungerGatesFood) {
      const sb = satiatedBar(genes, i, cfg);
      hunger = sb > 0 ? 1 - energy[i]! / sb : 1;
      if (hunger < 0) hunger = 0;
      else if (hunger > 1) hunger = 1;
    }
    // Food-drive gate (satiation → stop seeking): scale the FOOD gradient by a drive that is FULL while
    // the creature is hungry and eases to 0 only as it approaches satiation — drive = clamp(hunger /
    // foodGateThreshold, 0, 1) (raw hunger when threshold ≤ 0). So a full creature stops seeking food and
    // steers on its other drives (sight/flow/pheromone/bias) → wanders, a NEARLY-full one eases off, and
    // the still-hungry majority forages at full strength (no handicap). ONLY the food gradient is scaled.
    // Gated so the OFF path leaves fwd/lat untouched (byte-identical). Scaling at the source feeds the elig.
    if (hungerGatesFood) {
      let drive = foodGateThreshold > 0 ? hunger / foodGateThreshold : hunger;
      if (drive > 1) drive = 1; // lower bound is implicit: hunger ≥ 0 → drive ≥ 0
      fwd *= drive;
      lat *= drive;
    }
    const vx = sightX[i]!;
    const vy = sightY[i]!;
    const sFwd = vx * dx + vy * dy; // sight vector ahead (appeal-signed)
    const sLat = -vx * dy + vy * dx; // sight vector to the left
    const wallVx = wallSenseX[i]!;
    const wallVy = wallSenseY[i]!;
    const wFwd = wallVx * dx + wallVy * dy; // wall-avoidance gradient ahead
    const wLat = -wallVx * dy + wallVy * dx; // wall-avoidance gradient to the left
    const flowVx = flowSenseX[i]!;
    const flowVy = flowSenseY[i]!;
    const flFwd = flowVx * dx + flowVy * dy; // current/flow vector ahead
    const flLat = -flowVx * dy + flowVy * dx; // current/flow vector to the left
    const glowVx = glowSenseX[i]!;
    const glowVy = glowSenseY[i]!;
    const glFwd = glowVx * dx + glowVy * dy; // glow-field gradient ahead (∇G)
    const glLat = -glowVx * dy + glowVy * dx; // glow-field gradient to the left
    const b = i * BRAIN_GENES;
    const sb = i * SCENT_CHANNELS;
    // Turn/thrust = food-gradient + sight + wall + flow responses (+ hunger when on); all heading-frame.
    let turnRaw =
      learnedBrain[b + Brain.LAT_TURN]! * lat +
      learnedBrain[b + Brain.FWD_TURN]! * fwd +
      learnedBrain[b + Brain.SIGHT_LAT_TURN]! * sLat +
      learnedBrain[b + Brain.SIGHT_FWD_TURN]! * sFwd +
      learnedBrain[b + Brain.WALL_LAT_TURN]! * wLat +
      learnedBrain[b + Brain.WALL_FWD_TURN]! * wFwd +
      learnedBrain[b + Brain.FLOW_LAT_TURN]! * flLat +
      learnedBrain[b + Brain.FLOW_FWD_TURN]! * flFwd +
      learnedBrain[b + GLOW_SENSE_LAT_TURN]! * glLat +
      learnedBrain[b + GLOW_SENSE_FWD_TURN]! * glFwd +
      learnedBrain[b + Brain.TURN_BIAS]!;
    let thrustRaw =
      learnedBrain[b + Brain.LAT_THRUST]! * lat +
      learnedBrain[b + Brain.FWD_THRUST]! * fwd +
      learnedBrain[b + Brain.SIGHT_LAT_THRUST]! * sLat +
      learnedBrain[b + Brain.SIGHT_FWD_THRUST]! * sFwd +
      learnedBrain[b + Brain.WALL_LAT_THRUST]! * wLat +
      learnedBrain[b + Brain.WALL_FWD_THRUST]! * wFwd +
      learnedBrain[b + Brain.FLOW_LAT_THRUST]! * flLat +
      learnedBrain[b + Brain.FLOW_FWD_THRUST]! * flFwd +
      learnedBrain[b + GLOW_SENSE_LAT_THRUST]! * glLat +
      learnedBrain[b + GLOW_SENSE_FWD_THRUST]! * glFwd +
      learnedBrain[b + Brain.THRUST_BIAS]!;
    // F2 scent: each channel's gradient (heading frame) on its own 4 synapses. N-generic loop. Base for
    // channel c = PHERO_C0_LAT_TURN + c*4 → {lat_turn, fwd_turn, lat_thrust, fwd_thrust}. Seeded 0 so the
    // sign evolves (climb prey-scent / descend predator-scent / cluster on kin-hue). Each channel's gradient
    // ALSO feeds the hidden layer (HiddenInput.SCENT_C{c}_FWD/LAT) so scent reaches the NONLINEAR logic, not
    // just the linear synapses — the same dual path food/sight/wall/flow use (mandate 1).
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const cvx = scentSenseX[sb + c]!;
      const cvy = scentSenseY[sb + c]!;
      const cFwd = cvx * dx + cvy * dy;
      const cLat = -cvx * dy + cvy * dx;
      const pb = b + Brain.PHERO_C0_LAT_TURN + c * 4;
      turnRaw += learnedBrain[pb]! * cLat + learnedBrain[pb + 1]! * cFwd;
      thrustRaw += learnedBrain[pb + 2]! * cLat + learnedBrain[pb + 3]! * cFwd;
      if (hiddenLayer) {
        hidIn[HiddenInput.SCENT_C0_FWD + c * 2] = cFwd;
        hidIn[HiddenInput.SCENT_C0_FWD + c * 2 + 1] = cLat;
      }
    }

    // Interoceptive hunger (lever E2): the shared hunger scalar (computed above) on its own pair of
    // synapses. Gated, not +0'd, so the OFF path leaves turn/thrust byte-identical (hunger stays 0 / was
    // never computed when both hunger levers are off).
    if (hungerSense) {
      turnRaw += learnedBrain[b + Brain.HUNGER_TURN]! * hunger;
      thrustRaw += learnedBrain[b + Brain.HUNGER_THRUST]! * hunger;
    }

    // Interoceptive AGE (slice C): maturity = min(age/ageNorm, 1) on its own synapses (gated like hunger so
    // the OFF path is untouched). A newborn's aged = 0, so even ON it adds nothing until the creature ages.
    let aged = 0;
    if (ageSense) {
      aged = ageNorm > 0 ? age[i]! / ageNorm : 0; // ageNorm≤0 (live-tune footgun) → no age signal, not NaN
      if (aged > 1) aged = 1;
      turnRaw += learnedBrain[b + Brain.AGE_TURN]! * aged;
      thrustRaw += learnedBrain[b + Brain.AGE_THRUST]! * aged;
    }

    // Interoceptive REPRO-READINESS (slice D): how far into the breeding band [reproThreshold, satiatedBar]
    // the creature is, clamped 0..1. Distinct from hunger (clamped to the BAND, not the full bar). Gated.
    let readiness = 0;
    if (readinessSense) {
      const repro = genes[sg + ScalarGene.REPRO_THRESHOLD]!;
      const band = satiatedBar(genes, i, cfg) - repro;
      readiness = band > 0 ? (energy[i]! - repro) / band : 0; // band>0 always (satiatedBar ≥ repro+MIN_BAND)
      if (readiness < 0) readiness = 0;
      else if (readiness > 1) readiness = 1;
      turnRaw += learnedBrain[b + Brain.READINESS_TURN]! * readiness;
      thrustRaw += learnedBrain[b + Brain.READINESS_THRUST]! * readiness;
    }

    // Interoceptive own-body inputs (A1a): own normalized SIZE + own DIET on their own synapses. Constant
    // within a life → EVOLVE-ONLY (no eligibility below; a learning synapse on a constant input is the bias
    // positive-feedback runaway learn() excludes biases for). Gated, not +0'd, so the OFF path is untouched.
    let sizeN = 0;
    let dietN = 0;
    let crowdN = 0;
    let fertN = 0;
    if (bodySense) {
      sizeN = genes[sg + ScalarGene.SIZE]! / (2 * cellRadius);
      dietN = genes[sg + ScalarGene.DIET]!;
      crowdN = crowding[i]! / crowdSenseNorm;
      if (crowdN > 1) crowdN = 1;
      turnRaw += learnedBrain[b + Brain.SIZE_TURN]! * sizeN + learnedBrain[b + Brain.DIET_TURN]! * dietN;
      thrustRaw +=
        learnedBrain[b + Brain.SIZE_THRUST]! * sizeN + learnedBrain[b + Brain.DIET_THRUST]! * dietN;
      turnRaw += learnedBrain[b + Brain.CROWD_TURN]! * crowdN;
      thrustRaw += learnedBrain[b + Brain.CROWD_THRUST]! * crowdN;
      // A1c fertility-under-foot: total local biomass / foodCap, clamped to 1. VARIES within a life →
      // gets eligibility below (unlike A1a's constant size/diet). 0 when !bodySense (fertHere stays stale).
      fertN = fertHere[i]! / foodCap;
      if (fertN > 1) fertN = 1;
      turnRaw += learnedBrain[b + Brain.FERT_TURN]! * fertN;
      thrustRaw += learnedBrain[b + Brain.FERT_THRUST]! * fertN;
    }

    // Hidden layer (slice E): a tanh layer adding a NONLINEAR correction on top of the linear map above
    // (skip-connection). Computed once per creature; its units feed turn + thrust here, eatGate below, and
    // are reused for the hidden→output eligibility traces. Input→hidden is frozen (evolved); hidden→output
    // learns. Skipped entirely when off → the pure linear brain (byte-identical motor to pre-hidden).
    if (hiddenLayer) {
      hidIn[HiddenInput.FOOD_FWD] = fwd;
      hidIn[HiddenInput.FOOD_LAT] = lat;
      hidIn[HiddenInput.SIGHT_FWD] = sFwd;
      hidIn[HiddenInput.SIGHT_LAT] = sLat;
      hidIn[HiddenInput.WALL_FWD] = wFwd;
      hidIn[HiddenInput.WALL_LAT] = wLat;
      hidIn[HiddenInput.FLOW_FWD] = flFwd;
      hidIn[HiddenInput.FLOW_LAT] = flLat;
      // SCENT_C0..C3 (hidIn slots 8..15) were written in the scent loop above.
      hidIn[HiddenInput.HUNGER] = hunger;
      hidIn[HiddenInput.AGE] = aged;
      hidIn[HiddenInput.READINESS] = readiness;
      hidIn[HiddenInput.SIZE] = sizeN; // 0 when !bodySense → no hidden contribution either
      hidIn[HiddenInput.DIET] = dietN;
      hidIn[HiddenInput.CROWD] = crowdN; // 0 when !bodySense
      hidIn[HiddenInput.FERT] = fertN; // 0 when !bodySense
      hidIn[HiddenInput.BIAS] = 1;
      const w1 = b + HIDDEN_W1;
      for (let j = 0; j < HIDDEN_UNITS; j++) {
        let s = 0;
        for (let ii = 0; ii < HIDDEN_INPUTS; ii++)
          s += hidIn[ii]! * learnedBrain[w1 + ii * HIDDEN_UNITS + j]!;
        hAct[j] = Math.tanh(s);
      }
      const w2 = b + HIDDEN_W2;
      for (let j = 0; j < HIDDEN_UNITS; j++) {
        const a = hAct[j]!;
        turnRaw += a * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 0]!;
        thrustRaw += a * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 1]!;
      }
    }

    let turn: number;
    let thrust: number;
    let eatGateRaw = 0; // eat-gate pre-sigmoid sum (slice B); stays 0 when brainGatedEating is off
    // Reverse floor: a creature may push backward down to −reverseFrac·maxThrust (0 ⇒ forward-only, the
    // legacy motor). Capped below the forward max so backing away is a slower retreat, not a launch. The
    // `>0` guard keeps the floor at +0 (not −0) when off, so reverseFrac 0 is bit-identical to the old motor.
    const reverseFloor = reverseFrac > 0 ? -reverseFrac * maxThrust : 0;
    if (motorSquash) {
      // Smooth saturation: out = max·tanh(raw/max). Slope→1 near 0 (small signals steer ~linearly), eases
      // asymptotically into ±max — no bang-bang snap to the limit (the saturated-rudder spin). Guard the
      // max≤0 edge: tanh(raw/0) is ±1/NaN, so a zero gene would otherwise poison the output → force 0.
      turn = maxTurn > 0 ? maxTurn * Math.tanh(turnRaw / maxTurn) : 0;
      // tanh is symmetric, so negative thrustRaw yields a negative (reverse) thrust; floor it at the reverse
      // cap. With reverseFrac 0 the floor is 0, reproducing the old forward-only squash exactly.
      thrust = maxThrust > 0 ? maxThrust * Math.tanh(thrustRaw / maxThrust) : 0;
      if (thrust < reverseFloor) thrust = reverseFloor;
    } else {
      // Hard clamp (default): a strong signal snaps to the per-creature limit. With reverseFrac 0 the floor
      // is 0, so this is byte-identical to the pre-reverse motor; with reverseFrac>0 it permits backward push.
      turn = turnRaw;
      if (turn > maxTurn) turn = maxTurn;
      else if (turn < -maxTurn) turn = -maxTurn;
      thrust = thrustRaw;
      if (thrust < reverseFloor) thrust = reverseFloor;
      else if (thrust > maxThrust) thrust = maxThrust;
    }
    const nh = h + turn;
    heading[i] = nh;
    thrust *= efficiency; // metabolic-efficiency tradeoff: thrifty (low-e) bodies produce less push
    // Eat-gate (slice B): a sigmoid 0..1 throttle from food + sight + bias. Eating slows the body so
    // grazing is a real decision (graze slow vs lift the head to flee at full speed); metabolize throttles
    // intake by the same gate. Gated by brainGatedEating so the OFF path leaves thrust/force untouched.
    if (brainGatedEating) {
      eatGateRaw =
        learnedBrain[b + Brain.EAT_GATE_BIAS]! +
        learnedBrain[b + Brain.EAT_GATE_FWD]! * fwd +
        learnedBrain[b + Brain.EAT_GATE_LAT]! * lat +
        learnedBrain[b + Brain.EAT_GATE_SIGHT_FWD]! * sFwd +
        learnedBrain[b + Brain.EAT_GATE_SIGHT_LAT]! * sLat;
      if (hiddenLayer) {
        // Hidden layer also feeds the eat decision (output index 2) — conditional "stop eating when …".
        const w2 = b + HIDDEN_W2;
        for (let j = 0; j < HIDDEN_UNITS; j++)
          eatGateRaw += hAct[j]! * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 2]!;
      }
      const gate = 1 / (1 + Math.exp(-eatGateRaw)); // 0 (head up, fast) … 1 (head down, eating, slow)
      eatGate[i] = gate;
      thrust *= 1 - gate * eatMovePenalty; // eating costs mobility — lift the head to flee at full speed
    }
    forceX[i] = thrust * Math.cos(nh);
    forceY[i] = thrust * Math.sin(nh);

    // Mood-glow (slice F): a display/signal output read from the hidden "mood" layer — glow =
    // sigmoid(GLOW_BIAS + Σ_j hAct_j·GLOW_HID_j). DOES NOT affect the motor (display-only). Evolve-only (no
    // elig below). Each lineage's hidden→glow weights diverge, so different species glow for different reasons.
    if (moodGlow) {
      let glowRaw = learnedBrain[b + GLOW_BIAS]!;
      if (hiddenLayer) {
        for (let j = 0; j < HIDDEN_UNITS; j++)
          glowRaw += hAct[j]! * learnedBrain[b + GLOW_HID + j]!;
      }
      glow[i] = 1 / (1 + Math.exp(-glowRaw));
    }

    if (!learn) continue;
    // Eligibility trace per synapse = pre·post (decayed). pre is the synapse's input (lat/fwd food,
    // sLat/sFwd sight, or the bias' constant 1); post is its PRE-clamp motor output.
    const keep = 1 - eligLambda;
    elig[b + Brain.LAT_TURN] = keep * elig[b + Brain.LAT_TURN]! + eligLambda * lat * turnRaw;
    elig[b + Brain.FWD_TURN] = keep * elig[b + Brain.FWD_TURN]! + eligLambda * fwd * turnRaw;
    elig[b + Brain.SIGHT_LAT_TURN] =
      keep * elig[b + Brain.SIGHT_LAT_TURN]! + eligLambda * sLat * turnRaw;
    elig[b + Brain.SIGHT_FWD_TURN] =
      keep * elig[b + Brain.SIGHT_FWD_TURN]! + eligLambda * sFwd * turnRaw;
    elig[b + Brain.TURN_BIAS] = keep * elig[b + Brain.TURN_BIAS]! + eligLambda * turnRaw;
    elig[b + Brain.LAT_THRUST] = keep * elig[b + Brain.LAT_THRUST]! + eligLambda * lat * thrustRaw;
    elig[b + Brain.FWD_THRUST] = keep * elig[b + Brain.FWD_THRUST]! + eligLambda * fwd * thrustRaw;
    elig[b + Brain.SIGHT_LAT_THRUST] =
      keep * elig[b + Brain.SIGHT_LAT_THRUST]! + eligLambda * sLat * thrustRaw;
    elig[b + Brain.SIGHT_FWD_THRUST] =
      keep * elig[b + Brain.SIGHT_FWD_THRUST]! + eligLambda * sFwd * thrustRaw;
    elig[b + Brain.WALL_LAT_TURN] =
      keep * elig[b + Brain.WALL_LAT_TURN]! + eligLambda * wLat * turnRaw;
    elig[b + Brain.WALL_FWD_TURN] =
      keep * elig[b + Brain.WALL_FWD_TURN]! + eligLambda * wFwd * turnRaw;
    elig[b + Brain.WALL_LAT_THRUST] =
      keep * elig[b + Brain.WALL_LAT_THRUST]! + eligLambda * wLat * thrustRaw;
    elig[b + Brain.WALL_FWD_THRUST] =
      keep * elig[b + Brain.WALL_FWD_THRUST]! + eligLambda * wFwd * thrustRaw;
    elig[b + Brain.FLOW_LAT_TURN] =
      keep * elig[b + Brain.FLOW_LAT_TURN]! + eligLambda * flLat * turnRaw;
    elig[b + Brain.FLOW_FWD_TURN] =
      keep * elig[b + Brain.FLOW_FWD_TURN]! + eligLambda * flFwd * turnRaw;
    elig[b + Brain.FLOW_LAT_THRUST] =
      keep * elig[b + Brain.FLOW_LAT_THRUST]! + eligLambda * flLat * thrustRaw;
    elig[b + Brain.FLOW_FWD_THRUST] =
      keep * elig[b + Brain.FLOW_FWD_THRUST]! + eligLambda * flFwd * thrustRaw;
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const cvx = scentSenseX[sb + c]!;
      const cvy = scentSenseY[sb + c]!;
      const cFwd = cvx * dx + cvy * dy;
      const cLat = -cvx * dy + cvy * dx;
      const pb = b + Brain.PHERO_C0_LAT_TURN + c * 4;
      elig[pb] = keep * elig[pb]! + eligLambda * cLat * turnRaw;
      elig[pb + 1] = keep * elig[pb + 1]! + eligLambda * cFwd * turnRaw;
      elig[pb + 2] = keep * elig[pb + 2]! + eligLambda * cLat * thrustRaw;
      elig[pb + 3] = keep * elig[pb + 3]! + eligLambda * cFwd * thrustRaw;
    }
    // Glow-sense elig (slice F3): real input (∇G), so these LEARN. pre = glLat/glFwd, post = motor output.
    elig[b + GLOW_SENSE_LAT_TURN] =
      keep * elig[b + GLOW_SENSE_LAT_TURN]! + eligLambda * glLat * turnRaw;
    elig[b + GLOW_SENSE_FWD_TURN] =
      keep * elig[b + GLOW_SENSE_FWD_TURN]! + eligLambda * glFwd * turnRaw;
    elig[b + GLOW_SENSE_LAT_THRUST] =
      keep * elig[b + GLOW_SENSE_LAT_THRUST]! + eligLambda * glLat * thrustRaw;
    elig[b + GLOW_SENSE_FWD_THRUST] =
      keep * elig[b + GLOW_SENSE_FWD_THRUST]! + eligLambda * glFwd * thrustRaw;
    elig[b + Brain.THRUST_BIAS] = keep * elig[b + Brain.THRUST_BIAS]! + eligLambda * thrustRaw;
    if (hungerSense) {
      elig[b + Brain.HUNGER_TURN] =
        keep * elig[b + Brain.HUNGER_TURN]! + eligLambda * hunger * turnRaw;
      elig[b + Brain.HUNGER_THRUST] =
        keep * elig[b + Brain.HUNGER_THRUST]! + eligLambda * hunger * thrustRaw;
    }
    // Eat-gate output-layer eligibility (slice B): pre = the sense input, post = eatGateRaw (pre-sigmoid).
    if (brainGatedEating) {
      elig[b + Brain.EAT_GATE_FWD] =
        keep * elig[b + Brain.EAT_GATE_FWD]! + eligLambda * fwd * eatGateRaw;
      elig[b + Brain.EAT_GATE_LAT] =
        keep * elig[b + Brain.EAT_GATE_LAT]! + eligLambda * lat * eatGateRaw;
      elig[b + Brain.EAT_GATE_SIGHT_FWD] =
        keep * elig[b + Brain.EAT_GATE_SIGHT_FWD]! + eligLambda * sFwd * eatGateRaw;
      elig[b + Brain.EAT_GATE_SIGHT_LAT] =
        keep * elig[b + Brain.EAT_GATE_SIGHT_LAT]! + eligLambda * sLat * eatGateRaw;
    }
    // Age input eligibility (slice C): pre = maturity, post = the motor output (mirrors the hunger pair).
    if (ageSense) {
      elig[b + Brain.AGE_TURN] = keep * elig[b + Brain.AGE_TURN]! + eligLambda * aged * turnRaw;
      elig[b + Brain.AGE_THRUST] =
        keep * elig[b + Brain.AGE_THRUST]! + eligLambda * aged * thrustRaw;
    }
    // Repro-readiness eligibility (slice D): pre = readiness, post = the motor output.
    if (readinessSense) {
      elig[b + Brain.READINESS_TURN] =
        keep * elig[b + Brain.READINESS_TURN]! + eligLambda * readiness * turnRaw;
      elig[b + Brain.READINESS_THRUST] =
        keep * elig[b + Brain.READINESS_THRUST]! + eligLambda * readiness * thrustRaw;
    }
    // Local-crowding eligibility (A1b): pre = crowdN, post = motor output. CROWD VARIES within a life, so it
    // LEARNS (unlike A1a's constant own-size/diet, which get NO elig). Gated on bodySense.
    if (bodySense) {
      elig[b + Brain.CROWD_TURN] = keep * elig[b + Brain.CROWD_TURN]! + eligLambda * crowdN * turnRaw;
      elig[b + Brain.CROWD_THRUST] =
        keep * elig[b + Brain.CROWD_THRUST]! + eligLambda * crowdN * thrustRaw;
      // Fertility-under-foot eligibility (A1c): pre = fertN, post = motor output. FERT VARIES within a life,
      // so it LEARNS (like CROWD; unlike A1a's constant own-size/diet, which get NO elig).
      elig[b + Brain.FERT_TURN] = keep * elig[b + Brain.FERT_TURN]! + eligLambda * fertN * turnRaw;
      elig[b + Brain.FERT_THRUST] =
        keep * elig[b + Brain.FERT_THRUST]! + eligLambda * fertN * thrustRaw;
    }
    // Hidden→output eligibility (slice E): ONLY the output layer learns (pre = hidden activation, post =
    // the motor output). The input→hidden weights get NO elig → they stay at the genome (evolved-only),
    // because the Hebbian rule cannot credit-assign reward back through a hidden unit.
    if (hiddenLayer) {
      const w2 = b + HIDDEN_W2;
      for (let j = 0; j < HIDDEN_UNITS; j++) {
        const a = hAct[j]!;
        const o = w2 + j * HIDDEN_OUTPUTS;
        elig[o + 0] = keep * elig[o + 0]! + eligLambda * a * turnRaw;
        elig[o + 1] = keep * elig[o + 1]! + eligLambda * a * thrustRaw;
        elig[o + 2] = keep * elig[o + 2]! + eligLambda * a * eatGateRaw;
      }
    }
  }
}

/**
 * Reward-modulated Hebbian consolidation (run after METABOLIZE, once this tick's energy is known) — a
 * 3-factor rule (pre × post × reward):
 *   reward = clamp( energy − prevEnergy, ±rewardClamp )          // this tick's NET energy change
 *   dev    = clamp( (w − genome)·(1−decay) + learningRate·reward·elig, ±maxDev )
 *   w      = genome + dev
 * The reward is the actual outcome: behavior that EARNED energy (foraging that fed, a hunt that landed)
 * is reinforced; behavior during a LOSS is weakened (you unlearn what was starving you). This is what
 * makes learning a real "gets smarter within life" signal rather than just reinforcing whatever you were
 * already doing. Two stability legs keep it honest: biases are excluded (their constant input makes
 * Hebbian a positive-feedback spin runaway), and the learned DEVIATION from the heritable instinct is
 * bounded, so learning refines instinct and dies with the individual (children copy the genome).
 */
export function learn(
  store: OrganismStore,
  learningRate: number,
  weightDecay: number,
  maxLearnDeviation: number,
  rewardClamp: number,
): void {
  const { liveIndices, liveCount, energy, prevEnergy, brain, learnedBrain, elig } = store;
  const keep = 1 - weightDecay;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    let reward = energy[i]! - prevEnergy[i]!; // net Δenergy this tick (food + predation − costs)
    prevEnergy[i] = energy[i]!; // baseline for next tick's reward
    if (reward > rewardClamp) reward = rewardClamp;
    else if (reward < -rewardClamp) reward = -rewardClamp;
    const b = i * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++) {
      // Biases are NOT plastic: their input is the constant 1, so Hebbian pre·post just accumulates the
      // motor output's own sign → a positive-feedback runaway that saturates turn/thrust (= spinning in
      // place). Sensorimotor synapses self-correct (their input vanishes as the creature aligns).
      if (g === Brain.TURN_BIAS || g === Brain.THRUST_BIAS || g === Brain.EAT_GATE_BIAS) continue;
      const w0 = brain[b + g]!; // genome instinct = the anchor the deviation relaxes toward
      let dev = (learnedBrain[b + g]! - w0) * keep + learningRate * reward * elig[b + g]!;
      if (dev > maxLearnDeviation) dev = maxLearnDeviation;
      else if (dev < -maxLearnDeviation) dev = -maxLearnDeviation;
      learnedBrain[b + g] = w0 + dev;
    }
  }
}
