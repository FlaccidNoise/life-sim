import { ScalarField } from './scalar-field';

/**
 * Coarse bioluminescent light grid over the toroidal world. NEURON cells bound as
 * GLOW effectors emit light into their patch each tick; the field PERSISTS across
 * ticks, diffusing toroidally and decaying so emission balances decay into an
 * equilibrium proportional to local glow activity. Sensors can sample it as a scalar
 * (chemotaxis/lure signal). A persistent deposit/diffuse/decay scalar field carrying
 * emitted light rather than food smell — see {@link ScalarField}.
 */
export class GlowField extends ScalarField {}
