// Camera math. Pure functions: screen y and world y both grow downward.

/** The world point at the screen centre, and CSS pixels per world unit. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** The world rectangle that the screen shows. */
export function viewRect(
  cam: Camera,
  cssW: number,
  cssH: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const halfW = cssW / (2 * cam.scale);
  const halfH = cssH / (2 * cam.scale);
  return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
}

export function screenToWorld(
  cam: Camera,
  cssW: number,
  cssH: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: cam.x + (sx - cssW / 2) / cam.scale, y: cam.y + (sy - cssH / 2) / cam.scale };
}

/** The camera that shows the whole world, centred, as large as the screen allows. */
export function fitWorld(worldW: number, worldH: number, cssW: number, cssH: number): Camera {
  return { x: worldW / 2, y: worldH / 2, scale: Math.min(cssW / worldW, cssH / worldH) };
}
