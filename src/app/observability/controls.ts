/**
 * Control bar — play / pause / step / reset, seed field, speed. The seed field + reset make the
 * determinism contract tangible: type a seed, reset, get the same run. Speed is ticks-per-frame (the
 * sim never reads wall-clock, so this scales work, not a time delta — determinism is preserved).
 */
export interface ControlsHandlers {
  onPlayToggle(): void;
  onStep(): void;
  onReset(seed: number): void;
  onSpeed(ticksPerFrame: number): void;
  onDumpCsv(): void;
}

export class Controls {
  private readonly seedInput: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly perf: HTMLElement;
  private readonly follow: HTMLElement;

  constructor(root: HTMLElement, initialSeed: number, h: ControlsHandlers) {
    root.innerHTML = `
      <div class="ctl-row">
        <button data-act="play" class="btn">▶ play</button>
        <button data-act="step" class="btn">⏭ step</button>
        <button data-act="reset" class="btn">↺ reset</button>
        <button data-act="dump" class="btn" title="download the followed creature's per-tick CSV">⤓ csv</button>
      </div>
      <div class="ctl-row">
        <label class="lbl">seed</label>
        <input data-act="seed" class="num" type="number" value="${initialSeed}" />
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
      </div>
      <div data-act="status" class="status muted"></div>
      <div data-act="perf" class="status muted"></div>
      <div data-act="follow" class="status muted"></div>`;

    const q = <T extends HTMLElement>(sel: string): T => {
      const e = root.querySelector<T>(sel);
      if (!e) throw new Error(`controls: missing ${sel}`);
      return e;
    };
    this.playBtn = q<HTMLButtonElement>('[data-act="play"]');
    this.seedInput = q<HTMLInputElement>('[data-act="seed"]');
    this.status = q('[data-act="status"]');
    this.perf = q('[data-act="perf"]');
    this.follow = q('[data-act="follow"]');

    this.playBtn.addEventListener('click', () => h.onPlayToggle());
    q<HTMLButtonElement>('[data-act="step"]').addEventListener('click', () => h.onStep());
    q<HTMLButtonElement>('[data-act="reset"]').addEventListener('click', () =>
      h.onReset(Number(this.seedInput.value)),
    );
    q<HTMLSelectElement>('[data-act="speed"]').addEventListener('change', (e) =>
      h.onSpeed(Number((e.target as HTMLSelectElement).value)),
    );
    q<HTMLButtonElement>('[data-act="dump"]').addEventListener('click', () => h.onDumpCsv());
  }

  get seed(): number {
    return Number(this.seedInput.value);
  }

  setRunning(running: boolean): void {
    this.playBtn.textContent = running ? '⏸ pause' : '▶ play';
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
    const occPct = ((100 * hash.occupied) / hash.buckets).toFixed(1);
    this.perf.textContent =
      `${msPerTick.toFixed(2)} ms/tick · ${stepsPerFrame}/frame · ` +
      `hash ${hash.occupied}/${hash.buckets} (${occPct}%) · max bucket ${hash.maxBucket}`;
  }

  /** Follow-cam status line: which creature is locked, alive/dead, + how many ticks were recorded. */
  setFollow(slot: number, ticks: number, alive: boolean): void {
    this.follow.textContent =
      slot < 0
        ? `'l' = follow + record selected`
        : alive
          ? `🔒 following #${slot} · ${ticks} ticks recorded`
          : `† #${slot} died · ${ticks} ticks recorded (⤓ csv, or 'l' to release)`;
  }
}
