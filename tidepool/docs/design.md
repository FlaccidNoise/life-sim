# Tidepool — Game Design

Status: locked with the owner (Josh) on 2026-10-09 by interview. This file says WHAT the game is.
`architecture.md` says how it is built. `roadmap.md` says in what order.

## 1. One paragraph

Tidepool is a free browser game. You are one small organism in a tall column of water full of other
organisms. Each of them is driven by its own evolved neural network. You steer, eat, flee, and choose
mates. When you die, the world runs forward several generations without you, and you continue as one of
your descendants in a world that has evolved to meet what your line became. You can leave your body at
any time and watch, inspect, and change the whole simulation.

It is a successor to the cell stage of Spore, with the simulation made real: you and every other
creature play by the same genetic rules.

## 2. Who it is for

- A portfolio piece on the owner's website. Free, no install, no account, no server.
- Desktop first. Playable on a recent phone by touch.
- The bar: a game or simulation developer who opens the link decides within a minute that the author is
  someone to hire. The first 60 seconds come first in every priority call. Depth reveals itself after.

## 3. Pillars

Use these to settle design arguments, in this order.

1. **Alive to watch.** Behavior you can read. A creature visibly decides. If a system passes its tests
   and the world looks dead, the system is wrong.
2. **Same rules for everyone.** The player's body, brain, genes, and reproduction are the same data and
   code as every other creature's. No player-only systems.
3. **The neural nets are the stars.** Brains grow, differ, remember, and can be opened and watched.
4. **Sandbox.** No required goal. A player who stays a grazer in the shallows forever is playing
   correctly. Zones, rivals, and the chronicle are pulls, never requirements.
5. **Looks and function are one thing.** A part does what it looks like it does. A sense you evolve
   changes what you see.

## 4. The core loop

1. **Arrive.** The page opens on a pre-evolved world already in motion, camera drifting in the shallows.
   No menu. One prompt: click any creature to become it.
2. **Live.** 3 to 6 minutes when played well. Steer, eat, flee, use the abilities your parts give you.
   Grow from juvenile to adult. Bud offspring. Find a mate and choose it. Offspring enter the world as
   ordinary creatures of your lineage, run by their own brains.
3. **Die.** Predation, starvation, or old age. The world freezes on the cause. A death card names what
   killed you and its lineage, and shows the killer's brain at the moment of the kill. A death the
   player's senses could not show them must still be explained after the fact.
4. **Skip.** The world fast-forwards many generations, with no player. The length is set by the
   throughput budget in `architecture.md`. A short montage shows population bands, your lineage's body
   changing, and rivals rising. The skip stops early if your lineage shrinks to its last few members.
