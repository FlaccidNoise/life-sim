import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

export const visionCone: TraitModule = {
  id: 'vision-cone',
  z: -10,
  minTier: 1,
  draw({ ctx, R, genes, derived, opts }) {
    if (!opts.showCone) return;
    const vis = genes.norm(ScalarGene.VISION_RANGE);
    const fov = genes.raw(ScalarGene.VISION_FOV);
    const lite: RGB = derived.lite;
    const coneLen = R * 1.3 + vis * R * 3.0;
    ctx.fillStyle = `rgba(${lite[0]},${lite[1]},${lite[2]},0.12)`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, coneLen, -fov, fov);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${lite[0]},${lite[1]},${lite[2]},0.22)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-fov) * coneLen, Math.sin(-fov) * coneLen);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(fov) * coneLen, Math.sin(fov) * coneLen);
    ctx.stroke();
  },
};
