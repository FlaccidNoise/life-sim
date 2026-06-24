/**
 * View chips — the bottom-centre cluster of clickable render/overlay toggles (food layer, color mode,
 * flow, walls, overlay, glow). These surface the keyboard-only view controls that used to be documented
 * in the removed help blob. State is owned by main.ts; the chips call back on click and main.ts pushes
 * the current state via update() so a chip and its keyboard shortcut never disagree.
 */
export interface ViewChipsState {
  food: string; // display name of the active food/scent layer
  foodOn: boolean; // false when the layer is OFF
  color: string; // display name of the active dot color mode
  flow: boolean;
  walls: boolean;
  overlay: boolean;
  glow: boolean;
}

export interface ViewChipsHandlers {
  onFood: () => void;
  onColor: () => void;
  onFlow: () => void;
  onWalls: () => void;
  onOverlay: () => void;
  onGlow: () => void;
}

export class ViewChips {
  private readonly v = new Map<string, HTMLElement>(); // value spans for food/color
  private readonly chip = new Map<string, HTMLButtonElement>();

  constructor(root: HTMLElement, h: ViewChipsHandlers) {
    root.innerHTML = `
      <button class="chip" data-c="food" type="button" title="cycle food / scent overlay (f · ⇧f back)">🍃 <span class="chip-v" data-v="food"></span></button>
      <button class="chip" data-c="color" type="button" title="cycle dot color mode (c)">🎨 <span class="chip-v" data-v="color"></span></button>
      <button class="chip" data-c="flow" type="button" title="flow current arrows (v)">≈ flow</button>
      <button class="chip" data-c="walls" type="button" title="wall / biome layer (w)">▦ walls</button>
      <button class="chip" data-c="overlay" type="button" title="selected-creature overlay + trail (o)">◎ overlay</button>
      <button class="chip" data-c="glow" type="button" title="bioluminescence (g)">✦ glow</button>`;

    const bind = (c: string, fn: () => void): void => {
      const btn = root.querySelector<HTMLButtonElement>(`[data-c="${c}"]`)!;
      this.chip.set(c, btn);
      btn.addEventListener('click', fn);
    };
    bind('food', h.onFood);
    bind('color', h.onColor);
    bind('flow', h.onFlow);
    bind('walls', h.onWalls);
    bind('overlay', h.onOverlay);
    bind('glow', h.onGlow);
    for (const span of root.querySelectorAll<HTMLElement>('.chip-v'))
      this.v.set(span.dataset.v!, span);
  }

  update(s: ViewChipsState): void {
    this.v.get('food')!.textContent = `food: ${s.food}`;
    this.v.get('color')!.textContent = `color: ${s.color}`;
    this.chip.get('food')!.classList.toggle('active', s.foodOn);
    this.chip.get('flow')!.classList.toggle('active', s.flow);
    this.chip.get('walls')!.classList.toggle('active', s.walls);
    this.chip.get('overlay')!.classList.toggle('active', s.overlay);
    this.chip.get('glow')!.classList.toggle('active', s.glow);
  }
}
