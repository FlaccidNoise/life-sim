// Every line of the walkthrough. tests/words.test.ts holds each to the rules of
// docs/plans/2026-10-13-walkthrough.md: at most eight words, and no purpose in a cause.

/** The lines at the foot of the screen, by the beat that shows them. */
export const LINE = {
  possess: 'Click any creature to become it.',
  move: 'Your instincts are steering. Move to take over.',
  eat: 'Green is food.',
  letGo: 'It swims without you. It has a brain.',
  disagree: 'Your hands and its brain disagree.',
  halfRing: 'At the notch, a child buds.',
  score: 'The only score: descendants alive.',
};

/**
 * The changes line of the brain panel. The count follows it. It counts from the first readout that
 * the page got of this body, which is the first time the player opened the panel on it.
 */
export const NO_CHANGE = 'Wiring changed since you first looked:';

/** The death overlay, on the first death with a living descendant. */
export const FIRST_DEATH = 'You are gone. Your line is not.';

/**
 * The bud card. A place in braces takes a count, a percent, or the name of a part. `{s}` is the
 * plural.
 */
export const BUD = {
  heading: 'Your child. A copy, with changes.',
  parent: 'You',
  child: 'Child',
  none: 'No change you can see.',
  noChild: 'You budded a child.', // no card: the frame did not hold the child
  brood: 'One of {n} born at this bud.',
  died: 'This child has died already.',
  noBrain: 'The brain could not be read.',
  // The frame gives a body as long as it is now, and the card draws the shape and the parts.
  newborn: 'Drawn at one length. A newborn is small.',
  more: 'And {n} more.',
  longer: 'Body {n}% longer',
  shorter: 'Body {n}% shorter',
  wider: 'Body {n}% wider for its length',
  narrower: 'Body {n}% narrower for its length',
  gained: 'Gained: {part}',
  lost: 'Lost: {part}',
  larger: '{part} {n}% larger',
  smaller: '{part} {n}% smaller',
  fromNone: '{part} larger, from nothing',
  tailward: '{part} moved toward the tail',
  noseward: '{part} moved toward the nose',
  coneWider: '{part} cone wider',
  coneNarrower: '{part} cone narrower',
  moreHidden: '{n} more hidden neuron{s}',
  fewerHidden: '{n} fewer hidden neuron{s}',
  moreConns: '{n} more connection{s}',
  fewerConns: '{n} fewer connection{s}',
  connsGained: '{n} connection{s} gained',
  connsLost: '{n} connection{s} lost',
  weights: '{n} of {m} connection weights nudged',
  part: 'part', // a kind that this build does not know
};

/** The kinds of part, by the `KIND_` constants of src/protocol.ts. */
export const KIND: Record<number, string> = {
  1: 'flagellum',
  2: 'cilia',
  3: 'mouth',
  4: 'chemoreceptor',
  5: 'fin',
  6: 'eye',
};

/** Which one of its kind a part is. A body holds 12 parts at most. */
export const ORDINAL = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
];
