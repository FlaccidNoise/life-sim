import { ScalarField } from './scalar-field';

/**
 * Coarse motion/loudness grid over the toroidal world. Every live cell deposits
 * `loudnessGain · speed` (speed = hypot(velX, velY)) into its patch at END-OF-TICK
 * (world.ts step 11b), then the field diffuses + decays so deposit balances decay into
 * an equilibrium ∝ local motion. Sensors read its GRADIENT next tick (one-tick coupling,
 * like smell). Undifferentiated: one field, everyone deposits and reads. A persistent
 * deposit/diffuse/decay scalar field — see {@link ScalarField}.
 */
export class NoiseField extends ScalarField {}
