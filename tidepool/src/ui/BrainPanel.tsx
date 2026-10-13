// The brain panel: a live graph of the brain of the body the player is in. Inputs on the left under
// the part that owns them, hidden neurons between, outputs on the right. The error state and the
// two empty states come before the graph.

import { useEffect, useRef } from 'preact/hooks';
import { KIND_CHEMO, KIND_EYE, type BrainNeuron, type BrainView } from '../protocol';
import { KIND_MATE, layout, type Group, type Placed } from './brain/layout';
import { brain, brainError, brainOpen, steer } from './state';

const TAU = 2 * Math.PI;
const INK = '#cfe6ee';
const EDGE = '#3b6377';
const WATER = '#04121c';
const PLUS = '#7fd1a8';
const MINUS = '#f0b27a';
const QUIET = 0.02; // a neuron whose activation has stayed under this is drawn dim
const FULL_WEIGHT = 2; // a connection of this weight has the full width
const LEFT = 108; // CSS pixels left of the input column, for the labels
const RIGHT = 96; // right of the output column, for the gauges
const PAD = 10; // above and below the columns
const LABEL_PITCH = 11; // inputs closer than this get no label of their own

// The inputs of the body by port, as in crates/sim/src/brain.rs. The eye ports: cone A looks to
// the right of the heading and cone B to the left. A midline eye has cone A only, and it looks ahead.
const BODY_INPUT: Record<number, string> = {
  0: 'always on',
  1: 'energy',
  2: 'age',
  3: 'speed',
  4: 'size',
  5: 'kin',
  16: 'strength',
  17: 'ahead',
  18: 'side',
};
const EYE_INPUT = ['food R', 'body R', 'food L', 'body L'];
const MIDLINE_EYE_INPUT = ['food', 'body'];

// An output by port: its name, the two ends of its gauge in words, and whether the body uses only
// the part above 0, as `brain::think` does for the thrust.
interface Output {
  name: string;
  low: string;
  high: string;
  fromZero: boolean;
}
const OUTPUT: Record<number, Output> = {
  128: { name: 'thrust', low: 'rest', high: 'full', fromZero: true },
  129: { name: 'turn', low: 'left', high: 'right', fromZero: false },
  130: { name: 'accept', low: 'no', high: 'yes', fromZero: false },
};
const outputOf = (port: number): Output =>
  OUTPUT[port] ?? { name: `output ${port}`, low: '', high: '', fromZero: false };

function groupNames(groups: Group[]): string[] {
  let eyes = 0;
  return groups.map((g) =>
    g.kind === 0
      ? 'Body'
      : g.kind === KIND_MATE
        ? 'Mate'
        : g.kind === KIND_CHEMO
          ? 'Scent'
          : g.kind === KIND_EYE
            ? `Eye ${++eyes}`
            : 'Part',
  );
}

function inputName(n: BrainNeuron, group: Group): string {
  if (n.owner === 0) return BODY_INPUT[n.port] ?? '';
  if (group.kind !== KIND_EYE) return '';
  return (group.count === 2 ? MIDLINE_EYE_INPUT : EYE_INPUT)[n.port] ?? '';
}

// The text that stands for the canvas.
function describe(b: BrainView, groups: Group[]): string {
  const outs = b.neurons
    .slice(b.inputs + b.hidden)
    .map((n) => `${outputOf(n.port).name} ${n.activation.toFixed(1)}`);
  return (
    `A graph of the brain of this body. ${b.inputs} inputs on the left, in groups: ` +
    `${groupNames(groups).join(', ')}. ${b.hidden} hidden neurons in the middle. ` +
    `${b.outputs} outputs on the right: ${outs.join(', ')}. ${b.connections.length} connections.`
  );
}

/**
 * Draws the brain. `peak` is the largest size of each activation since the panel opened. `hands`
 * is what the player asks for, drawn only while the player steers.
 */
