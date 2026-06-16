import { type World } from '../core/sim/world';

/**
 * §11 M4 deliverable — renders the neuron-cell network with LIVE activations.
 * Nodes are laid out from each neuron's world position (projected into the canvas);
 * node colour encodes activation (blue −1 → grey 0 → orange +1); synapse edges are
 * green (excitatory) / red (inhibitory), width ∝ |weight|. Read-only over core.
 */
export class BrainInspector {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('brain inspector needs a 2D context');
    this.ctx = ctx;
  }

  render(world: World): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const net = world.net;
    const f = world.cells.fields;
    const n = net.liveNeuronCount;
    if (n === 0) {
      ctx.fillStyle = '#789';
      ctx.font = '12px monospace';
      ctx.fillText('no neuron cells', 10, 20);
      return;
    }

    // Bounding box of the live neurons in world space → fit to canvas with padding.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = net.liveNeurons[k]!;
      const x = f.posX[i]!;
      const y = f.posY[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = 24;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const sx = (w - 2 * pad) / spanX;
    const sy = (h - 2 * pad) / spanY;
    const proj = (x: number, y: number): [number, number] => [
      pad + (x - minX) * sx,
      pad + (y - minY) * sy,
    ];

    // Edges (synapses).
    for (let k = 0; k < net.liveSynapseCount; k++) {
      const s = net.liveSynapses[k]!;
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

    // Nodes (neurons), coloured by activation.
    for (let k = 0; k < n; k++) {
      const i = net.liveNeurons[k]!;
      const [px, py] = proj(f.posX[i]!, f.posY[i]!);
      const a = net.actCur[i]!; // ∈ roughly [−1, 1]
      const t = Math.max(-1, Math.min(1, a));
      // blue (−) → grey (0) → orange (+)
      const r = Math.round(120 + 110 * t);
      const g = Math.round(120 + 30 * Math.abs(t) * (t > 0 ? 1 : -1));
      const bl = Math.round(120 - 110 * t);
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cde';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
