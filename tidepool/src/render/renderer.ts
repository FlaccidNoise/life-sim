// WebGL2 renderer: the depth gradient, then one instanced draw of every plant in a frame, then one of
// every creature, placed between the last two frames, then one of their parts. In Play each program
// dims what the possessed body does not see. It owns the GL context of its canvas.

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
  FLAG_BUDDED,
  FRAME_HEADER_WORDS,
  KIND_CILIA,
  MAX_EYES,
  PART_WORDS,
  PLANT_STRIDE,
  WORLD_H,
  type FrameView,
  type Part,
} from '../protocol';
import {
  MAX_SWELLS,
  OUTLINE_FLOATS,
  OUTLINE_SWELLS,
  OUTLINE_TAPER,
  PART_INSTANCE_FLOATS,
  PART_LOD_PX,
  buildParts,
  endsOf,
  hasMixedMark,
  outlineOf,
  partsOf,
} from './parts';
import { sightOf } from './sight';
import {
  BACKGROUND_FRAG,
  BACKGROUND_VERT,
  CREATURE_FRAG,
  CREATURE_VERT,
  PART_FRAG,
  PART_VERT,
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
   * `timeSeconds` is a clock that only moves forward. It drives the parts that move.
   */
  draw(
    prev: FrameView | null,
    cur: FrameView,
    alpha: number,
    cam: Camera,
    timeSeconds: number,
  ): void;
  /** The share of a full store at which a body buds. The energy ring has its notch there. */
  setBudAt(share: number): void;
  dispose(): void;
}

