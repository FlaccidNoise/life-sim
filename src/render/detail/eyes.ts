import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;

export const eyes: TraitModule = {
  id: 'eyes',
  z: 10,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const fear = derived.fear;
    const vis = genes.norm(ScalarGene.VISION_RANGE);
    const fov = genes.raw(ScalarGene.VISION_FOV);
    const acuity = genes.norm(ScalarGene.VISION_ACUITY);
    const lw = Math.max(1.5, R * 0.07);
    const eyeR = R * (0.16 + vis * 0.24) * lerp(1.35, 0.82, fear);
    const fwd = R * 0.3;
    const lat = R * (0.3 + (fov / 3.14159) * 0.36);
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.translate(fwd, s * lat);
      if (fear < 0.45) {
        // CUTE round eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, eyeR, 0, TAU);
        ctx.fill();
        ctx.lineWidth = lw * 0.7;
        ctx.strokeStyle = rgb(derived.ink);
        ctx.stroke();
        const pr = eyeR * (0.62 - 0.22 * acuity);
        const px = eyeR * 0.3;
        ctx.fillStyle = '#0a0f14';
        ctx.beginPath();
        ctx.arc(px, 0, pr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px - pr * 0.4, -pr * 0.4, pr * 0.4, 0, TAU);
        ctx.fill();
      } else {
        // FEARSOME almond eye (slit pupil) + brow, mirrored across the forward axis
        ctx.scale(1, s);
        ctx.rotate(-0.45 * fear);
        ctx.fillStyle = `rgb(255,${lerp(240, 200, fear) | 0},${lerp(220, 110, fear) | 0})`;
        ctx.beginPath();
        ctx.moveTo(-eyeR, -eyeR * 0.15);
        ctx.lineTo(eyeR, -eyeR * 0.55);
        ctx.lineTo(eyeR * 0.9, eyeR * 0.5);
        ctx.lineTo(-eyeR * 0.9, eyeR * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = lw * 0.7;
        ctx.strokeStyle = rgb(derived.ink);
        ctx.lineJoin = 'round';
        ctx.stroke();
        const px = eyeR * 0.25;
        ctx.fillStyle = '#070b0f';
        ctx.beginPath();
        ctx.ellipse(px, 0, eyeR * (0.26 - 0.16 * acuity), eyeR * 0.6, 0, 0, TAU);
        ctx.fill();
        // angry brow slash (same mirrored+rotated frame)
        ctx.strokeStyle = rgb(derived.ink);
        ctx.lineWidth = lw * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-eyeR * 1.0, -eyeR * 1.15);
        ctx.lineTo(eyeR * 1.05, -eyeR * 0.72);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
};
