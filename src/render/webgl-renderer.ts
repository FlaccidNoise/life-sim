import { type World } from '../core/sim/world';
import { lerpWrapped } from '../core/math/vec2';

export interface Camera {
  /** World-space point at the centre of the viewport. */
  x: number;
  y: number;
  /** Pixels per world unit. */
  scale: number;
}

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_type;
uniform vec2 u_offset;
uniform float u_scale;
uniform vec2 u_res;
uniform float u_point;
out float v_type;
void main() {
  vec2 screen = (a_pos - u_offset) * u_scale;
  vec2 clip = screen / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = clamp(u_point * u_scale, 1.0, 64.0);
  v_type = a_type;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float v_type;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  vec3 col;
  if (v_type < 0.5)       col = vec3(0.30, 0.80, 0.35);  // PHOTO   green
  else if (v_type < 1.5)  col = vec3(0.95, 0.45, 0.20);  // DIGEST  orange-red
  else                    col = vec3(0.55, 0.50, 0.45);  // MEAT    grey-brown
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('failed to create shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`shader compile error: ${log ?? 'unknown'}`);
  }
  return sh;
}

/** WebGL2 instanced point renderer. Draws every live cell in one draw call,
 *  coloured by speed, under a pan/zoom camera. */
export class Renderer {
  private readonly gl_: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly data: Float32Array; // interleaved [x, y, cellType] per cell
  private readonly uOffset: WebGLUniformLocation;
  private readonly uScale: WebGLUniformLocation;
  private readonly uRes: WebGLUniformLocation;
  private readonly uPoint: WebGLUniformLocation;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, capacity: number, pointDiameter: number) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl_ = gl;

    const program = gl.createProgram();
    if (!program) throw new Error('failed to create program');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link error: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
    }
    this.program = program;

    const loc = (name: string): WebGLUniformLocation => {
      const l = gl.getUniformLocation(program, name);
      if (!l) throw new Error(`missing uniform ${name}`);
      return l;
    };
    this.uOffset = loc('u_offset');
    this.uScale = loc('u_scale');
    this.uRes = loc('u_res');
    this.uPoint = loc('u_point');

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('failed to create VAO');
    this.vao = vao;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('failed to create buffer');
    this.buffer = buffer;

    this.data = new Float32Array(capacity * 3);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = 3 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);

    gl.useProgram(program);
    gl.uniform1f(this.uPoint, pointDiameter);
    gl.clearColor(0.04, 0.055, 0.08, 1);
  }

  /** The underlying WebGL2 context, shared with the light overlay. */
  get gl(): WebGL2RenderingContext {
    return this.gl_;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gl_.viewport(0, 0, width, height);
  }

  /**
   * Draw the live cells. Positions are interpolated `alpha` of the way from the
   * previous physics step (`prevX/prevY`) to the current one (along the shortest
   * toroidal path), so motion is smooth at any sim speed. `alpha` ∈ [0, 1].
   */
  render(
    world: World,
    camera: Camera,
    prevX: Float64Array,
    prevY: Float64Array,
    alpha: number,
  ): void {
    const gl = this.gl_;
    const f = world.cells.fields;
    const live = world.liveIndices;
    const n = world.liveCount;
    const data = this.data;
    const w = world.config.worldWidth;
    const h = world.config.worldHeight;

    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      const o = k * 3;
      data[o] = lerpWrapped(prevX[i]!, f.posX[i]!, alpha, w);
      data[o + 1] = lerpWrapped(prevY[i]!, f.posY[i]!, alpha, h);
      data[o + 2] = f.cellType[i]!;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uOffset, camera.x, camera.y);
    gl.uniform1f(this.uScale, camera.scale);
    gl.uniform2f(this.uRes, this.width, this.height);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 3));
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }
}
