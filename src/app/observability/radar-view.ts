/**
 * Trait radar — a 7-spoke polygon of a selected creature's heritable genes, so you can read its
 * "morphotype" at a glance and see how guilds differ in SHAPE. Mirrors the BrainView split: a pure,
 * unit-tested computeRadar() does all the math (read-only), and RadarView only draws.
 *
 * The seven axes are heritable scalar genes that already exist (genome.ts) AND are seeded to vary from
 * t0, so no spoke is born flat: trophic role (diet) + weaponry (bite) + locomotion (speed) + body size
 * + the chemoreception sense (smell) + the two r/K life-history genes (repro threshold + offspring
 * provisioning). Each spoke is normalized against the gene's own clamp bounds (SCALAR_GENE_SPECS), so a
 * full-length spoke = the genetic maximum for that trait — absolute magnitude, comparable across
 * creatures and across time. The polygon is filled with the creature's diet GUILD hue (the same
 * green→red mapping as the dots), and each spoke carries a distinct accent color for its label.
 *
 * Guild silhouettes this is meant to make obvious: a sessile grazer is a small wedge pulled toward the
 * smell/fecundity side; a predator is a spiky star pulled toward diet/bite/speed/size; a forager is a
 * balanced mid pentagon.
 */
import { type OrganismStore } from '../../core/store';
import { type Config } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';

interface RadarAxisDef {
  gene: number; // ScalarGene id whose clamp bounds define this spoke's 0..1 range
  label: string; // short rim label
  color: string; // accent color for the spoke label + vertex dot
}

/** The seven spokes, clockwise from the top. Ordered so predator-capability genes (diet, bite, speed,
 *  size) cluster on one side and the life-history/sensory genes (smell, r/K, provisioning) on the other,
 *  making a predator and a plant pull toward opposite halves of the chart. */
export const RADAR_AXES: readonly RadarAxisDef[] = [
  { gene: ScalarGene.DIET, label: 'diet', color: '#d98b6a' },
  { gene: ScalarGene.DAMAGE, label: 'bite', color: '#e0566a' },
  { gene: ScalarGene.MAX_SPEED, label: 'spd', color: '#5fd9e8' },
  { gene: ScalarGene.SIZE, label: 'size', color: '#9aa7b4' },
  { gene: ScalarGene.SENSE_RANGE, label: 'smell', color: '#b6d957' },
  { gene: ScalarGene.REPRO_THRESHOLD, label: 'r/K', color: '#e88fb0' },
  { gene: ScalarGene.BIRTH_ENERGY, label: 'prov', color: '#e8cf7a' },
];

export interface RadarAxis {
  key: number; // ScalarGene id
  label: string;
  color: string;
  value: number; // raw gene value
  norm: number; // value mapped to [0,1] over the gene's clamp bounds
}

export interface RadarState {
  axes: RadarAxis[];
  diet: number; // raw diet gene [0,1]
  dietHue: number; // CSS hue degrees for the guild fill (122 green herbivore → 0 red predator)
  guild: string; // herbivore | omnivore | predator (diet thresholds)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Read one creature's seven radar spokes (read-only; no allocation beyond the returned object). */
export function computeRadar(store: OrganismStore, _cfg: Config, slot: number): RadarState {
  const sg = slot * SCALAR_GENE_COUNT;
  const axes: RadarAxis[] = RADAR_AXES.map((def) => {
    const spec = SCALAR_GENE_SPECS[def.gene]!;
    const value = store.scalarGenes[sg + def.gene]!;
    const norm = clamp01((value - spec.min) / (spec.max - spec.min));
    return { key: def.gene, label: def.label, color: def.color, value, norm };
  });
  const diet = store.scalarGenes[sg + ScalarGene.DIET]!;
  const dietHue = 122 * (1 - clamp01(diet));
  const guild = diet < 0.2 ? 'herbivore' : diet < 0.6 ? 'omnivore' : 'predator';
  return { axes, diet, dietHue, guild };
}

const GRID_RINGS = [0.25, 0.5, 0.75, 1] as const;

export class RadarView {
  private readonly ctx: CanvasRenderingContext2D;
  private slot = -1;
  private gen = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the radar view');
    this.ctx = ctx;
  }

  select(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
  }

  clear(): void {
    this.slot = -1;
  }

  render(store: OrganismStore | null, cfg: Config | null): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,170,210,0.06)';
    ctx.fillRect(0, 0, w, h);

    if (!store || !cfg || this.slot < 0 || !store.isAlive(this.slot, this.gen)) {
      ctx.fillStyle = 'rgba(140,160,180,0.6)';
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('click a dot to read its traits', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const st = computeRadar(store, cfg, this.slot);
    const n = st.axes.length;
    const cx = w / 2;
    const cy = h / 2 + 6 * dpr; // nudge down to leave room for the guild caption up top
    const R = Math.min(w, h) / 2 - 26 * dpr; // margin for rim labels
    const ang = (i: number): number => -Math.PI / 2 + (2 * Math.PI * i) / n;

    // Concentric grid rings (faint heptagons) — the magnitude reference.
    ctx.strokeStyle = 'rgba(120,170,210,0.14)';
    ctx.lineWidth = Math.max(0.5, dpr * 0.6);
    for (const ring of GRID_RINGS) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = ang(i);
        const x = cx + Math.cos(a) * R * ring;
        const y = cy + Math.sin(a) * R * ring;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Spokes + rim labels.
    ctx.font = `${Math.round(9 * dpr)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = ang(i);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      ctx.strokeStyle = 'rgba(120,170,210,0.12)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * R, cy + dy * R);
      ctx.stroke();
      // Label just outside the rim, aligned away from center so text never overlaps the polygon.
      const lx = cx + dx * (R + 9 * dpr);
      const ly = cy + dy * (R + 9 * dpr);
      ctx.textAlign = dx > 0.3 ? 'left' : dx < -0.3 ? 'right' : 'center';
      ctx.fillStyle = st.axes[i]!.color;
      ctx.fillText(st.axes[i]!.label, lx, ly);
    }

    // Data polygon, filled with the diet guild hue.
    const fill = `hsla(${st.dietHue.toFixed(0)}, 60%, 55%, 0.28)`;
    const stroke = `hsl(${st.dietHue.toFixed(0)}, 70%, 62%)`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ang(i);
      const r = R * st.axes[i]!.norm;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // Per-spoke vertex dots in each axis's accent color.
    for (let i = 0; i < n; i++) {
      const a = ang(i);
      const r = R * st.axes[i]!.norm;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = st.axes[i]!.color;
      ctx.fill();
    }

    // Guild caption (top-left), in the guild hue.
    ctx.fillStyle = stroke;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.fillText(`${st.guild}  ·  diet ${st.diet.toFixed(2)}`, 6 * dpr, 6 * dpr);
  }
}
