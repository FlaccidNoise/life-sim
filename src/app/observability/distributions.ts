/**
 * Population distributions — the histograms the headless gene-MEANS hide. A mean is a lie about a
 * bimodal population: diet is split into grazers (~0) and hunters (~0.9), so its mean (~0.18) describes
 * nobody. This panel draws the actual SHAPE of every trait, updating each frame.
 *
 * Every scalar gene plus energy + age is available as a field (built from SCALAR_GENE_SPECS so the
 * ranges stay honest); a checkbox picker chooses which to show, and the stacked rows can be dragged to
 * reorder. Each field draws in its own stable palette hue (diet keeps the green→red trophic ramp) so
 * adjacent histograms read as distinct, not one flat blue.
 *
 * histogram() is a pure bucketing pass over the live set; the Distributions class is a dumb 2D-canvas
 * drawer over it (plus a thin pointer-drag layer for row reordering). Read-only — never touches the sim.
 */
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { dietColor, dietShape, fieldColor, rgbCss } from '../../render/palette';

/** Bucket the live population by `accessor` into `bins` equal bins over [min,max] (clamped). */
export function histogram(
  store: OrganismStore,
  accessor: (slot: number) => number,
  min: number,
  max: number,
  bins: number,
): number[] {
  const counts = new Array<number>(bins).fill(0);
  const span = max - min || 1;
  const { liveIndices, liveCount } = store;
  for (let k = 0; k < liveCount; k++) {
    const v = accessor(liveIndices[k]!);
    let idx = Math.floor(((v - min) / span) * bins);
    if (idx < 0) idx = 0;
    else if (idx >= bins) idx = bins - 1;
    counts[idx]!++;
  }
  return counts;
}

interface FieldSpec {
  key: string;
  label: string;
  bins: number;
  accessor: (store: OrganismStore, slot: number) => number;
  min: number;
  max: number; // NaN → computed per-frame from the live max (auto-scale)
  colorIndex: number; // stable index into the palette (a field keeps its hue regardless of selection)
  dietColored?: boolean; // color bins green→red (the diet histogram)
}

const gene =
  (g: number) =>
  (s: OrganismStore, i: number): number =>
    s.scalarGenes[i * SCALAR_GENE_COUNT + g]!;

// Short labels for the scalar genes, indexed by ScalarGene id.
const GENE_LABELS: Record<number, string> = {
  [ScalarGene.MAX_SPEED]: 'maxSpeed',
  [ScalarGene.EAT_RATE]: 'eatRate',
  [ScalarGene.SENSE_RANGE]: 'senseRange',
  [ScalarGene.SIZE]: 'size',
  [ScalarGene.MAX_TURN]: 'maxTurn',
  [ScalarGene.MAX_THRUST]: 'maxThrust',
  [ScalarGene.METAB_EFF]: 'metabEff',
  [ScalarGene.REPRO_THRESHOLD]: 'reproBar',
  [ScalarGene.SATIATED_THRESHOLD]: 'satiated',
  [ScalarGene.BIRTH_ENERGY]: 'birthEnergy',
  [ScalarGene.DIET]: 'diet',
  [ScalarGene.DAMAGE]: 'damage',
  [ScalarGene.VISION_RANGE]: 'visionRange',
  [ScalarGene.VISION_FOV]: 'visionFOV',
  [ScalarGene.VISION_ACUITY]: 'visAcuity',
  [ScalarGene.SHELTER_DRIVE]: 'shelterDrive',
  [ScalarGene.COHESION_DRIVE]: 'cohesionDrive',
  [ScalarGene.FORAGE_PREF]: 'foragePref',
  [ScalarGene.FORAGE_PREF_C]: 'foragePrefC',
  [ScalarGene.SENSE_RANGE_B]: 'senseRangeB',
  [ScalarGene.SENSE_RANGE_C]: 'senseRangeC',
  [ScalarGene.PHERO_DEPOSIT]: 'pheroDeposit',
  [ScalarGene.MATURITY_AGE]: 'maturityAge',
  [ScalarGene.SENESCENCE_AGE]: 'senescenceAge',
  [ScalarGene.DISPLAY]: 'display',
  [ScalarGene.PREFERENCE]: 'preference',
};

