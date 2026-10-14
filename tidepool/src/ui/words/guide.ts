// The field guide: six short chapters and a glossary. docs/plans/2026-10-13-walkthrough.md.
//
// Every sentence here is of the code as it is. tests/guide.test.ts holds the numbers to their
// source, and tests/words.test.ts holds every string to rule 5: no purpose in a cause. A number in
// a text is a place in braces that `FACTS` fills: none is typed.

export type ChapterId = 'body' | 'brain' | 'child' | 'line' | 'evolution' | 'machine';
/** A place that the guide opens at. */
export type EntryId = ChapterId | 'glossary';

/** The numbers that the texts give. tests/guide.test.ts reads each from crates/sim/src. */
export const FACTS = {
  maxParts: 12, // genome.rs, MAX_PART_GENES
  maxNeurons: 96, // brain.rs, MAX_NEURONS
  maxConns: 384, // brain.rs, MAX_CONNS
  maxHeirs: 5, // control.rs, MAX_HEIRS
};

/** A text with each place in braces filled from `FACTS`. */
export const fill = (text: string): string =>
  text.replace(/\{(\w+)\}/g, (place, key: string) =>
    key in FACTS ? String(FACTS[key as keyof typeof FACTS]) : place,
  );

/** In reading order. A chapter is a few short paragraphs. */
export const CHAPTERS: { id: ChapterId; title: string; text: string[] }[] = [
  {
    id: 'body',
    title: 'A body',
    text: [
      'A body is one rounded shape with parts on it. Its genes set its length, its width, and its parts: a mouth, a flagellum or cilia that push it, a fin that steers it, a chemoreceptor that smells plants, an eye. A gene makes one part or a mirrored pair, and a body holds at most {maxParts} such genes.',
      'Energy is the only currency, and the ring around your body shows its store. A mouth takes energy from each plant the body touches, with no order from the brain. Energy pays for upkeep at every moment, for growth, and for children. A body with none left starves.',
      'Every part adds mass. Mass costs energy to build, and a heavier body pays more upkeep for as long as it lives. That is the whole cost of a part: it has no fee of its own. Thrust costs energy too, and so does each hidden neuron and each connection of the brain.',
    ],
  },
  {
    id: 'brain',
    title: 'A brain',
    text: [
      'Every body carries a brain that runs many times a second, also while you steer: your hands replace only thrust and turn.',
      'Inputs, on the left, are numbers that the body senses, such as its energy, the smell of plants, what each eye sees. Outputs, on the right, are thrust, turn, and accept, the answer to a mate.',
      'Hidden neurons sit between. A connection carries one neuron’s value to another, times its weight: a positive weight adds, a negative one takes away. A neuron sums what arrives, adds a fixed number, its bias, and squashes the result into a fixed range. A connection that loops back makes a brain recurrent.',
      'A brain keeps only the values of its neurons. A slow neuron, one with a long time constant, holds part of its old value. That is all its memory, and it ends with the body. The wiring is set at birth. It does not learn.',
    ],
  },
  {
    id: 'child',
    title: 'A child',
    text: [
      'A full-grown body with a full enough store buds: it splits off a child, or a small brood, and pays for each out of its own energy. Budding takes no mate. With mixing on, a child can also carry a donor’s genes.',
      'A child is a copy of its parent’s genes with random mutations, drawn at the birth. Most are nudges: a body a little longer, a part a little larger or moved along the body, a weight of the brain a little up or down. Now and then a birth drops a part, copies one, or adds a new one of a random kind.',
      'The code can also add or remove a connection or a hidden neuron at a birth. Each kind of mutation has its own chance, shown below for this world, and a chance can be zero.',
      'No rule aims a mutation at what a body lacks. Some harm: a child that loses its mouth cannot eat.',
    ],
  },
  {
    id: 'line',
    title: 'A line',
    text: [
      'The only score is your line, alive. When you take a body the game marks it, and each living body that descends from it through living parents. A child inherits its parent’s mark. Your line, or lineage, is every living body with the mark. The counter shows how many, apart from your own.',
      'Every body dies. It starves when its energy runs out, or it dies of old age at the age its genes set. A longer life costs more upkeep.',
      'When your body dies the world waits, and the game offers up to {maxHeirs} living bodies of your line, the fullest of energy first. Pick one and you go on as it. With none alive, the line has ended.',
      'That pick is selection by a chooser, as when a breeder picks which animal to breed from. The same holds while you steer: a body fed by your hands buds, whether or not its own brain could have fed it.',
    ],
  },
  {
    id: 'evolution',
    title: 'Evolution, without a goal',
    text: [
      'Variation comes first: children differ from their parents by random mutation. Then survival is unequal: some bodies starve young and some bud many times. Over many generations the common genes change. That is selection.',
      'No body evolves in its life. It grows, but its genes and its wiring are fixed at birth. What changes over time is which bodies are alive.',
      'There is no goal. No rule of the world picks a winner or aims a mutation. Most mutations are small and do little, and some do harm. Fitness here means descendants left, and nothing else. A trait can be lost: one birth can drop a part, and in test worlds with a sense switched off the lines lost much of that sense.',
      'And this world has not shown that sensing pays: with the rules as they are, a test world whose senses were switched off sometimes held as many creatures as one that could sense, or more.',
    ],
  },
  {
    id: 'machine',
    title: 'The machine',
    text: [
      'This world is a program, run from a seed: a number that fixes every random draw. Same seed, same play, same world.',
      'Nothing is trained. There is no gradient, the signal that training uses to push a network toward a target. Brains change only between a parent and its child: neuroevolution.',
      'The first creatures have brains wired by hand so that they can feed. Everything after is copy, random change, and unequal survival.',
      'Each part, connection, and hidden neuron carries a history id from when it appeared. Crossover, which mixes the genes of a mate into a child, lines genes up by that id: a method from NEAT (Stanley and Miikkulainen, 2002). With mixing on, grown bodies that touch and both accept exchange genes.',
      'For speed, a brain holds at most {maxNeurons} neurons and {maxConns} connections, and a body {maxParts} part genes. Your picks, an heir now and a mate later, are selection by a chooser, as a breeder does.',
    ],
  },
];

