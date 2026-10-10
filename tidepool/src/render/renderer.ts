// WebGL2 renderer: one instanced draw of every creature in a frame, placed between the last two
// frames. It owns the GL context of its canvas and sets GL state once.

import {
  C_ENERGY,
  C_FLAGS,
  C_HEADING,
  C_HUE,
  C_LENGTH,
  C_SLOT,
  C_UID,
  C_WIDTH,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  type FrameView,
} from '../protocol';
import { FRAG, VERT } from './shaders';

export class RendererError extends Error {}

/** The same shape as `Camera` in src/app/camera.ts. `render` may not import from `app`. */
interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Renderer {
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Draws `cur`, with each creature moved back toward its place in `prev` by (1 - alpha). */
  draw(prev: FrameView | null, cur: FrameView, alpha: number, cam: Camera): void;
  dispose(): void;
}

const MAX_CREATURES = 4096; // the creature pool of the core
const INSTANCE_FLOATS = 8; // a_pose and a_body
const MAX_DPR = 2;

function compile(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new RendererError('WebGL2 did not make a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** Throws RendererError when WebGL2 is missing. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) {
    throw new RendererError(
      'This browser has no WebGL2, and Tidepool needs it to draw. Fix: use a current version of Chrome, Firefox, or Safari.',
    );
  }

  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new RendererError(
      `The shaders did not build: ${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vert)} ${gl.getShaderInfoLog(frag)}`,
    );
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  gl.useProgram(program);
  const uView = gl.getUniformLocation(program, 'u_view');
  const uPx = gl.getUniformLocation(program, 'u_px');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // Stays bound: `draw` uploads into it.
  const instanceBuffer = gl.createBuffer();
  const instances = new Float32Array(MAX_CREATURES * INSTANCE_FLOATS);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instances.byteLength, gl.DYNAMIC_DRAW);
  for (const location of [1, 2]) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, INSTANCE_FLOATS * 4, (location - 1) * 16);
    gl.vertexAttribDivisor(location, 1);
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0x04 / 255, 0x12 / 255, 0x1c / 255, 1);

  // The record index in `indexed` of each slot, or -1.
  const prevIndexBySlot = new Int32Array(MAX_CREATURES);
  let indexed: FrameView | null | undefined;
  let cssW = 1;
  let cssH = 1;
  let ratio = 1;

  return {
    resize(w, h, dpr) {
      cssW = w;
      cssH = h;
      ratio = Math.min(dpr, MAX_DPR);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      // A new size empties the canvas. Without this it is black until the next `draw`.
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    draw(prev, cur, alpha, cam) {
      if (prev !== indexed) {
        indexed = prev;
        prevIndexBySlot.fill(-1);
        const count = prev ? Math.min(prev.creatureCount, MAX_CREATURES) : 0;
        for (let i = 0; prev && i < count; i++) {
          const slot = prev.u32[prev.creatureBase + i * CREATURE_STRIDE + C_SLOT] ?? 0;
          prevIndexBySlot[slot] = i;
        }
      }

      const { f32, u32 } = cur;
      const count = Math.min(cur.creatureCount, MAX_CREATURES);
      for (let i = 0; i < count; i++) {
        const r = cur.creatureBase + i * CREATURE_STRIDE;
        let x = f32[r + C_X] ?? 0;
        let y = f32[r + C_Y] ?? 0;
        const j = prevIndexBySlot[u32[r + C_SLOT] ?? 0] ?? -1;
        if (prev && j >= 0) {
          const q = prev.creatureBase + j * CREATURE_STRIDE;
          // A slot with another uid holds another creature: it is not interpolated.
          if (prev.u32[q + C_UID] === u32[r + C_UID]) {
            const px = prev.f32[q + C_X] ?? x;
            const py = prev.f32[q + C_Y] ?? y;
            x = px + (x - px) * alpha;
            y = py + (y - py) * alpha;
          }
        }
        const o = i * INSTANCE_FLOATS;
        instances[o] = x;
        instances[o + 1] = y;
        instances[o + 2] = f32[r + C_HEADING] ?? 0;
        instances[o + 3] = f32[r + C_HUE] ?? 0;
        instances[o + 4] = f32[r + C_LENGTH] ?? 0;
        instances[o + 5] = f32[r + C_WIDTH] ?? 0;
        instances[o + 6] = f32[r + C_ENERGY] ?? 0;
        instances[o + 7] = u32[r + C_FLAGS] ?? 0;
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      // Clip y grows upward and world y grows downward.
      gl.uniform4f(uView, cam.x, cam.y, (2 * cam.scale) / cssW, (-2 * cam.scale) / cssH);
      gl.uniform1f(uPx, 1 / (cam.scale * ratio));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, count * INSTANCE_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    },

    dispose() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteProgram(program);
    },
  };
}
