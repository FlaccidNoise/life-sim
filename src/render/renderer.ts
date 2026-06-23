/**
 * WebGL2 renderer. Two layers under a UNIFORM letterboxed scale (square world never stretched):
 *   1. the FOOD FIELD as a green heatmap (a texture quad over the world rect) — so you can SEE where
 *      biomass is rich vs. grazed-out, the spatial half of the boom-bust;
 *   2. the ORGANISMS as round dots at their per-creature SIZE gene radius (so size evolution is
 *      visible). NB: collision still uses the global cellRadius, so visual size and the collision
 *      cutoff are intentionally decoupled until size becomes physical (the predation slice).
 * Allocation-free per frame (reused scratch buffers). Rendering is one-way — never feeds the sim, so
 * it can't affect determinism.
 */
import { type OrganismStore } from '../core/store';
import { type FoodField } from '../core/food-field';
import { type Walls } from '../core/walls';
import { ScalarGene, SCALAR_GENE_COUNT, MIN_BAND } from '../core/genome';
import {
  dietShape,
  DIET_HUE_HERB,
  DIET_HUE_OMNI,
  DIET_HUE_PRED,
  ENERGY_HUE_STARVING,
  ENERGY_HUE_REPRO,
  ENERGY_HUE_SATIATED,
  METAB_MIN,
  METAB_MAX,
} from './palette';

/** Canvas color-by mode (cycled with 'c'): which gene/state drives dot hue. */
export const ColorMode = { LINEAGE: 0, DIET: 1, ENERGY: 2 } as const;
export type ColorMode = (typeof ColorMode)[keyof typeof ColorMode];

/** Format a JS number as a GLSL float literal (always has a decimal point, so `mix()` stays float). */
const glf = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const DOT_VERT = `#version 300 es
in vec2 a_pos;
in float a_hue;                 // genome hue gene [0,1) → LINEAGE identity (full wheel in lineage mode)
in float a_size;                // per-creature point size in device px (from the size gene)
in float a_diet;                // diet gene [0,1] → trophic-role hue (diet mode) AND the SHAPE bucket
in float a_spd;                 // current speed, normalized [0,1] → BRIGHTNESS (active bright ↔ idle/jiggling dim)
in float a_shape;               // 0 herbivore (circle) · 1 omnivore (diamond) · 2 predator (triangle)
in float a_efrac;               // energy band fraction [0,1] → hue in energy color-mode
in float a_heading;             // heading in radians → glyph rotation (face heading)
in float a_metab;               // normalized METAB_EFF [0,1] → SATURATION (efficient vivid ↔ inefficient grey)
uniform vec2 u_cam;             // camera centre in world units (pan)
uniform vec2 u_canvas;
uniform float u_scale;          // device px per world unit (base fit × zoom)
uniform int u_colorMode;        // 0 = lineage · 1 = diet · 2 = energy (cycled with 'c')
out vec3 v_color;
flat out float v_shape;
flat out float v_heading;
vec3 hsv2rgb(float h, float s, float v) {
  vec3 p = abs(fract(vec3(h) + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}
// Trophic + energy hue ramps. The stop values are INTERPOLATED from the palette.ts constants below
// (not re-typed), so palette.ts stays the single literal source and the GLSL can't silently drift.
float dietHue(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(${glf(DIET_HUE_HERB)}, ${glf(DIET_HUE_OMNI)}, t / 0.5)
                 : mix(${glf(DIET_HUE_OMNI)}, ${glf(DIET_HUE_PRED)}, (t - 0.5) / 0.5);
}
float energyHue(float f) {
  f = clamp(f, 0.0, 1.0);
  return f < 0.5 ? mix(${glf(ENERGY_HUE_STARVING)}, ${glf(ENERGY_HUE_REPRO)}, f / 0.5)
                 : mix(${glf(ENERGY_HUE_REPRO)}, ${glf(ENERGY_HUE_SATIATED)}, (f - 0.5) / 0.5);
}
void main() {
  vec2 px = (a_pos - u_cam) * u_scale + u_canvas * 0.5;
  gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
  gl_PointSize = a_size;
  // Channels per dot: trophic ROLE = SHAPE (stable, life-constant); COLOR = the active color-mode
  // (lineage kin-identity / diet / energy); PERCEPTION = saturation (sharp-eyed vivid ↔ near-blind
  // grey); ACTIVITY = brightness (moving bright ↔ idle dim); body SIZE = the dot's radius.
  float fear = clamp(a_diet * 1.15, 0.0, 1.0);
  float satCeil = fear > 0.5 ? 0.85 : 0.72;
  float sat = clamp(satCeil * (0.6 + 0.4 * (a_metab * 2.0)), 0.0, 1.0); // METAB_EFF → vivid ↔ grey
  float val = 0.50 + 0.50 * clamp(a_spd, 0.0, 1.0);        // idle → dim, fast → bright
  if (u_colorMode == 1) {
    v_color = hsv2rgb(dietHue(a_diet), sat, val);          // diet: green herbivore → red predator
  } else if (u_colorMode == 2) {
    v_color = hsv2rgb(energyHue(a_efrac), 0.80, 0.95);     // energy: starving red → satiated green
  } else {
    v_color = hsv2rgb(fract(a_hue), sat, val);             // lineage: hue gene over the full wheel
  }
  v_shape = a_shape;
  v_heading = a_heading;
}`;

