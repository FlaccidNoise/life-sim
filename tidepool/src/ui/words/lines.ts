// Every line of the walkthrough. tests/words.test.ts holds each to the rules of
// docs/plans/2026-10-13-walkthrough.md: at most eight words, and no purpose in a cause.

/** The lines at the foot of the screen, by the beat that shows them. */
export const LINE = {
  possess: 'Click any creature to become it.',
  move: 'Your instincts are steering. Move to take over.',
  eat: 'Green is food.',
  letGo: 'It swims without you. It has a brain.',
  disagree: 'Your hands and its brain disagree.',
  halfRing: 'A full ring buds a child.',
  score: 'The only score: descendants alive.',
};

/**
 * The changes line of the brain panel. The count follows it. It counts from the first readout that
 * the page got of this body, which is the first time the player opened the panel on it.
 */
export const NO_CHANGE = 'Wiring changed since you first looked:';
