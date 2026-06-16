import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { Renderer, type Camera } from '../render/webgl-renderer';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud');

const config = defaultConfig({ maxCells: 100_000 });
const world = new World(config);
world.spawn(100_000);

const renderer = new Renderer(canvas, config.maxCells, config.cellRadius * 2);
const camera: Camera = { x: config.worldWidth / 2, y: config.worldHeight / 2, scale: 1 };

function fit(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
  camera.scale =
    Math.min(canvas.width / config.worldWidth, canvas.height / config.worldHeight) * 0.95;
}
window.addEventListener('resize', fit);
fit();

let paused = false;
let stepsPerFrame = 1;

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

// Time controls: space = pause, '.' = step, ']' / '[' = faster / slower.
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    paused = !paused;
    e.preventDefault();
  } else if (e.key === '.') {
    world.tick();
  } else if (e.key === ']') {
    stepsPerFrame = Math.min(64, stepsPerFrame * 2);
  } else if (e.key === '[') {
    stepsPerFrame = Math.max(1, Math.floor(stepsPerFrame / 2));
  }
});

let frames = 0;
let fps = 0;
let lastFpsT = performance.now();

function updateHud(): void {
  if (!hud) return;
  hud.textContent =
    `cells ${world.cells.aliveCount} | tick ${world.tickCount} | ${fps} fps | ` +
    `${stepsPerFrame}x${paused ? ' (paused)' : ''} | zoom ${camera.scale.toFixed(3)} | ` +
    `shared ${world.cells.soa.shared}`;
}

function loop(): void {
  if (!paused) {
    for (let s = 0; s < stepsPerFrame; s++) world.tick();
  }
  renderer.render(world, camera);

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
