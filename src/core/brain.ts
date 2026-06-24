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
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from './genome';

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
  const { liveIndices, liveCount, heading, senseX, senseY, sightX, sightY, forceX, forceY } = store;
  const { wallSenseX, wallSenseY, flowSenseX, flowSenseY, pheroSenseX, pheroSenseY } = store;
  const { learnedBrain, elig, energy } = store;
  const genes = store.scalarGenes;
  const hungerSense = cfg.hungerSense;
  const reverseFrac = cfg.reverseThrustFraction; // 0 = forward-only (legacy); 0.5 = back away at half power
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
    const fwd = gx * dx + gy * dy; // food gradient ahead
    const lat = -gx * dy + gy * dx; // food gradient to the left
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
    const pheroVx = pheroSenseX[i]!;
    const pheroVy = pheroSenseY[i]!;
    const pFwd = pheroVx * dx + pheroVy * dy; // pheromone gradient ahead (∇P)
    const pLat = -pheroVx * dy + pheroVy * dx; // pheromone gradient to the left

    const b = i * BRAIN_GENES;
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
      learnedBrain[b + Brain.PHERO_LAT_TURN]! * pLat +
      learnedBrain[b + Brain.PHERO_FWD_TURN]! * pFwd +
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
      learnedBrain[b + Brain.PHERO_LAT_THRUST]! * pLat +
      learnedBrain[b + Brain.PHERO_FWD_THRUST]! * pFwd +
      learnedBrain[b + Brain.THRUST_BIAS]!;

    // Interoceptive hunger (lever E2): a scalar drive on its own pair of synapses. Gated, not +0'd,
    // so the OFF path leaves turn/thrust byte-identical (satiatedBar isn't even consulted when off).
    let hunger = 0;
    if (hungerSense) {
      const sb = satiatedBar(genes, i, cfg);
      hunger = sb > 0 ? 1 - energy[i]! / sb : 1;
      if (hunger < 0) hunger = 0;
      else if (hunger > 1) hunger = 1;
      turnRaw += learnedBrain[b + Brain.HUNGER_TURN]! * hunger;
      thrustRaw += learnedBrain[b + Brain.HUNGER_THRUST]! * hunger;
    }

    let turn: number;
    let thrust: number;
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
    forceX[i] = thrust * Math.cos(nh);
    forceY[i] = thrust * Math.sin(nh);

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
    elig[b + Brain.PHERO_LAT_TURN] =
      keep * elig[b + Brain.PHERO_LAT_TURN]! + eligLambda * pLat * turnRaw;
    elig[b + Brain.PHERO_FWD_TURN] =
      keep * elig[b + Brain.PHERO_FWD_TURN]! + eligLambda * pFwd * turnRaw;
    elig[b + Brain.PHERO_LAT_THRUST] =
      keep * elig[b + Brain.PHERO_LAT_THRUST]! + eligLambda * pLat * thrustRaw;
    elig[b + Brain.PHERO_FWD_THRUST] =
      keep * elig[b + Brain.PHERO_FWD_THRUST]! + eligLambda * pFwd * thrustRaw;
    elig[b + Brain.THRUST_BIAS] = keep * elig[b + Brain.THRUST_BIAS]! + eligLambda * thrustRaw;
    if (hungerSense) {
      elig[b + Brain.HUNGER_TURN] =
        keep * elig[b + Brain.HUNGER_TURN]! + eligLambda * hunger * turnRaw;
      elig[b + Brain.HUNGER_THRUST] =
        keep * elig[b + Brain.HUNGER_THRUST]! + eligLambda * hunger * thrustRaw;
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
      if (g === Brain.TURN_BIAS || g === Brain.THRUST_BIAS) continue;
      const w0 = brain[b + g]!; // genome instinct = the anchor the deviation relaxes toward
      let dev = (learnedBrain[b + g]! - w0) * keep + learningRate * reward * elig[b + g]!;
      if (dev > maxLearnDeviation) dev = maxLearnDeviation;
      else if (dev < -maxLearnDeviation) dev = -maxLearnDeviation;
      learnedBrain[b + g] = w0 + dev;
    }
  }
}
