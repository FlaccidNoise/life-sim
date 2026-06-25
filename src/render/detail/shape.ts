/** Procedural body outline ported from the validated flat-vector playground. Diet ramps spike count,
 *  amplitude, and edge sharpness; a forward taper biases radius toward +x so the front reads as the
 *  heading. Pure geometry (no canvas) so it is unit-testable; the body module traces it. */
const TAU = Math.PI * 2;

export interface Pt {
  x: number;
  y: number;
}

export function bodyOutline(diet: number, R: number): Pt[] {
  const N = 72;
  const pts: Pt[] = [];
  const sc = Math.round(5 + diet * 5);
  const amp = diet * 0.55;
  const sh = diet;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const lo = Math.cos(a * sc);
    const sp = (1 - sh) * lo + sh * Math.sign(lo) * Math.pow(Math.abs(lo), 0.35);
    let r = R * (1 + amp * sp);
    const fw = Math.cos(a);
    r *= 1 + 0.22 * Math.max(0, fw) - 0.08 * Math.max(0, -fw);
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export function traceOutline(ctx: CanvasRenderingContext2D, pts: Pt[], smooth: boolean): void {
  ctx.beginPath();
  if (smooth) {
    for (let i = 0; i <= pts.length; i++) {
      const a = pts[i % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (i) ctx.quadraticCurveTo(a.x, a.y, mx, my);
      else ctx.moveTo(mx, my);
    }
  } else {
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  }
  ctx.closePath();
}