const MAX_CREATURES = 4096; // the creature pool of the core
const MAX_PLANTS = 8192; // the plant pool of the core
const MAX_PARTS = MAX_CREATURES * PART_WORDS * 2; // a part gene makes a pair at most
const CREATURE_ATTRIBUTES = [4, 4, 3, 2, 4]; // a_pose, a_body, a_life, a_ends, a_swells
const I_ENDS = 11; // the float of an instance at which a_ends starts
const I_SWELLS = 13; // and its swells: an x and a radius each
const INSTANCE_FLOATS = I_SWELLS + 2 * MAX_SWELLS;
const NO_PARTS: readonly Part[] = [];
const PART_ATTRIBUTES = [4, 4, 2]; // a_place, a_look, a_body
const MAX_DPR = 2;
const TAU = 2 * Math.PI;
const CILIA_BEAT = 6; // radians per second
// FLAG_BUDDED stays set this long at normal speed: BUD_FLASH in crates/sim/src/frame.rs.
const PULSE_SECONDS = 2;

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

  const layer = (vert: string, frag: string, sizes: number[], capacity: number) => {
    const program = link(gl, vert, frag);
    return {
      program,
      uView: gl.getUniformLocation(program, 'u_view'),
      uPx: gl.getUniformLocation(program, 'u_px'),
      uSight: gl.getUniformLocation(program, 'u_sight'),
      uCones: gl.getUniformLocation(program, 'u_cones'),
      ...instancedQuad(gl, quad, sizes, capacity),
    };
  };
  const backdrop = layer(BACKGROUND_VERT, BACKGROUND_FRAG, [], 0);
  const uHeight = gl.getUniformLocation(backdrop.program, 'u_height');
  const plants = layer(PLANT_VERT, PLANT_FRAG, [PLANT_STRIDE], MAX_PLANTS);
  const creatures = layer(CREATURE_VERT, CREATURE_FRAG, CREATURE_ATTRIBUTES, MAX_CREATURES);
  const uBeat = gl.getUniformLocation(creatures.program, 'u_beat');
  const uBudAt = gl.getUniformLocation(creatures.program, 'u_bud_at');
  const instances = new Float32Array(MAX_CREATURES * INSTANCE_FLOATS);
  const parts = layer(PART_VERT, PART_FRAG, PART_ATTRIBUTES, MAX_PARTS);
  const partInstances = new Float32Array(MAX_PARTS * PART_INSTANCE_FLOATS);
  // The outline of the body of each slot.
  const outlines = new Float64Array(MAX_CREATURES * OUTLINE_FLOATS);
  // The creature records of the frame being drawn, with each body placed between the last two
  // frames. The bodies and their parts are both drawn from it.
  const posedU32 = new Uint32Array(FRAME_HEADER_WORDS + MAX_CREATURES * CREATURE_STRIDE);
  const posedF32 = new Float32Array(posedU32.buffer);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0x04 / 255, 0x12 / 255, 0x1c / 255, 1);

  // The record index in `indexed` of each slot, or -1.
  const prevIndexBySlot = new Int32Array(MAX_CREATURES);
  let indexed: FrameView | null | undefined;
  // The time at which each slot's FLAG_BUDDED was first drawn, or 0 while the flag is clear.
  const pulseFrom = new Float64Array(MAX_CREATURES);
  let cssW = 1;
  let cssH = 1;
  let ratio = 1;
  // The `u_sight` and `u_cones` of the frame being drawn.
  const sightUniform = new Float32Array(4);
  const coneUniform = new Float32Array(4 * MAX_EYES);

  // Makes the program of a layer current, with the camera and the sight of the frame.
  const aim = ({ program, uView, uPx, uSight, uCones, vao }: typeof plants, cam: Camera): void => {
    gl.useProgram(program);
    // Clip y grows upward and world y grows downward.
    gl.uniform4f(uView, cam.x, cam.y, (2 * cam.scale) / cssW, (-2 * cam.scale) / cssH);
    gl.uniform1f(uPx, 1 / (cam.scale * ratio));
    gl.uniform4fv(uSight, sightUniform);
    gl.uniform4fv(uCones, coneUniform);
    gl.bindVertexArray(vao);
  };

  // Uploads `count` instances of `floats` floats each, from `data` at `start`, and draws them.
  const drawLayer = (
    to: typeof plants,
    cam: Camera,
    data: Float32Array,
    start: number,
    floats: number,
    count: number,
  ): void => {
    // A length of 0 would upload the whole array.
    if (count === 0) return;
    aim(to, cam);
    gl.bindBuffer(gl.ARRAY_BUFFER, to.buffer);
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

      const { f32, u32 } = cur;
      const count = Math.min(cur.creatureCount, MAX_CREATURES);
      const base = cur.creatureBase;
      posedU32.set(u32.subarray(base, base + count * CREATURE_STRIDE), base);
      const posed: FrameView = {
        ...cur,
        buffer: posedU32.buffer,
        f32: posedF32,
        u32: posedU32,
        creatureCount: count,
      };
      let lag = 0; // how far the possessed body is drawn behind its heading in `cur`, radians
      for (let i = 0; i < count; i++) {
        const r = base + i * CREATURE_STRIDE;
        let x = f32[r + C_X] ?? 0;
        let y = f32[r + C_Y] ?? 0;
        let heading = f32[r + C_HEADING] ?? 0;
        const length = f32[r + C_LENGTH] ?? 0;
        const width = f32[r + C_WIDTH] ?? 0;
        const slot = u32[r + C_SLOT] ?? 0;
        const flags = u32[r + C_FLAGS] ?? 0;
        let known = false; // `prev` holds this creature
        const j = prevIndexBySlot[slot] ?? -1;
        if (prev && j >= 0) {
          const q = prev.creatureBase + j * CREATURE_STRIDE;
          // A slot with another uid holds another creature: it is not interpolated.
          if (prev.u32[q + C_UID] === u32[r + C_UID]) {
            known = true;
            const px = prev.f32[q + C_X] ?? x;
            const py = prev.f32[q + C_Y] ?? y;
            const pHeading = prev.f32[q + C_HEADING] ?? heading;
            x = px + (x - px) * alpha;
            y = py + (y - py) * alpha;
            // The shortest arc.
            const turn = heading - pHeading;
            heading = pHeading + (turn - TAU * Math.round(turn / TAU)) * alpha;
          }
        }
        posedF32[r + C_X] = x;
        posedF32[r + C_Y] = y;
        posedF32[r + C_HEADING] = heading;
        if (slot === cur.possessedSlot) lag = heading - (f32[r + C_HEADING] ?? 0);

        // A body too small on screen for its parts has no cilia either, and an outline with no taper
        // and no swell.
        const carried = length * cam.scale >= PART_LOD_PX ? partsOf(u32, r) : NO_PARTS;
        let cilia = 0;
        for (const part of carried) if (part.kind === KIND_CILIA) cilia += part.size;
        // A body that draws a part has its outline in `outlines`, for its parts too.
        const shaped = carried.length > 0;
        const outline = slot * OUTLINE_FLOATS;
        if (shaped) outlineOf(carried, u32[r + C_UID] ?? 0, length, width, outlines, outline);
        const taper = shaped ? (outlines[outline + OUTLINE_TAPER] ?? 0) : 0;
        // One pulse for each time the flag is set. A body that comes into view with the flag set
        // starts its pulse then.
        const budded = (flags & FLAG_BUDDED) !== 0;
        if (!budded) pulseFrom[slot] = 0;
        else if (!known || pulseFrom[slot] === 0) pulseFrom[slot] = timeSeconds;
        const pulsed = (timeSeconds - (pulseFrom[slot] ?? 0)) / PULSE_SECONDS;
        const o = i * INSTANCE_FLOATS;
        instances[o] = x;
        instances[o + 1] = y;
        instances[o + 2] = heading;
        instances[o + 3] = f32[r + C_HUE] ?? 0;
        instances[o + 4] = length;
        instances[o + 5] = width;
        instances[o + 6] = f32[r + C_ENERGY] ?? 0;
        instances[o + 7] = flags;
        instances[o + 8] = Math.min(cilia, 1);
        instances[o + 9] = budded ? Math.sin(Math.PI * Math.min(pulsed, 1)) : 0;
        instances[o + 10] = hasMixedMark(flags) ? 1 : 0;
        const [nose, tail] = endsOf(taper);
        instances[o + I_ENDS] = nose;
        instances[o + I_ENDS + 1] = tail;
        // The swells are those of the outline. A radius of 0 is no swell.
        instances.fill(0, o + I_SWELLS, o + INSTANCE_FLOATS);
        for (let k = OUTLINE_SWELLS; shaped && k < OUTLINE_FLOATS; k++) {
          instances[o + I_SWELLS + k - OUTLINE_SWELLS] = outlines[outline + k] ?? 0;
        }
      }
      const partCount = buildParts(posed, cam.scale, timeSeconds, partInstances, outlines);

      // The cones of the header are those of `cur`. They turn with the body as it is drawn.
      const sight = sightOf(posed);
      sightUniform.set([sight?.x ?? 0, sight?.y ?? 0, sight?.near ?? 0, sight?.cones.length ?? -1]);
      sight?.cones.forEach(({ dir, cosHalf, range }, k) =>
        coneUniform.set([Math.cos(dir + lag), Math.sin(dir + lag), cosHalf, range], 4 * k),
      );

      // The gradient covers the canvas, so nothing is cleared.
      aim(backdrop, cam);
      gl.uniform1f(uHeight, WORLD_H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const plantCount = Math.min(cur.plantCount, MAX_PLANTS);
      drawLayer(plants, cam, f32, cur.plantBase, PLANT_STRIDE, plantCount);
      gl.useProgram(creatures.program);
      gl.uniform1f(uBeat, (CILIA_BEAT * timeSeconds) % TAU);
      drawLayer(creatures, cam, instances, 0, INSTANCE_FLOATS, count);
      drawLayer(parts, cam, partInstances, 0, PART_INSTANCE_FLOATS, partCount);
    },

    setBudAt(share) {
      gl.useProgram(creatures.program);
      gl.uniform1f(uBudAt, share);
    },

    dispose() {
      for (const { vao, buffer, program } of [backdrop, plants, creatures, parts]) {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
      gl.deleteBuffer(quad);
    },
  };
}
