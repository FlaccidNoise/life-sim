// The short notes: one for each "?" mark. docs/plans/2026-10-13-walkthrough.md. A note is at most
// three sentences, and "More" opens the field guide at the chapter that says the rest.
// tests/guide.test.ts and tests/words.test.ts hold these.

import type { ChapterId } from './guide';

export type NoteId = 'brain' | 'wiring' | 'bud' | 'score' | 'death';

/** `about` ends the label of the mark: what the note is on. `more` is the chapter of the guide. */
export const NOTE: Record<NoteId, { about: string; text: string; more: ChapterId }> = {
  brain: {
    about: 'the brain panel',
    text: 'Each line carries a number from one neuron to the next. A neuron adds up what arrives and squashes the sum. On the right, thrust and turn are what reaches the body.',
    more: 'brain',
  },
  wiring: {
    about: 'the wiring count',
    text: 'This wiring was set at birth, and nothing in the game changes it while the body lives. It does not learn. Brains here change only between a parent and its child.',
    more: 'machine',
  },
  bud: {
    about: 'the bud card',
    text: 'The child is a copy of your genes with random changes. Most are small. No rule aims a change at what a body lacks.',
    more: 'child',
  },
  score: {
    about: 'the counter of your line',
    text: 'This counts the living bodies of your line, apart from the one you are in. It is the only score. Nothing here scores size, speed, or age.',
    more: 'line',
  },
  death: {
    about: 'death and your line',
    text: 'You were one body of a line. Each body you play is marked, and every child inherits the mark of its parent. The line goes on while one marked body is alive.',
    more: 'line',
  },
};

/** The words of a mark and of an open note. The label of a mark is `mark`, then `about`. */
export const NOTE_UI = {
  mark: 'Open the note on',
  more: 'More',
  moreLabel: 'More in the field guide:',
};