function draw(
  canvas: HTMLCanvasElement,
  b: BrainView,
  placed: { nodes: Placed[]; groups: Group[] },
  peak: number[],
  hands: { thrust: number; turn: number },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = devicePixelRatio;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { nodes, groups } = placed;
  const xs = nodes.map((n) => LEFT + n.x * (w - LEFT - RIGHT));
  const ys = nodes.map((n) => PAD + n.y * (h - 2 * PAD));
  const x = (i: number): number => xs[i] ?? 0;
  const y = (i: number): number => ys[i] ?? 0;
  const pitch = b.inputs > 1 ? y(1) - y(0) : h;
  const r = Math.min(5, pitch * 0.4);
  const quiet = (i: number): boolean => (peak[i] ?? 0) < QUIET;

  // Connections, the weak ones first so that a strong one lies on top. The colour is the sign and
  // the width is the size. A connection that carries a signal now is brighter.
  ctx.lineCap = 'round';
  const wires = [...b.connections].sort((p, q) => Math.abs(p.weight) - Math.abs(q.weight));
  for (const c of wires) {
    const size = Math.min(Math.abs(c.weight) / FULL_WEIGHT, 1);
    const signal = Math.abs(c.weight * (b.neurons[c.src]?.activation ?? 0));
    ctx.strokeStyle = c.weight < 0 ? MINUS : PLUS;
    ctx.globalAlpha = 0.1 + 0.3 * size + 0.6 * Math.min(signal / FULL_WEIGHT, 1);
    ctx.lineWidth = 0.5 + 2.5 * size;
    const [x0, y0, x1, y1] = [x(c.src), y(c.src), x(c.dst), y(c.dst)];
    ctx.beginPath();
    if (c.src === c.dst) {
      ctx.arc(x0, y0 - r - 4, 5, 0, TAU); // a loop on one neuron
    } else if (x1 > x0) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    } else {
      // Inside a column, or backwards: a bow, to the other side for the other direction.
      const length = Math.hypot(x1 - x0, y1 - y0) || 1;
      const bow = Math.min(28, length / 2) / length;
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        (x0 + x1) / 2 - (y1 - y0) * bow,
        (y0 + y1) / 2 + (x1 - x0) * bow,
        x1,
        y1,
      );
    }
    ctx.stroke();
  }

  // Neurons. The fill is brighter the larger the activation, in the colour of its sign. A quiet
  // neuron is a faint ring.
  b.neurons.forEach((n, i) => {
    const size = Math.min(Math.abs(n.activation), 1);
    const colour = n.activation < 0 ? MINUS : PLUS;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x(i), y(i), r, 0, TAU);
    ctx.fillStyle = WATER;
    ctx.fill();
    if (!quiet(i)) {
      ctx.globalAlpha = size;
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 10 * size;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = quiet(i) ? 0.7 : 0.45 + 0.55 * size;
    ctx.strokeStyle = quiet(i) ? EDGE : INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // The labels of the inputs: the group, a line down its inputs, and each input where there is room.
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.strokeStyle = EDGE;
  const names = groupNames(groups);
  groups.forEach((g, k) => {
    const top = y(g.first);
    const bottom = y(g.first + g.count - 1);
    ctx.globalAlpha = 0.95;
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(names[k] ?? '', 0, (top + bottom) / 2);
    ctx.beginPath();
    ctx.moveTo(44.5, top - r);
    ctx.lineTo(44.5, bottom + r);
    ctx.stroke();
    if (pitch < LABEL_PITCH) return;
    ctx.textAlign = 'right';
    ctx.font = '10px system-ui, sans-serif';
    for (let i = g.first; i < g.first + g.count; i++) {
      const n = b.neurons[i];
      if (!n) continue;
      ctx.globalAlpha = quiet(i) ? 0.45 : 0.85;
      ctx.fillText(inputName(n, g), LEFT - r - 6, y(i));
    }
  });

  // The outputs: a name and a gauge each. The dot is what the brain wants. The ring is what the
  // player does, on the outputs that the player's hands hold.
  for (let i = b.inputs + b.hidden; i < b.neurons.length; i++) {
    const n = b.neurons[i];
    if (!n) continue;
    const out = outputOf(n.port);
    const from = x(i) + r + 14;
    const to = w - 8;
    const mid = y(i);
    // A value of -1 to 1 as a place on the gauge. A gauge from zero has its 0 at the left end.
    const at = (v: number): number => {
      const t = out.fromZero ? Math.max(v, 0) : (v + 1) / 2;
      return from + Math.min(Math.max(t, 0), 1) * (to - from);
    };
    ctx.globalAlpha = 0.95;
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(out.name, from, mid - 13);
    ctx.globalAlpha = 0.6;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(out.low, from, mid + 15);
    ctx.textAlign = 'right';
    ctx.fillText(out.high, to, mid + 15);
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from, mid);
    ctx.lineTo(to, mid);
    if (!out.fromZero) {
      ctx.moveTo((from + to) / 2, mid - 4);
      ctx.lineTo((from + to) / 2, mid + 4);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(at(n.activation), mid, 4, 0, TAU);
    ctx.fill();
    const hand = n.port === 128 ? hands.thrust : n.port === 129 ? hands.turn : null;
    if (b.manual && hand !== null) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.arc(at(hand), mid, 7, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The styles of the panel and of its button. `App` renders them once. */
export const BRAIN_CSS = `
.corner { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
.corner .leave { position: static; }
.brain-toggle[aria-pressed='true'] { border-color: ${INK}; background: #12384d; }
.brain {
  position: fixed; top: 68px; right: 12px; box-sizing: border-box;
  width: min(26rem, calc(100% - 24px)); padding: 10px 14px 12px;
  border: 1px solid ${EDGE}; border-radius: 12px; background: rgb(4 18 28 / 0.9);
  font-size: 13px; line-height: 1.4; pointer-events: auto;
}
.brain header { display: flex; align-items: center; gap: 10px; }
.brain h2 { margin: 0; font-size: 16px; font-weight: 600; }
.brain-count { flex: 1; font-size: 12px; opacity: 0.7; }
.brain-close {
  width: 32px; height: 32px; margin-left: auto; border: 0; border-radius: 8px; background: none;
  color: inherit; font: inherit; font-size: 20px; line-height: 1; cursor: pointer;
}
.brain-close:hover { background: #12384d; }
.brain-close:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
.brain p { margin: 4px 0 0; }
.brain canvas { display: block; width: 100%; height: clamp(200px, 40vh, 320px); margin-top: 6px; }
.brain-state { padding: 28px 8px 32px; font-size: 15px; text-align: center; }
.brain-state small { display: block; margin-top: 6px; font-size: 12px; opacity: 0.7; overflow-wrap: anywhere; }
.brain-mode { font-weight: 600; }
.brain-mode span, .brain-key { font-size: 12px; font-weight: 400; opacity: 0.75; }
.brain i { display: inline-block; box-sizing: border-box; margin: 0 5px 0 10px; vertical-align: middle; }
.brain i:first-child { margin-left: 0; }
.brain .wire { width: 14px; height: 3px; border-radius: 2px; }
.brain .dot { width: 8px; height: 8px; border-radius: 50%; background: ${INK}; }
.brain .ring { width: 13px; height: 13px; border: 2px solid #fff; border-radius: 50%; }
.brain .quiet { width: 10px; height: 10px; border: 1px solid ${EDGE}; border-radius: 50%; }
@media (max-width: 40rem) {
  .brain {
    top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 46%; overflow-y: auto;
    border-width: 1px 0 0; border-radius: 12px 12px 0 0;
  }
  .brain canvas { height: clamp(140px, 24vh, 200px); }
  .brain-close { width: 44px; height: 44px; margin-block: -6px; }
  #ui:has(.brain) { --foot: 60%; }
}
@media (prefers-reduced-motion: no-preference) {
  .brain { animation: brain-in 160ms ease-out; }
  @keyframes brain-in { from { opacity: 0; transform: translateY(8px); } }
}
`;

/** The button that opens and closes the panel. The key B does the same. */
export function BrainToggle(props: { onToggle: () => void }) {
  return (
    // The class `leave` gives it the look of the Leave button beside it.
    <button
      type="button"
      class="leave brain-toggle"
      aria-pressed={brainOpen.value}
      aria-keyshortcuts="B"
      onClick={props.onToggle}
    >
      Brain <kbd>B</kbd>
    </button>
  );
}

export function BrainPanel(props: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The largest size of each activation of the body `uid` since the panel opened.
  const seen = useRef<{ uid: number; peak: number[] }>({ uid: 0, peak: [] });
  const b = brain.value;
  const error = brainError.value;
  const placed = b ? layout(b) : null;

  useEffect(() => {
    if (!canvas.current || !b || !placed) return;
    if (seen.current.uid !== b.uid || seen.current.peak.length !== b.neurons.length) {
      seen.current = { uid: b.uid, peak: b.neurons.map(() => 0) };
    }
    const { peak } = seen.current;
    b.neurons.forEach((n, i) => (peak[i] = Math.max(peak[i] ?? 0, Math.abs(n.activation))));
    draw(canvas.current, b, placed, peak, steer.peek());
  });

  return (
    <section class="brain" aria-label="Brain">
      <header>
        <h2>Brain</h2>
        {b && error === null && (
          <span class="brain-count">
            {b.neurons.length} neurons, {b.connections.length} connections
          </span>
        )}
        <button
          type="button"
          class="brain-close"
          aria-label="Close the brain panel"
          onClick={props.onClose}
        >
          ×
        </button>
      </header>
      {error !== null ? (
        <p class="brain-state" role="alert">
          This brain could not be read.
          <small>{error}</small>
        </p>
      ) : b === null ? (
        <p class="brain-state">Possess a creature to see its brain.</p>
      ) : b && placed ? (
        <>
          <p class="brain-mode" role="status">
            {b.connections.length === 0 ? (
              'This brain has no connections. Its outputs rest.'
            ) : b.manual ? (
              <>
                You steer.{' '}
                <span>
                  <i class="ring" />
                  you
                  <i class="dot" />
                  what the brain wants
                </span>
              </>
            ) : (
              'The brain drives.'
            )}
          </p>
          <canvas ref={canvas} role="img" aria-label={describe(b, placed.groups)} />
          {/* The strongest path in words goes here. */}
          <p class="brain-key">
            <i class="wire" style={{ background: PLUS }} />
            adds
            <i class="wire" style={{ background: MINUS }} />
            takes away
            <i class="quiet" />
            silent so far
          </p>
          <p class="brain-key">All it can do: thrust, turn, and accept a mate. Nothing higher.</p>
        </>
      ) : null}
    </section>
  );
}
