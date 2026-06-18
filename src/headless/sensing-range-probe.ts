/**
 * Empirical chemotaxis-range probe. Uses the REAL FoodField + the REAL sense.ts finite-difference
 * to measure: at what distance from a food pocket does the gradient magnitude fall below
 * senseThreshold (1e-4)? Settles the "can a cell swim a great distance to sparse food?" question.
 *
 * Result (2026-06-18): the gradient is sensible to ~29 patches ≈ 92% of the half-world at ANY world
 * size with the fixed grid — so sensing range is NOT the bigger/sparser-world blocker (see
 * DESIGN-SCALING.md). Run: pnpm exec tsx src/headless/sensing-range-probe.ts
 */
import { FoodField } from '../core/environment/food-field';
import { wrap } from '../core/math/vec2';

const SENSE = 1e-4;
const DIFFUSE = 0.22;
const DECAY = 0.03;
const DEPOSIT = 2; // foodDeposit per edible cell per tick

// Replicate sense.ts gradient exactly.
function gradMag(field: FoodField, x: number, y: number, w: number, h: number): number {
  const hx = field.patchW;
  const hy = field.patchH;
  const gx = field.sampleAt(wrap(x + hx, w), y) - field.sampleAt(wrap(x - hx, w), y);
  const gy = field.sampleAt(x, wrap(y + hy, h)) - field.sampleAt(x, wrap(y - hy, h));
  return Math.sqrt(gx * gx + gy * gy);
}

function measure(world: number, cols: number, pocketCells: number, ticks: number): void {
  const field = new FoodField(cols, cols, world, world);
  const cx = world / 2;
  const cy = world / 2;
  // pocket = sqrt(pocketCells) x sqrt(pocketCells) grid of depositors spaced ~1 patch apart
  const side = Math.max(1, Math.round(Math.sqrt(pocketCells)));
  const spacing = field.patchW;
  for (let t = 0; t < ticks; t++) {
    for (let a = 0; a < side; a++)
      for (let b = 0; b < side; b++)
        field.depositAt(
          wrap(cx + (a - side / 2) * spacing, world),
          wrap(cy + (b - side / 2) * spacing, world),
          DEPOSIT,
        );
    field.step(DIFFUSE, DECAY);
  }
  const peak = field.sampleAt(cx, cy);
  let lastSensible = 0;
  const step = field.patchW / 2;
  for (let d = step; d < world / 2; d += step) {
    const g = gradMag(field, wrap(cx + d, world), cy, world, world);
    if (g >= SENSE) lastSensible = d;
  }
  const patchW = field.patchW;
  console.log(
    `world ${world}\tgrid ${cols}\tpatchW ${patchW.toFixed(0)}\tpocket ${pocketCells}cell\t` +
      `peak ${peak.toFixed(1)}\tSENSIBLE to ${lastSensible.toFixed(0)} units ` +
      `(${(lastSensible / patchW).toFixed(1)} patches, ${((lastSensible / (world / 2)) * 100).toFixed(0)}% of half-world)`,
  );
}

console.log('=== Chemotaxis gradient range (gradient >= senseThreshold 1e-4) ===');
console.log('--- fixed grid resolution (cols=64; patchW grows with world → range auto-scales) ---');
measure(2048, 64, 1, 4000);
measure(2048, 64, 16, 4000);
measure(4096, 64, 16, 4000);
measure(8192, 64, 16, 6000);
console.log('--- world-derived grid (patchW held ~32 units → constant absolute range) ---');
measure(4096, 128, 16, 4000);
measure(8192, 256, 16, 6000);
