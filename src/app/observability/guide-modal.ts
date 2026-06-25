/**
 * Guide modal — the tutorial / controls reference. Absorbs the keyboard-help blob that used to clutter
 * the left panel, restyled into a clean key-grid. Static content; opened from the ❔ guide button.
 * Keep the key list in sync with main.ts's keydown handler.
 */
export class GuideModal {
  constructor(
    private readonly overlay: HTMLElement,
    bodyEl: HTMLElement,
  ) {
    bodyEl.innerHTML = `
      <p class="guide-lead">
        Evolving swimmers in fertility pockets across a huge ocean. Each dot is one creature with an
        evolvable brain and genome; click any of them to inspect it on the left, and watch the whole
        population on the right.
      </p>

      <div class="guide-sec">
        <h3>navigate</h3>
        <div class="key-grid">
          <span class="muted">scroll</span><span>zoom in / out around the cursor</span>
          <span class="muted">drag</span><span>pan the camera</span>
          <span class="muted">click</span><span>inspect the nearest creature</span>
        </div>
      </div>

      <div class="guide-sec">
        <h3>keys</h3>
        <div class="key-grid">
          <span><kbd>f</kbd> / <kbd>⇧f</kbd></span><span>cycle the food / scent overlay layer (⇧ = backward)</span>
          <span><kbd>c</kbd></span><span>cycle dot color mode (lineage → diet → energy → forage)</span>
          <span><kbd>w</kbd></span><span>toggle the wall / biome layer</span>
          <span><kbd>v</kbd></span><span>toggle flow-current arrows</span>
          <span><kbd>o</kbd></span><span>toggle the selected creature's debug overlay + trail</span>
          <span><kbd>g</kbd></span><span>toggle bioluminescence glow</span>
          <span><kbd>l</kbd></span><span>follow + record the selected creature (⤓ csv to export)</span>
          <span><kbd>t</kbd></span><span>open the family tree of the selection</span>
        </div>
        <p class="muted" style="margin-top: 10px">
          The same view toggles are clickable as chips along the bottom of the screen.
        </p>
      </div>

      <div class="guide-sec">
        <h3>reading the dots</h3>
        <div class="key-grid">
          <span class="muted">shape</span><span>trophic role — ○ herbivore · ◇ omnivore · △ predator</span>
          <span class="muted">color</span><span>the active color mode (open the legend pill, bottom-centre)</span>
          <span class="muted">brightness</span><span>speed — dim idle, bright active</span>
          <span class="muted">size</span><span>body radius (the SIZE gene)</span>
        </div>
      </div>`;

    overlay.querySelector<HTMLButtonElement>('[data-close="guide"]')!.addEventListener('click', () =>
      this.setOpen(false),
    );
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.setOpen(false);
    });
    globalThis.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.setOpen(false);
    });
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  setOpen(open: boolean): void {
    this.overlay.hidden = !open;
  }
}