5. **Read what changed.** A skip report in specific sentences ("your line lost its second eye", "the
   spiked reds now hunt at your depth") with before and after trait histograms. Thrive's players could
   not tell what a skip had changed. This report is the countermeasure.
6. **Choose an heir.** Three to five living descendants, picked to differ from each other. Each shows its
   body, what changed since you, and where it lives. Pick one and return to step 2. Thrive's players
   respawned into the failure that had just killed them. Heirs that differ, with the difference stated,
   are the countermeasure.
7. **No descendants.** That lineage's chronicle closes. You are in Watch mode in the same world. Possess
   any creature to start a new lineage. There is no game-over screen and the world never resets.

Rules that follow:

- Play runs at normal speed and can be paused. Watch can run at any speed.
- You can leave your body at any time. It continues under its own brain and stays in your lineage.
- Old age is mandatory. It keeps generations turning.

## 5. The creature

### 5.1 Body

One rigid body: position, heading, linear velocity, angular velocity. The outline comes from a few genes
(length, width, taper). Mass comes from area. A creature is born small and grows to adult size as it
banks energy. Parts scale with it.

Turning comes from torque applied at parts. Turn rate thus depends on the body and its speed. The draft
let turn rate ignore speed, and creatures spun in place inside their own body length.

### 5.2 Parts

A variable-length list of part genes. Each has a type, an anchor point on the outline, a size, and one or
two type-specific numbers. Parts are bilateral by default: one gene makes a mirrored pair.

| Family | v1 parts | Function |
|---|---|---|
| Mouth | Filter, Jaw | Filter eats plants and debris. Jaw bites flesh and must face its target. |
| Movement | Flagellum, Fin, Cilia | Force acts at the anchor. A rear flagellum pushes, a side one turns. Fins add turn authority. Cilia give slow motion in any direction. |
| Sense | Eye, Chemoreceptor, Lateral line | Eye sees a cone and needs light. Chemoreceptor reads scent. Lateral line feels nearby movement in any light. |
| Defense | Spike, Shell plate | Protect the arc they cover. A spike hurts the biter. A shell plate adds mass and drag. |
| Gland | Toxin gland, Photophore | Toxin cloud. Light: see in the dark, lure prey, or flash to blind eyes. |
| Body | Chloroplast, Fat store | Photosynthesis where there is light. Energy capacity. |

Every part costs energy to build, energy to keep, and mass to carry.

### 5.3 Abilities

Active abilities come from parts: dash (Flagellum), lunge (Jaw), toxin cloud (Toxin gland), flash
(Photophore). Each costs energy and has a cooldown. Each is one brain output, so NPCs evolve to use them.
The player's ability buttons are whatever their current body carries.

### 5.4 One currency

Energy is health, growth, and breeding budget. A bite removes energy. There is no separate health bar.

### 5.5 Genome

- Body genes, the part list, brain genes, life-history genes (maturity age, old age, brood size versus
  egg size), appearance genes (hue, pattern).
- Mutations: nudge a value, add a part, remove a part, duplicate a part, rarely change a part's type,
  plus the brain mutations in §6.
- Every gene carries a history id assigned when the gene first appears. Crossover lines up two genomes
  by history id. The draft could not do this: every founder gene had id 0.
- The genome can grow without a fixed upper bound on kinds of body. Hard caps on part count and brain
  size exist for performance and are set in `architecture.md`.

### 5.6 Reproduction

- **Budding.** A creature with enough energy buds offspring on its own. Each is a mutated copy. No
  population dies for lack of partners. The draft measured mate-finding as the top cause of failed
  reproduction.
- **Mixing.** Two creatures in contact that both agree exchange genes. The next brood of each is a
  crossover of its own genome with the partner's. Agreement is a brain output, so an NPC can refuse the
  player.
- **Lineage is a tree.** Every creature has exactly one parent: the one that budded it. A gene donor is
  recorded as a cross-link. "Your lineage" is everything descended, parent to child, from a creature you
  possessed. The chronicle draws a tree with donor links as thin cross-lines.
- **Mate choice for the player.** Approach a creature. An overlay compares its body, parts, and brain
  size with yours. Hold to court. Its brain decides.

## 6. The brain

- **Shape.** Node genes and connection genes. Mutation adds and removes neurons and connections, and
  nudges weights, biases, and time constants.
- **Wired to the body.** Each part type declares its inputs and outputs. Adding an Eye adds its inputs.
  Removing a Flagellum removes its dash output. A new part arrives with a few weak random connections,
  because the draft showed that anything wired at zero is never recruited by evolution.
- **Motor outputs.** `thrust` and `turn` always exist. The body's parts decide what force and torque
  those commands can produce. Each ability part adds one trigger output. Also `bite` and
  `accept mate`. A Filter mouth eats on contact with no output: the draft measured brain-gated eating
  at 2.7 times fewer creatures.
- **Own-body inputs.** Energy, hunger, age, damage just taken and from which side, speed, a constant.
- **Memory and rhythm.** Neurons keep state between ticks. Each neuron has an evolvable time constant.
  Slow neurons hold memory. Loops produce rhythm.
- **Cost.** Each neuron and each connection costs upkeep.
- **The player and their brain.** While the player steers, their inputs replace the motor and ability
  outputs. The brain still runs every tick. The viewer can show what the creature's instincts wanted.
  With the controls released, the brain drives.
- **Evolution only in v1.** Brains change between generations. Within-life learning is a world rule in
  the Lab panel, off by default, and arrives in a later milestone with a new rule. The brain's data
  layout reserves for it from the start and pays nothing while it is off. This revises the 2026-06-20
  decision that made learning core: the old rule reached 34% of the weights and measured net-harmful.

### 6.1 Brain viewer

A first-class feature. Inputs on the left grouped under their part's icon. Outputs on the right. Hidden
neurons between. Neurons light as they fire. Connections show sign and strength. The strongest path from
a sense to the current action is named in plain words ("smells predator left, turns right"). Any brain
can be compared with an ancestor's.

## 7. The world

### 7.1 The column

One continuous map, much taller than wide. Depth is the y-axis. Light falls off with depth. Rock shelves
with a few narrow gaps separate four zones. Everything is simulated all the time.

| Zone | Light | Food | Character |
|---|---|---|---|
| Shallows | Bright | Dense plants | Gentle. Grazers and small hunters. The visitor starts here. |
| Twilight | Dim, patchy | Sparse plants, sinking debris | Ambush country. Eyes work, barely. |
| Midwater | Dark | Debris falling from above | Filter feeders. Hunters that feel movement. |
| Abyss | Black | Vents on the floor | Bioluminescence. Large, slow, armored, strange. |

### 7.2 Food

Four sources. One resource produces one winner, which is how the draft became a monoculture.

1. **Plants.** Evolving, rooted entities with their own genome, where there is light.
2. **Debris.** Corpses and waste sink. What dies above feeds what lives below. The zones are one coupled
   ecosystem.
3. **Vents.** Fixed hot spots on the abyss floor.
4. **Flesh.**

### 7.3 Density

Predation cannot happen when the average gap between creatures is much larger than bite range. This was
the draft's hardest lesson. Food is patchy so life clumps. The world is sized so that local spacing sits
below interaction range. A headless probe checks encounter rates before any ecology tuning starts.

### 7.4 Persistence

The ecosystem is the save file. It is stored in the browser and resumes where it stopped. The page ships
with a baked world: a script runs the simulation for a long time, checks the health gates, and writes
the snapshot the page loads on first visit.

## 8. Perception

The player perceives what their creature can.

- **Eyes** set how far and in what arc the world is drawn clearly. Outside the cone the world is a dim
  silhouette. Eyes need light, so they fade with depth.
- **Chemoreceptors** draw scent as drifting colored trails.
- **Lateral line** draws ripples where things move.
- **Photophores** light a patch of the dark.

A creature with no senses for its zone leaves the player nearly blind there. That is intended. It is the
reason to evolve before descending.

## 9. Watch mode

Full visual debug control of the whole simulation, built to game-UI standard, not as a developer panel.

- Free camera over the whole column, with a column minimap.
- Time bar: pause, step, speeds up to fast-forward.
- Inspector for any creature: body, parts, genome, live brain, family tree.
- Charts: population by lineage and by diet, trait distributions, brain size over time.
- Overlays: light, scent, food, density, lineage.
- God tools: drop food, start a plague, raise a wall, seed a species, remove a creature, drag a creature.
- Lab panel: every simulation parameter as a live control, grouped and searchable, with presets and
  reset. The within-life learning toggle lives here.
- Possess any creature. Play and Watch are two views of one world with no loading between them.

## 10. Chronicle and rivals

- The game records each lineage the player has run: its family tree with a body thumbnail at each
  branch, what killed its members, what it drove extinct, the zones it reached.
- Other large lineages in the world are detected from the family tree, named, and tracked. The death
  card and the chronicle refer to them by name.
- Both are records. Neither sets a goal.

## 11. Look and sound

- **Sunlit to abyss.** One renderer whose lighting is driven by depth. Shallows: bright, translucent,
  microscope-slide feel, soft caustic light. Twilight and midwater: murky blue-green, silhouettes,
  drifting particles. Abyss: black, seen by bioluminescence and bloom.
- **Creatures** are drawn from the genome: translucent membrane, parts visible as organs, flagella that
  wave, jaws that snap, glow that shows in the dark.
- **Play HUD** is nearly absent: an energy ring on the player's body, ability buttons, a depth marker.
- **Audio** is generated from the simulation: an ambient bed that darkens with depth, soft tones for
  eating and births, a low cue when something that hunts your kind is near.

## 12. Not in v1

- Later Spore stages. The whole game is the microscopic column.
- Multicellular soft bodies. The genome does not reserve for them.
- Multiplayer, accounts, any server.
- A required goal or an endgame.
- Within-life learning switched on by default.
- Gamepad support. Sharing a creature or world by link. Both are wanted later.
- A parts shop or editor. The player's evolution is mate choice and heir choice only.

## 13. Risks the design must answer

Sources: `research/draft-inventory.md` (constraint ids C1 to C37, measured on the draft) and
`research/prior-art.md` §4.2 (what other games hit). A countermeasure marked CANDIDATE is not decided.

| # | Risk | Evidence | Countermeasure |
|---|---|---|---|
| R1 | Costed traits that rarely pay are stripped. Brains shrink to nothing and bodies go blind. This attacks pillar 3 directly. | C20, C21. Vision evolved down on every seed in the draft. | Parts and neurons arrive only with the thing that makes them useful. Patchy food so that sensing pays often. A health gate on mean brain size and sense-part count. If the gate fails, lower the cost before adding mechanisms. |
| R2 | The ecosystem collapses to one niche, most often all grazers. | C5 to C7, C15. Species ALRE and The Bibites report the same. | Four food sources. Mouths differ in what they can eat. A body cannot carry every mouth for free, which is a physical generalist penalty. Gate on predator share and diet spread at 12,000+ ticks on 3 seeds. |
| R3 | A guild that dies out in a world that never resets is gone for good. | C10: predators are founding-limited. | Zones act as refuges. Part-type mutation can rebuild a lost mouth. CANDIDATE: dormant cysts, where a lineage leaves a few long-delay eggs so that a guild can return after a crash. Test at the predation milestone. |
| R4 | Physical turning removes prey evasion and predators wipe prey out. | C17: population 40 against 1,877 at 12,000 ticks. | The dash ability and burst turns exist from the first predation milestone. Ecology is tuned only after the motor model is final. |
| R5 | Predators die out. | C9, C12 to C14. | A Jaw body can still filter or scavenge debris. Every energy source stops at "full". Transfers conserve energy. No feeding cooldown ships without a paired 3-seed long run. |
| R6 | Embodied deaths feel unfair, more so with sense-limited view. | Rain World, Osmos reviews. | The death freeze in §4. Cues a sense-poor body still gets: damage direction, a near-miss ripple. |
| R7 | Random brains do nothing for hours. | The Bibites FAQ. | The page ships a baked, pre-evolved world. Founders for the bake use hand-wired starter brains. |
| R8 | The brain viewer fills with dead neurons. | Creatures, The Bibites reviews. | Upkeep per neuron and connection. Mutation can prune. The viewer dims nodes that never fire. |
| R9 | "It is a trigger-to-action system, not a brain." | A Bibites review. The audience is developers. | Motor outputs are low level: thrust, turn, and one trigger per ability. The viewer states this openly. |
| R10 | Deeper means empty screen. | Thrive, Adapt reviews. C1. | Each zone is sized from mouth reach so that local spacing stays below it. Debris and light motes keep the dark zones visually alive. |
| R11 | A long-lived save is corrupted. | The Bibites review. | Versioned save format with a checksum. Keep the last good save. Export and import to a file. Safari deletes site storage after 7 days of browser use without a visit, so export matters. |
| R12 | Time-skip throughput. The draft's tick is far too slow for it. | C28: about 8 µs per creature per tick. | Throughput is a first-class budget, measured in `research/kernel-bench.md`, and a regression test from the first milestone. |
| R13 | "Full" creatures park. | C18: births fell 6 times. | A fed creature has something else to do: seek a mate, explore, bud. |

## 14. What to lead with

From `research/prior-art.md` §4.4. No surveyed game puts a steered player among individually simulated,
neurally controlled, evolving creatures. Confidence is medium, since it rests on not finding one.

1. **Let go and it keeps swimming.** Release the controls and the creature's own evolved brain takes
   over, shown live. This must be discoverable inside the first minute.
2. **Everything else alive is thinking too, and you can become any of it.**
3. **No parts shop. You die, generations pass, you return as a descendant, and the world wrote it down.**

"Tide pool" is already an alternate name for Spore's cell stage. The name supports the successor framing
and invites comparison with Spore's parts editor, which Tidepool does not have.

## 15. Decisions from the interview

| # | Question | Decision |
|---|---|---|
| 1 | Player unit | A lineage. Steer one creature. On death continue as a descendant. |
| 2 | Player's say in evolution | Mate choice and heir pick. Same genetics as NPCs. |
| 3 | How enemies get smarter | Time-skip on death, in a persistent world. The player's lineage is part of the ecosystem, so the world adapts to it with no special rule. |
| 4 | God mode | Yes. Watch mode on the same simulation, full debug control, high UI polish. |
| 5 | Scope | One scale, deep. |
| 6 | Body | Rigid body plus evolved parts. |
| 7 | Audience | Free web game on the owner's portfolio. Very high polish. |
| 8 | Stack | Decided by benchmark. See `research/kernel-bench.md` and `architecture.md`. |
| 9 | Goal | Sandbox. Zones, chronicle, and rivals are pulls. Endgame deferred. |
| 10 | Embodiment | Senses are the screen. Releasing the controls hands over to the brain. |
| 11 | Action | Parts give abilities. |
| 12 | Art | Sunlit to abyss. |
| 13 | Learning | Evolution only in v1. Lab toggle later, off by default. |
| 14 | Extinction | Skip stops at a bottleneck. No descendants closes the chapter. No game over. |
| 15 | Polish scope | Generative audio and touch play are in v1. |
| 16 | Name | Tidepool. |
| 17 | Brains | Growing topology, wired to the body, memory and rhythm, a first-class viewer. |
| 18 | World layout | One tall continuous world. |
| 19 | Life length | 3 to 6 minutes. |
| 20 | First ten seconds | A living world, then inhabit. |
| 21 | Reproduction | Bud alone, mix by choice. |
| 22 | Build order | Playable at every milestone. |
