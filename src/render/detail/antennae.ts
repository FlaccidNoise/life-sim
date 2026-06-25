import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const TAU = Math.PI * 2;

export const antennae: TraitModule = {
  id: 'antennae',
  z: 8,
  minTier: 2,
  draw({ ctx, R, tier, genes, derived }) {
    if (tier < 2) return;
    const aLen = R * 0.5 + genes.norm(ScalarGene.SENSE_RANGE) * R * 2.2;
    const lw = Math.max(1.5, R * 0.07);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.8;
    ctx.lineCap = 'round';
    for (const s of [-1, 1] as const) {
      ctx.beginPath();
      const bx = Math.cos(s * 0.5) * R * 0.6;
      const by = Math.sin(s * 0.5) * R * 0.6;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(R * 0.9, s * R * 0.6, R * 0.6 + aLen, s * (R * 0.5 + aLen * 0.45));
      ctx.stroke();
      ctx.fillStyle = rgb(derived.base);
      ctx.beginPath();
      ctx.arc(R * 0.6 + aLen, s * (R * 0.5 + aLen * 0.45), R * 0.12, 0, TAU);
      ctx.fill();
      ctx.lineWidth = lw * 0.7;
      ctx.strokeStyle = rgb(derived.ink);
      ctx.stroke();
    }
  },
};
