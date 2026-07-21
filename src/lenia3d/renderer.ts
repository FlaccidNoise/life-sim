/**
 * Three.js renderer for the Lenia 3D world. One-way: reads world state, never feeds the sim.
 *
 *   • creature particles → InstancedMesh of small spheres, colored by creature hue, brightness ∝ energy
 *   • food particles     → THREE.Points (cheap glowing motes)
 *   • world bounds       → a wireframe cube (toroidal volume context)
 *   • camera             → PerspectiveCamera + OrbitControls (drag/rotate, scroll = dolly — NOT a zoom level)
 *
 * No sprite system, no discrete zoom levels — continuous 3D navigation only (per the brief).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { World } from './world';
import { G } from './genome';

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class LeniaRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private renderer: THREE.WebGLRenderer;
  private particleMesh: THREE.InstancedMesh;
  private foodGeom: THREE.BufferGeometry;
  private foodPoints: THREE.Points;
  private foodPos: Float32Array;
  private maxParticles: number;

  constructor(canvas: HTMLCanvasElement, worldSize: number, maxCreatures: number, maxParticlesPerCreature: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05070b, 1);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    this.camera.position.set(worldSize * 1.4, worldSize * 1.1, worldSize * 1.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(worldSize / 2, worldSize / 2, worldSize / 2);

    this.scene.fog = new THREE.FogExp2(0x05070b, 0.0028);

    // Soft lighting + a faint hemispheric fill so the spheres read as 3D dots, not flat discs.
    this.scene.add(new THREE.AmbientLight(0x404858, 1.4));
    const key = new THREE.DirectionalLight(0xbfd8ff, 0.9);
    key.position.set(1, 1.5, 0.8);
    this.scene.add(key);
    const fill = new THREE.HemisphereLight(0x2a3a5a, 0x05070b, 0.6);
    this.scene.add(fill);

    // World-bound wireframe cube.
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(worldSize, worldSize, worldSize),
    );
    const helper = new THREE.Box3Helper(box, 0x1a2a3a);
    this.scene.add(helper);

    // Particles: instanced icosahedron (low-poly sphere) — small, crisp dots in 3D.
    this.maxParticles = maxCreatures * maxParticlesPerCreature;
    const geom = new THREE.IcosahedronGeometry(0.5, 1);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.0,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.5,
    });
    this.particleMesh = new THREE.InstancedMesh(geom, mat, this.maxParticles);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);

    // Food: points.
    this.foodGeom = new THREE.BufferGeometry();
    this.foodPos = new Float32Array(6000 * 3);
    this.foodGeom.setAttribute('position', new THREE.BufferAttribute(this.foodPos, 3));
    this.foodGeom.setDrawRange(0, 0);
    const fmat = new THREE.PointsMaterial({
      color: 0x7ad0a0,
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });
    this.foodPoints = new THREE.Points(this.foodGeom, fmat);
    this.foodPoints.frustumCulled = false;
    this.scene.add(this.foodPoints);

    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Draw one frame from world state. */
  draw(world: World): void {
    // Particles.
    let inst = 0;
    const creatures = world.creatures;
    for (let ci = 0; ci < creatures.length; ci++) {
      const c = creatures[ci]!;
      const hue = c.genes[G.HUE]!;
      // value (brightness) rises with energy up to the repro bar; starving creatures dim.
      const eFrac = Math.max(0, Math.min(1, c.energy / (c.genes[G.REPRO_THRESHOLD]! || 1)));
      tmpColor.setHSL(hue, 0.85, 0.32 + 0.38 * eFrac);
      const n = c.n;
      for (let i = 0; i < n; i++) {
        if (inst >= this.maxParticles) break;
        tmpObj.position.set(c.px[i]!, c.py[i]!, c.pz[i]!);
        tmpObj.scale.setScalar(1);
        tmpObj.updateMatrix();
        this.particleMesh.setMatrixAt(inst, tmpObj.matrix);
        this.particleMesh.setColorAt(inst, tmpColor);
        inst++;
      }
    }
    this.particleMesh.count = inst;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // Food.
    let fp = 0;
    const fc = world.foodCount;
    for (let f = 0; f < fc && fp < this.foodPos.length / 3; f++) {
      if (!world.fAlive[f]) continue;
      this.foodPos[fp * 3] = world.fx[f]!;
      this.foodPos[fp * 3 + 1] = world.fy[f]!;
      this.foodPos[fp * 3 + 2] = world.fz[f]!;
      fp++;
    }
    this.foodGeom.setDrawRange(0, fp);
    (this.foodGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
