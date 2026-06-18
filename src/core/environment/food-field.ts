import { ScalarField } from './scalar-field';

/**
 * Coarse food/smell grid over the toroidal world (§4.6 "local food/chemical
 * gradient"). Edible cells deposit "smell" into their patch each tick; the field
 * PERSISTS across ticks (it is NOT cleared per tick — exactly like LightField),
 * diffusing toroidally and decaying so deposit balances decay into an equilibrium
 * proportional to local food density — a smooth, long-range gradient motile cells
 * climb (chemotaxis). A per-tick clear() would collapse the support to ~1 patch
 * and make the gradient unclimbable.
 *
 * Mechanically a plain deposit/diffuse/decay scalar field; all behaviour lives in
 * {@link ScalarField} (default `step` = diffuse + decay). The prey-scent and
 * predator-scent fields are also FoodField instances.
 */
export class FoodField extends ScalarField {}
