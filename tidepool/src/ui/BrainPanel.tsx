// The brain panel: a live graph of the brain of the body the player is in. Inputs on the left under
// the part that owns them, hidden neurons between, outputs on the right. The error state and the
// two empty states come before the graph.

import { useEffect, useRef } from 'preact/hooks';
import { KIND_CHEMO, KIND_EYE, type BrainView } from '../protocol';
import { KIND_MATE, layout, type Group, type Placed } from './brain/layout';
import { inputLabel, pickPath } from './brain/words';
import { Note, NoteMark } from './Note';
import { brain, brainError, brainOpen, changesShown, pulse, steer, wiringChanged } from './state';
import { NO_CHANGE } from './words/lines';

const TAU = 2 * Math.PI;
const INK = '#cfe6ee';
const EDGE = '#3b6377';
const WATER = '#04121c';
const PLUS = '#7fd1a8';
const MINUS = '#f0b27a';
const QUIET = 0.02; // a neuron whose activation has stayed under this is drawn dim
const PATH_WIDTH = 4; // of the strongest path
const FULL_WEIGHT = 2; // a connection of this weight has the full width
const LEFT = 108; // CSS pixels left of the input column, for the labels
const RIGHT = 96; // right of the output column, for the gauges
const PAD = 10; // above and below the columns
const LABEL_PITCH = 11; // inputs closer than this get no label of their own

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
 * Draws the brain. `peak` is the largest size of each activation since the panel opened. `path` is
 * the strongest path, drawn bold. `hands` is what the player asks for, drawn only while the player
 * steers.
 */
function draw(
  canvas: HTMLCanvasElement,
  b: BrainView,
  placed: { nodes: Placed[]; groups: Group[] },
  peak: number[],
  path: number[],
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

  // The line of a connection: a loop on one neuron, a straight line between columns, or, inside a
  // column or backwards, a bow to the other side for the other direction.
  const trace = (src: number, dst: number): void => {
    const [x0, y0, x1, y1] = [x(src), y(src), x(dst), y(dst)];
    ctx.beginPath();
    if (src === dst) {
      ctx.arc(x0, y0 - r - 4, 5, 0, TAU);
    } else if (x1 > x0) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    } else {
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
  };

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
    trace(c.src, c.dst);
    ctx.stroke();
  }

  // The strongest path, bold, over the rest: a dark edge under the colour of the sign of each wire.
  for (let k = 1; k < path.length; k++) {
    const [src, dst] = [path[k - 1] ?? 0, path[k] ?? 0];
    const wire = b.connections.find((c) => c.src === src && c.dst === dst);
    if (!wire) continue;
    trace(src, dst);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = WATER;
    ctx.lineWidth = PATH_WIDTH + 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = wire.weight < 0 ? MINUS : PLUS;
    ctx.lineWidth = PATH_WIDTH;
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
      ctx.globalAlpha = quiet(i) ? 0.45 : 0.85;
      ctx.fillText(inputLabel(b, i), LEFT - r - 6, y(i));
    }
  });

  // The outputs: a name and a gauge each. The dot is what the brain asks for. The ring is what the
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

/** The button that opens and closes the panel. The key B does the same. */
export function BrainToggle(props: { onToggle: () => void }) {
  return (
    // The class `leave` gives it the look of the Leave button beside it.
    <button
      type="button"
      class={pulse.value === 'brain' ? 'leave brain-toggle pulse' : 'leave brain-toggle'}
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
  // The path on show, kept by the body: it stays until another is clearly stronger.
  const shown = useRef<{ uid: number; nodes: number[] | null }>({ uid: 0, nodes: null });
  const b = brain.value;
  const error = brainError.value;
  const placed = b ? layout(b) : null;
  if (b && shown.current.uid !== b.uid) shown.current = { uid: b.uid, nodes: null };
  const path = b ? pickPath(b, shown.current.nodes) : null;
  shown.current.nodes = path?.nodes ?? null;

  useEffect(() => {
    if (!canvas.current || !b || !placed) return;
    if (seen.current.uid !== b.uid || seen.current.peak.length !== b.neurons.length) {
      seen.current = { uid: b.uid, peak: b.neurons.map(() => 0) };
    }
    const { peak } = seen.current;
    b.neurons.forEach((n, i) => (peak[i] = Math.max(peak[i] ?? 0, Math.abs(n.activation))));
    draw(canvas.current, b, placed, peak, path?.nodes ?? [], steer.peek());
  });

  return (
    <section class="brain" aria-label="Brain">
      <header>
        <h2>Brain</h2>
        <NoteMark id="brain" />
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
      <Note id="brain" />
      {error !== null ? (
        <div class="brain-state" role="alert">
          <p>This brain could not be read. Close the panel and open it again.</p>
          <details>
            <summary>Details</summary>
            <small>{error}</small>
          </details>
        </div>
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
                  what the brain asks for
                </span>
              </>
            ) : (
              'The brain drives.'
            )}
          </p>
          <canvas ref={canvas} role="img" aria-label={describe(b, placed.groups)} />
          {b.connections.length > 0 && (
            <p class="brain-path">{path ? path.text : 'Nothing drives this body strongly now.'}</p>
          )}
          {/* Beat 7 of the walkthrough. The count is of the live readouts: above 0 is a bug. */}
          {changesShown.value && (
            <>
              <p class="brain-changes">
                {NO_CHANGE} <b>{wiringChanged.value}</b> <NoteMark id="wiring" />
              </p>
              <Note id="wiring" />
            </>
          )}
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
