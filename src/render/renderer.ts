/**
 * WebGL2 renderer. Two layers under a UNIFORM letterboxed scale (square world never stretched):
 *   1. the FOOD FIELD as a green heatmap (a texture quad over the world rect) — so you can SEE where
 *      biomass is rich vs. grazed-out, the spatial half of the boom-bust;
 *   2. the ORGANISMS as round dots at their TRUE physical radius (cellRadius) — so visual contact
 *      lines up with the collision cutoff (2·cellRadius).
 * Allocation-free per frame (reused scratch buffers). Rendering is one-way — never feeds the sim, so
 * it can't affect determinism.
 */
import { type OrganismStore } from '../core/store';
import { type FoodField } from '../core/food-field';

const DOT_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_world;
uniform vec2 u_canvas;
uniform float u_scale;
uniform float u_pointSize;
void main() {
  vec2 px = (a_pos - u_world * 0.5) * u_scale + u_canvas * 0.5;
  gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}`;

const DOT_FRAG = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  outColor = u_color;
}`;

const FOOD_VERT = `#version 300 es
in vec2 a_corner; // [0,1]²
uniform vec2 u_world;
uniform vec2 u_canvas;
uniform float u_scale;
out vec2 v_uv;
void main() {
  vec2 worldPos = a_corner * u_world;
  vec2 px = (worldPos - u_world * 0.5) * u_scale + u_canvas * 0.5;
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
  private readonly dotScratch: Float32Array;
  private readonly aPos: number;
  // food overlay
  private readonly foodProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly aCorner: number;
  private readonly foodTex: WebGLTexture;
  private foodTexData: Uint8Array = new Uint8Array(0);
  private foodTexInit = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly cellRadius: number,
    capacity: number,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is required but unavailable in this browser');
    this.gl = gl;

    this.dotProgram = link(gl, DOT_VERT, DOT_FRAG);
    this.foodProgram = link(gl, FOOD_VERT, FOOD_FRAG);
    this.aPos = gl.getAttribLocation(this.dotProgram, 'a_pos');
    this.aCorner = gl.getAttribLocation(this.foodProgram, 'a_corner');

    const dotBuffer = gl.createBuffer();
    const quadBuffer = gl.createBuffer();
    const foodTex = gl.createTexture();
    if (!dotBuffer || !quadBuffer || !foodTex) throw new Error('GL resource alloc failed');
    this.dotBuffer = dotBuffer;
    this.quadBuffer = quadBuffer;
    this.foodTex = foodTex;
    this.dotScratch = new Float32Array(capacity * 2);

    // Unit quad as a triangle strip: (0,0)(1,0)(0,1)(1,1).
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, foodTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // R8 rows aren't 4-byte aligned

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

  /** Uniform device-px-per-world-unit scale (letterbox: the whole square world fits, undistorted). */
  private scale(): number {
    return Math.min(this.canvas.width / this.worldWidth, this.canvas.height / this.worldHeight);
  }

  private setCommonUniforms(program: WebGLProgram, sc: number): void {
    const gl = this.gl;
    gl.uniform2f(gl.getUniformLocation(program, 'u_world'), this.worldWidth, this.worldHeight);
    gl.uniform2f(gl.getUniformLocation(program, 'u_canvas'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), sc);
  }

  draw(store: OrganismStore, food: FoodField | null, showFood: boolean): void {
    const gl = this.gl;
    const sc = this.scale();
    gl.clearColor(0.04, 0.055, 0.08, 1); // --bg (also fills the letterbox margins)
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

    // ── Organisms (on top) ──
    const n = store.liveCount;
    if (n > 0) {
      const s = this.dotScratch;
      const { liveIndices, x, y } = store;
      for (let k = 0; k < n; k++) {
        const i = liveIndices[k]!;
        s[k * 2] = x[i]!;
        s[k * 2 + 1] = y[i]!;
      }
      gl.useProgram(this.dotProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
      this.setCommonUniforms(this.dotProgram, sc);
      gl.uniform1f(
        gl.getUniformLocation(this.dotProgram, 'u_pointSize'),
        Math.max(2, 2 * this.cellRadius * sc),
      );
      gl.uniform4f(gl.getUniformLocation(this.dotProgram, 'u_color'), 0.6, 0.88, 0.97, 1); // cyan
      gl.drawArrays(gl.POINTS, 0, n);
    }
  }

  /** Convert a canvas-relative click (CSS px) to world coordinates, inverting the letterbox transform. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    const sc = this.scale();
    return {
      x: (px - this.canvas.width / 2) / sc + this.worldWidth / 2,
      y: (py - this.canvas.height / 2) / sc + this.worldHeight / 2,
    };
  }
}