// Per-role glyph by signed-distance discard in the point's [0,1]² coord: circle (herbivore),
// diamond (omnivore), up-triangle (predator). A redundant, stable trophic cue legible when zoomed in.
const DOT_FRAG = `#version 300 es
precision mediump float;
in vec3 v_color;
flat in float v_shape;
flat in float v_heading;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);   // [-0.5,0.5]², origin at the point centre (y down)
  // rotate so local +x aligns with the heading direction (screen y-down)
  vec2 cr = vec2(cos(v_heading) * c.x - sin(v_heading) * c.y,
                 sin(v_heading) * c.x + cos(v_heading) * c.y);
  bool keep;
  if (v_shape > 1.5) {                  // predator: triangle, apex toward +x (front)
    float x = cr.x;
    keep = !(x > 0.5 || x < -0.4 || abs(cr.y) > (0.5 - x) * 0.62);
  } else if (v_shape > 0.5) {           // omnivore: diamond (L1 ball)
    keep = (abs(cr.x) + abs(cr.y) <= 0.5);
  } else {                              // herbivore: circle
    keep = (dot(cr, cr) <= 0.25);
  }
  // heading nub: a small dot at the front (+x) so even a circle shows facing
  bool nub = distance(cr, vec2(0.42, 0.0)) < 0.13;
  if (!keep && !nub) discard;
  outColor = vec4(v_color, 1.0);
}`;

const FOOD_VERT = `#version 300 es
in vec2 a_corner; // [0,1]²
uniform vec2 u_world;  // world dimensions (place the quad corners)
uniform vec2 u_cam;    // camera centre (pan)
uniform vec2 u_canvas;
uniform float u_scale; // base fit × zoom
out vec2 v_uv;
void main() {
  vec2 worldPos = a_corner * u_world;
  vec2 px = (worldPos - u_cam) * u_scale + u_canvas * 0.5;
  gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_uv = a_corner;
}`;

const FOOD_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  float b = texture(u_tex, v_uv).r;                       // biomass / capacity, 0..1
  vec3 col = mix(vec3(0.04, 0.055, 0.08), vec3(0.10, 0.42, 0.24), b); // bg → green
  outColor = vec4(col, 1.0);
}`;

const WALL_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  float s = texture(u_tex, v_uv).r;          // 0 open, 1 solid
  if (s < 0.5) discard;                        // open cells show the food layer beneath
  outColor = vec4(0.16, 0.18, 0.22, 1.0);      // slate rock
}`;

