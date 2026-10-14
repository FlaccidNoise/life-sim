// What the overlay shows. `src/app/main.ts` writes these from worker messages.

import { effect, signal } from '@preact/signals';
import type { BrainView, DeathCause, Heir, Kin, ParamInfo } from '../protocol';
import type { EntryId } from './words/guide';
import type { NoteId } from './words/notes';

export const errorText = signal<string | null>(null);
export const ready = signal(false);
export const stats = signal({ tick: 0, creatures: 0, plants: 0, tickMicros: 0, fps: 0 });
export const benchText = signal<string | null>(null);
export const mode = signal<'watch' | 'play'>('watch');
export const brainDriving = signal(false);
export const hint = signal<string | null>(null);
export const lineageAlive = signal(0); // frame header word 7: living creatures with the lineage mark
export const buds = signal(0); // frame header word 8: buds of the possessed body since it was possessed
export const toast = signal<string | null>(null); // one line, 3 seconds
export const starving = signal(false); // the possessed body has under a quarter of a full store
// `first`: the overlay leads with the line that goes on: `leadsDeath` of src/app/walkthrough.ts.
export interface Death {
  cause: DeathCause;
  heirs: Heir[];
  first: boolean;
}
export const death = signal<Death | null>(null);
export const focusHeir = signal<Heir | null>(null); // main.ts moves the camera to it
export const heirGone = signal(false); // a pick came back empty: the heir was not alive
export const brainOpen = signal(false); // the brain panel
// The brain of the possessed body, while the panel is open. Null: no body is possessed. Undefined:
// the worker has sent none yet.
export const brain = signal<BrainView | null | undefined>(undefined);
export const brainError = signal<string | null>(null); // a `brain` message that could not be read
// What the player's hands ask of the body. The brain panel reads it with `peek` when it draws: a
// held pointer changes it on every frame.
export const steer = signal({ thrust: 0, turn: 0 });
// The walkthrough, docs/plans/2026-10-13-walkthrough.md. `main.ts` writes these on each frame.
export const walkLine = signal<string | null>(null); // the line of the beat on show
export const pulse = signal<'brain' | 'score' | null>(null); // the control that a beat points at
export const changesShown = signal(false); // beat 7 is done: the brain panel has its changes line
// Connections of the brain on show that differ from the first readout the page got of that body.
export const wiringChanged = signal(0);
// The playtest log: by beat, the seconds since the page loaded at its first showing and when done.
export const walkLog = signal<Record<string, { shown?: number; done?: number }>>({});

/** One line of the bud card. `part` is the place of a part in the part list of the body of `side`. */
export interface Difference {
  text: string;
  side: 'parent' | 'child';
  part?: number;
}

/** A bud of the possessed body: the two bodies as the frame of the bud held them, and what differs. */
export interface Bud {
  parent: Kin;
  child: Kin; // the nearest of the brood
  brood: number; // children of this bud
  lines: Difference[];
  brainRead: boolean; // the two brains were read, and `lines` counts their connections
  childDied: boolean; // the child was dead when the worker read its brain
}
// The last bud. It stays after its card has left, so the field guide can show it again.
export const lastBud = signal<Bud | null>(null);
export const budOpen = signal(false); // the bud card is up

// The notes and the field guide, docs/plans/2026-10-13-walkthrough.md. Neither opens by itself, and
// neither pauses the world.
export const noteOpen = signal<NoteId | null>(null); // the note that is open in place. One at a time
export const guideAt = signal<EntryId | null>(null); // the entry of the guide on show. Null: closed
// The live readings of the guide. The parameter table is that of the `ready` message.
export const worldParams = signal<ParamInfo[]>([]);
// The counts of the brain of the possessed body, read when the guide opens. Null: no body.
export const guideBrain = signal<{
  inputs: number;
  hidden: number;
  outputs: number;
  connections: number;
} | null>(null);

/**
 * The mate card: the body of the player, the body that the card is about, and the first thing that
 * the two still lack for an exchange of genes. `courtship` of src/app/court.ts makes it.
 */
export interface Courtship {
  you: Kin;
  other: Kin;
  state:
    | 'ownYoung' // the body of the player is not full-grown
    | 'young' // no full-grown body is in reach, and `other` is a juvenile
    | 'carry' // the player holds a donor
    | 'otherCarries'
    | 'apart' // the two do not touch
    | 'third' // another body is the nearest that one of the two touches
    | 'hold' // the body of the player does not accept
    | 'refused' // in touch, the player accepts and the other does not. `lingering` keeps it a while
    | 'chance'; // both accept
}
// Null: no body is in reach, or mixing is off in this world, or the player is in no body.
export const mate = signal<Courtship | null>(null);
export const courtHeld = signal(false); // the Court button of the card is down
/** The mate card is up. It steps back for the bud card: one card at a time. */
export const mateShown = (): boolean =>
  mate.value !== null && !budOpen.value && noteOpen.value !== 'bud';
const NO_COURT: Courtship['state'][] = ['ownYoung', 'young', 'carry', 'otherCarries'];
/** The card has its Court button: both bodies are full-grown and neither holds a donor. */
export const courtable = (): boolean => {
  const state = mate.value?.state;
  return mateShown() && state !== undefined && !NO_COURT.includes(state);
};
// The button leaves with the card, and a button that is gone gets no `pointerup`.
effect(() => {
  if (!courtable()) courtHeld.value = false;
});

// A note leaves with the thing that it is on: none is open when the thing comes back.
effect(() => {
  const dead = death.value !== null;
  const play = mode.value === 'play';
  const panel = brainOpen.value && !dead;
  const up: Record<NoteId, boolean> = {
    brain: panel,
    wiring: panel && changesShown.value,
    bud: play && !dead,
    mate: play && !dead && mateShown(),
    score: play,
    death: dead,
  };
  const open = noteOpen.value;
  if (open !== null && !up[open]) noteOpen.value = null;
});

/** The "?" mark of a note: a tap opens the note, and a second tap closes it. */
export const toggleNote = (id: NoteId): void => {
  noteOpen.value = noteOpen.peek() === id ? null : id;
};

/**
 * The body of the player died. The death is seen at once: the guide and an open note close, and the
 * overlay comes up and takes the focus.
 */
export const showDeath = (died: Death): void => {
  closeGuide();
  noteOpen.value = null;
  death.value = died;
};

/** The Escape key closes the note that is open. False: none was open, and the key leaves the body. */
export const closeNote = (): boolean => {
  if (noteOpen.peek() === null) return false;
  noteOpen.value = null;
  return true;
};

/**
 * A new line of the walkthrough waits for these: an answer to a click, a toast, the bud card, which
 * stays up while its note is open, and the guide, which covers the foot of the screen.
 */
export const pageBusy = (): boolean =>
  hint.peek() !== null ||
  toast.peek() !== null ||
  budOpen.peek() ||
  noteOpen.peek() === 'bud' ||
  guideAt.peek() !== null;

let guideLast: EntryId = 'body'; // where the guide was last, for the button and the key
/** Opens the guide at an entry, or where it was last. */
export const openGuide = (at: EntryId = guideLast): void => {
  guideLast = at;
  guideAt.value = at;
};
export const closeGuide = (): void => {
  guideAt.value = null;
};
