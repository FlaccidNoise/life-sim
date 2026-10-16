// The short notes: one for each "?" mark. docs/plans/2026-10-13-walkthrough.md. A note is at most
// three sentences, and "More" opens the field guide at the chapter that says the rest.
// tests/guide.test.ts and tests/words.test.ts hold these.

import type { ChapterId } from './guide';

export type NoteId = 'brain' | 'wiring' | 'bud' | 'mate' | 'score' | 'death' | 'hunter';

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
    // True of a child of one parent and of a child born of a cross: the card of each has this mark.
    text: 'The child is made of copied genes, with random changes. Most are small. No rule aims a change at what a body lacks.',
    more: 'child',
  },
  // Each clause is of `cross` in crates/sim/src/mix.rs. A gene that only one of the two holds comes
  // from that one, or is left out. The hue is the home's.
  mate: {
    about: 'the mate card',
    text: 'Each part, connection, and hidden neuron carries an id from when it first appeared. Mixing lines up the genes of both bodies by that id, and each gene of the child comes from one of them. The colour of a child comes from the parent that buds it.',
    more: 'machine',
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
  // On the killer card of a death by a bite. A brain changes only at a birth: crates/sim/src/repro.rs.
  hunter: {
    about: 'the body that killed you',
    text: 'A hunter is a body with a Jaw. Its brain was born with its wiring. Nothing in it changed during its life.',
    more: 'brain',
  },
};

/** The words of a mark and of an open note. The label of a mark is `mark`, then `about`. */
export const NOTE_UI = {
  mark: 'Open the note on',
  more: 'More',
  moreLabel: 'More in the field guide:',
};
