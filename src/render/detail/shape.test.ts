import { describe, it, expect } from 'vitest';
import { bodyOutline } from './shape';

describe('bodyOutline', () => {
  it('returns 72 points', () => {
    expect(bodyOutline(0, 10)).toHaveLength(72);
  });
  it('herbivore (diet 0) is a near-circle: low radial variance', () => {
    const pts = bodyOutline(0, 10);
    const radii = pts.map((p) => Math.hypot(p.x, p.y));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    const variance = radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length;
    // forward taper still perturbs it, but spike amp = 0, so variance stays modest
    expect(variance).toBeLessThan((0.3 * mean) ** 2);
  });
  it('predator (diet 1) spikes: max radius noticeably exceeds mean', () => {
    const pts = bodyOutline(1, 10);
    const radii = pts.map((p) => Math.hypot(p.x, p.y));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    expect(Math.max(...radii)).toBeGreaterThan(mean * 1.3);
  });
  it('forward taper biases mass toward +x (front bigger than back)', () => {
    const pts = bodyOutline(0, 10);
    const frontX = Math.max(...pts.map((p) => p.x));
    const backX = Math.min(...pts.map((p) => p.x));
    expect(frontX).toBeGreaterThan(-backX); // +x extent > -x extent
  });
});
