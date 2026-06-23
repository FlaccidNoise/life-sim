import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const tail: TraitModule = {
  id: 'tail',
  z: -5,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const tLen = R * 0.4 + genes.norm(ScalarGene.MAX_SPEED) * R * 1.7;
    const tThick = R * (0.16 + genes.norm(ScalarGene.MAX_THRUST) * 0.5);
    const lw = Math.max(1.5, R * 0.07);
    ctx.fillStyle = rgb(derived.shadow);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, -tThick);
    ctx.quadraticCurveTo(-R * 0.85 - tLen * 0.6, -tThick * 0.3, -R * 0.85 - tLen, 0);
    ctx.quadraticCurveTo(-R * 0.85 - tLen * 0.6, tThick * 0.3, -R * 0.8, tThick);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
};