/** The full field registry: energy + age + every scalar gene (range pulled from SCALAR_GENE_SPECS). */
export const FIELD_REGISTRY: readonly FieldSpec[] = buildRegistry();

function buildRegistry(): FieldSpec[] {
  const fields: FieldSpec[] = [
    {
      key: 'energy',
      label: 'energy',
      bins: 16,
      accessor: (s, i) => s.energy[i]!,
      min: 0,
      max: NaN,
      colorIndex: 0,
    },
    {
      key: 'age',
      label: 'age',
      bins: 16,
      accessor: (s, i) => s.age[i]!,
      min: 0,
      max: NaN,
      colorIndex: 1,
    },
  ];
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    const key = GENE_LABELS[g] ?? `gene${g}`;
    fields.push({
      key,
      label: key,
      bins: g === ScalarGene.DIET ? 14 : 12,
      accessor: gene(g),
      min: spec.min,
      max: spec.max,
      colorIndex: fields.length,
      dietColored: g === ScalarGene.DIET,
    });
  }
  return fields;
}

const DEFAULT_KEYS = ['diet', 'energy', 'age', 'visionRange', 'maxSpeed'];

const HEADER_CSS = 18; // header strip height in CSS px (the pop/○◇△ line); rows start below it

export class Distributions {
  private readonly ctx: CanvasRenderingContext2D;
  // Selected fields, in display order. Starts in registry order (the original five) but the user can
  // drag rows to reorder — so this is NO LONGER pinned to registry order once a drag happens.
  private fields: FieldSpec[] = FIELD_REGISTRY.filter((f) => DEFAULT_KEYS.includes(f.key));
  // Live drag state: which row is grabbed and where it would drop (-1 = not dragging). Read by render()
  // to draw the grab highlight + insertion line; the actual splice happens on pointer-up.
  private dragFrom = -1;
  private dragTo = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for distributions');
    this.ctx = ctx;
    this.applyHeight();
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none'; // we own the gesture; stop the panel from scroll-stealing the drag
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Map a CSS-pixel y (within the canvas) to the row index it falls in, clamped to a valid row. */
  private rowAtCssY(cssY: number): number {
    const n = this.fields.length;
    if (n === 0) return -1;
    const rowH = (this.canvas.clientHeight - HEADER_CSS) / n;
    const idx = Math.floor((cssY - HEADER_CSS) / rowH);
    return idx < 0 ? 0 : idx >= n ? n - 1 : idx;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.fields.length < 2) return; // nothing to reorder
    const rect = this.canvas.getBoundingClientRect();
    const idx = this.rowAtCssY(e.clientY - rect.top);
    if (idx < 0) return;
    this.dragFrom = idx;
    this.dragTo = idx;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragFrom < 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.dragTo = this.rowAtCssY(e.clientY - rect.top);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.dragFrom < 0) return;
    const from = this.dragFrom;
    const to = this.dragTo;
    this.dragFrom = -1;
    this.dragTo = -1;
    this.canvas.style.cursor = 'grab';
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (to >= 0 && to !== from) {
      const [moved] = this.fields.splice(from, 1);
      this.fields.splice(to, 0, moved!);
    }
  };

  /** A field's bar color: the trophic ramp for diet, else its stable palette hue. */
  private static fieldCss(spec: FieldSpec): string {
    return rgbCss(fieldColor(spec.colorIndex));
  }

  /** Grow the canvas with the field count so rows stay readable (≈42px/field, min 220). */
  private applyHeight(): void {
    this.canvas.style.height = `${Math.max(220, this.fields.length * 42)}px`;
  }

  /**
   * Build the checkbox picker into `container`: one toggle per registry field (with its color swatch),
   * checked when selected. Toggling updates the selected set live (registry order preserved).
   */
  mountPicker(container: HTMLElement): void {
    container.innerHTML = '';
    const selected = new Set(this.fields.map((f) => f.key));
    for (const spec of FIELD_REGISTRY) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(spec.key);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(spec.key);
        else selected.delete(spec.key);
        // Preserve the user's drag order: keep still-selected fields where they are, drop the rest, and
        // append any newly-checked field at the end (registry order among the new ones).
        const kept = this.fields.filter((f) => selected.has(f.key));
        const keptKeys = new Set(kept.map((f) => f.key));
        const added = FIELD_REGISTRY.filter((f) => selected.has(f.key) && !keptKeys.has(f.key));
        this.fields = [...kept, ...added];
        this.applyHeight();
      });
      const sw = document.createElement('span');
      sw.className = 'dist-sw';
      sw.style.background = spec.dietColored
        ? `linear-gradient(90deg, ${rgbCss(dietColor(0))}, ${rgbCss(dietColor(1))})`
        : Distributions.fieldCss(spec);
      label.append(cb, sw, document.createTextNode(spec.label));
      container.appendChild(label);
    }
  }

  render(store: OrganismStore | null): void {
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
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (!store || store.liveCount === 0) {
      ctx.fillStyle = 'rgba(140,160,180,0.6)';
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.fillText('no live population', 6 * dpr, 8 * dpr);
      return;
    }

    // Header: the trophic headcount the diet-mean hides — bucketed by the SAME dietShape() the dots
    // use (○ herbivore / ◇ omnivore / △ predator), so the count and the on-canvas glyphs agree.
    let herb = 0;
    let omni = 0;
    let pred = 0;
    for (let k = 0; k < store.liveCount; k++) {
      const shape = dietShape(
        store.scalarGenes[store.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
      );
      if (shape === 2) pred++;
      else if (shape === 1) omni++;
      else herb++;
    }
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(150,170,190,0.85)';
    ctx.fillText(`pop ${store.liveCount}   ○${herb} ◇${omni} △${pred}`, 6 * dpr, 4 * dpr);

    if (this.fields.length === 0) {
      ctx.fillStyle = 'rgba(140,160,180,0.6)';
      ctx.fillText('no fields selected — pick some above', 6 * dpr, 22 * dpr);
      return;
    }

    const headerH = HEADER_CSS * dpr;
    const rowH = (h - headerH) / this.fields.length;
    const padL = 6 * dpr;
    const padR = 6 * dpr;
    const barTop = 12 * dpr; // room for the label inside each row

    for (let f = 0; f < this.fields.length; f++) {
      const spec = this.fields[f]!;
      let max = spec.max;
      if (Number.isNaN(max)) {
        max = 1;
        for (let k = 0; k < store.liveCount; k++) {
          const v = spec.accessor(store, store.liveIndices[k]!);
          if (v > max) max = v;
        }
      }
      const counts = histogram(store, (i) => spec.accessor(store, i), spec.min, max, spec.bins);
      let peak = 1;
      for (const c of counts) if (c > peak) peak = c;

      const y0 = headerH + f * rowH;
      // Label + range.
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(140,160,180,0.8)';
      ctx.fillText(`${spec.label} [${spec.min}–${Math.round(max)}]`, padL, y0);

      const bx0 = padL;
      const bw = (w - padL - padR) / spec.bins;
      const barAreaTop = y0 + barTop;
      const barAreaH = rowH - barTop - 3 * dpr;
      const solid = Distributions.fieldCss(spec);
      for (let b = 0; b < spec.bins; b++) {
        const bh = (counts[b]! / peak) * barAreaH;
        if (spec.dietColored) {
          const t = b / (spec.bins - 1); // green (herbivore) → red (predator)
          ctx.fillStyle = rgbCss(dietColor(t));
        } else {
          ctx.fillStyle = solid;
        }
        ctx.fillRect(bx0 + b * bw, barAreaTop + (barAreaH - bh), Math.max(1, bw - dpr), bh);
      }
    }

    // Drag feedback (overlaid on top): highlight the grabbed row + show where it will drop. The fields
    // array isn't reordered until pointer-up, so rows stay put and we just paint the intent.
    if (this.dragFrom >= 0 && this.fields.length > 1) {
      const gy = headerH + this.dragFrom * rowH;
      ctx.fillStyle = 'rgba(120,170,210,0.12)';
      ctx.fillRect(0, gy, w, rowH);
      ctx.strokeStyle = 'rgba(150,195,235,0.55)';
      ctx.lineWidth = dpr;
      ctx.strokeRect(0.5 * dpr, gy + 0.5 * dpr, w - dpr, rowH - dpr);
      if (this.dragTo >= 0 && this.dragTo !== this.dragFrom) {
        const insY = headerH + this.dragTo * rowH;
        ctx.fillStyle = 'rgba(120,205,255,0.95)';
        ctx.fillRect(0, insY - dpr, w, 2 * dpr);
      }
    }
  }
}
