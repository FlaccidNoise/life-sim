// What the overlay shows. `src/app/main.ts` writes these from worker messages.

import { signal } from '@preact/signals';
import type { BrainView, DeathCause, Heir } from '../protocol';

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
export const death = signal<{ cause: DeathCause; heirs: Heir[] } | null>(null);
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
