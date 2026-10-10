# Tidepool prior art: evolution and artificial-life games

Research date: 2026-10-09. Scope: games and toys closest to Tidepool's locked design.

Method notes:
- Every factual claim links to the page it came from. Steam review quotes carry the review's `recommendationid`; they were pulled from the public Steam review API (`store.steampowered.com/appreviews/<appid>?json=1`), sorted by helpful votes.
- Steam review totals are all languages, all purchase types, as returned on the research date.
- Fan wikis (Fandom) are secondary sources. Where a claim rests only on one, the Confidence column says so.
- `UNCONFIRMED` means I looked and could not verify. The place I looked is stated.

## 1. Key findings

| Finding | Source | Confidence |
|---------|--------|------------|
| No surveyed title puts a directly-steered player inside a population whose members each run an evolved neural net. The neural sims are god-view; the embodied games use scripted AI and abstract evolution. | Sections 2-3; [extended search](#6-open-questions) returned no match | MEDIUM (absence of evidence) |
| Thrive, the closest embodied competitor, does not simulate NPC evolution per individual. Other species "evolve via a population dynamics driven simulation with random mutations", run while the player is in the editor, behind a loading screen. | [Thrive Steam page][thrive-steam], [Microbe Stage GDD][thrive-gdd], [progress update 2026-03-21][thrive-pu2026] | HIGH |
| The Bibites, the closest neural competitor, uses "a custom algorithm loosely based on" rtNEAT with fixed input and output neurons and evolvable hidden neurons and synapses. Its hotkey list has no direct-control binding. | [Bibites wiki: Brain][bib-brain], [Hotkeys][bib-hotkeys] | MEDIUM (fan wiki) |
| "Mate, then pick which offspring to continue as" shipped in Cubivore (2002). It is not new as a mechanic; it is new on top of a live evolving population. | [Wikipedia: Cubivore][cubivore-wp] | HIGH |
| "Spectate the ecosystem and control any living creature" shipped in Rain World: Downpour's Safari mode. | [Wikipedia: Rain World][rw-wp] | HIGH |
| The most repeated complaint against free-form evolved bodies is that they read as noise ("abominations", fish that "flop around"). It is aimed at Ecosystem, not at the constrained-body sims. | [Ecosystem Steam reviews][eco-reviews] ids 161794261, 178935734, 196095065 | HIGH |
| Evolution sims converge on one easy niche unless forced apart. Species ALRE drifts to all-herbivore; The Bibites wiki lists apex predation as "theorized to be possible". | [Species Steam reviews][species-reviews] ids 51091469, 50619246; [Bibites wiki: behaviors][bib-behaviors] | HIGH |
| Starting from random brains is slow: The Bibites' (outdated, v0.42) FAQ says a stable species "typically takes several hours with the default sim settings". | [Bibites wiki: FAQ][bib-faq] | MEDIUM (outdated page) |
| Spore's cell stage is the one Spore stage a lead designer singled out as having "an editor with consequence": part position matters. | [Soren Johnson, "Spore: My View of the Elephant"][soren] | HIGH |
| "Tide pool" is an existing alternate name for Spore's cell stage. Thrive's own devblog describes its arc as "from the tidepool to the stars". | [Wikipedia: Spore][spore-wp], [Thrive devblog #5][thrive-db5] | HIGH |

## 2. Core titles

### 2.1 Comparison matrix

| Title | Player role | NPC control | How NPCs evolve | Handling slow evolution | Platform |
|-------|-------------|-------------|-----------------|-------------------------|----------|
| Spore, cell stage | Embodied, plus parts editor | Scripted, named cell types ([wiki][spore-cell], fan) | They do not | Not applicable; stage lasts ~5-15 min ([wiki][spore-cell], fan) | PC |
| Thrive, microbe stage | Embodied, plus Mutation Point editor ([GDD][thrive-gdd]) | "Behavior scales", not neural ([GDD][thrive-gdd]) | Auto-evo: population model plus random mutation, run during editor ([Steam][thrive-steam], [GDD][thrive-gdd]) | Evolution happens between play segments | Win/Linux; Godot ([GamingOnLinux][thrive-gol]) |
| The Bibites | God and spectator; gene and brain editor ([Steam][bib-steam]) | Evolved neural net per creature ([wiki][bib-brain]) | Real-time, per individual | Speed multiplier; overnight runs ([FAQ][bib-faq], [reviews][bib-reviews]) | Win/Mac/Linux ([Steam][bib-steam]) |
| flOw | Embodied | Scripted | They do not | Not applicable | Flash, later PlayStation ([Wikipedia][flow-wp]) |
| Osmos | Embodied | Scripted or inert motes | They do not | Not applicable | PC, iOS ([Wikipedia][osmos-wp]) |
| Species: ALRE | God and experimenter; "the player in Species doesn't act as an agent within the game" ([devblog][thrive-db5]) | AI routines, behaviour states, emotions ([dev changelog][species-blog]) | Real-time, per individual | UNCONFIRMED (speed controls not verified; looked at Steam page and dev blog front page) | Win/Mac/Linux ([Steam][species-steam]) |
| Ecosystem | God and gardener ([Steam][eco-steam]) | Evolved "pipeline computer" brain driving joint torques ([Steam][eco-steam]) | Real-time, per individual | Leave running; players run it overnight ([reviews][eco-reviews] id 99305754) | Windows ([Steam][eco-steam]) |
| Creatures | Caretaker via on-screen hand ([Wikipedia][creatures-wp]) | Genetic neural net plus biochemistry ([Wikipedia][creatures-wp]) | Breeding across generations | Breeding is the game loop | PC |
| Adapt (unreleased) | Embodied, plus evolution-point parts shop ([itch][adapt-itch]) | "Complex species AI behaviors" ([itch][adapt-itch]); mechanism UNCONFIRMED | "Your competitors will evolve alongside you" ([press sheet][adapt-press]); mechanism UNCONFIRMED | UNCONFIRMED | Windows ([itch][adapt-itch]) |
| Evolution (Keiwan) | Builder, then spectator ([itch][keiwan-itch]) | Fixed feed-forward net ([forum][keiwan-brains]) | Genetic algorithm on weights | Generational batches | Browser, desktop, mobile ([GitHub][keiwan-gh]) |

### 2.2 Spore, cell stage

| Question | Finding | Source |
|----------|---------|--------|
| Player role | Embodied in a top-down 2D plane; grows by eating; spends DNA points on parts in a Cell Editor. | [Wikipedia][spore-wp], [Spore wiki][spore-cell] (fan) |
| Part acquisition | Parts unlocked by finding meteor fragments or killing cells that carry the part; about one DNA point per unit of food. | [Spore wiki][spore-cell] (fan) |
| Evolution visibility | Player growth changes scale: "large creatures in the background are drawn into the foreground as the player's organism evolves". | [Wikipedia][spore-wp] |
| Parts as function | "The exact position of each Proboscis, Flagella, and Cilia matters as the player-designed cell swims along". The later creature editor lost this: each part carried "a canned set of attributes" regardless of position. | [Soren Johnson][soren] |
| Praise | The cell stage "does deliver an editor with consequence". Will Wright described it as "like Pac-Man". | [Soren Johnson][soren] |
| Criticism | Whole game: "Individual gameplay elements are extremely simple" (GameSpot, via Wikipedia). Science magazine's panel: on evolution, Spore "failed miserably". Johnson's diagnosis: "Spore is not really a game about evolution. Spore is actually a game about creativity". | [Wikipedia][spore-wp], [Soren Johnson][soren] quoting [Bohannon 2008][flunking] |
| Scope lesson | Johnson: had scope been cut "to just the biological stages (cell and creature), the team could have focused on fully exploring the intersection of procedural content and evolutionary gameplay". | [Soren Johnson][soren] |
| Death handling | UNCONFIRMED. Looked in the Spore wiki Cell Stage page; it does not state the respawn rule. | [Spore wiki][spore-cell] |
| Steam reception | 67,577 positive / 5,379 negative (whole game). | Steam review API, app 17390 |

### 2.3 Thrive, microbe stage

| Question | Finding | Source |
|----------|---------|--------|
| Player role | Control one microbe; on reproduction enter the editor with 100 Mutation Points by default; "All other microbes of the player species in that biome will be changed to match the mutations". | [GDD][thrive-gdd] |
| Auto-evo | "Each time the player enters the editor, new species will arise from the player's own and each other using the auto-evo algorithm". Rebuilt in 0.7.0 as the Miche System: "defining various problems and pressures that organisms might face, and defining how species might respond". | [GDD][thrive-gdd], [devblog #43][thrive-db43] |
| NPC brains | No neural net. "Different modes of AI determined by various behavior scales" (predator scale, prey-like scale). | [GDD][thrive-gdd] |
| Making evolution visible | Editor report, patch map, population graphs ("Review and plan future actions by looking at population simulation results and graphs"). 0.7.1 reworked the auto-evo report and added a Food Chain tab. The Auto-Evo Exploration Tool runs several generations, draws a clade diagram, and offers "Play With Current Setting". | [Steam][thrive-steam], [GamingOnLinux][thrive-gol], [devblog #34][thrive-db34] |
| What does not work | A dev-forum thread titled "Explaining the auto-evo prediction to the player" exists; a search snippet says the prediction is "too difficult to use currently". I could not parse the thread body. Treat the quote as UNCONFIRMED. | [forum thread][thrive-forum-pred] |
| Time handling | Evolution runs in the editor. In 2026 the developers reported auto-evo "appears to run at least twice as fast, meaning you will spend a lot less time looking at a loading screen when entering the editor". The "100 million years per editor session" figure is UNCONFIRMED (seen only in a search snippet of a community post). | [progress update][thrive-pu2026] |
| Death | Camera freezes "to show how they died", then the player becomes another cell of the species "with low compound stores". No members left means extinction and game over. 0.7.0 added "continuing as a related species in easy mode". | [GDD][thrive-gdd], [devblog #43][thrive-db43] |
| Praise | Scientific depth; "The evolutionary tree and respective clades are really fun to observe" (id 128898721); free and open source. | [Steam reviews][thrive-reviews] |
| Complaints | Performance: "abysmal when you get an hour or so into the game" (id 107755539, 83 helpful). Loop: "wander aimlessly, hope the right stuff spawned near you" (id 105756476). Parts backfire: "You can quickly evolve into the most efficient organism ... before you start regressing as you get larger" (id 106692853). Lineage dead end: after extinction "the game only allows you to continue as that 1 recent branch. Since that branch is almost identical to the one that just failed, it usually goes extinct for the same reasons" (id 222661371). | [Steam reviews][thrive-reviews] |
| Steam reception | 1,628 positive / 138 negative. | Steam review API, app 1779200 |

### 2.4 The Bibites

| Question | Finding | Source |
|----------|---------|--------|
| Player role | God and spectator. "Play a benevolent god", or build creatures in the editor: "Tinker with every aspect of their genetic information and brains". Challenge levels with leaderboards were added on top. | [Steam][bib-steam] |
| Direct control | The in-game control list offers select, kill, lay egg, and "CTRL-dragging a bibite => Rotates bibite toward cursor". No steer or possess binding is listed. Absence elsewhere UNCONFIRMED. | [wiki: Hotkeys][bib-hotkeys] (fan, v0.6.3.1) |
| Brain architecture | "custom algorithm loosely based on the rt-NEAT algorithm". Input and output neurons are fixed and "can't be subjected to mutation. Only Hidden Neurons can mutate". | [wiki: Brain][bib-brain] (fan) |
| Topology change | Eight mutation types: change, flip, toggle, add, remove synapse; change a neuron's activation function; add neuron; remove neuron. Each has its own probability setting. | [wiki: Brain][bib-brain] (fan) |
| Inputs and outputs | Inputs are pre-digested: `PlantCloseness`, `PlantAngle`, `NBibites`, `EnergyRatio`, three pheromone strengths and angles, clock `Tic`. Outputs are intents: `Accelerate`, `Rotate`, `Want2Eat`, `Want2Attack`, `Herding`, `Grab`, three pheromone emitters. | [wiki: Brain][bib-brain] (fan) |
| Brain viewer | "Brain Inspector" with circular or linear graph layout, toggle for disabled synapses, and force-layout sliders (synaptic attraction, neuron repulsion). A separate Brain Editor exists. | [wiki: Brain Inspector][bib-inspector] (fan) |
| Reads as intelligent? | Reported behaviours: herding, scavenging, cannibalism, altruism, pheromone trickery, "grey goo". One reviewer: after overpopulation and starvation "They evolved to become omnivores" (id 189402208). Dissent: "naming what there is a neural network is disingenuous ... more of a trigger -> action system" (id 231520874); "I've in my time playing experienced 0 behaviors that function as intended or shown in any video" (id 221832353). | [wiki: behaviors][bib-behaviors], [Steam reviews][bib-reviews] |
| Making evolution visible | "family trees and lineage views", population stats over time. Lineage panel has tree and mesh views, hide-extinct, favourite lineages. Hotkeys jump to oldest creature or highest generation, with auto-reselect on death. | [Steam][bib-steam], [wiki: lineage][bib-lineage], [wiki: Hotkeys][bib-hotkeys] |
| Gap the dev names | Planned, not shipped at the time of the 0.6.2 devlog: "A Notification System to track events, take notes, and track significant changes to the simulation (like die-offs, new species, etc.)". | [devlog 0.6.2][bib-062] |
| Time handling | v0.42 FAQ: speed "up to a maximum of 11x", but "at higher speeds, the physics become less accurate"; recommended at most ~5x. Current maximum UNCONFIRMED. | [wiki: FAQ][bib-faq] (outdated) |
| Performance | No official creature count found. Fan wiki: grey-goo species "can easily reach over 1000 bibites". The dev is rebuilding on Unity DOTS, which "promises incredible improvements to performance (x10 to x100)". | [wiki: behaviors][bib-behaviors], [devlog 0.6.2][bib-062] |
| Praise | "does a great job showing visual data. I've been able to follow lineages survive multiple extinctions" (id 189402624). Used as a wall aquarium (id 199740281). Attachment: "got a species called 'ghostmcfloatium' and cried when it went extinct" (id 195861292). | [Steam reviews][bib-reviews] |
| Complaints | Documentation: "poor documentation ... just a PDF" (id 189451582). Pace: "more than 1000h of simulation to really see any difference" (id 193217996). Save corruption destroyed a long run (id 195443581). "super boring ... just sitting there doing nothing" (id 201118475). HN: "Would be interesting if it was easier to identify and compare their lineages. Hard to sort through all these little things swimming around". | [Steam reviews][bib-reviews], [HN thread][bib-hn] |
| Steam reception | 239 positive / 9 negative. | Steam review API, app 2736860 |

### 2.5 flOw and Osmos

| Topic | Finding | Source |
|-------|---------|--------|
| flOw: player role | Embodied aquatic organism that "grows and evolves by consuming other microorganisms". No simulation, no evolution of others. | [Wikipedia][flow-wp] |
| flOw: depth as difficulty | The world is "two-dimensional planes stacked vertically". Chen "allowed players to dive between planes at will and provided the option of eating or not eating any creature", so the player sets difficulty without a menu. "A blurred version of the layer below appears in the background of each plane." | [Wikipedia][flow-wp]; design rationale in [Chen's thesis][flow-thesis] |
| flOw: reach | 100,000 downloads in two weeks; over 3.5 million plays by 2008; no menus, "the game begins immediately". | [Wikipedia][flow-wp] |
| flOw: criticism | "there really isn't any sort of a challenge here", tied to "the player character's inability to die". | [Wikipedia][flow-wp] |
| Osmos: player role | Embodied mote; absorb smaller, avoid larger; move by ejecting own mass. | [Wikipedia][osmos-wp]; [Steam reviews][osmos-reviews] id 10195951 |
| Osmos: reception | IndieCade 2009 "Best in Show"; Apple iPad game of the year 2010. Steam 1,244 positive / 202 negative. | [Wikipedia][osmos-wp]; Steam review API, app 29180 |
| Osmos: complaints | Difficulty spike: "you would need to play the whole level on slow motion and just pray" (id 8908896); "This game is *NOT* relaxing" (id 30548955). The review implies a player time-rate control; exact feature UNCONFIRMED from the developer page. | [Steam reviews][osmos-reviews] |

### 2.6 Species: Artificial Life, Real Evolution

| Question | Finding | Source |
|----------|---------|--------|
| Player role | Deliberately not embodied. Developer: "the evolving creatures are autonomous beings, rather than player-controlled". Tools: climate and sea level, rovers "capable of performing automated artificial selection", a nursery. | [devblog #5][thrive-db5], [Steam][species-steam] |
| Making evolution visible | "real-time clade diagram", satellite map, "web of life", creature inspection. Marketed as "we give you the tools to tell it's story". A survivorship curve per species was added in 2022. | [devblog #5][thrive-db5], [Steam][species-steam], [dev blog][species-blog] |
| Species definition | "a collection of creatures connected by the ability to breed", measured by "genetic distance"; speciation happens when intermediates die (ring species). | [devblog #5][thrive-db5] |
| NPC brains | No neural net found. The changelog refers to "AI routine names, as utilized by the thought logger", "creature behavior states", and "emotion names". | [dev blog][species-blog] |
| Performance | Reviewer on GTX 980 Ti / i5-6600K: "60FPS up to around 1100 creatures, huge drop off to 1 FPS at around 1500 creatures" (id 47558780). Another: not "more than 500 creatures" above 50% detail (id 45100217). | [Steam reviews][species-reviews] |
| Praise | "probably the most realistic sandbox out there" (id 48323754); clade diagrams; teaching value. | [Steam reviews][species-reviews] |
| Complaints | Convergence: "All animals tend towards herbivores because it's the easiest was to obtain energy without risk" and "a very limited number of models for animal parts ... you'll see the same forms keep showing up" (id 51091469). Predators unviable: "Most attacks are instakills" (id 60412802). Crashes; "Abandonware" (id 205969573). | [Steam reviews][species-reviews] |
| Status | Latest post on the dev blog front page is dated 2022-11-25 (v0.14.2.6). Steam still lists Early Access per reviewers. | [dev blog][species-blog] |
| Steam reception | 739 positive / 264 negative ("Mostly Positive"). | Steam review API, app 774541 |

### 2.7 Ecosystem (Tom Johnson)

| Question | Finding | Source |
|----------|---------|--------|
| Player role | Sculpt terrain, seed plants and fish, optionally force traits ("requiring a species to have tentacles, be a certain size"). | [Steam][eco-steam] |
| Brain | "a pipeline computer where, every moment, data from sense organs passes through a network of neurons and finally contracts a muscle in a specific body part". Body and brain are both encoded in the genome. Inspired by Karl Sims. | [Steam][eco-steam], [Naked Scientists interview][eco-interview] |
| Brain viewer | UNCONFIRMED. Not mentioned on the Steam page or in the interview. | [Steam][eco-steam] |
| Making evolution visible | "population charts for both animals and plants" and "phylogenetic trees for individual species". | [Steam][eco-steam] |
| Praise | "these fish are not pre-programmed or pre-designed ... a digital genome that encodes their morphology and the structure of their brain" (id 88548849, 282 helpful). One player has 402 hours from overnight runs (id 99305754). | [Steam reviews][eco-reviews] |
| Complaints | Legibility of bodies: "little more than some kind of over stretched, messy looking monsters" (id 161794261); "EVERY fish flops around all weird" (id 178935734); "sideways-sliding fish with flailing fins" (id 196095065). Convergence: "all your ecosystems look the same" (id 196230493). Dead time: "The early stage of the game is very boring, there needs to be something to do in the meantime" (id 88651333, 290 helpful). Performance at "10-20% of the map" occupied (id 93182308). Tutorial (id 178729459). | [Steam reviews][eco-reviews] |
| Steam reception | 489 positive / 150 negative ("Mostly Positive"). | Steam review API, app 1133120 |

### 2.8 Creatures (Cyberlife)

| Question | Finding | Source |
|----------|---------|--------|
| Player role | Caretaker using a hand cursor; names, photographs, medicates, and records deceased norns. | [Wikipedia][creatures-wp] |
| Brain | "genetically-defined artificial neural networks usually built of about 10 layers (called lobes), maybe 900 neurons, and many thousands of dendrites". Coupled to simulated biochemistry and drives that "give punishment when they are raised, and reward when they are lowered", so norns learn within a lifetime. | [Creatures wiki: Brain][creatures-brain], [Wikipedia][creatures-wp] |
| Topology change | Lobe genes can duplicate ("multi-lobed" creatures, 36+ lobes reported in Creatures 1), but "many are simple duplications ... and don't make the creature any smarter". "in Creatures 3 base genomes, the brains do not mutate". | [Creatures wiki: Brain][creatures-brain] |
| Brain visualisation | Creatures 2 "introduced an Ecology Kit and Neuroscience Kit". Details of the view UNCONFIRMED. | [Wikipedia][creatures-wp] |
| Reads as intelligent? | "The Norns turned out to behave similarly to living creatures." Design goal: creatures that "seem 'genuinely alive'". | [Wikipedia][creatures-wp] |
| Reach | 500,000 copies of Creatures sold by Q2 1998; community still active in 2026. | [Wikipedia][creatures-wp] |
| Complaint | Creatures 2 "was considered 'much more difficult' ... and the new, more challenging environment and norn biology was described as frustrating". | [Wikipedia][creatures-wp] |

### 2.9 Adapt, Biogenesis, Evolution (Keiwan), Primer

| Title | Finding | Source |
|-------|---------|--------|
| Adapt | Embodied survival; "you will earn evolution points which allow you to purchase new parts to help your future generations". "Find a mate, place a nest". Lists "Visual, audio, and scent queues". Release date TBA. | [itch][adapt-itch], [press sheet][adapt-press] |
| Adapt | Developer in comments: "When evolving during gameplay, your offspring will change, but not your current animal. Also, in the Demo you can't play as your offspring. The inheritance feature is disabled". So play-as-descendant is planned, not yet playable in public. | [itch comments][adapt-itch] |
| Adapt | Demo feedback: tutorial soft-lock; "I was not able to find any other creature to interact with at all"; "lethargic speed". Itch rating 4.3/5 from 41 ratings. | [itch comments][adapt-itch] |
| Biogenesis | Named by the Species developer as an example of "fast-paced natural selection sims" and the "spiritual successor" of Primordial Life. All other details UNCONFIRMED: the project site returned a bot challenge. | [devblog #5][thrive-db5]; tried [biogenesis.sourceforge.net][biogenesis] |
| Evolution (Keiwan) | Build a creature from "joints, bones and muscles"; a neural net plus genetic algorithm learns running, jumping, climbing, flying. Inspired by Karl Sims. | [itch][keiwan-itch], [GitHub][keiwan-gh] |
| Evolution (Keiwan) | Brain is "a simple feed-forward neural network", fully connected layers, sigmoid activation, one output per muscle. Topology does not evolve; weights do. A diagram of the network sits in settings. | [itch forum][keiwan-brains] |
| Evolution (Keiwan) | Runs in browser. 4.5/5 from 1,344 itch ratings. Author's disclaimer: "more of a sandbox simulator ... than a real game. There are no achievements or player rewards". A user GIF collection thread has 148 posts. | [itch][keiwan-itch] |
| Primer | Blob creatures with size, speed, and sensing traits. "Seeing the populations' traits change in realtime as the generations pass is a powerful way to make sense of a complex concept." Specific visual techniques UNCONFIRMED from text sources; the videos themselves were not reviewed. | [Kottke][primer-kottke] |

## 3. Other close matches

| Title | Why it matters to Tidepool | Source |
|-------|----------------------------|--------|
| Rain World | Embodied creature in an ecosystem where "creatures act independently from the player and perpetually roam". Reviews "criticized its difficulty, checkpoint system, and controls"; critics were "more or less interested in the game based on how lucky they were with enemy behavior". Gained "a cult following". | [Wikipedia][rw-wp] |
| Rain World: Downpour | "Safari mode allows the player to spectate the ecosystem and control any living creature." Direct precedent for Watch mode plus possession, on a non-evolving sim. | [Wikipedia][rw-wp] |
| Rain World, animation | Procedural animation let the AI "create unintentional behaviors like creatures appearing 'frustrated' when failing to hunt". Animation, not the AI model, carried the read. | [Wikipedia][rw-wp] |
| Cubivore (2002) | Mate, then "the player is given the option of selecting from the pool of possible offspring". Continue as the offspring. | [Wikipedia][cubivore-wp] |
| Niche | Breeding game that "simulates over 100 genes"; turn-based; "inspired by Creatures, Spore, and Don't Starve". Mate choice as the whole game. | [Wikipedia][niche-wp] |
| E.V.O.: Search for Eden | Embodied evolution via points spent per body section; death costs "roughly half" the points. The parts-shop lineage Tidepool rejects. | [Wikipedia][evo-wp] |
| Ancestors: The Humankind Odyssey | Lineage play across generations; 2 million copies by April 2024. Polygon: "death isn't a tragic event ... in the next generation, my clan will understand a little more". IGN criticised "the progression as obtuse". | [Wikipedia][ancestors-wp] |
| The Life Engine | Browser cellular automaton. Organisms are built from typed cells (mouth, producer, mover, killer, armor, eye) whose colour is their function. No fitness function: "allows true natural selection to run its course". | [GitHub][lifeengine] |
| ALIEN | GPU particle engine; "Each cell is controlled by its own small neural network"; "millions of particles in real time"; first prize, ALIFE 2024 Virtual Creatures Competition. God-view only ("push creatures around"). Requires a discrete GPU (CUDA). | [GitHub][alien] |
| biosim4 | Source for the video "I programmed some creatures. They evolved." Command-line; now maintenance-only. Legibility came from the video, not the tool. | [GitHub][biosim4] |
| Polyworld | Agents with genome-derived neural nets and Hebbian learning; population "typically only in the hundreds"; emergent "cannibalism, predators and prey, and mimicry". Research tool. | [Wikipedia][polyworld-wp] |
| Dwarf Fortress, Legends mode | "players can view maps, histories of each civilization" of a generated world. The reference for a generated chronicle. | [DF wiki][df-legends] |
| Cell Lab | UNCONFIRMED details. A store-listing snippet reports over 1,000,000 Google Play installs and a fast-forward control; I did not open a primary page. | search snippet only |

## 4. Synthesis

### 4.1 What to steal

| Idea | Proven where | Apply to Tidepool as |
|------|--------------|----------------------|
| Depth is the difficulty dial, chosen by swimming | flOw: dive "between planes at will"; blurred layer below visible ([Wikipedia][flow-wp]) | Let the player see a hint of the next depth band before committing. This is Tidepool's tall world, already validated. |
| Part position has mechanical effect | Spore cell stage, per its own designer ([Soren Johnson][soren]) | Keep "parts function as they look" strict. A fin's thrust comes from where it is mounted. |
| Colour or shape equals function | The Life Engine's typed cells ([GitHub][lifeengine]) | A stranger must be readable at a glance: mouth, spike, shell. |
| Explicit niches to keep the ecosystem diverse | Thrive's Miche System ([devblog #43][thrive-db43]) | The fast-forward step should protect niche diversity, not only fitness. |
| Force-directed brain graph with a toggle for disabled synapses | Bibites Brain Inspector ([wiki][bib-inspector]) | Baseline for the brain viewer. Add live activation, which the wiki page does not document. |
| Named, sensor-tied inputs and outputs | Bibites `PlantAngle`, `Want2Eat` ([wiki][bib-brain]) | Tie every input and output to a visible body part, which Tidepool already plans. That answers the "what does this node mean" question on screen. |
| Select oldest, select highest generation, auto-reselect on death | Bibites hotkeys ([wiki][bib-hotkeys]) | Watch-mode camera shortcuts. |
| Lineage tree with hide-extinct and favourites | Bibites lineage panel ([wiki][bib-lineage]) | Chronicle navigation. |
| Real-time clade diagram and a thought logger | Species ALRE ([devblog #5][thrive-db5], [dev blog][species-blog]) | Clade view in Watch mode; a plain-language line for what a creature is doing now. |
| Species by genetic distance, splitting when intermediates die | Species ALRE ([devblog #5][thrive-db5]) | Rival lineages in the chronicle need a principled species boundary. |
| Generate a history, then offer "play in it" | Thrive Auto-Evo Exploration Tool: "Play With Current Setting" ([devblog #34][thrive-db34]) | Watch mode to possession is the same move. |
| Freeze on death to show the cause | Thrive ([GDD][thrive-gdd]) | Show the killer and, in Tidepool's case, its brain state at the moment of the kill. |
| Offspring pool to choose from | Cubivore ([Wikipedia][cubivore-wp]) | Descendant picker after the time skip. |
| Spectate and control any creature | Rain World Safari ([Wikipedia][rw-wp]) | Watch/god mode. Cite it as precedent when pitching. |
| Procedural animation to make AI read as intent | Rain World ([Wikipedia][rw-wp]) | Cheap animation cues (flinch, lunge wind-up) will do more for "intelligent" than network size. |
| Naming creates attachment | Bibites species names; "cried when it went extinct" ([reviews][bib-reviews] id 195861292). Creatures: naming, photos, death records ([Wikipedia][creatures-wp]) | Auto-name lineages and rivals in the chronicle. |
| Zero-install browser reach | flOw: no menus, starts at once ([Wikipedia][flow-wp]). Keiwan: 1,344 itch ratings on a browser build ([itch][keiwan-itch]) | Tidepool's browser target is a real advantage over Bibites, Thrive, Ecosystem, ALIEN (all downloads). |
| Trait distributions shifting over generations | Primer ([Kottke][primer-kottke]) | Post-skip summary: show two histograms, before and after. |
| Shareable clips | Keiwan's GIF collection thread ([itch][keiwan-itch]) | One-click clip or seed share from Watch mode. |

### 4.2 Known traps

| Trap | Who hit it | Tidepool exposure |
|------|------------|-------------------|
| Random brains do nothing for hours | Bibites: virgin bibites "swim backwards, swim in circles, ignore food"; stable species "typically takes several hours" ([FAQ][bib-faq], outdated) | HIGH. The first session must start from a pre-evolved world. Bibites ships template creatures and pre-wiring ([HN][bib-hn]). |
| Evolution too slow to notice | Bibites: "more than 1000h" (id 193217996). Ecosystem: "requires immense patience" (id 178634729) ([reviews][bib-reviews], [reviews][eco-reviews]) | HIGH. The death fast-forward must produce visible change, at browser compute budgets. Thrive needs a loading screen even for an abstract population model ([progress update][thrive-pu2026]). |
| Player cannot tell what changed after a skip | Thrive reworked its auto-evo report in 0.7.1 and added a Food Chain tab ([GamingOnLinux][thrive-gol]); prediction readability was a dev-forum topic ([thread][thrive-forum-pred]). Bibites overnight: "Hard to sort through all these little things" ([HN][bib-hn]) | HIGH. The chronicle is the mitigation; it has to be specific ("your line lost its second eye; the spiked reds now hunt at your depth"). |
| Respawn into the same failure | Thrive: the continuing branch "is almost identical to the one that just failed, it usually goes extinct for the same reasons" (id 222661371) ([reviews][thrive-reviews]) | HIGH. A descendant several generations on may be no better adapted to what killed the player. Offer several descendants that differ, and say how. |
| Embodied play in a live ecosystem feels unfair | Rain World: interest depended on "how lucky they were with enemy behavior" ([Wikipedia][rw-wp]). Osmos: late levels "more frustrating than it is fun" (id 8908896) ([reviews][osmos-reviews]) | HIGH, and sense-limited rendering makes it worse. Deaths need a visible cause. Thrive's death freeze is the minimum. |
| Evolved bodies read as noise | Ecosystem: "abominations", "flop around" ([reviews][eco-reviews]) | LOW to MEDIUM. One rigid body plus discrete parts is the Bibites and Spore-cell side of this line. Guard symmetry: an Ecosystem reviewer notes "symmetry is off by default" (id 206902646). |
| Ecosystem collapses to one niche | Species: all herbivores, "predators are pretty much impossible to breed" (ids 51091469, 60412802). Bibites: apex predation "theorized" ([wiki][bib-behaviors]). Ecosystem: "all your ecosystems look the same" (id 196230493) | HIGH. A deep, dangerous world needs predators that persist. Thrive answered with explicit niches ([devblog #43][thrive-db43]). |
| Neural behaviour dismissed as fake | Bibites: "trigger -> action system", outputs like "move towards, attack" are "too complex from the very start" (id 231520874) ([reviews][bib-reviews]) | MEDIUM. The target audience is developers. High-level outputs are readable but invite this charge; low-level outputs invite noise. State the choice openly in the viewer. |
| Brain mutation that adds size, not ability | Creatures: duplicated lobes "don't make the creature any smarter" ([Creatures wiki][creatures-brain]). Bibites: "Too much useless neurons" (id 193217996) | MEDIUM. Variable topology needs a cost per neuron and pruning, or the viewer fills with dead nodes. |
| Empty wandering | Thrive: "Floating through massive empty areas" (id 106692853). Adapt demo: no other creature found in an in-game year ([itch][adapt-itch]). Ecosystem: early stage "very boring" (id 88651333) | MEDIUM. "Deeper is sparser" must not mean nothing on screen. |
| Adding parts makes you worse | Thrive: "evolving to add new modules / organelles is often counterproductive" (id 106692853) | LOW. No parts shop. But a descendant with a costly new part can feel like a downgrade; show the trade. |
| Population performance cliff | Species: 1,100 fine, 1,500 at 1 FPS (id 47558780). Thrive: unplayable after ~3 hours (id 106078969). Ecosystem at 10-20% map (id 93182308) | HIGH in a browser. Budget creature count before designing the world height. |
| Long-run save corruption | Bibites: a save "with hundreds of simulated hours was completely ruined" (id 195443581) | HIGH. A persistent world across sessions raises the cost of any sim or serialisation bug. |
| Weak onboarding | Bibites "just a PDF" (id 189451582). Ecosystem tutorial popups unrelated to the current action (id 178729459). Thrive "tutorials aren't clear enough" (id 177312200) | MEDIUM. flOw's answer was no menus and immediate play ([Wikipedia][flow-wp]). |
| "Nothing to do" sandbox | Bibites: "just sitting there doing nothing" (id 201118475). Bibites later added challenges and leaderboards ([Steam][bib-steam]). flOw: "there really isn't any sort of a challenge" ([Wikipedia][flow-wp]) | MEDIUM. Embodiment gives survival as an implicit goal. The chronicle has to supply the long arc. |
| Theme promises evolution, mechanics deliver something else | Spore ([Soren Johnson][soren]) | LOW if the player's lineage really runs on NPC genetics. Do not add a hidden player-only boost. |
| Scope spread | Spore: "making five games at once"; Johnson argues for cell and creature only ([Soren Johnson][soren]). Thrive: reviewer asks devs to "drop the 'macroscopic' parts" (id 231320301) | LOW. Tidepool is one stage by design. Hold that. |

### 4.3 Open space

| Tidepool feature | Closest prior art | Gap |
|------------------|-------------------|-----|
| Embodied player among individually simulated, neurally controlled, evolving NPCs | Bibites, Ecosystem, ALIEN, Polyworld have the NPCs but no embodiment. Thrive, Spore, Adapt have embodiment but scripted or abstracted NPCs. | No surveyed title combines them. An extended web search for a playable-creature neuroevolution game returned no match. Not proof none exists. |
| Player evolves through the same genetics as NPCs, no shop | Cubivore and Niche use mate choice, but NPCs are not a co-evolving population. Thrive, Spore, Adapt, E.V.O. all use point shops ([GDD][thrive-gdd], [Spore wiki][spore-cell], [itch][adapt-itch], [Wikipedia][evo-wp]). | Open. Thrive's developers called their own editor a realism trade: "we traded some realism in allowing the player to choose their mutations each generation" ([devblog #5][thrive-db5]). |
| Releasing controls hands the body to its own evolved brain | None found. | Open. This is also the fastest proof that the creature has a brain at all. |
| Player view limited to the creature's senses; scent as trails | Adapt lists "visual, audio, and scent" cues ([itch][adapt-itch]). The neural sims are all god-view. | Mostly open. Whether Adapt restricts the view to senses is UNCONFIRMED. |
| Death triggers a multi-generation fast-forward, resume as descendant | Thrive evolves during the editor and respawns you as a sibling ([GDD][thrive-gdd]). Adapt plans play-as-offspring ([itch][adapt-itch]). Ancestors has generational play ([Wikipedia][ancestors-wp]). | Partly open. The individual-level fast-forward is new; the respawn-into-failure trap is documented. |
| Generated prose chronicle of your lineage and rivals | Species sells clade tools as "tell your story" ([Steam][species-steam]). Bibites lists an event notification system as planned ([devlog][bib-062]). Dwarf Fortress Legends is the model outside the genre ([DF wiki][df-legends]). | Open inside the genre. |
| Watch/god mode on the same sim, with possession | Rain World Safari ([Wikipedia][rw-wp]); Thrive's exploration tool to "Play With Current Setting" ([devblog #34][thrive-db34]). | Done before on non-evolving or abstract sims. Not on a neuroevolving one. |
| First-class live brain viewer | Bibites Brain Inspector ([wiki][bib-inspector]); Creatures 2 Neuroscience Kit ([Wikipedia][creatures-wp]). | Not open as a feature. Open as "your own body's brain, live, while you are inside it". |
| Browser delivery of a neural ecosystem | The Life Engine (no brains) ([GitHub][lifeengine]); Keiwan's Evolution (single creature, no ecosystem) ([itch][keiwan-itch]). | Open. Every neural ecosystem surveyed is a download. |

Did anyone try the core combination and fail?
- Not found. The nearest record is a choice, not a failure: the Species developer rejected an embodied player on purpose, for a science-experiment framing ([devblog #5][thrive-db5]).
- Thrive pairs embodiment with a population-level evolution model instead of simulated individuals ([Steam][thrive-steam]). The reason for that choice is UNCONFIRMED; I did not find a statement of it.
- Spore's team did not pursue the biological stages in depth; its designer later called that the missed opportunity ([Soren Johnson][soren]).

### 4.4 Ten-second pitch test

Lead with these three, in this order:

1. **Let go and it keeps swimming.** You steer one creature; release the controls and its own evolved brain takes over, with the brain shown live. No surveyed game does this, it demonstrates in one GIF, and it proves the neural claim that a Bibites reviewer disputed ([reviews][bib-reviews] id 231520874).
2. **Everything else alive is thinking too, and you can jump into any of it.** Bibites-style neuroevolution, but you are in the water with it. Rain World's Safari is the only possession precedent and its creatures do not evolve ([Wikipedia][rw-wp]).
3. **No parts shop. You die, generations pass, you return as a descendant, and the world wrote down what happened.** Same genetics for player and NPCs is the answer to Spore's "not really a game about evolution" ([Soren Johnson][soren]) and to Thrive's own admitted realism trade ([devblog #5][thrive-db5]).

Hold back as secondary: the depth-as-difficulty world (flOw did it in 2006), the brain viewer on its own (Bibites has one), sense-limited view (strong in play, weak in a ten-second pitch).

Naming note: "tide pool" already means Spore's cell stage to that audience ([Wikipedia][spore-wp]). That supports the successor framing. It also invites direct comparison with Spore's parts editor, which Tidepool does not have; say so early.

## 5. Sources not reached

| Target | What happened |
|--------|---------------|
| Thrive developer wiki pages `Auto-Evo`, `Auto-Evo_Algorithm` | Pages exist as empty stubs to anonymous readers. Used the Microbe Stage GDD and devblogs instead. |
| Thrive forum thread 836 body | Discourse HTML did not yield post text. Only the title and a search snippet are used, flagged. |
| GameSpot Rain World review | Fetch returned an empty body. Rain World reception is cited from Wikipedia only. |
| Biogenesis site | Returned a bot challenge. |
| Science, "Flunking Spore" | Not fetched (dead link per Wikipedia). Quoted through Soren Johnson and Wikipedia. |
| Primer videos | Not watched. Only a text description is cited. |
| Wikipedia pages for SimLife, Framsticks | Rate-limited; dropped. |

## 6. Open questions

- Does any current Bibites build allow steering a creature? The hotkey list says no; the Discord and Patreon builds were not checked.
- What is Thrive's stated reason for a population-model auto-evo over simulated individuals, and what does it cost in compute per generation? This bounds Tidepool's fast-forward design.
- How does Adapt evolve its competitor species, and does it limit the player's view to senses? Its mechanics are described only in marketing copy.
- What creature count does a browser neural sim hold at 60 FPS? No surveyed title publishes a figure; Species' 1,100-creature ceiling is a native 3D build on 2015 hardware.
- Does Ecosystem expose a brain view? Not found.
- How do Primer's videos stage a generation change visually? Needs a direct watch.
- Is there an embodied neuroevolution game outside English-language stores or in academic work (for example rtNEAT-based games)? One extended search found none; itch.io's `neural-network` tag was not walked.

[spore-wp]: https://en.wikipedia.org/wiki/Spore_(2008_video_game)
[spore-cell]: https://spore.fandom.com/wiki/Cell_Stage
[soren]: https://www.designer-notes.com/spore-my-view-of-the-elephant/
[flunking]: https://doi.org/10.1126/science.322.5901.531b
[thrive-steam]: https://store.steampowered.com/app/1779200/
[thrive-gdd]: https://wiki.revolutionarygamesstudio.com/wiki/Microbe_Stage_GDD
[thrive-db43]: https://www.revolutionarygamesstudio.com/devblog-43-meshes-and-miches
[thrive-db34]: https://revolutionarygamesstudio.com/devblog-34-sticky-phylogeny/
[thrive-db5]: https://www.revolutionarygamesstudio.com/devblog-5-thrive-vs-species
[thrive-pu2026]: https://www.revolutionarygamesstudio.com/progress-update-3-21-2026
[thrive-gol]: https://www.gamingonlinux.com/2024/10/open-source-evolution-sim-thrive-v0-7-1-is-a-feature-packed-release
[thrive-forum-pred]: https://forum.revolutionarygamesstudio.com/t/explaining-the-auto-evo-prediction-to-the-player/836
[thrive-reviews]: https://steamcommunity.com/app/1779200/reviews/
[bib-steam]: https://store.steampowered.com/app/2736860/
[bib-brain]: https://the-bibites.fandom.com/wiki/Brain
[bib-inspector]: https://the-bibites.fandom.com/wiki/Brain_Inspector
[bib-hotkeys]: https://the-bibites.fandom.com/wiki/Hotkeys
[bib-faq]: https://the-bibites.fandom.com/wiki/FAQ
[bib-behaviors]: https://the-bibites.fandom.com/wiki/List_of_Common_Behaviors
[bib-lineage]: https://the-bibites.fandom.com/wiki/Ancestral_Lineage_Panel
[bib-062]: https://thebibites.itch.io/the-bibites/devlog/973592/the-bibites-062-steam-workshop-and-toward-the-future
[bib-reviews]: https://steamcommunity.com/app/2736860/reviews/
[bib-hn]: https://news.ycombinator.com/item?id=34386570
[flow-wp]: https://en.wikipedia.org/wiki/Flow_(video_game)
[flow-thesis]: https://www.jenovachen.com/flowingames/designfig.htm
[osmos-wp]: https://en.wikipedia.org/wiki/Osmos
[osmos-reviews]: https://steamcommunity.com/app/29180/reviews/
[species-steam]: https://store.steampowered.com/app/774541/
[species-blog]: https://speciesdevblog.wordpress.com/
[species-reviews]: https://steamcommunity.com/app/774541/reviews/
[eco-steam]: https://store.steampowered.com/app/1133120/
[eco-interview]: https://www.thenakedscientists.com/node/199360
[eco-reviews]: https://steamcommunity.com/app/1133120/reviews/
[creatures-wp]: https://en.wikipedia.org/wiki/Creatures_(video_game_series)
[creatures-brain]: https://creatures.wiki/Brain
[adapt-itch]: https://paul-herve.itch.io/adapt-prologue
[adapt-press]: https://slugdisco.com/press/sheet.php?p=adapt
[biogenesis]: https://biogenesis.sourceforge.net/
[keiwan-itch]: https://keiwan.itch.io/evolution
[keiwan-gh]: https://github.com/Keiwando/evolution
[keiwan-brains]: https://itch.io/t/433790/information-on-creature-brains
[primer-kottke]: https://www.kottke.org/19/07/simulating-natural-selection
[rw-wp]: https://en.wikipedia.org/wiki/Rain_World
[cubivore-wp]: https://en.wikipedia.org/wiki/Cubivore:_Survival_of_the_Fittest
[niche-wp]: https://en.wikipedia.org/wiki/Niche_(video_game)
[evo-wp]: https://en.wikipedia.org/wiki/E.V.O.:_Search_for_Eden
[ancestors-wp]: https://en.wikipedia.org/wiki/Ancestors:_The_Humankind_Odyssey
[lifeengine]: https://github.com/MaxRobinsonTheGreat/LifeEngine
[alien]: https://github.com/chrxh/alien
[biosim4]: https://github.com/davidrmiller/biosim4
[polyworld-wp]: https://en.wikipedia.org/wiki/Polyworld
[df-legends]: https://dwarffortresswiki.org/index.php/Legends
