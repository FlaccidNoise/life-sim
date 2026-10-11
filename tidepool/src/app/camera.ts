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

export const SCALE_MIN = 0.4; // the whole world fits a laptop screen
export const SCALE_MAX = 12;
export const PLAY_SCALE = 4; // a 12-unit body is 48 CSS pixels long

/**
 * The fitted camera: the world centred, as large as the screen allows. On a screen too small for the
 * whole world at `SCALE_MIN`, it shows the middle of the world at that scale.
 */
export function fitWorld(worldW: number, worldH: number, cssW: number, cssH: number): Camera {
  const scale = Math.min(cssW / worldW, cssH / worldH);
  return { x: worldW / 2, y: worldH / 2, scale: Math.min(Math.max(scale, SCALE_MIN), SCALE_MAX) };
}

/**
 * True when `cam` is the fitted camera of a screen of this size. A zoom or a pan that changed what
 * the screen shows makes it false. One that the limits undid does not.
 */
export function isFitted(
  cam: Camera,
  worldW: number,
  worldH: number,
  cssW: number,
  cssH: number,
): boolean {
  const fit = fitWorld(worldW, worldH, cssW, cssH);
  return cam.x === fit.x && cam.y === fit.y && cam.scale === fit.scale;
}

/** Multiplies the scale by `factor`, inside the limits. The world point under (sx, sy) stays there. */
export function zoomAt(
  cam: Camera,
  cssW: number,
  cssH: number,
  sx: number,
  sy: number,
  factor: number,
): Camera {
  const scale = Math.min(Math.max(cam.scale * factor, SCALE_MIN), SCALE_MAX);
  const p = screenToWorld(cam, cssW, cssH, sx, sy);
  return { x: p.x - (sx - cssW / 2) / scale, y: p.y - (sy - cssH / 2) / scale, scale };
}

/** Moves the world with a drag of (dxCss, dyCss) CSS pixels. */
export function pan(cam: Camera, dxCss: number, dyCss: number): Camera {
  return { x: cam.x - dxCss / cam.scale, y: cam.y - dyCss / cam.scale, scale: cam.scale };
}

/** Moves the camera toward the target by the fraction 1 - exp(-6 * dt). `dt` in seconds. */
export function follow(
  cam: Camera,
  targetX: number,
  targetY: number,
  targetScale: number,
  dt: number,
): Camera {
  const k = 1 - Math.exp(-6 * dt);
  return {
    x: cam.x + (targetX - cam.x) * k,
    y: cam.y + (targetY - cam.y) * k,
    scale: cam.scale + (targetScale - cam.scale) * k,
  };
}

/** Keeps the view inside the world. On an axis where the view is larger, centres the world. */
export function clampToWorld(
  cam: Camera,
  worldW: number,
  worldH: number,
  cssW: number,
  cssH: number,
): Camera {
  const axis = (c: number, world: number, css: number): number => {
    const half = css / (2 * cam.scale);
    return half * 2 >= world ? world / 2 : Math.min(Math.max(c, half), world - half);
  };
  return { x: axis(cam.x, worldW, cssW), y: axis(cam.y, worldH, cssH), scale: cam.scale };
}
