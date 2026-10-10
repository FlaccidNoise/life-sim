// WebGL2 renderer: the depth gradient, then one instanced draw of every plant in a frame, then one of
// every creature, placed between the last two frames. It owns the GL context of its canvas.

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
  PLANT_STRIDE,
  TICK_HZ,
  WORLD_H,
  type FrameView,
} from '../protocol';
import {
  BACKGROUND_FRAG,
  BACKGROUND_VERT,
  CREATURE_FRAG,
  CREATURE_VERT,
  PLANT_FRAG,
  PLANT_VERT,
} from './shaders';

export class RendererError extends Error {}

/** The same shape as `Camera` in src/app/camera.ts. `render` may not import from `app`. */
interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Renderer {
  resize(cssW: number, cssH: number, dpr: number): void;
  /**
   * Draws `cur`, with each creature moved back toward its place in `prev` by (1 - alpha).
   * `timeSeconds` is a clock that only moves forward. It drives the tails.
   */
  draw(
    prev: FrameView | null,
    cur: FrameView,
    alpha: number,
    cam: Camera,
    timeSeconds: number,
  ): void;
  dispose(): void;
}

const MAX_CREATURES = 4096; // the creature pool of the core
const MAX_PLANTS = 8192; // the plant pool of the core
const CREATURE_ATTRIBUTES = [4, 4, 1]; // a_pose, a_body, a_phase
const INSTANCE_FLOATS = 9;
const MAX_DPR = 2;
const TAU = 2 * Math.PI;
const TAIL_RADIANS_PER_LENGTH = 4; // the tail wave moves this far for each body length swum
const MAX_STEP_SECONDS = 0.1; // a longer gap between draws does not spin the tails

function compile(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new RendererError('WebGL2 did not make a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function link(gl: WebGL2RenderingContext, vertSource: string, fragSource: string): WebGLProgram {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource);
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
  return program;
}

/**
 * A vertex array with the unit quad at location 0, and one buffer of `capacity` instances that
 * feeds a float attribute of each given size at locations 1 and up.
 */
function instancedQuad(
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer,
  sizes: number[],
  capacity: number,
): { vao: WebGLVertexArrayObject; buffer: WebGLBuffer } {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const stride = 4 * sizes.reduce((a, b) => a + b, 0);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, capacity * stride, gl.DYNAMIC_DRAW);
  let offset = 0;
  sizes.forEach((size, i) => {
    gl.enableVertexAttribArray(i + 1);
    gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(i + 1, 1);
    offset += 4 * size;
  });
  return { vao, buffer };
}

