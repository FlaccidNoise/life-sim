import { type CreatureVisualCtx, type TraitModule } from './gene-view';
import { body } from './body';
import { eyes } from './eyes';
import { visionCone } from './vision-cone';

// All trait modules, sorted once by draw order (z). Adding a gene's visual = import + add here.
export const MODULES: readonly TraitModule[] = [body, eyes, visionCone].sort((a, b) => a.z - b.z);

export function dispatch(c: CreatureVisualCtx): void {
  for (const m of MODULES) if (m.minTier <= c.tier) m.draw(c);
}
