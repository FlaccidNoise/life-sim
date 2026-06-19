import { type World } from '../core/sim/world';
import { CellType } from '../core/cells/types';
import { SenseSource, SightTarget } from '../core/cells/sense-source';

/** Single-letter tag per neural cell type, drawn inside each node. */
const TYPE_TAG: Record<number, string> = {
  [CellType.SENSOR]: 'S',
  [CellType.NEURON]: 'N',
  [CellType.MOVER]: 'M',
};

/** Single sight-target letter: FOOD=F, PREY=Y (so it can't collide with Predator), PREDATOR=P. */
const SIGHT_TARGET_TAG: Record<number, string> = {
  [SightTarget.FOOD]: 'F',
  [SightTarget.PREY]: 'Y',
  [SightTarget.PREDATOR]: 'P',
};

/**
 * Legibility label for a SENSOR cell, derived from its modality binding (Phase 5):
 * Sm = smell, He = hearing, Si:{F|Y|P} = sight (food/prey/predator). 'S' if the cell
 * has no live sensor binding. Read-only over core; reads net.sensorSource, NOT think.
 */
export function sensorLabel(
  net: {
    sensorCell: Uint32Array;
    sensorSource: Uint8Array;
    sensorSightTarget: Uint8Array;
    sensorCount: number;
  },
  cell: number,
): string {
  for (let k = 0; k < net.sensorCount; k++) {
    if (net.sensorCell[k] !== cell) continue;
    const src = net.sensorSource[k]!;
    if (src === SenseSource.HEARING) return 'He';
    if (src === SenseSource.SIGHT)
      return 'Si:' + (SIGHT_TARGET_TAG[net.sensorSightTarget[k]!] ?? '?');
    return 'Sm'; // SMELL (default)
  }
  return 'S'; // no sensor binding on this cell
}

/**
 * §11 M4 deliverable — renders the neuron-cell network with LIVE activations.
 * Nodes are laid out from each neuron's world position (projected into the canvas);
 * node colour encodes activation (blue −1 → grey 0 → orange +1), with the cell-type
 * tag (S/N/M) and the activation value drawn on each; synapse edges are green
 * (excitatory) / red (inhibitory), width ∝ |weight|. Read-only over core.
 *
 * Scoped to a single organism when `organismId` is given (else all neurons), so two
 * roaming critters don't collapse into one degenerate shared bounding box.
 */
export class BrainInspector {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('brain inspector needs a 2D context');
    this.ctx = ctx;
  }

  render(world: World, organismId?: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const net = world.net;
    const f = world.cells.fields;
    const inScope = (i: number): boolean =>
      organismId === undefined || f.organismId[i] === organismId;

    // Title.
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.fillStyle = '#5fd9ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('BRAIN INSPECTOR', 10, 16);

    // Bounding box of the in-scope live neurons in world space → fit canvas + padding.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let shown = 0;
    for (let k = 0; k < net.liveNeuronCount; k++) {
      const i = net.liveNeurons[k]!;
      if (!inScope(i)) continue;
      shown++;
      const x = f.posX[i]!;
      const y = f.posY[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (shown === 0) {
      ctx.fillStyle = '#7d93a4';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('no neuron cells — spawn a critter', 10, 34);
      return;
    }
    // Asymmetric padding: room for the title (top) and the key (bottom).
    const padX = 30;
    const padTop = 30;
    const padBot = 22;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const sx = (w - 2 * padX) / spanX;
    const sy = (h - padTop - padBot) / spanY;
    const proj = (x: number, y: number): [number, number] => [
      padX + (x - minX) * sx,
      padTop + (y - minY) * sy,
    ];

    // Edges (synapses).
    for (let k = 0; k < net.liveSynapseCount; k++) {
      const s = net.liveSynapses[k]!;
      if (!inScope(net.pre[s]!)) continue; // pre & post share an organism
      const a = proj(f.posX[net.pre[s]!]!, f.posY[net.pre[s]!]!);
      const b = proj(f.posX[net.post[s]!]!, f.posY[net.post[s]!]!);
      const wgt = net.weight[s]!;
      ctx.strokeStyle = wgt >= 0 ? 'rgba(80,220,120,0.7)' : 'rgba(230,90,90,0.7)';
      ctx.lineWidth = Math.min(4, 0.5 + Math.abs(wgt));
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }

    // Nodes (neurons): fill by activation, tag by cell type, value beneath.
    ctx.textAlign = 'center';
    for (let k = 0; k < net.liveNeuronCount; k++) {
      const i = net.liveNeurons[k]!;
      if (!inScope(i)) continue;
      const [px, py] = proj(f.posX[i]!, f.posY[i]!);
      const a = net.actCur[i]!; // ∈ roughly [−1, 1]
      const t = Math.max(-1, Math.min(1, a));
      // blue (−) → grey (0) → orange (+)
      const r = Math.round(120 + 110 * t);
      const g = Math.round(120 + 30 * Math.abs(t) * (t > 0 ? 1 : -1));
      const bl = Math.round(120 - 110 * t);
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cde';
      ctx.lineWidth = 1;
      ctx.stroke();
      // type tag inside the node (dark for contrast on the bright fill)
      ctx.fillStyle = 'rgba(8,12,18,0.85)';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const tag =
        f.cellType[i]! === CellType.SENSOR
          ? sensorLabel(net, i)
          : (TYPE_TAG[f.cellType[i]!] ?? '?');
      ctx.fillText(tag, px, py + 0.5);
      // activation value beneath
      ctx.fillStyle = '#aebfce';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(a.toFixed(2), px, py + 11);
    }

    // Footer key.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = '#7d93a4';
    ctx.fillText(
      'Sm smell  Si sight(F/Y/P)  He hear  N neuron  M mover   ·   − blue / + orange',
      10,
      h - 8,
    );
  }
}
