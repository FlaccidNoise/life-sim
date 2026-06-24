/**
 * Family-tree modal — a closeable overlay (mirrors legend.ts's panel idiom) showing the selected
 * creature's ancestor spine to its founder (selected highlighted), its direct children, and dynasty
 * counts. Reads the Lineage recorder (which persists past a creature's death), so a dead creature's
 * tree still renders. Live rows are clickable to re-inspect (onPick re-roots the whole shell).
 */
import { rgbCss, lineageColor, dietShape } from '../../render/palette';
import { Lineage, type LineageRow, type LineageView, type LineageStore } from './lineage';

const GLYPH = ['●', '◆', '▲']; // herbivore / omnivore / predator — indexed by dietShape()

export class LineageModal {
  private slot = -1;
  private gen = 0;
  private open = false;

  constructor(
    private readonly panel: HTMLElement,
    private readonly lineage: Lineage,
    private readonly onPick: (slot: number, gen: number) => void,
  ) {
    this.setOpen(false);
    // One delegated click handler: ✕ closes; a live row re-inspects.
    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.ln-x')) {
        this.setOpen(false);
        return;
      }
      const row = target.closest('.ln-row') as HTMLElement | null;
      if (row && row.dataset.alive === '1') {
        this.onPick(Number(row.dataset.slot), Number(row.dataset.gen));
      }
    });
  }

  select(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.style.display = open ? 'block' : 'none';
  }

  /** Re-render from the recorder. Called each frame while open (cheap: a Map lookup + chain walk). */
  render(store: LineageStore): void {
    if (!this.open) return;
    if (this.slot < 0) {
      this.panel.innerHTML = this.shell(
        `<div class="muted">no lineage yet — click a creature, then press <b>t</b></div>`,
      );
      return;
    }
    const view = this.lineage.queryBySlot(this.slot, this.gen, store);
    if (view === null) {
      this.panel.innerHTML = this.shell(
        `<div class="muted">no lineage for this creature (try after a step)</div>`,
      );
      return;
    }
    this.panel.innerHTML = this.shell(this.body(view));
  }

  private shell(inner: string): string {
    return (
      `<div class="ln-head"><span>family tree</span>` +
      `<button class="ln-x" title="close">✕</button></div>${inner}`
    );
  }

  private rowHtml(r: LineageRow, selected: boolean): string {
    const swatch = rgbCss(lineageColor(r.hue));
    const glyph = GLYPH[dietShape(r.diet)];
    const dead = r.alive ? '' : ` <span class="ln-dead">✝</span>`;
    const cls = `ln-row${selected ? ' ln-sel' : ''}${r.alive ? ' ln-live' : ''}`;
    return (
      `<div class="${cls}" data-slot="${r.slot}" data-gen="${r.genId}" data-alive="${r.alive ? 1 : 0}">` +
      `<span class="ln-sw" style="background:${swatch}"></span>` +
      `<span class="ln-gl">${glyph}</span>` +
      `<span class="ln-id">#${r.slot}</span>` +
      `<span class="ln-gen">gen ${r.generation}</span>` +
      `<span class="ln-bt">t${r.birthTick}</span>${dead}</div>`
    );
  }

  private body(view: LineageView): string {
    const spine = view.ancestors
      .map((r, i) => {
        const connector = i < view.ancestors.length - 1 ? `<div class="ln-conn">│</div>` : '';
        return this.rowHtml(r, r.key === view.selectedKey) + connector;
      })
      .join('');
    const childRows =
      view.children.length > 0
        ? view.children.map((r) => this.rowHtml(r, false)).join('')
        : `<div class="muted">no children yet</div>`;
    const pruned =
      view.prunedLeaves > 0
        ? `<div class="ln-foot muted">… ${view.prunedLeaves} old dead leaves pruned (counts still exact)</div>`
        : '';
    const orphans =
      view.orphanBirths > 0
        ? `<div class="ln-foot muted">⚠ ${view.orphanBirths} orphan birth(s) — parent not in forest</div>`
        : '';
    return (
      `<div class="ln-sec muted">ANCESTRY · founder → selected</div>${spine}` +
      `<div class="ln-sec">CHILDREN (${view.directChildren}) · dynasty ${view.dynasty}</div>${childRows}` +
      `<div class="ln-foot muted">founder ${view.founderKey} · click a live node to inspect</div>${pruned}${orphans}`
    );
  }
}
