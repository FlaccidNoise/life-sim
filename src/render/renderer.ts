/**
 * WebGL2 point renderer. Draws each live organism as a round dot, mapping toroidal world coordinates
 * to the canvas. Deliberately minimal for Phase 0 (gl.POINTS, one draw call); it reads the SoA store
 * directly into a reused Float32 scratch buffer (no per-frame allocation). Rendering is one-way — it
 * never feeds back into the sim, so it can't affect determinism.
 */
import { type OrganismStore } from '../core/store';

const VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_world;
uniform float u_pointSize;
void main() {
  vec2 clip = vec2(a_pos.x / u_world.x * 2.0 - 1.0, 1.0 - a_pos.y / u_world.y * 2.0);
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
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`shader compile failed: ${log ?? '?'}`);
  }
  return sh;
}

export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly scratch: Float32Array;
  private readonly uWorld: WebGLUniformLocation;
  private readonly uPointSize: WebGLUniformLocation;
  private readonly uColor: WebGLUniformLocation;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
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
    this.dpr = dpr;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, s.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.uniform2f(this.uWorld, this.worldWidth, this.worldHeight);
      gl.uniform1f(this.uPointSize, Math.max(3, 5 * this.dpr));
      gl.uniform4f(this.uColor, 0.55, 0.85, 0.95, 1); // cyan accent
      gl.drawArrays(gl.POINTS, 0, n);
    }
  }

  /** Convert a canvas-relative click (CSS px) to world coordinates (for the inspector pick). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return { x: fx * this.worldWidth, y: fy * this.worldHeight };
  }
}
