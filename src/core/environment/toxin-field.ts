import { ScalarField } from './scalar-field';

/**
 * Coarse toxin grid over the toroidal world. Toxin deposits (e.g. from decaying
 * MEAT, or a future defensive cell) and diffuses+decays; high concentration damages
 * cells (applied in metabolism). Selection rewards avoidance (sensing+fleeing) or
 * resistance. A persistent deposit/diffuse/decay scalar field — see {@link ScalarField}.
 */
export class ToxinField extends ScalarField {}
