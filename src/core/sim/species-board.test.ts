import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { CellType } from '../cells/types';
import { sampleSpecies } from './species-board';
import { type Genome } from '../genome/genome';

function spawn(w: World, g: Genome, x: number, y: number): void {
  const cfg = w.config;
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    0,
    cfg.worldWidth,
    cfg.worldHeight,
    w.instantiateScratch,
  );
}

describe('sampleSpecies', () => {
  it('groups identical-morphology foragers into ONE species', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 4000,
      worldWidth: 256,
      worldHeight: 256,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    w.seedLife(300);
    for (let i = 0; i < 4; i++) spawn(w, buildForagerGenome(cfg.cellRadius, 100), 40 + i * 40, 80);
    w.tick();
    const board = sampleSpecies(w.organisms, w.genomes);
    expect(board.length).toBe(1);
    expect(board[0]!.liveCount).toBe(4);
  });

  it('splits a morphologically distinct variant into a second species', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 4000,
      worldWidth: 256,
      worldHeight: 256,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    w.seedLife(300);
    spawn(w, buildForagerGenome(cfg.cellRadius, 100), 60, 60);
    spawn(w, buildForagerGenome(cfg.cellRadius, 100), 100, 60);
    // a variant: flip several genes to PHOTO so composition is far from the forager
    const variant = buildForagerGenome(cfg.cellRadius, 100);
    for (const g of variant.genes) g.cellType = CellType.PHOTO;
    spawn(w, variant, 160, 120);
    w.tick();
    const board = sampleSpecies(w.organisms, w.genomes);
    expect(board.length).toBe(2);
    // ranked by liveCount desc → the 2-member forager species first
    expect(board[0]!.liveCount).toBe(2);
    expect(board[1]!.liveCount).toBe(1);
  });
});
