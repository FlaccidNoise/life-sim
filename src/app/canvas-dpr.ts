/**
 * Shared devicePixelRatio handling for Canvas2D panels (telemetry, brain inspector).
 * Reads dpr (capped at 2), rescales the backing store when it has changed (e.g. the
 * window dragged between Retina and non-Retina displays), and applies a setTransform
 * so all subsequent drawing happens in CSS pixels. Returns the current dpr so the
 * caller can store it and detect the next change.
 *
 * `setTransform` is guarded for test stubs that don't implement it.
 */
export function syncCanvasDpr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  prevDpr: number,
): number {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  if (dpr !== prevDpr) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (canvas.style) {
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
  }
  if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}
