import { type World } from '../core/sim/world';

const TYPE_NAMES = ['PHOTO', 'DIGESTIVE', 'MEAT', 'MOTILE', 'SENSOR', 'NEURON', 'MOVER'];

/** Render an organism's genome + lineage into a text panel (§11 M6 genome/lineage inspector). */
export function renderGenomeInspector(world: World, org: number, panel: HTMLElement): void {
  if (org <= 0 || !world.organisms.isAlive(org)) {
    panel.textContent = 'no organism selected (click a bonded organism)';
    return;
  }
  const ref = world.organisms.genomeRef[org]!;
  if (ref < 0) {
    panel.textContent = `org #${org}: no genome (hand-built or split fragment)`;
    return;
  }
  const g = world.genomes.get(ref);
  if (g === undefined) {
    panel.textContent = `org #${org}: genome #${ref} (freed)`;
    return;
  }
  const lines: string[] = [];
  lines.push(
    `organism #${org} · genome #${ref} · gen ${g.generation} · parent ${g.parentRef < 0 ? '∅' : '#' + g.parentRef}`,
  );
  lines.push(
    `genes ${g.genes.length} · div ${g.divisionRules.length} · bond ${g.bondRules.length} · conn ${g.connectionRules.length} · motor ${g.motorRules.length}`,
  );
  for (let i = 0; i < g.genes.length; i++) {
    const ge = g.genes[i]!;
    const tags =
      (ge.bias !== 0 ? ` b${ge.bias.toFixed(2)}` : '') +
      (ge.sensorChannel >= 0 ? ` ch${ge.sensorChannel}` : '');
    lines.push(
      `  gene ${i} [innov ${ge.innovation}] ${TYPE_NAMES[ge.cellType] ?? ge.cellType} r${ge.radius.toFixed(1)} m${ge.mass.toFixed(1)} E${ge.initialEnergy.toFixed(0)}${tags}`,
    );
  }
  panel.textContent = lines.join('\n');
}
