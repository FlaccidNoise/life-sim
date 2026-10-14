// The notes and the field guide: docs/plans/2026-10-13-walkthrough.md, Task W3. The words are in
// src/ui/words/notes.ts and src/ui/words/guide.ts, and this file holds them to the code that they
// describe.

import { readFileSync } from 'node:fs';
import type { ComponentChild, VNode } from 'preact';
import { beforeEach, expect, test } from 'vitest';
import { Note, NoteMark } from '../src/ui/Note';
import {
  brainOpen,
  changesShown,
  closeGuide,
  death,
  guideAt,
  mode,
  noteOpen,
  openGuide,
} from '../src/ui/state';
import {
  CHANCES,
  CHAPTERS,
  FACTS,
  GLOSSARY,
  GUIDE_UI,
  fill,
  type EntryId,
} from '../src/ui/words/guide';
import { NOTE, NOTE_UI, type NoteId } from '../src/ui/words/notes';
import { createSim } from '../src/worker/wasm';

const text = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const rust = (file: string): string => text(`../crates/sim/src/${file}`);

const NOTE_IDS = Object.keys(NOTE) as NoteId[];
const NOTE_TEXTS = NOTE_IDS.map((id) => NOTE[id].text);
const CHAPTER_TEXTS = CHAPTERS.map((chapter) => chapter.text.join(' '));
const GLOSSARY_TEXTS = GLOSSARY.map((entry) => entry.means);

// A vnode tree with each function component called. The components of src/ui/Note.tsx hold no
// hook, so a call outside a render gives what a render would.
function flat(node: ComponentChild): VNode<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(flat);
  if (typeof node !== 'object' || node === null || !('props' in node)) return [];
  const vnode = node as VNode<Record<string, unknown>>;
  if (typeof vnode.type === 'function') {
    const component = vnode.type as (props: Record<string, unknown>) => ComponentChild;
    return flat(component(vnode.props));
  }
  return [vnode, ...flat(vnode.props.children as ComponentChild)];
}

// The words on the screen under a node.
function wordsIn(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map(wordsIn).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null || !('props' in node)) return '';
  return wordsIn((node as VNode<Record<string, unknown>>).props.children as ComponentChild);
}

const click = (vnode: VNode<Record<string, unknown>> | undefined): void => {
  expect(vnode?.type).toBe('button');
  (vnode?.props.onClick as () => void)();
};

// The page as it is when the thing that a note is on is up.
function show(id: NoteId | null): void {
  mode.value = id === 'death' || id === null ? 'watch' : 'play';
  death.value = id === 'death' ? { cause: 'starved', heirs: [], first: true } : null;
  brainOpen.value = id === 'brain' || id === 'wiring';
  changesShown.value = id === 'wiring';
}

beforeEach(() => {
  show(null);
  noteOpen.value = null;
  closeGuide();
});

test('there is one note for each thing that the plan gives a mark', () => {
  expect(NOTE_IDS).toEqual(['brain', 'wiring', 'bud', 'score', 'death']);
});

test.each(NOTE_IDS)(
  'the mark of the %s note opens it in place, and a second tap closes it',
  (id) => {
    show(id);
    expect(flat(Note({ id }))).toEqual([]);
    const [mark] = flat(NoteMark({ id }));
    // The mark is a real button, and its label says what it opens.
    expect(mark?.props['aria-label']).toBe(`${NOTE_UI.mark} ${NOTE[id].about}`);
    expect(mark?.props['aria-expanded']).toBe(false);
    click(mark);
    expect(noteOpen.value).toBe(id);
    expect(flat(NoteMark({ id }))[0]?.props['aria-expanded']).toBe(true);
    expect(wordsIn(Note({ id }))).toContain(NOTE[id].text);
    // One note at a time: no other note is up.
    for (const other of NOTE_IDS) if (other !== id) expect(flat(Note({ id: other }))).toEqual([]);
    // Opening a note opens nothing else.
    expect(guideAt.value).toBeNull();
    click(flat(NoteMark({ id }))[0]);
    expect(noteOpen.value).toBeNull();
  },
);

test.each(NOTE_IDS)('a note leaves with the thing that it is on: %s', (id) => {
  show(id);
  noteOpen.value = id;
  expect(noteOpen.value).toBe(id);
  show(null);
  expect(noteOpen.value).toBeNull();
  // It does not come back with the thing: a note never opens by itself.
  show(id);
  expect(noteOpen.value).toBeNull();
});

