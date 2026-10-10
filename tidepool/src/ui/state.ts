// What the overlay shows. `src/app/main.ts` writes these from worker messages.

import { signal } from '@preact/signals';

export const errorText = signal<string | null>(null);
export const ready = signal(false);
export const stats = signal({ tick: 0, creatures: 0, plants: 0, tickMicros: 0, fps: 0 });
export const benchText = signal<string | null>(null);
export const mode = signal<'watch' | 'play'>('watch');
export const brainDriving = signal(false);
export const hint = signal<string | null>(null);
