/**
 * Single source of truth for cell/overlay colours. Consumed by the WebGL
 * renderer (injected as vec3 literals), the Canvas2D telemetry dashboard, and
 * the legend swatches (applied at startup from main.ts) so the three layers can
 * never drift apart.
 *
 * The UI accent (`--accent` cyan in index.html) is deliberately NOT in here —
 * it is chrome, not a cell type. MOTILE is teal (not cyan) so swimming cells
 * don't read as UI chrome. (BOND is intentionally absent — its overlay colour is
 * an energy-flow ramp `rgba(80, g, 140)`, not a single identity colour.)
 */
export const PALETTE = {
  photo: '#4dcc59',
  digestive: '#f27333',
  meat: '#8c8073',
  motile: '#27d0c5',
  sensor: '#d959d9',
  neuron: '#738cf2',
  mover: '#f2d94d',
  predator: '#f22626',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** hex (#rrggbb) → normalized [0,1] vec3 for WebGL shaders. */
export function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const v = (hex: string): string => {
  const [r, g, b] = hexToVec3(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

/** Pre-formatted vec3 literals for the WebGL fragment shader. */
export const PALETTE_VEC3 = {
  photo: v(PALETTE.photo),
  digestive: v(PALETTE.digestive),
  meat: v(PALETTE.meat),
  motile: v(PALETTE.motile),
  sensor: v(PALETTE.sensor),
  neuron: v(PALETTE.neuron),
  mover: v(PALETTE.mover),
  predator: v(PALETTE.predator),
};
