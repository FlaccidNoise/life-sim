import { describe, it, expect } from 'vitest';
import {
  type Gene,
  type Genome,
  cloneGenome,
  serializeGenome,
  deserializeGenome,
  GenomeStore,
  serializeGenomeLibrary,
  loadGenomeLibrary,
} from './genome';
import { CellType } from '../cells/types';
import { SenseSource, SightTarget } from '../cells/sense-source';

function tinyGenome(): Genome {
  return {
    seedGene: 0,
    genes: [
      {
        innovation: 0,
        cellType: CellType.PHOTO,
        radius: 6,
        mass: 2,
        initialEnergy: 100,
        bias: 0,
        sensorChannel: -1,
        glowGain: 0,
        senseSource: 0,
        sightTarget: 0,
      },
      {
        innovation: 1,
        cellType: CellType.PHOTO,
        radius: 6,
        mass: 2,
        initialEnergy: 100,
        bias: 0,
        sensorChannel: -1,
        glowGain: 0,
        senseSource: 0,
        sightTarget: 0,
      },
    ],
    divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 15, stiffness: 1, repeat: 1 }],
    bondRules: [],
    connectionRules: [],
    motorRules: [],
    parentRef: -1,
    generation: 0,
    founderId: -1,
  };
}

describe('Genome — clone + serialize', () => {
  it('cloneGenome deep-copies (mutating the clone never touches the original)', () => {
    const a = tinyGenome();
    const b = cloneGenome(a);
    b.genes[0]!.mass = 999;
    b.divisionRules[0]!.dist = 42;
    b.genes.push({
      innovation: 2,
      cellType: CellType.MOVER,
      radius: 6,
      mass: 2,
      initialEnergy: 0,
      bias: 0,
      sensorChannel: -1,
      glowGain: 0,
      senseSource: 0,
      sightTarget: 0,
    });
    expect(a.genes[0]!.mass).toBe(2);
    expect(a.divisionRules[0]!.dist).toBe(15);
    expect(a.genes.length).toBe(2);
  });

  it('serialize/deserialize round-trips exactly', () => {
    const a = tinyGenome();
    const back = deserializeGenome(serializeGenome(a));
    expect(back).toEqual(a);
  });
});

describe('GenomeStore', () => {
  it('assigns monotonically increasing refs from 0 (deterministic)', () => {
    const s = new GenomeStore();
    expect(s.register(tinyGenome())).toBe(0);
    expect(s.register(tinyGenome())).toBe(1);
    expect(s.register(tinyGenome())).toBe(2);
    expect(s.size).toBe(3);
  });

  it('get returns the stored genome; free removes it but does NOT recycle the ref', () => {
    const s = new GenomeStore();
    const r = s.register(tinyGenome());
    expect(s.get(r)!.seedGene).toBe(0);
    s.free(r);
    expect(s.get(r)).toBeUndefined();
    // Next ref keeps climbing — refs are never reused (lineage stays unambiguous, determinism).
    expect(s.register(tinyGenome())).toBe(1);
  });

  it('nextInnovationId is a monotonic counter independent of refs', () => {
    const s = new GenomeStore();
    expect(s.nextInnovationId()).toBe(0);
    expect(s.nextInnovationId()).toBe(1);
    s.register(tinyGenome());
    expect(s.nextInnovationId()).toBe(2);
  });
});

function geneOf(over: Partial<Gene> = {}): Gene {
  return {
    innovation: 0,
    cellType: 0,
    radius: 6,
    mass: 1,
    initialEnergy: 100,
    bias: 0,
    sensorChannel: -1,
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
    ...over,
  };
}

describe('Gene senseSource/sightTarget', () => {
  it('cloneGenome carries senseSource and sightTarget per gene', () => {
    const g: Genome = {
      seedGene: 0,
      genes: [geneOf({ senseSource: SenseSource.HEARING, sightTarget: SightTarget.PREY })],
      divisionRules: [],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
      founderId: -1,
    };
    const c = cloneGenome(g);
    expect(c.genes[0]!.senseSource).toBe(SenseSource.HEARING);
    expect(c.genes[0]!.sightTarget).toBe(SightTarget.PREY);
    // deep copy — mutating the clone does not touch the parent
    c.genes[0]!.senseSource = SenseSource.SMELL;
    expect(g.genes[0]!.senseSource).toBe(SenseSource.HEARING);
  });
});

describe('GenomeStore — list + library save/load', () => {
  it('list() returns refs + genomes in ascending ref order', () => {
    const s = new GenomeStore();
    s.register(tinyGenome());
    s.register(tinyGenome());
    const l = s.list();
    expect(l.map((e) => e.ref)).toEqual([0, 1]);
  });

  it('serialize/load the library round-trips the genomes', () => {
    const s = new GenomeStore();
    s.register(tinyGenome());
    s.register(tinyGenome());
    const json = serializeGenomeLibrary(s);
    const back = loadGenomeLibrary(json);
    expect(back.length).toBe(2);
    // register() lazily stamped the first founder with founderId 0 (was -1 in the builder).
    expect(back[0]!.genome).toEqual({ ...tinyGenome(), founderId: 0 });
    expect(back[0]!.ref).toBe(0);
  });
});
