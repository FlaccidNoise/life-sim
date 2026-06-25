/**
 * Top transport bar — play / pause / step, speed, and the live status read-out. This is the
 * frequently-touched "time" surface, pulled out of the old left panel into a centered top bar.
 * Speed is ticks-per-frame (the sim never reads wall-clock, so this scales WORK, not a time delta —
 * determinism is preserved). Seed entry + "launch new world" live in the settings modal, not here.
 */
export interface ControlsHandlers {
  onPlayToggle(): void;
  onStep(): void;
  onSpeed(ticksPerFrame: number): void;
}

export class Controls {
  private readonly playBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly perf: HTMLElement;

  constructor(root: HTMLElement, h: ControlsHandlers) {
    root.innerHTML = `
      <button data-act="play" class="btn">▶ play</button>
      <button data-act="step" class="btn">⏭ step</button>
      <label class="lbl">speed</label>
      <select data-act="speed" class="num">
        <option value="0.125">0.125×</option>
        <option value="0.25">0.25×</option>
        <option value="0.5">0.5×</option>
        <option value="1" selected>1×</option>
        <option value="4">4×</option>
        <option value="16">16×</option>
        <option value="64">64×</option>
      </select>
      <div class="tb-sep"></div>
      <div class="tb-stat">
        <span data-act="status">tick 0 · 0 tps · pop 0</span>
        <span data-act="perf" class="tb-perf"></span>
      </div>`;

    const q = <T extends HTMLElement>(sel: string): T => {
      const e = root.querySelector<T>(sel);
      if (!e) throw new Error(`controls: missing ${sel}`);
      return e;
    };
    this.playBtn = q<HTMLButtonElement>('[data-act="play"]');
    this.status = q('[data-act="status"]');
    this.perf = q('[data-act="perf"]');

    this.playBtn.addEventListener('click', () => h.onPlayToggle());
    q<HTMLButtonElement>('[data-act="step"]').addEventListener('click', () => h.onStep());
    q<HTMLSelectElement>('[data-act="speed"]').addEventListener('change', (e) =>
      h.onSpeed(Number((e.target as HTMLSelectElement).value)),
    );
  }

  setRunning(running: boolean): void {
    this.playBtn.textContent = running ? '⏸ pause' : '▶ play';
    this.playBtn.classList.toggle('active', running);
  }

  setStatus(tick: number, tps: number, population: number, hash: string): void {
    this.status.textContent = `tick ${tick} · ${tps.toFixed(0)} tps · pop ${population} · #${hash}`;
  }

  /** Performance readout: cost per tick + the hash occupancy that drives neighbor-scan cost. */
  setPerf(
    msPerTick: number,
    stepsPerFrame: number,
    hash: { occupied: number; buckets: number; maxBucket: number },
  ): void {
    const occPct = ((100 * hash.occupied) / hash.buckets).toFixed(0);
    this.perf.textContent =
      `${msPerTick.toFixed(2)} ms/tick · ${stepsPerFrame}/frame · ` +
      `hash ${occPct}% · max ${hash.maxBucket}`;
  }
}
