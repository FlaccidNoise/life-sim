// What the overlay shows. `src/app/main.ts` writes these from worker messages.

import { signal } from '@preact/signals';
import type { DeathCause, Heir } from '../protocol';

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
