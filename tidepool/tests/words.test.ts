// The lint on the words of the game: rules 2 and 5 of docs/plans/2026-10-13-walkthrough.md.

import { expect, test } from 'vitest';
import brainWords from '../src/ui/brain/words.ts?raw';

const MAX_WORDS = 8; // rule 2: of a line on the screen
// Rule 5: no purpose in a cause. A body or a brain does not change for a reason of its own.
const PURPOSE = [
  'in order to',
  'so that',
  'so it could',
  'so it can',
  'wants',
  'needs',
  'tries',
  'trying',
  'learned',
  'learns',
  'learn',
  'decides to',
  'better',
];
// The exact sentences that may hold a word of `PURPOSE`.
const ALLOWED = [
  // It says that the thing does not happen.
  'It does not learn.',
  // The purpose is that of the people who wrote the founder brain (`starter` in
  // crates/sim/src/brain.rs), and they had one. No body and no brain changed for it.
  'The first creatures have brains wired by hand so that they can feed.',
];

const wordsOf = (text: string): number =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/** What `text` breaks, each as the string and the rule. Empty when it breaks nothing. */
function broken(text: string, isLine: boolean): string[] {
  const out: string[] = [];
  // A line that ends in a colon has a number after it on the screen.
  const words = wordsOf(text) + (text.endsWith(':') ? 1 : 0);
  if (isLine && words > MAX_WORDS) {
    out.push(`"${text}" breaks rule 2: ${words} words, and a line has at most ${MAX_WORDS}`);
  }
  const rest = ALLOWED.reduce((left, sentence) => left.split(sentence).join(' '), text);
  for (const phrase of PURPOSE) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(rest)) {
      out.push(`"${text}" breaks rule 5: "${phrase}" gives a cause a purpose`);
    }
  }
  return out;
}

/** Every string that a module exports, at any depth. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(stringsOf);
}

const modules = import.meta.glob<Record<string, unknown>>('../src/ui/words/*.ts', { eager: true });

test('every string of src/ui/words keeps rule 5, and every line keeps rule 2', () => {
  const lines = stringsOf(modules['../src/ui/words/lines.ts']);
  expect(lines.length).toBeGreaterThanOrEqual(8);
  // The notes and the field guide are held too: every sentence of each is a string here.
  expect(stringsOf(modules['../src/ui/words/notes.ts']).length).toBeGreaterThanOrEqual(15);
  expect(stringsOf(modules['../src/ui/words/guide.ts']).length).toBeGreaterThanOrEqual(60);
  const breaks = Object.entries(modules).flatMap(([path, module]) =>
    stringsOf(module).flatMap((text) => broken(text, path.endsWith('/lines.ts'))),
  );
  expect(breaks).toEqual([]);
});

test('the phrase table of the brain sentence keeps rule 5', () => {
  // Every string of the file, with the comments taken out first: an apostrophe in a comment would
  // pair with the quote of a string.
  const code = brainWords.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const phrases = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(
    (m) => m[1] ?? m[2] ?? '',
  );
  // The table is found: these are four of its phrases.
  expect(phrases).toEqual(
    expect.arrayContaining(['Smells food', 'Sees a plant ahead', 'Speeds up', 'turns left']),
  );
  expect(phrases.length).toBeGreaterThan(40);
  expect(phrases.flatMap((text) => broken(text, false))).toEqual([]);
});

test('the lint names the string and the rule that it broke', () => {
  expect(broken('One two three four five six seven eight nine.', true)).toEqual([
    '"One two three four five six seven eight nine." breaks rule 2: 9 words, and a line has at most 8',
  ]);
  expect(broken('One two three four five six seven eight.', true)).toEqual([]);
  // The count that follows a colon is a word.
  expect(broken('One two three four five six seven eight:', true)).toHaveLength(1);
  // A note is longer than a line: rule 2 is for a line.
  expect(broken('One two three four five six seven eight nine.', false)).toEqual([]);
  expect(broken('It grew an eye so that it could see.', false)).toEqual([
    '"It grew an eye so that it could see." breaks rule 5: "so that" gives a cause a purpose',
  ]);
});

test('the lint rejects each phrase of rule 5, in any case', () => {
  for (const phrase of PURPOSE) {
    expect(broken(`A body ${phrase} this.`, false), phrase).not.toEqual([]);
    expect(broken(`A body ${phrase.toUpperCase()} this.`, false), phrase).not.toEqual([]);
  }
  // A word that only holds a banned one is not that word.
  expect(broken('A kneeds b. Betterment.', false)).toEqual([]);
});

test('a hunter bites what it faces, and no string gives a hunt a purpose', () => {
  const all = Object.values(modules).flatMap(stringsOf);
  expect(all.some((text) => text.includes('bites what it faces'))).toBe(true);
  // "Hunts to eat" is a purpose too, and the lint does not hold "to" in general.
  for (const text of all) expect(text, text).not.toMatch(/\bhunt(s|ing)? (to|for)\b/i);
  expect(broken('A hunter hunts in order to eat.', false)).toHaveLength(1);
  expect(broken('It wants the body ahead.', false)).toHaveLength(1);
});

test('"learn" passes only in a sentence that is allowed by name', () => {
  expect(broken('It does not learn.', false)).toEqual([]);
  expect(broken('Born with this wiring. It does not learn.', false)).toEqual([]);
  expect(broken('It does not learn. But it learns later.', false)).toHaveLength(1);
  expect(broken('It does learn.', false)).toHaveLength(1);
});

test('the purpose of a designer passes only in the sentence that is allowed by name', () => {
  const founders = 'The first creatures have brains wired by hand so that they can feed.';
  expect(broken(founders, false)).toEqual([]);
  expect(broken('The first creatures grew brains so that they can feed.', false)).toHaveLength(1);
});
