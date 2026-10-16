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
  score: 'The only score: your line, alive.',
  court: 'Its brain decides, not a rule.',
};

/** The counter, top left: the living bodies with the lineage mark, apart from the player's own. */
export const COUNTER = 'Your line: {n} alive';

/** The line that stands while the body the player is in has under a quarter of a full store. */
export const STARVING = 'You are starving. Find a plant.';

/** A click in Watch on a body that the page does not hand to the player, by what the body is. */
export const REFUSE = {
  starving: 'That one is starving. Pick another.',
  old: 'That one is very old. Pick another.',
};

/**
 * The changes line of the brain panel. The count follows it. It counts from the first readout that
 * the page got of this body, which is the first time the player opened the panel on it.
 */
export const NO_CHANGE = 'Wiring changed since you first looked:';

/** The death overlay, on the first death of a life of 20 seconds or more that leaves an heir. */
export const FIRST_DEATH = 'You are gone. Your line is not.';

/**
 * The bud card. A place in braces takes a count, a percent, or the name of a part. `{s}` is the
 * plural.
 */
export const BUD = {
  heading: 'Your child. A copy, with changes.',
  // The child of a parent that held the genes of a partner: `cross` of crates/sim/src/mix.rs, and
  // then the mutations of every birth. The card lists what differs from the parent that budded.
  mixedHeading: 'Your child. A mix of two, with changes.',
  against: 'Differences are against you, the budding parent.',
  parent: 'You',
  child: 'Child',
  none: 'No change you can see.',
  // No card: the frame did not hold the child, or the player has seen the card twice.
  noChild: 'You budded a child.',
  brood: 'One of {n} born at this bud.',
  died: 'This child has died already.',
  noBrain: 'The brain could not be read.',
  // The card draws the shape and the parts of the two bodies, not their lengths.
  oneLength: 'Both drawn at one length.',
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
  // Of a child born of a cross, a weight that differs can be the partner's: not every one is a nudge.
  weights: '{n} of {m} connection weights differ',
  // The child eats other food than its parent, by `dietWord`.
  diet: 'Diet: now {diet}',
  part: 'part', // a kind that this build does not know
};

/**
 * The mate card. A place in braces takes a number. The card shows only in a world with `mix_rate`
 * above 0.
 */
export const MATE = {
  heading: 'Courting',
  what: 'If both accept, your next brood is mixed.',
  you: 'You',
  other: 'The other',
  size: 'Length {l}, width {w}',
  hidden: 'Hidden neurons: {n}',
  conns: 'Connections: {n}',
  diet: 'Diet: {diet}',
  noParts: 'No parts',
  // `FLAG_WILLING` of the frame: the accept command of the body is above 0.
  willing: 'Willing now',
  unwilling: 'Not willing now',
  court: 'Hold to court',
  // What the two still lack for an exchange, by the `state` of `courtship` in src/app/court.ts.
  state: {
    ownYoung: 'You are not full-grown yet.',
    young: 'Too young',
    carry: 'You carry a partner’s genes until you bud.',
    otherCarries: 'It carries a partner’s genes already.',
    apart: 'You do not touch yet.',
    third: 'Another body is nearer to one of you.',
    hold: 'You touch. You are not courting.',
    // In touch, with the player courting, the accept output of its brain was at 0 or under. The
    // game knows no reason for it. The line stays for a while after the two come apart.
    refused: 'It refused. Its brain decided.',
    // Every condition holds. The core draws once per step for the pair, with chance `mix_rate`.
    chance: 'Both accept. Each step has a chance.',
  },
  // `FLAG_DONOR` rose on the body of the player.
  exchanged: 'Genes exchanged. Your next brood is mixed.',
};

/** The cut points of the diet words: the targets of rule D1 in docs/plans/2026-10-16-m4-retune-diet.md. */
export const DIET_PLANTS_BELOW = 0.3;
export const DIET_FLESH_ABOVE = 0.7;

/** What a body eats, from its `diet` gene: under 0.3 plants, over 0.7 flesh, and both from 0.3 to 0.7. */
export function dietWord(diet: number): string {
  if (diet < DIET_PLANTS_BELOW) return 'eats plants';
  return diet > DIET_FLESH_ABOVE ? 'eats flesh' : 'eats both';
}

/** The kinds of part, by the `KIND_` constants of src/protocol.ts. */
export const KIND: Record<number, string> = {
  1: 'flagellum',
  2: 'cilia',
  3: 'mouth',
  4: 'chemoreceptor',
  5: 'fin',
  6: 'eye',
  7: 'jaw',
  8: 'spike',
  9: 'shell plate',
  10: 'toxin gland',
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
