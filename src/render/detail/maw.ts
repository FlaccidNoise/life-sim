import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;

export const maw: TraitModule = {
  id: 'maw',
  z: 5,
  minTier: 1,
  draw({ ctx, R, tier, genes, derived }) {
    const fear = derived.fear;
    const eat = genes.norm(ScalarGene.EAT_RATE);
    const dmg = genes.norm(ScalarGene.DAMAGE);
    const lw = Math.max(1.5, R * 0.07);
    const mx = R * 0.62;
    const gape = R * (0.1 + eat * 0.4) * lerp(0.7, 1.3, fear);
    ctx.fillStyle = fear > 0.5 ? '#2a0707' : '#3a1414';
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    if (fear < 0.4) ctx.ellipse(mx, 0, R * 0.15, gape * 0.65, 0, 0, TAU);
    else ctx.ellipse(mx, 0, R * 0.25, gape, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (dmg > 0.04 && tier >= 2) {
      const teeth = Math.round(2 + dmg * 6);
      ctx.fillStyle = '#f6f2e8';
      for (let t = 0; t < teeth; t++) {
        const ty = -gape + ((t + 0.5) / teeth) * 2 * gape;
        const th = ((gape * (0.2 + dmg * 0.5)) / teeth) * 2.4;
        ctx.beginPath();
        ctx.moveTo(mx - R * 0.2, ty - th * 0.4);
        ctx.lineTo(mx + R * 0.08, ty);
        ctx.lineTo(mx - R * 0.2, ty + th * 0.4);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
};
