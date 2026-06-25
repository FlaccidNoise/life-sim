/**
 * Settings modal — the organized tuning surface. A centered, dismissable sheet with one tab per knob
 * GROUP (World & food / Creature genes / Selection costs / Economy & evolution / Predation), plus a
 * footer to edit the seed and launch a fresh world. Replaces the old flat #knobs list that lived in the
 * left panel. Pure control surface: every change routes through the same onLive/onReset/onToggle paths,
 * so determinism is untouched.
 */
import { type Config } from '../../core/config';
import { SPECS, TOGGLES, KNOB_GROUPS, type KnobsHandlers, type KnobGroup } from './knobs';

export interface SettingsHandlers extends KnobsHandlers {
  /** Launch a fresh world from `seed` using the current (tuned) config. */
  onLaunch(seed: number): void;
  /** Read the config's current seed (so the footer field reflects reality each open). */
  getSeed: () => number;
}

export class SettingsModal {
  private active: KnobGroup = KNOB_GROUPS[0]!.key;
  private readonly sections = new Map<KnobGroup, HTMLElement>();
  private readonly tabs = new Map<KnobGroup, HTMLButtonElement>();
  private readonly getSeed: () => number;

  constructor(
    private readonly overlay: HTMLElement,
    tabsEl: HTMLElement,
    bodyEl: HTMLElement,
    private readonly seedInput: HTMLInputElement,
    launchBtn: HTMLButtonElement,
    config: Config,
    h: SettingsHandlers,
  ) {
    // ── Tabs ──
    tabsEl.innerHTML = KNOB_GROUPS.map(
      (g) => `<button class="tab" data-group="${g.key}" type="button">${g.label}</button>`,
    ).join('');
    for (const g of KNOB_GROUPS) {
      const tab = tabsEl.querySelector<HTMLButtonElement>(`[data-group="${g.key}"]`)!;
      this.tabs.set(g.key, tab);
      tab.addEventListener('click', () => this.show(g.key));
    }

    // ── One section per group: hint + its toggles + its sliders ──
    const sliderHtml = (s: (typeof SPECS)[number]): string => `
      <div class="knob" data-key="${s.key}">
        <div class="knob-head">
          <span class="lbl">${s.label}${s.live ? '' : ' *'}</span><span class="knob-val"></span>
        </div>
        <input class="slider" type="range" min="${s.min}" max="${s.max}" step="${s.step}"
               value="${config[s.key] as number}" />
      </div>`;
    const toggleHtml = (t: (typeof TOGGLES)[number]): string => `
      <label class="knob toggle" data-key="${t.key}">
        <input class="check" type="checkbox" ${config[t.key] ? 'checked' : ''} />
        <span class="lbl">${t.label}</span>
      </label>`;

    bodyEl.innerHTML = KNOB_GROUPS.map((g) => {
      const toggles = TOGGLES.filter((t) => t.group === g.key).map(toggleHtml).join('');
      const sliders = SPECS.filter((s) => s.group === g.key).map(sliderHtml).join('');
      return `<section data-group="${g.key}" hidden>
        <div class="group-hint">${g.hint}</div>${toggles}${sliders}
      </section>`;
    }).join('');
    for (const g of KNOB_GROUPS) {
      this.sections.set(g.key, bodyEl.querySelector<HTMLElement>(`section[data-group="${g.key}"]`)!);
    }

    // ── Wire sliders + toggles (same routing the old Knobs used) ──
    for (const s of SPECS) {
      const wrap = bodyEl.querySelector<HTMLElement>(`.knob[data-key="${s.key}"]`)!;
      const slider = wrap.querySelector<HTMLInputElement>('.slider')!;
      const val = wrap.querySelector<HTMLElement>('.knob-val')!;
      const show = (v: number): string => (s.step < 1 ? v.toFixed(3) : String(v));
      val.textContent = show(config[s.key] as number);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        val.textContent = show(v);
        if (s.live) h.onLive(s.key, v);
        else h.onReset(s.key, v);
      });
    }
    for (const t of TOGGLES) {
      const wrap = bodyEl.querySelector<HTMLElement>(`.toggle[data-key="${t.key}"]`)!;
      const check = wrap.querySelector<HTMLInputElement>('.check')!;
      check.addEventListener('change', () => h.onToggle(t.key, check.checked));
    }

    // ── Footer: seed + launch ──
    launchBtn.addEventListener('click', () => {
      h.onLaunch(Number(this.seedInput.value));
      this.setOpen(false); // launched — drop the curtain so the new world is visible
    });

    // ── Close affordances: ✕, backdrop click, Escape ──
    overlay.querySelector<HTMLButtonElement>('[data-close="settings"]')!.addEventListener('click', () =>
      this.setOpen(false),
    );
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.setOpen(false); // click outside the .modal card
    });
    globalThis.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.setOpen(false);
    });

    this.getSeed = h.getSeed;
    this.show(this.active);
  }

  private show(group: KnobGroup): void {
    this.active = group;
    for (const [key, sec] of this.sections) sec.hidden = key !== group;
    for (const [key, tab] of this.tabs) tab.classList.toggle('active', key === group);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  setOpen(open: boolean): void {
    if (open) this.seedInput.value = String(this.getSeed()); // reflect the live seed on each open
    this.overlay.hidden = !open;
  }
}
