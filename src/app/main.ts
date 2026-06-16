import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { Renderer, type Camera } from '../render/webgl-renderer';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud');

const config = defaultConfig({ maxCells: 100_000 });
const world = new World(config);
world.spawn(100_000);
const f = world.cells.fields;

const renderer = new Renderer(canvas, config.maxCells, config.cellRadius * 2);
const camera: Camera = { x: config.worldWidth / 2, y: config.worldHeight / 2, scale: 1 };

// Previous-step position snapshots, for render interpolation (smooth motion at any speed).
const prevX = new Float64Array(config.maxCells);
const prevY = new Float64Array(config.maxCells);
prevX.set(f.posX);
prevY.set(f.posY);

function fit(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
  camera.scale =
    Math.min(canvas.width / config.worldWidth, canvas.height / config.worldHeight) * 0.95;
}
window.addEventListener('resize', fit);
fit();

// Fixed-timestep state.
let speed = 0.25; // physics ticks advanced per rendered frame (fractional = slow-mo)
let paused = false;
let accumulator = 0;
const MAX_STEPS = 64;

function snapshot(): void {
  prevX.set(f.posX);
  prevY.set(f.posY);
}

// Pan with mouse drag.
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camera.x -= (e.clientX - lastX) / camera.scale;
  camera.y -= (e.clientY - lastY) / camera.scale;
  lastX = e.clientX;
  lastY = e.clientY;
});

// Zoom with wheel.
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.scale *= Math.exp(-e.deltaY * 0.001);
  },
  { passive: false },
);

// Time controls: space = pause, '.' = single step, ']' / '[' = faster / slower.
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    paused = !paused;
    accumulator = 0;
    e.preventDefault();
  } else if (e.key === '.') {
    snapshot();
    world.tick();
    snapshot(); // prev == cur → render the stepped state statically
  } else if (e.key === ']') {
    speed = Math.min(16, speed * 1.5);
  } else if (e.key === '[') {
    speed = Math.max(0.02, speed / 1.5);
  }
});

let frames = 0;
let fps = 0;
let lastFpsT = performance.now();

function updateHud(): void {
  if (!hud) return;
  hud.textContent =
    `cells ${world.cells.aliveCount} | tick ${world.tickCount} | ${fps} fps | ` +
    `speed ${speed.toFixed(2)}x${paused ? ' (paused)' : ''} | zoom ${camera.scale.toFixed(3)} | ` +
    `shared ${world.cells.soa.shared}`;
}

function loop(): void {
  if (!paused) {
    accumulator += speed;
    let steps = 0;
    while (accumulator >= 1 && steps < MAX_STEPS) {
      snapshot();
      world.tick();
      accumulator -= 1;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0; // drop backlog rather than spiral
  }

  const alpha = paused ? 1 : Math.min(1, accumulator);
  renderer.render(world, camera, prevX, prevY, alpha);

  frames++;
  const now = performance.now();
  if (now - lastFpsT >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsT));
    frames = 0;
    lastFpsT = now;
    updateHud();
  }
  requestAnimationFrame(loop);
}

updateHud();
requestAnimationFrame(loop);

// Debug/automation handle — also handy from the browser console for live poking.
interface SimHandle {
  world: World;
  camera: Camera;
  setSpeed: (s: number) => void;
}
(globalThis as unknown as { sim: SimHandle }).sim = {
  world,
  camera,
  setSpeed: (s) => {
    speed = s;
  },
};