/** Throws RendererError when WebGL2 is missing. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) {
    throw new RendererError(
      'This browser has no WebGL2, and Tidepool needs it to draw. Fix: use a current version of Chrome, Firefox, or Safari.',
    );
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const background = link(gl, BACKGROUND_VERT, BACKGROUND_FRAG);
  const uDepth = gl.getUniformLocation(background, 'u_depth');
  const backdrop = instancedQuad(gl, quad, [], 0);
  const layer = (vert: string, frag: string, sizes: number[], capacity: number) => {
    const program = link(gl, vert, frag);
    return {
      program,
      uView: gl.getUniformLocation(program, 'u_view'),
      uPx: gl.getUniformLocation(program, 'u_px'),
      ...instancedQuad(gl, quad, sizes, capacity),
    };
  };
  const plants = layer(PLANT_VERT, PLANT_FRAG, [PLANT_STRIDE], MAX_PLANTS);
  const creatures = layer(CREATURE_VERT, CREATURE_FRAG, CREATURE_ATTRIBUTES, MAX_CREATURES);
  const instances = new Float32Array(MAX_CREATURES * INSTANCE_FLOATS);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0x04 / 255, 0x12 / 255, 0x1c / 255, 1);

  // The record index in `indexed` of each slot, or -1.
  const prevIndexBySlot = new Int32Array(MAX_CREATURES);
  let indexed: FrameView | null | undefined;
  // The phase of each slot's tail wave. It only moves while the creature moves.
  const tailPhase = new Float32Array(MAX_CREATURES);
  let lastTime = 0;
  let cssW = 1;
  let cssH = 1;
  let ratio = 1;

  // Uploads `count` instances of `floats` floats each, from `data` at `start`, and draws them.
  const drawLayer = (
    { program, uView, uPx, vao, buffer }: typeof plants,
    cam: Camera,
    data: Float32Array,
    start: number,
    floats: number,
    count: number,
  ): void => {
    // A length of 0 would upload the whole array.
    if (count === 0) return;
    gl.useProgram(program);
    // Clip y grows upward and world y grows downward.
    gl.uniform4f(uView, cam.x, cam.y, (2 * cam.scale) / cssW, (-2 * cam.scale) / cssH);
    gl.uniform1f(uPx, 1 / (cam.scale * ratio));
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, start, count * floats);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  };

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

    draw(prev, cur, alpha, cam, timeSeconds) {
      if (prev !== indexed) {
        indexed = prev;
        prevIndexBySlot.fill(-1);
        const count = prev ? Math.min(prev.creatureCount, MAX_CREATURES) : 0;
        for (let i = 0; prev && i < count; i++) {
          const slot = prev.u32[prev.creatureBase + i * CREATURE_STRIDE + C_SLOT] ?? 0;
          prevIndexBySlot[slot] = i;
        }
      }
      // At alpha 1 the bodies have reached `cur` and stand still, so the tails do too.
      const step = alpha < 1 ? Math.min(Math.max(timeSeconds - lastTime, 0), MAX_STEP_SECONDS) : 0;
      lastTime = timeSeconds;

      const { f32, u32 } = cur;
      const count = Math.min(cur.creatureCount, MAX_CREATURES);
      for (let i = 0; i < count; i++) {
        const r = cur.creatureBase + i * CREATURE_STRIDE;
        let x = f32[r + C_X] ?? 0;
        let y = f32[r + C_Y] ?? 0;
        let heading = f32[r + C_HEADING] ?? 0;
        const length = f32[r + C_LENGTH] ?? 0;
        const slot = u32[r + C_SLOT] ?? 0;
        let moved = 0; // world units in the last tick
        const j = prevIndexBySlot[slot] ?? -1;
        if (prev && j >= 0) {
          const q = prev.creatureBase + j * CREATURE_STRIDE;
          // A slot with another uid holds another creature: it is not interpolated.
          if (prev.u32[q + C_UID] === u32[r + C_UID]) {
            const px = prev.f32[q + C_X] ?? x;
            const py = prev.f32[q + C_Y] ?? y;
            const pHeading = prev.f32[q + C_HEADING] ?? heading;
            moved = Math.hypot(x - px, y - py);
            x = px + (x - px) * alpha;
            y = py + (y - py) * alpha;
            // The shortest arc.
            const turn = heading - pHeading;
            heading = pHeading + (turn - TAU * Math.round(turn / TAU)) * alpha;
          }
        }
        const lengthsPerSecond = (moved * TICK_HZ) / length;
        const phase =
          ((tailPhase[slot] ?? 0) + TAIL_RADIANS_PER_LENGTH * lengthsPerSecond * step) % TAU;
        tailPhase[slot] = phase;
        const o = i * INSTANCE_FLOATS;
        instances[o] = x;
        instances[o + 1] = y;
        instances[o + 2] = heading;
        instances[o + 3] = f32[r + C_HUE] ?? 0;
        instances[o + 4] = length;
        instances[o + 5] = f32[r + C_WIDTH] ?? 0;
        instances[o + 6] = f32[r + C_ENERGY] ?? 0;
        instances[o + 7] = u32[r + C_FLAGS] ?? 0;
        instances[o + 8] = phase;
      }

      // The gradient covers the canvas, so nothing is cleared.
      gl.useProgram(background);
      gl.uniform3f(uDepth, cam.y, cssH / (2 * cam.scale), WORLD_H);
      gl.bindVertexArray(backdrop.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const plantCount = Math.min(cur.plantCount, MAX_PLANTS);
      drawLayer(plants, cam, f32, cur.plantBase, PLANT_STRIDE, plantCount);
      drawLayer(creatures, cam, instances, 0, INSTANCE_FLOATS, count);
    },

    dispose() {
      for (const { vao, buffer } of [backdrop, plants, creatures]) {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(buffer);
      }
      gl.deleteBuffer(quad);
      for (const program of [background, plants.program, creatures.program]) {
        gl.deleteProgram(program);
      }
    },
  };
}