test.each(NOTE_IDS)('"More" of the %s note opens the guide at its entry', (id) => {
  show(id);
  noteOpen.value = id;
  const more = flat(Note({ id })).find((v) => v.type === 'button');
  expect(wordsIn(more)).toBe(NOTE_UI.more);
  const chapter = CHAPTERS.find((c) => c.id === NOTE[id].more);
  expect(chapter, `the ${id} note points at an entry that the guide does not hold`).toBeDefined();
  expect(more?.props['aria-label']).toContain(chapter?.title);
  click(more);
  expect(guideAt.value).toBe(NOTE[id].more);
  // The note is still there when the guide closes, and the focus goes back to "More".
  expect(noteOpen.value).toBe(id);
});

test('each mark sits on the thing that its note explains', () => {
  const on: Record<NoteId, string> = {
    brain: 'BrainPanel.tsx',
    wiring: 'BrainPanel.tsx',
    bud: 'BudCard.tsx',
    score: 'App.tsx',
    death: 'DeathOverlay.tsx',
  };
  for (const id of NOTE_IDS) {
    const source = text(`../src/ui/${on[id]}`);
    expect(source, `${on[id]} has no mark for ${id}`).toContain(`<NoteMark id="${id}" />`);
    expect(source, `${on[id]} has no place for the ${id} note`).toContain(`<Note id="${id}" />`);
  }
});

test('the guide opens at an entry, opens again where it was, and closes', () => {
  expect(guideAt.value).toBeNull();
  openGuide('child');
  expect(guideAt.value).toBe('child');
  closeGuide();
  expect(guideAt.value).toBeNull();
  openGuide();
  expect(guideAt.value).toBe('child');
  openGuide('glossary');
  expect(guideAt.value).toBe('glossary');
});

const sentences = (s: string): number => s.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;
const words = (s: string): number => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

test('a note is at most three sentences', () => {
  for (const id of NOTE_IDS) {
    expect(sentences(NOTE[id].text), id).toBeGreaterThan(0);
    expect(sentences(NOTE[id].text), id).toBeLessThanOrEqual(3);
  }
});

test('the guide holds the six chapters of the plan in reading order, each short', () => {
  expect(CHAPTERS.map((c) => c.title)).toEqual([
    'A body',
    'A brain',
    'A child',
    'A line',
    'Evolution, without a goal',
    'The machine',
  ]);
  const ids: EntryId[] = CHAPTERS.map((c) => c.id);
  expect(new Set(ids).size).toBe(CHAPTERS.length);
  for (const [i, chapter] of CHAPTERS.entries()) {
    const count = words(fill(CHAPTER_TEXTS[i] ?? ''));
    expect(count, `${chapter.title} is ${count} words`).toBeGreaterThanOrEqual(80);
    expect(count, `${chapter.title} is ${count} words`).toBeLessThanOrEqual(160);
    // A few short paragraphs, and no wall of text.
    expect(chapter.text.length).toBeGreaterThanOrEqual(2);
    for (const paragraph of chapter.text) expect(words(paragraph), paragraph).toBeLessThan(70);
  }
});

// The words of the plan's glossary. A text that uses one of them uses it in the sense that the
// glossary gives.
const TERMS = [
  'gene',
  'mutation',
  'selection',
  'fitness',
  'lineage',
  'neuron',
  'weight',
  'time constant',
  'recurrent',
  'crossover',
  'history id',
  'neuroevolution',
  'seed',
];
const uses = (s: string, term: string): boolean => new RegExp(`\\b${term}s?\\b`, 'i').test(s);

test('every glossary word that a note or a chapter uses is in the glossary', () => {
  const held = GLOSSARY.map((entry) => entry.term.toLowerCase());
  expect(held).toEqual(TERMS);
  for (const entry of GLOSSARY) expect(sentences(entry.means), entry.term).toBe(1);
  for (const term of TERMS) {
    // A word that no note and no chapter uses has no place in the glossary.
    const users = [...NOTE_TEXTS, ...CHAPTER_TEXTS].filter((s) => uses(s, term));
    expect(users.length, `no note and no chapter uses "${term}"`).toBeGreaterThan(0);
  }
});

