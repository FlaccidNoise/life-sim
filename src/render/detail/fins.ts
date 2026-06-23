import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const fins: TraitModule = {
  id: 'fins',
  z: -4,
  minTier: 2,
  draw({ ctx, R, genes, derived }) {
    const fins = Math.round(1 + genes.norm(ScalarGene.MAX_TURN) * 4);
    const lw = Math.max(1.5, R * 0.07);
    ctx.fillStyle = rgb(derived.shadow);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.7;
    for (let f = 0; f < fins; f++) {
      const t = fins === 1 ? 0.5 : f / (fins - 1);
      const ax = (-0.15 - t * 0.5) * R;
      for (const s of [-1, 1] as const) {
        const ay = s * R * 0.72;
        ctx.beginPath();
        ctx.moveTo(ax, ay * 0.85);
        ctx.lineTo(ax - R * 0.16, ay * 1.3);
        ctx.lineTo(ax + R * 0.16, ay * 1.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  },
};
