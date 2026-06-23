/**
 * Floating dot legend — explains the four channels stacked on every creature dot. It used to sit at
 * the top of the right panel, pushing the population/distributions/brain/inspector data below the
 * fold; now it floats bottom-left over the canvas (beside the dots it describes) and is closeable
 * (✕ → a small reopen pill). It's the ONE place that names the encoding, and it updates live with the
 * color-by mode ('c'): shape is always trophic role, but color means lineage / diet / energy depending
 * on the mode, so the color row + swatch re-render on setColorMode.
 */
import { ColorMode } from '../../render/renderer';
import {
  lineageColor,
  dietColor,
  energyColor,
  rgbCss,
  hsv2rgb,
  CHANNEL_HUE,
  type RGB,
} from '../../render/palette';

/** A horizontal CSS gradient sampled from a palette ramp (lo→hi across the bar). */
function rampGradient(sample: (t: number) => RGB, stops = 12): string {
  const parts: string[] = [];
  for (let i = 0; i < stops; i++) parts.push(rgbCss(sample(i / (stops - 1))));
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** A hard-edged categorical bar (no blending) from a list of swatch colors — for the forage mode,
 *  where the channels are distinct categories (A/B/C specialist + generalist grey), not a ramp. */
function categoricalBar(colors: RGB[]): string {
  const n = colors.length;
  const parts = colors.map((c, i) => `${rgbCss(c)} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Vivid 0..255 RGB for a forage specialist swatch (matches the dot shader's hsv2rgb(hue,0.85,0.95)). */
const specialist = (ch: number): RGB => hsv2rgb(CHANNEL_HUE[ch] ?? 0.33, 0.85, 0.95);

const COLOR_INFO: Record<ColorMode, { label: string; ramp: string }> = {
  [ColorMode.LINEAGE]: { label: 'lineage · kin identity', ramp: rampGradient(lineageColor) },
  [ColorMode.DIET]: { label: 'diet · herbivore→predator', ramp: rampGradient(dietColor) },
  [ColorMode.ENERGY]: { label: 'energy · starving→satiated', ramp: rampGradient(energyColor) },
  [ColorMode.FORAGE]: {
    label: 'forage · A/B/C specialist · grey generalist',
    ramp: categoricalBar([
      specialist(0),
      specialist(1),
      specialist(2),
      [115, 115, 115], // generalist grey (matches the shader's vec3(0.45))
    ]),
  },
};

export class Legend {
  private readonly colorLabel: HTMLElement;
  private readonly colorBar: HTMLElement;
  // The saturation/brightness rows are only honest in lineage/diet modes — energy mode fixes both in
  // the shader — so they're dimmed/struck when they don't apply (kept refs to toggle live).
  private readonly satRow: HTMLElement;
  private readonly valRow: HTMLElement;

  constructor(
    private readonly panel: HTMLElement,
    private readonly pill: HTMLElement,
  ) {
    panel.innerHTML = `
      <div class="lg-head"><span>legend</span><button class="lg-x" title="hide legend">✕</button></div>
      <div class="lg-row"><b>shape</b> = role
        <span class="lg-gl">●</span> herbivore
        <span class="lg-gl">◆</span> omnivore
        <span class="lg-gl lg-tri">▲</span> predator</div>
      <div class="lg-row"><b>color</b> = <span class="lg-cl"></span><div class="lg-bar lg-cbar"></div></div>
      <div class="lg-row lg-satrow"><b>saturation</b> = vision <span class="muted">(grey blind → vivid sharp)</span>
        <div class="lg-bar lg-satbar"></div></div>
      <div class="lg-row lg-valrow"><b>brightness</b> = speed <span class="muted">(dim idle → bright active)</span>
        <div class="lg-bar lg-valbar"></div></div>
      <div class="lg-row"><b>size</b> = body radius</div>
      <div class="lg-row muted">press <b>c</b> to change color</div>`;
    this.colorLabel = panel.querySelector('.lg-cl') as HTMLElement;
    this.colorBar = panel.querySelector('.lg-cbar') as HTMLElement;
    this.satRow = panel.querySelector('.lg-satrow') as HTMLElement;
    this.valRow = panel.querySelector('.lg-valrow') as HTMLElement;
    (panel.querySelector('.lg-x') as HTMLElement).addEventListener('click', () =>
      this.setOpen(false),
    );
    pill.addEventListener('click', () => this.setOpen(true));
    this.setColorMode(ColorMode.LINEAGE);
    this.setOpen(true);
  }

  setColorMode(mode: ColorMode): void {
    const info = COLOR_INFO[mode];
    this.colorLabel.textContent = info.label;
    this.colorBar.style.background = info.ramp;
    // In energy + forage modes the shader fixes saturation + brightness, so vision/speed aren't
    // encoded — strike those rows so the legend never claims an encoding the dots don't show.
    const na = mode === ColorMode.ENERGY || mode === ColorMode.FORAGE;
    this.satRow.classList.toggle('lg-na', na);
    this.valRow.classList.toggle('lg-na', na);
  }

  private setOpen(open: boolean): void {
    // The pill's stylesheet default is display:none, so '' would fall back to hidden — set an
    // explicit visible value when closed.
    this.panel.style.display = open ? 'block' : 'none';
    this.pill.style.display = open ? 'none' : 'inline-block';
  }
}