/** One sentence each, in the order of the plan. */
export const GLOSSARY: { term: string; means: string }[] = [
  {
    term: 'Gene',
    means:
      'One inherited value of a body, such as its length, a part, or a connection of its brain.',
  },
  {
    term: 'Mutation',
    means: 'A random change to a gene, made when a child is copied from its parent.',
  },
  {
    term: 'Selection',
    means:
      'What happens when bodies that differ leave unequal numbers of descendants, with a chooser or with none.',
  },
  {
    term: 'Fitness',
    means: 'The descendants that a body leaves, and not its size, its speed, or its strength.',
  },
  {
    term: 'Lineage',
    means:
      'A body and every body that descends from it, parent to child, which the game calls a line.',
  },
  {
    term: 'Neuron',
    means:
      'One unit of a brain, which holds a single value and updates it from what its connections bring.',
  },
  {
    term: 'Weight',
    means:
      'The number on a connection, which sets how strongly, and with which sign, one neuron pushes the next.',
  },
  {
    term: 'Time constant',
    means:
      'How long a neuron takes to move to its new value, where a long one holds a trace of the old.',
  },
  {
    term: 'Recurrent',
    means:
      'Said of a brain in which a connection may loop back, and a value can return to the neuron that it left.',
  },
  {
    term: 'Crossover',
    means:
      'Making a child from the genes of a parent and of a mate, lined up gene by gene, in a world that has mixing on.',
  },
  {
    term: 'History id',
    means:
      'A number given to a part, a connection, or a hidden neuron when it first appears, and copied with it to every body that inherits it.',
  },
  {
    term: 'Neuroevolution',
    means:
      'Shaping brains by copy, mutation, and selection over generations, with no training of any one brain.',
  },
  {
    term: 'Seed',
    means: 'The number that a world starts from, which fixes every random draw that follows.',
  },
];

/**
 * The live reading of chapter 3: the chance of each kind of mutation, from the parameter table of
 * the world that runs.
 */
export const CHANCES: { param: string; label: string }[] = [
  { param: 'mut_rate', label: 'Each length, width, or part size is nudged' },
  { param: 'mut_weight_rate', label: 'Each number of the brain is nudged' },
  { param: 'mut_part_remove', label: 'A part is lost' },
  { param: 'mut_part_dup', label: 'A part is copied' },
  { param: 'mut_part_add', label: 'A new part' },
  { param: 'mut_conn_remove', label: 'A connection is lost' },
  { param: 'mut_conn_add', label: 'A new connection' },
  { param: 'mut_neuron_remove', label: 'A hidden neuron is lost' },
  { param: 'mut_neuron_add', label: 'A new hidden neuron' },
];

/** The words of the panel that are not of a chapter. `{n}` and `{of}` take a count. */
export const GUIDE_UI = {
  button: 'Guide',
  title: 'Field guide',
  sub: 'How this world works.',
  close: 'Close the field guide',
  chapters: 'Chapters',
  glossary: 'Glossary',
  count: 'Chapter {n} of {of}',
  next: 'Next',
  back: 'Back',
  live: 'In your world, now',
  inputs: 'Inputs',
  hidden: 'Hidden neurons',
  outputs: 'Outputs',
  connections: 'Connections',
  noBody: 'Take a body, and the counts of its brain show here.',
  lastBud: 'The last bud of your body',
  noBud: 'No bud yet. The last bud of your body will show here.',
  chances: 'Chances at one birth, in this world',
  lineOthers: 'Bodies of your line alive, apart from yours',
  lineAlive: 'Bodies of your line alive',
  tick: 'Steps of this world so far',
  bodies: 'Bodies alive',
  plants: 'Plants',
};
