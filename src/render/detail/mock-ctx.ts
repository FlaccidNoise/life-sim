/** A recording CanvasRenderingContext2D stub for unit tests (Node has no real canvas). Records call
 *  counts + arc radii so trait-module invariants (eye count, fang count, cone arc) can be asserted. */
export interface Recorder {
  ctx: CanvasRenderingContext2D;
  counts: Record<string, number>;
  arcRadii: number[];
  arcAngles: { start: number; end: number }[];
}

export function recordingCtx(): Recorder {
  const counts: Record<string, number> = {};
  const arcRadii: number[] = [];
  const arcAngles: { start: number; end: number }[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === 'canvas') return { width: 800, height: 600 };
      // settable style props read back as themselves; assignment is swallowed by the proxy set trap
      if (
        prop === 'fillStyle' ||
        prop === 'strokeStyle' ||
        prop === 'lineWidth' ||
        prop === 'lineJoin' ||
        prop === 'lineCap'
      )
        return '';
      return (...args: number[]) => {
        counts[prop] = (counts[prop] ?? 0) + 1;
        if (prop === 'arc') arcRadii.push(args[2]!);
        if (prop === 'arc' || prop === 'ellipse') {
          // arc: (x,y,r,start,end); ellipse: (x,y,rx,ry,rot,start,end)
          const s = prop === 'arc' ? args[3]! : args[5]!;
          const e = prop === 'arc' ? args[4]! : args[6]!;
          arcAngles.push({ start: s, end: e });
        }
      };
    },
    set() {
      return true; // swallow fillStyle/strokeStyle/etc assignments
    },
  };
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, counts, arcRadii, arcAngles };
}
