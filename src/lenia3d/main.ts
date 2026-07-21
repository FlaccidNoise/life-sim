/**
 * Lenia 3D entry — wires the deterministic core to the Three.js renderer and runs the loop.
 * Fixed-timestep sim decoupled from rendering (same contract as the 2D app): each animation
 * frame advances `speed` sim steps then draws. The sim never reads wall-clock → determinism holds.
 */
import { World, defaultLeniaConfig, type LeniaConfig } from './world';
import { LeniaRenderer } from './renderer';
import { G, GENE_NAMES } from './genome';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const speedSel = document.getElementById('speed') as HTMLSelectElement;
const reseedBtn = document.getElementById('reseed') as HTMLButtonElement;

const MAX_PARTICLES_PER = 28;

let config: LeniaConfig = defaultLeniaConfig();
let world = new World(config);
const renderer = new LeniaRenderer(canvas, config.worldSize, config.maxCreatures, MAX_PARTICLES_PER);

let running = true;
let speed = 1;
let lastT = performance.now();
let lastTick = 0;
let tps = 0;

function rebuild(seed?: number): void {
  if (seed !== undefined) config = defaultLeniaConfig({ seed });
  world = new World(config);
}

function setPlaying(v: boolean): void {
  running = v;
  playBtn.textContent = v ? '⏸ pause' : '▶ play';
}

playBtn.addEventListener('click', () => setPlaying(!running));
speedSel.addEventListener('change', () => {
  speed = Number(speedSel.value);
});
reseedBtn.addEventListener('click', () => rebuild(Math.floor(Math.random() * 1e9)));

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    setPlaying(!running);
  }
});

const STEP_CAP = 512;

function frame(): void {
  if (running) {
    const steps = Math.min(STEP_CAP, Math.max(1, Math.round(speed)));
    for (let i = 0; i < steps; i++) world.step();
  }
  renderer.draw(world);

  const now = performance.now();
  if (now - lastT >= 500) {
    tps = ((world.tick - lastTick) * 1000) / (now - lastT);
    lastT = now;
    lastTick = world.tick;
    updateHud();
  }
  requestAnimationFrame(frame);
}

function meanGen(): number {
  let sum = 0;
  const cs = world.creatures;
  for (let i = 0; i < cs.length; i++) sum += cs[i]!.gen;
  return cs.length ? sum / cs.length : 0;
}

function meanGene(idx: number): number {
  let sum = 0;
  const cs = world.creatures;
  for (let i = 0; i < cs.length; i++) sum += cs[i]!.genes[idx]!;
  return cs.length ? sum / cs.length : 0;
}

function updateHud(): void {
  const pop = world.population;
  const meanParticles = pop ? world.creatures.reduce((a, c) => a + c.n, 0) / pop : 0;
  const lines = [
    `tick ${world.tick}  ·  ${tps.toFixed(0)} t/s  ·  speed ${speed}×`,
    `population ${pop}  ·  births ${world.totalBirths}  ·  deaths ${world.totalDeaths}`,
    `mean gen ${meanGen().toFixed(2)}  ·  mean particles ${meanParticles.toFixed(1)}`,
    `μK ${meanGene(G.MU_K).toFixed(2)}  ·  μG ${meanGene(G.MU_G).toFixed(2)}  ·  wK ${meanGene(G.W_K).toFixed(3)}  ·  n ${meanGene(G.N).toFixed(1)}`,
    `hunger ${meanGene(G.HUNGER).toFixed(2)}  ·  reproThr ${meanGene(G.REPRO_THRESHOLD).toFixed(0)}`,
  ];
  hud.textContent = lines.join('\n');
}

// Console handle for poking the sim (matches the project's affordance).
(globalThis as unknown as { sim: unknown }).sim = {
  get world() {
    return world;
  },
  get renderer() {
    return renderer;
  },
  get config() {
    return config;
  },
  reseed: (s?: number) => rebuild(s ?? Math.floor(Math.random() * 1e9)),
  geneNames: () => GENE_NAMES,
};

setPlaying(true);
requestAnimationFrame(frame);