// A number in a text is a place in braces, filled from `FACTS`. The one typed number is the year
// of a paper.
const CITED = '(Stanley and Miikkulainen, 2002)';
const TYPED =
  /\d|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|dozen|hundred|thousand|twice|half|double)\b/i;

test('no text types a number: each is a place that FACTS fills', () => {
  const all = [...NOTE_TEXTS, ...CHAPTER_TEXTS, ...GLOSSARY_TEXTS, ...CHANCES.map((c) => c.label)];
  expect(all.join(' ')).toContain(CITED);
  const places = new Set<string>();
  for (const s of all) {
    const bare = s.replace(CITED, '').replace(/\{(\w+)\}/g, (_, key: string) => {
      places.add(key);
      return '';
    });
    expect(TYPED.exec(bare)?.[0], `"${s}" types a number`).toBeUndefined();
    expect(fill(s), s).not.toMatch(/[{}]/);
  }
  // Every fact is used, and every place has its fact.
  expect([...places].sort()).toEqual(Object.keys(FACTS).sort());
  expect(fill('{maxParts} and {maxConns}')).toBe(`${FACTS.maxParts} and ${FACTS.maxConns}`);
});

test('each number of the text equals its source in the core', () => {
  const constant = (file: string, name: string): number => {
    const found = new RegExp(`pub const ${name}: \\w+ = (\\d+);`).exec(rust(file));
    if (!found?.[1]) {
      throw new Error(
        `crates/sim/src/${file} has no constant ${name}. Fix: read the number that ` +
          'src/ui/words/guide.ts gives from where it is now, in tests/guide.test.ts.',
      );
    }
    return Number(found[1]);
  };
  expect(FACTS).toEqual({
    maxParts: constant('genome.rs', 'MAX_PART_GENES'),
    maxNeurons: constant('brain.rs', 'MAX_NEURONS'),
    maxConns: constant('brain.rs', 'MAX_CONNS'),
    maxHeirs: constant('control.rs', 'MAX_HEIRS'),
  });
});

test('each chance of chapter 3 is a parameter of the built module', () => {
  const module = new WebAssembly.Module(
    readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
  );
  const params = createSim(module, { seed: 1, worldW: 1536, worldH: 1024 }).params();
  expect(CHANCES.length).toBeGreaterThan(0);
  for (const { param } of CHANCES) {
    const found = params.find((p) => p.name === param);
    expect(found, `the core has no parameter ${param}`).toBeDefined();
    // A chance: the range of the parameter is 0 to 1.
    expect([found?.min, found?.max], param).toEqual([0, 1]);
  }
});

// What the guide says of the code at the head. When one of these fails, the code has moved on:
// write the sentence again in src/ui/words/guide.ts, and then change the check.
test('what the guide says is not built yet is not built yet', () => {
  const code = (file: string): string => rust(file).replace(/\/\/.*$/gm, '');
  // Chapter 6 and the glossary: the code of crossover is written, and no birth uses it.
  expect(code('mix.rs')).toContain('pub fn cross(');
  for (const file of ['repro.rs', 'mate.rs', 'world.rs']) {
    expect(
      code(file),
      `${file} mixes genes now: chapter 6 says "no birth uses it yet"`,
    ).not.toMatch(/\bcross\(|mix::/);
  }
  // Chapter 2: no rule reads the accept output.
  for (const file of ['mate.rs', 'repro.rs', 'energy.rs', 'motor.rs', 'control.rs']) {
    expect(code(file), `${file} reads accept now: chapter 2 says that no rule does`).not.toContain(
      'cmd_accept',
    );
  }
  // Chapter 2: the outputs that it names are the outputs of every body.
  expect(rust('brain.rs')).toContain(
    'pub const BODY_OUTPUTS: [u8; 3] = [OUT_THRUST, OUT_TURN, OUT_ACCEPT];',
  );
});

test('the word "evolve" is on no button', () => {
  const labels = [
    ...Object.values(GUIDE_UI),
    ...Object.values(NOTE_UI),
    ...CHAPTERS.map((chapter) => chapter.title),
  ];
  expect(labels.length).toBeGreaterThan(10);
  for (const label of labels) expect(label).not.toMatch(/evolve/i);
});
