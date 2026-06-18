import { type GlowField } from '../core/environment/glow-field';
import { type Camera } from './webgl-renderer';

const VERT = `#version 300 es
layout(location=0) in vec2 a_corner;     // unit quad 0..1
uniform vec2 u_offset; uniform float u_scale; uniform vec2 u_res; uniform vec2 u_world;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  vec2 world = a_corner * u_world;
  vec2 screen = (world - u_offset) * u_scale;
  vec2 clip = screen / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

// Additive blend (gl.ONE, gl.ONE in render) => emitted light piles on top of the scene,
// so glow reads as warm luminance over the darkened night dish rather than a flat heatmap.
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_field; uniform float u_max;
in vec2 v_uv; out vec4 frag;
void main() {
  float g = texture(u_field, v_uv).r / max(u_max, 1e-6);
  g = clamp(g, 0.0, 1.0);
  // warm yellow-orange glow; premultiplied by intensity for additive pile-up.
  vec3 col = mix(vec3(0.0), vec3(1.0, 0.85, 0.35), g);
  frag = vec4(col * g, g);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('failed to create shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`glow-overlay shader compile error: ${log ?? 'unknown'}`);
  }
  return sh;
}

/**
 * Single textured quad heatmap of the bioluminescence (GlowField), drawn ADDITIVELY so
 * neuron-cell glow piles on as warm light over the scene — most legible at night when the
 * #night div has dimmed the dish. Draw after the points so glow sits on top of cells.
 * The glow buffer is uploaded fresh every frame (GlowField.step swaps its double buffer).
 */
export class GlowOverlay {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly cols: number;
  private readonly rows: number;
  private readonly uOffset: WebGLUniformLocation;
  private readonly uScale: WebGLUniformLocation;
  private readonly uRes: WebGLUniformLocation;
  private readonly uWorld: WebGLUniformLocation;
  private readonly uField: WebGLUniformLocation;
  private readonly uMax: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext, field: GlowField) {
    this.gl = gl;
    this.cols = field.cols;
    this.rows = field.rows;

    const program = gl.createProgram();
    if (!program) throw new Error('failed to create glow-overlay program');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`glow-overlay link error: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
    }
    this.program = program;

    const loc = (name: string): WebGLUniformLocation => {
      const l = gl.getUniformLocation(program, name);
      if (!l) throw new Error(`glow-overlay missing uniform ${name}`);
      return l;
    };
    this.uOffset = loc('u_offset');
    this.uScale = loc('u_scale');
    this.uRes = loc('u_res');
    this.uWorld = loc('u_world');
    this.uField = loc('u_field');
    this.uMax = loc('u_max');

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('failed to create glow-overlay VAO');
    this.vao = vao;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('failed to create glow-overlay buffer');
    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const texture = gl.createTexture();
    if (!texture) throw new Error('failed to create glow-overlay texture');
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.cols, this.rows, 0, gl.RED, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Upload current glow + draw the quad additively over the given camera. */
  render(
    camera: Camera,
    field: GlowField,
    max: number,
    width: number,
    height: number,
  ): void {
    const gl = this.gl;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RED, gl.FLOAT, field.field);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive: light piles on

    gl.useProgram(this.program);
    gl.uniform2f(this.uOffset, camera.x, camera.y);
    gl.uniform1f(this.uScale, camera.scale);
    gl.uniform2f(this.uRes, width, height);
    gl.uniform2f(this.uWorld, field.worldWidth, field.worldHeight);
    gl.uniform1f(this.uField, 0);
    gl.uniform1f(this.uMax, max);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
