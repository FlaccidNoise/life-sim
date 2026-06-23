import { type TraitModule, type RGB } from './gene-view';
import { bodyOutline, traceOutline } from './shape';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const body: TraitModule = {
  id: 'body',
  z: 0,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const diet = genes.diet;
    const pts = bodyOutline(diet, R);
    const smooth = diet < 0.4;
    const lw = Math.max(1.5, R * 0.07);
    const [ux, uy] = derived.screenUp;
    const perp: [number, number] = [-uy, ux];
    const big = R * 4;

    // flat base fill
    traceOutline(ctx, pts, smooth);
    ctx.fillStyle = rgb(derived.base);
    ctx.fill();

    // hard 2-tone shadow (screen-down half), clipped to the body
    ctx.save();
    traceOutline(ctx, pts, smooth);
    ctx.clip();
    const d = R * 0.12;
    const c0: [number, number] = [ux * -d, uy * -d];
    ctx.fillStyle = rgb(derived.shadow);
    ctx.beginPath();
    ctx.moveTo(c0[0] + perp[0] * big, c0[1] + perp[1] * big);
    ctx.lineTo(c0[0] - perp[0] * big, c0[1] - perp[1] * big);
    ctx.lineTo(c0[0] - perp[0] * big - ux * big, c0[1] - perp[1] * big - uy * big);
    ctx.lineTo(c0[0] + perp[0] * big - ux * big, c0[1] + perp[1] * big - uy * big);
    ctx.closePath();
    ctx.fill();
    // flat top rim highlight
    const c2: [number, number] = [ux * (R * 0.55), uy * (R * 0.55)];
    ctx.fillStyle = `rgba(${derived.lite[0]},${derived.lite[1]},${derived.lite[2]},0.9)`;
    ctx.beginPath();
    ctx.moveTo(c2[0] + perp[0] * big, c2[1] + perp[1] * big);
    ctx.lineTo(c2[0] - perp[0] * big, c2[1] - perp[1] * big);
    ctx.lineTo(c2[0] - perp[0] * big + ux * big, c2[1] - perp[1] * big + uy * big);
    ctx.lineTo(c2[0] + perp[0] * big + ux * big, c2[1] + perp[1] * big + uy * big);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // crisp outline
    traceOutline(ctx, pts, smooth);
    ctx.lineWidth = lw;
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineJoin = 'round';
    ctx.stroke();
  },
};
