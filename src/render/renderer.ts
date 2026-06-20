/**
 * WebGL2 point renderer. Draws each live organism as a round dot at its TRUE physical radius
 * (cellRadius, in world units) under a UNIFORM letterboxed scale — so the square world is never
 * stretched and visual contact lines up exactly with the collision cutoff (2·cellRadius). Reads the
 * SoA store directly into a reused Float32 scratch buffer (no per-frame allocation). Rendering is
 * one-way — it never feeds back into the sim, so it can't affect determinism.
 */
import { type OrganismStore } from '../core/store';

const VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_world;     // world dimensions (units)
uniform vec2 u_canvas;    // drawing-buffer size (device px)
uniform float u_scale;    // device px per world unit (uniform → no aspect distortion)
uniform float u_pointSize;
void main() {
  vec2 px = (a_pos - u_world * 0.5) * u_scale + u_canvas * 0.5; // device px, origin top-left
  vec2 clip = vec2(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  outColor = u_color;
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

export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly scratch: Float32Array;
  private readonly uWorld: WebGLUniformLocation;
  private readonly uCanvas: WebGLUniformLocation;
  private readonly uScale: WebGLUniformLocation;
  private readonly uPointSize: WebGLUniformLocation;
  private readonly uColor: WebGLUniformLocation;

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

    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? '?'}`);
    }
    this.program = program;

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('createBuffer failed');
    this.buffer = buffer;
    this.scratch = new Float32Array(capacity * 2);

    const need = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(program, name);
      if (!loc) throw new Error(`missing uniform ${name}`);
      return loc;
    };
    this.uWorld = need('u_world');
    this.uCanvas = need('u_canvas');
    this.uScale = need('u_scale');
    this.uPointSize = need('u_pointSize');
    this.uColor = need('u_color');

    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.resize();
  }

  /** Match the drawing buffer to the canvas's CSS size × devicePixelRatio. */
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

  draw(store: OrganismStore): void {
    const gl = this.gl;
    gl.clearColor(0.04, 0.055, 0.08, 1); // matches the --bg token
    gl.clear(gl.COLOR_BUFFER_BIT);

    const n = store.liveCount;
    if (n > 0) {
      const s = this.scratch;
      const { liveIndices, x, y } = store;
      for (let k = 0; k < n; k++) {
        const i = liveIndices[k]!;
        s[k * 2] = x[i]!;
        s[k * 2 + 1] = y[i]!;
      }
      const sc = this.scale();
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.uniform2f(this.uWorld, this.worldWidth, this.worldHeight);
      gl.uniform2f(this.uCanvas, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uScale, sc);
      // Drawn diameter = physical diameter (2·cellRadius) in device px → contact == collision cutoff.
      gl.uniform1f(this.uPointSize, Math.max(2, 2 * this.cellRadius * sc));
      gl.uniform4f(this.uColor, 0.55, 0.85, 0.95, 1); // cyan accent
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