// Debug overlay lines: a flat [x, y, r, g, b] vertex stream drawn as gl.LINES, sharing the camera.
const LINE_VERT = `#version 300 es
in vec2 a_pos;
in vec3 a_col;
uniform vec2 u_cam;
uniform vec2 u_canvas;
uniform float u_scale;
out vec3 v_col;
void main() {
  vec2 px = (a_pos - u_cam) * u_scale + u_canvas * 0.5;
  gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_col = a_col;
}`;

const LINE_FRAG = `#version 300 es
precision mediump float;
in vec3 v_col;
out vec4 outColor;
void main() { outColor = vec4(v_col, 1.0); }`;

/** Lerp a→b by alpha on a torus of `size`, taking the short way around the seam. */
function lerpWrap(a: number, b: number, alpha: number, size: number): number {
  let d = b - a;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  let v = a + d * alpha;
  v %= size;
  return v < 0 ? v + size : v;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? '?'}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(p) ?? '?'}`);
  }
  return p;
}

export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  // dots
  private readonly dotProgram: WebGLProgram;
  private readonly dotBuffer: WebGLBuffer;
  private readonly hueBuffer: WebGLBuffer;
  private readonly sizeBuffer: WebGLBuffer;
  private readonly dietBuffer: WebGLBuffer;
  private readonly spdBuffer: WebGLBuffer;
  private readonly shapeBuffer: WebGLBuffer;
  private readonly efracBuffer: WebGLBuffer;
  private readonly headingBuffer: WebGLBuffer;
  private readonly metabBuffer: WebGLBuffer;
  private readonly dotScratch: Float32Array;
  private readonly hueScratch: Float32Array;
  private readonly sizeScratch: Float32Array;
  private readonly dietScratch: Float32Array;
  private readonly spdScratch: Float32Array;
  private readonly shapeScratch: Float32Array;
  private readonly efracScratch: Float32Array;
  private readonly headingScratch: Float32Array;
  private readonly metabScratch: Float32Array;
  private readonly aPos: number;
  private readonly aHue: number;
  private readonly aSize: number;
  private readonly aDiet: number;
  private readonly aSpd: number;
  private readonly aShape: number;
  private readonly aEfrac: number;
  private readonly aHeading: number;
  private readonly aMetab: number;
  // debug overlay lines
  private readonly lineProgram: WebGLProgram;
  private readonly lineBuffer: WebGLBuffer;
  private readonly aLinePos: number;
  private readonly aLineCol: number;
  // food overlay
  private readonly foodProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly aCorner: number;
  private readonly foodTex: WebGLTexture;
  private foodTexData: Uint8Array = new Uint8Array(0);
  private foodTexInit = false;
  // wall overlay (mirrors the food layer; NEAREST so the 0/1 mask stays crisp)
  private readonly wallProgram: WebGLProgram;
  private readonly aWallCorner: number;
  private readonly wallTex: WebGLTexture;
  private wallTexData: Uint8Array = new Uint8Array(0);
  private wallTexInit = false;
  // Camera: centre in world units + zoom (1 = whole world fits the viewport). Set via setCamera().
  private camX: number;
  private camY: number;
  private zoom = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    capacity: number,
  ) {
    this.camX = worldWidth / 2;
    this.camY = worldHeight / 2;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is required but unavailable in this browser');
    this.gl = gl;

    this.dotProgram = link(gl, DOT_VERT, DOT_FRAG);
    this.foodProgram = link(gl, FOOD_VERT, FOOD_FRAG);
    this.wallProgram = link(gl, FOOD_VERT, WALL_FRAG);
    this.lineProgram = link(gl, LINE_VERT, LINE_FRAG);
    this.aPos = gl.getAttribLocation(this.dotProgram, 'a_pos');
    this.aHue = gl.getAttribLocation(this.dotProgram, 'a_hue');
    this.aSize = gl.getAttribLocation(this.dotProgram, 'a_size');
    this.aDiet = gl.getAttribLocation(this.dotProgram, 'a_diet');
    this.aSpd = gl.getAttribLocation(this.dotProgram, 'a_spd');
    this.aShape = gl.getAttribLocation(this.dotProgram, 'a_shape');
    this.aEfrac = gl.getAttribLocation(this.dotProgram, 'a_efrac');
    this.aHeading = gl.getAttribLocation(this.dotProgram, 'a_heading');
    this.aMetab = gl.getAttribLocation(this.dotProgram, 'a_metab');
    this.aCorner = gl.getAttribLocation(this.foodProgram, 'a_corner');
    this.aWallCorner = gl.getAttribLocation(this.wallProgram, 'a_corner');
    this.aLinePos = gl.getAttribLocation(this.lineProgram, 'a_pos');
    this.aLineCol = gl.getAttribLocation(this.lineProgram, 'a_col');

    const dotBuffer = gl.createBuffer();
    const hueBuffer = gl.createBuffer();
    const sizeBuffer = gl.createBuffer();
    const dietBuffer = gl.createBuffer();
    const spdBuffer = gl.createBuffer();
    const shapeBuffer = gl.createBuffer();
    const efracBuffer = gl.createBuffer();
    const headingBuffer = gl.createBuffer();
    const metabBuffer = gl.createBuffer();
    const quadBuffer = gl.createBuffer();
    const lineBuffer = gl.createBuffer();
    const foodTex = gl.createTexture();
    const wallTex = gl.createTexture();
    if (
      !dotBuffer ||
      !hueBuffer ||
      !sizeBuffer ||
      !dietBuffer ||
      !spdBuffer ||
      !shapeBuffer ||
      !efracBuffer ||
      !headingBuffer ||
      !metabBuffer ||
      !quadBuffer ||
      !lineBuffer ||
      !foodTex ||
      !wallTex
    )
      throw new Error('GL resource alloc failed');
    this.spdBuffer = spdBuffer;
    this.shapeBuffer = shapeBuffer;
    this.efracBuffer = efracBuffer;
    this.headingBuffer = headingBuffer;
    this.metabBuffer = metabBuffer;
    this.dotBuffer = dotBuffer;
    this.hueBuffer = hueBuffer;
    this.sizeBuffer = sizeBuffer;
    this.dietBuffer = dietBuffer;
    this.quadBuffer = quadBuffer;
    this.lineBuffer = lineBuffer;
    this.foodTex = foodTex;
    this.wallTex = wallTex;
    this.dotScratch = new Float32Array(capacity * 2);
    this.hueScratch = new Float32Array(capacity);
    this.sizeScratch = new Float32Array(capacity);
    this.dietScratch = new Float32Array(capacity);
    this.spdScratch = new Float32Array(capacity);
    this.shapeScratch = new Float32Array(capacity);
    this.efracScratch = new Float32Array(capacity);
    this.headingScratch = new Float32Array(capacity);
    this.metabScratch = new Float32Array(capacity);

    // Unit quad as a triangle strip: (0,0)(1,0)(0,1)(1,1).
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, foodTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // R8 rows aren't 4-byte aligned

    // NEAREST so the binary wall mask stays crisp (LINEAR would blur the discard edge into fringe).
    gl.bindTexture(gl.TEXTURE_2D, wallTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.resize();
  }

  resize(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Base fit: device-px-per-world-unit at zoom 1 (whole world fits the viewport, undistorted). */
  private baseScale(): number {
    return Math.min(this.canvas.width / this.worldWidth, this.canvas.height / this.worldHeight);
  }

  /** Effective px-per-world-unit including zoom. */
  private effScale(): number {
    return this.baseScale() * this.zoom;
  }

  /** Set the camera (centre in world units, zoom factor). Clamped to a sane zoom range. */
  setCamera(x: number, y: number, zoom: number): void {
    this.camX = x;
    this.camY = y;
    this.zoom = zoom < 1 ? 1 : zoom > 64 ? 64 : zoom; // ≥1 (don't zoom out past the whole world)
  }

  get camera(): { x: number; y: number; zoom: number } {
    return { x: this.camX, y: this.camY, zoom: this.zoom };
  }

  private setCommonUniforms(program: WebGLProgram, sc: number): void {
    const gl = this.gl;
    // u_world is only declared in the food shader; getUniformLocation returns null on the dot program
    // and gl.uniform* on null is a silent no-op.
    gl.uniform2f(gl.getUniformLocation(program, 'u_world'), this.worldWidth, this.worldHeight);
    gl.uniform2f(gl.getUniformLocation(program, 'u_cam'), this.camX, this.camY);
    gl.uniform2f(gl.getUniformLocation(program, 'u_canvas'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), sc);
  }

  /**
   * Draw a frame. `interp` (optional) smooths motion between sim ticks: positions are lerped from the
   * previous tick's snapshot toward the current state by `alpha ∈ [0,1]` — so even at fractional sim
   * speeds (0.125×…) movement is fluid, not a teleport per tick. Wrap-aware so toroidal crossings
   * don't streak across the screen. Only creatures alive in both snapshots (matching genId) are
   * interpolated; the rest snap to current.
   */
  draw(
    store: OrganismStore,
    food: FoodField | null,
    walls: Walls | null,
    showFood: boolean,
    showWalls: boolean,
    interp?: {
      prevX: Float64Array;
      prevY: Float64Array;
      prevGen: Uint32Array;
      alpha: number;
    } | null,
    colorMode: ColorMode = ColorMode.LINEAGE,
  ): void {
    const gl = this.gl;
    const sc = this.effScale();
    gl.clearColor(0.04, 0.055, 0.08, 1); // --bg (also fills the off-world margins)
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ── Food heatmap (under the dots) ──
    if (food && showFood) {
      const cells = food.cols * food.rows;
      if (this.foodTexData.length !== cells) this.foodTexData = new Uint8Array(cells);
      food.fillTexture(this.foodTexData);
      gl.useProgram(this.foodProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.foodTex);
      if (!this.foodTexInit) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          food.cols,
          food.rows,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          this.foodTexData,
        );
        this.foodTexInit = true;
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          food.cols,
          food.rows,
          gl.RED,
          gl.UNSIGNED_BYTE,
          this.foodTexData,
        );
      }
      gl.uniform1i(gl.getUniformLocation(this.foodProgram, 'u_tex'), 0);
      this.setCommonUniforms(this.foodProgram, sc);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(this.aCorner);
      gl.vertexAttribPointer(this.aCorner, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── Walls (over the food, under the dots) ──
    if (walls && showWalls && walls.active) {
      const cells = walls.cols * walls.rows;
      if (this.wallTexData.length !== cells) this.wallTexData = new Uint8Array(cells);
      walls.fillTexture(this.wallTexData);
      gl.useProgram(this.wallProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.wallTex);
      if (!this.wallTexInit) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          walls.cols,
          walls.rows,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          this.wallTexData,
        );
        this.wallTexInit = true;
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          walls.cols,
          walls.rows,
          gl.RED,
          gl.UNSIGNED_BYTE,
          this.wallTexData,
        );
      }
      gl.uniform1i(gl.getUniformLocation(this.wallProgram, 'u_tex'), 0);
      this.setCommonUniforms(this.wallProgram, sc);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(this.aWallCorner);
      gl.vertexAttribPointer(this.aWallCorner, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── Organisms (on top) ──
    const n = store.liveCount;
    if (n > 0) {
      const s = this.dotScratch;
      const hsc = this.hueScratch;
      const zsc = this.sizeScratch;
      const dsc = this.dietScratch;
      const ssc = this.spdScratch;
      const psc = this.shapeScratch;
      const esc = this.efracScratch;
      const hdsc = this.headingScratch;
      const mtsc = this.metabScratch;
      const { liveIndices, x, y, vx, vy, hue, heading, genId, scalarGenes, energy } = store;
      const useInterp = interp != null && interp.alpha < 1;
      const a = useInterp ? interp.alpha : 0;
      const ww = this.worldWidth;
      const wh = this.worldHeight;
      for (let k = 0; k < n; k++) {
        const i = liveIndices[k]!;
        let px = x[i]!;
        let py = y[i]!;
        if (useInterp && interp.prevGen[i] === genId[i]!) {
          px = lerpWrap(interp.prevX[i]!, px, a, ww);
          py = lerpWrap(interp.prevY[i]!, py, a, wh);
        }
        s[k * 2] = px;
        s[k * 2 + 1] = py;
        hsc[k] = hue[i]!;
        // Per-creature dot diameter = 2·(size gene) in world units → device px (≥2 so it stays visible).
        const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
        zsc[k] = Math.max(2, 2 * size * sc);
        const diet = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
        dsc[k] = diet; // green→red trophic hue (diet color-mode)
        psc[k] = dietShape(diet); // 0 circle / 1 diamond / 2 triangle (trophic role glyph)
        const speed = Math.hypot(vx[i]!, vy[i]!);
        ssc[k] = speed > 6 ? 1 : speed / 6; // normalized by ~maxSpeed → brightness (activity)
        // Energy band fraction for the energy color-mode: 0..0.5 = SURVIVAL (below repro bar),
        // 0.5..1 = REPRODUCTIVE→SATIATED (the creature's own bars, mirroring inspector.ts).
        const repro = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD]!;
        let sat = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SATIATED_THRESHOLD]!;
        if (sat < repro + MIN_BAND) sat = repro + MIN_BAND;
        const e = energy[i]!;
        esc[k] =
          e >= sat
            ? 1
            : e >= repro
              ? 0.5 + (0.5 * (e - repro)) / (sat - repro)
              : repro > 0
                ? (0.5 * e) / repro
                : 0;
        hdsc[k] = heading[i]!; // radians → glyph rotation (face heading)
        mtsc[k] =
          (scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF]! - METAB_MIN) /
          (METAB_MAX - METAB_MIN); // normalized [0,1] → saturation (efficient vivid ↔ inefficient grey)
      }
      gl.useProgram(this.dotProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, hsc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aHue);
      gl.vertexAttribPointer(this.aHue, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, zsc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aSize);
      gl.vertexAttribPointer(this.aSize, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dietBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, dsc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aDiet);
      gl.vertexAttribPointer(this.aDiet, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spdBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, ssc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aSpd);
      gl.vertexAttribPointer(this.aSpd, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, psc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aShape);
      gl.vertexAttribPointer(this.aShape, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.efracBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, esc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aEfrac);
      gl.vertexAttribPointer(this.aEfrac, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.headingBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, hdsc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aHeading);
      gl.vertexAttribPointer(this.aHeading, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.metabBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mtsc.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aMetab);
      gl.vertexAttribPointer(this.aMetab, 1, gl.FLOAT, false, 0, 0);
      this.setCommonUniforms(this.dotProgram, sc);
      gl.uniform1i(gl.getUniformLocation(this.dotProgram, 'u_colorMode'), colorMode);
      gl.drawArrays(gl.POINTS, 0, n);
    }
  }

  /**
   * Draw debug overlay lines: a flat [x, y, r, g, b] vertex stream (world coords) rendered as gl.LINES
   * under the SAME camera as the dots. Call AFTER draw() so the overlay sits on top. `vertexCount` is
   * the number of vertices to draw from the front of `data` (must be even — gl.LINES pairs them).
   */
  drawLines(data: Float32Array, vertexCount: number): void {
    if (vertexCount < 2) return;
    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, vertexCount * 5), gl.DYNAMIC_DRAW);
    const stride = 5 * 4; // 5 floats per vertex
    gl.enableVertexAttribArray(this.aLinePos);
    gl.vertexAttribPointer(this.aLinePos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aLineCol);
    gl.vertexAttribPointer(this.aLineCol, 3, gl.FLOAT, false, stride, 2 * 4);
    this.setCommonUniforms(this.lineProgram, this.effScale());
    gl.drawArrays(gl.LINES, 0, vertexCount);
  }

  /** Convert a canvas-relative point (CSS px) to world coordinates, inverting the camera transform. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    const sc = this.effScale();
    return {
      x: (px - this.canvas.width / 2) / sc + this.camX,
      y: (py - this.canvas.height / 2) / sc + this.camY,
    };
  }
}
