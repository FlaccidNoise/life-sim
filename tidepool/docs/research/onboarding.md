<!-- Saved by the orchestrator on 2026-10-13 from the report of a research agent. The text below is the agent's, unchanged. The orchestrator did not open the sources again: a row marked A rests on an abstract or a search summary, so treat its numbers as not verified. What the project does with this is in ../plans/2026-10-13-walkthrough.md. -->

# Tidepool onboarding: research and a proposed walkthrough

Date: 2026-10-13. Read-only research. No repo file was changed.

How to read the "Checked" column:

- **P**: I fetched the primary source and read the passage.
- **S**: I fetched a secondary write-up or a transcript of the primary.
- **A**: abstract or search-result summary only. The full text was not read. Treat numbers as unverified.

Repo sources are cited as `file:line`. Paths that start with `src/` are relative to `tidepool/`. All others are relative to `tidepool/docs/`.

---

## 1. Findings

### 1.1 Game onboarding craft

| # | Finding | Source | Evidence type | Checked |
|---|---|---|---|---|
| F1 | Tutorials raised play only in the complex, unconventional game. Foldit with in-context tutorials: 75% more levels and 29% longer play than no tutorial. Refraction and Hello Worlds (simple browser games): no significant gain in time or levels. | Andersen et al., CHI 2012, 45,000+ players, randomized. https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf | Measured result | P |
| F2 | A tutorial can lower retention in a simple browser game. Hello Worlds with in-context tutorials: return rate 17.96% against 21.60% with none (p < 0.001). | Same paper, Table 3 | Measured result | P |
| F3 | Teaching in context beat an up-front manual where tutorials mattered at all. Foldit: 40% more levels, 16% longer. No effect in the two simple games. | Same paper | Measured result | P |
| F4 | Forcing the player through a step (blocking, with the rest of the screen greyed) did not help in any of the three games. The authors' reading: players learn the interface by experiment. | Same paper | Measured result | P |
| F5 | A help button is not a safe default. Help alone: Foldit +12% play time. Refraction: 12% fewer levels and 15% less time. Hello Worlds: about 3 points lower return. The authors can only guess why. | Same paper | Measured result | P |
| F6 | A card-deck tutorial before first use gave no gain and made the task feel harder. 70 users, 4 phone apps. Success 91% (read) against 94% (skipped), not significant. Ease 4.92 against 5.49 of 7, p = 0.047. | Kendrick, NN/g, 2020. https://www.nngroup.com/articles/mobile-tutorials/ | User study | P |
| F7 | George Fan's ten rules from Plants vs. Zombies: blend the tutorial into the game; do, not read; spread the teaching out; get the player to do it once; at most about eight words on screen; passive messages that need no OK click; adaptive messages shown only when the player is stuck; no noise; let the look of a thing teach its function; use what people already know. | GDC 2012 talk. Listing: https://gdconf.com/news/gdc_2012_reveals_plants_vs_zom . Two write-ups that agree: https://notes.hamatti.org/sources/talks/how-i-got-my-mom-to-play-through-plants-vs.-zombies and https://filamentgames.com/blog/10-tips-designing-game-tutorial | Designer testimony | S |
| F8 | Fan: given the choice, players skip a separate tutorial. So teaching must sit inside play. | Same write-ups | Designer testimony | S |
| F9 | Valve treats the whole of Portal as training: one concept at a time, then layered. A puzzle that introduced too many concepts at once was split in two by adding chambers. "Player training doesn't always stick", so a skill is taught again later. | Portal developer commentary (Walker, Chin, Swift), transcript: https://combineoverwiki.net/wiki/Developer_commentary/Portal | Designer testimony from weekly playtests | S |
| F10 | Valve gates progress on a shown skill and hides the gate. Portal: a puzzle "designed so that stumbling around will virtually always lead to a dead end". Half-Life 2: gates are disguised "so it doesn't feel like the game has come to a halt". | Same Portal transcript. Half-Life 2 commentary transcript: https://combineoverwiki.net/wiki/Developer_commentary/Half-Life_2 | Designer testimony | S |
| F11 | Valve introduces a threat at a safe distance first, and teaches away from stress. Barnacles were shown "at a safe distance". "People have a very limited ability to learn new things when under stress." Poison headcrabs train well because alone they cannot kill. | Half-Life 2 commentary (Dussault, Magal, Speyrer), same transcript | Designer testimony | S |
| F12 | A game teaches even when the designer does not mean it to. A Half-Life 2 flinch animation taught a tester a wrong tactic. | Half-Life 2 commentary (Smith, Davis), same transcript | Designer testimony | S |
| F13 | World 1-1 of Super Mario Bros. was built so players "gradually and naturally understand what they're doing". The first enemy was changed from a Koopa to a Goomba because the Koopa was too hard as a first lesson. The level layout makes the first mushroom hard to avoid. | Miyamoto and Tezuka, Eurogamer video, 2015, as reported by https://www.mcvuk.com/development-news/video-miyamoto-shares-his-level-design-secrets/ and https://www.gamerevolution.com/features/362525-perfect-level-super-mario-bros-world-1-1-changed-everything | Designer testimony | S (Eurogamer blocked the fetch) |
| F14 | Hodent: teach when the player can do the thing, and give the reason for it. At most 3 items at once while learning. Do not multitask the learner. Never punish a player who is still learning. Do not rely on memory: space reminders out. | Hodent, GDC 2016 slides. https://celiahodent.com/gamers-brain-ux-onboarding/ | Expert guidance from cognitive psychology, plus Fortnite playtest observations with no numbers | P |
| F15 | Hodent: test comprehension by asking players to explain the goal and the reason. Players say an objective is "clear" and then cannot explain it. | Same page | Playtest observation | P |
| F16 | Hodent: in Fortnite's alpha data, players who died or struggled in onboarding retained less. No numbers given. She reads Warframe's data as about 20% of players lost in the first hour. | Same page | Analytics, reported without figures | P |
| F17 | Gee: good games give information "on demand" and "just in time", inside the world, and people remember badly what they get out of context or long before use. | Gee, ACM Computers in Entertainment 1(1), 2003. https://blogs.ubc.ca/jenniferlazareck/files/2013/07/James-Gee-Article-learn-from-games-LIBE447B.pdf | Theory, with citations to cognitive research | P |
| F18 | flOw starts at once with no menu. Chen's rule: put the player's choices inside play so that they stop being noticed as choices. | `research/prior-art.md:96-97`. Chen's thesis page: https://www.jenovachen.com/flowingames/designfig.htm | Designer testimony | P |
| F19 | Mobile games lose most players in a day. Median day-1 retention about 23% (GameAnalytics, Q1 2024). Top quartile about 27% in 2024. | Summaries: https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile and https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks | Measured, vendor data | A |
| F20 | Web: Google reported in 2016 that 53% of mobile site visits are left if the page takes more than 3 seconds to load. | https://blog.amp.dev/2016/09/08/new-study-speedmatters-for-mobile-user-engagement-and-revenue/ | Measured, vendor data, method not read | A |
| F21 | Browser-game sessions are short. In the CHI 2012 study the time played in the two browser games ran from 690 s to 1,050 s by condition, and 18% to 29% of players came back. | Andersen et al., Table 3 | Measured result | P |

Where sources disagree: F1 to F5 say tutorials often do nothing, and F7 to F14 say how to do them well. They do not conflict. The measured study says *when* teaching pays (unfamiliar, complex mechanics). The designers say *how* (in context, by doing, a few words). I trust the study on "when" because it is the only randomized one. Its limit: it measured play time and return, not understanding.

### 1.2 Explaining science inside an interactive

| # | Finding | Source | Evidence type | Checked |
|---|---|---|---|---|
| F22 | Victor's "explorable explanation" is a text whose claims rest on a model the reader can change. He wants the exploration tied to the argument, not a loose sandbox. In 2024 he said the term had grown too wide. | Victor, 2011, postscript 2024. https://worrydream.com/ExplorableExplanations/ | Essay. No study. | P |
| F23 | Case's method: start with a question, start on the ground with one concrete experience, climb to the abstract, link each step with "but" or "therefore", end with a sandbox and an open question. | Case, 2017. https://blog.ncase.me/how-i-make-an-explorable-explanation/ | Designer testimony | P |
| F24 | The Evolution of Trust has the player act first (one coin, one choice), then predict before each simulated tournament ("PLACE YOUR BETS"), then watch. Its sandbox is marked optional. | Game text: https://ncase.me/trust/words.html | The work itself | P |
| F25 | The best review of interactive articles says the evidence is thin: "There is limited empirical evaluation of the effectiveness of interactive articles." It also reports that only a fraction of readers touch interactive content (it cites Tse, New York Times, 2016). | Hohman, Conlen, Heer, Chau, Distill, 2020. https://distill.pub/2020/communicating-with-interactive-articles/ | Review | P for the review. Tse's talk was not read (Nieman Lab returned 403). |
| F26 | The same review names what does have support: asking for a prediction before the reveal improves recall (Kim et al., 2017), self-explanation helps (Chi et al., 1989), segmenting helps (Mayer), and detail on demand reduces load (Shneiderman, 1996). | Same review | Review of experiments | P for the review, not for the studies |
| F27 | TensorFlow Playground's paper reports no user study. It states the aim: intuition by direct manipulation, with no code. | Smilkov et al., 2017. https://arxiv.org/abs/1708.03788 | Design paper | P (abstract) |
| F28 | Primer's "Simulating Natural Selection" shows blobs whose traits (speed, size, sense) shift over generations, drawn as moving trait distributions. I found no statement by its author on method and no study of its effect. | Third-party descriptions: https://www.kottke.org/19/07/simulating-natural-selection , https://flowingdata.com/2019/07/31/natural-selection-simulation/ . Also `research/prior-art.md:195` | Observation of the work | S |
| F29 | Pure discovery teaches worse than being told. Guided discovery teaches better than both. 164 studies: unassisted discovery against explicit teaching d = -0.38; guided discovery against other methods d = +0.30. Guidance means feedback, worked examples, and prompts to explain. | Alfieri et al., J. Educational Psychology, 2011. https://www.fisme.science.uu.nl/publicaties/literatuur/2011_alfieri_discovery_learning.pdf | Meta-analysis | A |
| F30 | Trying a problem first and being taught after beats the reverse order for conceptual understanding, in 53 studies with 166 comparisons. The gain did not hold for grades 2 to 5. The learner needs enough prior knowledge to make an attempt, and the teaching step afterwards is part of the method. | Sinha and Kapur, Review of Educational Research, 2021, DOI 10.3102/00346543211019105. Summary: https://www.weforum.org/stories/2021/09/students-who-productively-fail-learn-more/ | Meta-analysis | A. Effect size not confirmed. |
| F31 | Help that works for a novice can hurt an expert (the expertise reversal effect). | Kalyuga, Ayres, Chandler, Sweller, Educational Psychologist 38(1), 2003. https://ro.uow.edu.au/edupapers/136 | Review of experiments | A |
| F32 | Mayer's principles with experimental support: cut what is not needed (coherence), point at what matters (signaling), put the words next to the thing (spatial contiguity), show words and event together (temporal contiguity), break it into steps the learner paces (segmenting), teach the names of the parts first (pre-training). | Mayer, Multimedia Learning, 3rd ed., 2020 (200+ experiments per the publisher). Principle list: https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655 | Experiments | A. Sources give different effect sizes by edition. I do not quote one. |
| F33 | Mayer on games: features with evidence of added learning are conversational wording, spoken words, prompts to explain, advice at key points, and a pre-game introduction to the key parts. No sufficient evidence for a story, for free choice of format, or for scoring. | Mayer, Policy Insights from the Behavioral and Brain Sciences, 2016. Summary: https://www.sciencedaily.com/releases/2016/01/160112091354.htm | Review of experiments | A |
| F34 | The standard list of evolution misconceptions: evolution is progress; individuals evolve in a lifetime; organisms try to adapt; selection gives organisms what they need; fittest means strongest; evolution is random; selection makes perfect organisms; every trait is an adaptation. | UC Museum of Paleontology, Understanding Evolution. https://evolution.berkeley.edu/teach-evolution/misconceptions-about-evolution/ | Teaching reference | P |
| F35 | These misconceptions are common even after university biology. | Gregory, Evolution: Education and Outreach 2, 2009, DOI 10.1007/s12052-009-0128-1 | Review | A (Springer blocked the full text) |
| F36 | Popular media carry them. Of 73 media references named by 359 students, 98% showed evolution wrongly. Most frequent: individuals evolve (22%), teleology (16%), linear change (16%). Pokémon is the main example: an individual changes at once. Limits: 342 of the 359 students came from one private religious university, and the abstract says 96% where the results say 98%. | Ferguson et al., Evolution: Education and Outreach 15, 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9756704/ | Survey | P |
| F37 | A game about evolution can teach it wrongly. Science had biologists grade Spore: they found no natural selection, since death has no consequence, and no common descent. Bean, Sinatra and Schrader (2010) report that Spore fixed misconceptions in place unless teaching went with it. | Science 322, 2008, "Flunking Spore", DOI 10.1126/science.322.5901.531b (`research/prior-art.md:276`). Bean et al., J. Science Education and Technology 19(5), 2010, as reported in Ferguson et al. above | Expert review; small study | A. I did not read Bean et al. |
| F38 | Teleology is a default of the mind, not a gap in schooling. Under time pressure, working physical scientists accepted more purpose-based explanations. | Kelemen, Rottman, Seston, J. Experimental Psychology: General 142(4), 2013. https://pubmed.ncbi.nlm.nih.gov/23067062/ | Experiment | A |
| F39 | Children of 5 to 8 learned the population logic of natural selection from a picture storybook that showed variation, differential survival, and inheritance over generations. The learning held 3 months later. | Kelemen et al., Psychological Science, 2014. https://www.bu.edu/cdl/files/2015/10/Kelemen_et_al_Natural_Selectionplussupp.pdf | Experiment | A |
| F40 | Museum visitors mix right and wrong reasoning in one answer. Of 32 visitors, 72% mixed informed and novice (intuitive) reasoning, and 28% added creationist reasoning. | Evans et al., J. Research in Science Teaching 47, 2010. https://deepblue.lib.umich.edu/items/ed0f62b7-afe9-4b2a-9b78-79a95479cffd | Interview study | A |
| F41 | Ten minutes with an interactive tree-of-life table raised correct reasoning about common descent against a baseline. 247 youth aged 8 to 15, in pairs, assigned at random to four conditions. | Horn et al., J. Research in Science Teaching 53(6), 2016. https://tidal.northwestern.edu/media/files/pubs/loe-jrst-2016.pdf | Randomized study | A |
| F42 | Digital evolution in class (Avida-ED: self-copying programs that mutate and compete) went with gains in understanding and acceptance, across 11 instructors at 8 institutions. No control group. | Lark et al., The American Biology Teacher 80(2), 2018. https://avida-ed.msu.edu/files/curricula/ABT_Exploring_Relationship__Understanding_Acceptance_Evo.pdf | Pre and post, multiple case | A |
| F43 | An agent-based simulation alone did not move a pre and post test. Prompts inside it that asked for a causal explanation did reduce misconceptions. Small sample (28). | Su et al., ICLS 2021. https://asu.elsevierpure.com/en/publications/designing-simulation-module-to-diagnose-misconceptions-in-learnin | Small experiment | A |
| F44 | Novices hold wrong ideas about machine learning that bear on Tidepool: the system keeps learning while in use, it stores its training data, and its behavior was programmed. Children also give AI human traits or "pre-installed" knowledge. | Marx, Witt, Leonhardt, WiPSCE 2024 (5 students). https://fis.tu-dresden.de/portal/en/publications/identifying-secondary-school-students-misconceptions-about-machine-learning-an-interview-study(2b7baba2-ca05-4597-a4e4-ba88f2230bf0).html . Mertala and Fagerlund, 2024 (195 children). https://arxiv.org/abs/2311.16644 | Interview and survey | A |
| F45 | The computer science is real and can be named. NEAT gives each gene an "innovation number", a historical marker, so that crossover can line up two networks of different shape, and it grows networks from a minimal start. A plain genetic algorithm with no gradient can train large networks. | Stanley and Miikkulainen, Evolutionary Computation 10(2), 2002. https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf . Such et al., 2017. https://arxiv.org/abs/1712.06567 | Published methods | P |

Where sources disagree: F29 (pure discovery fails) against the craft rule "teach by play, not text" (F7, F9). Both hold, for different things. Play teaches controls. It does not, alone, teach a concept such as selection (F29, F37, F43). F30 gives the order that fits a game: act first, then a short explicit statement. I trust F29 and F30 for concepts because they are meta-analyses of learning. The designers measured progress through a game, not understanding.

### 1.3 Comparable products

| # | Finding | Source | Evidence type | Checked |
|---|---|---|---|---|
| F46 | Close relatives are faulted for onboarding. Bibites: "just a PDF". Ecosystem: tutorial pop-ups not tied to what the player is doing. Thrive: "tutorials aren't clear enough". | `research/prior-art.md:215` (Steam review ids there) | Player reviews | Repo note |
| F47 | Thrive's own developers wrote that new players meet too many unfamiliar parts in the editor at once, and proposed to limit the parts at the start. A forum post calls the game "a daunting and incomprehensible obelisk of unclear choices and goals". Whether the limit shipped is not confirmed. | Thrive forum threads, read as search summaries only. I did not pin each quote to its thread: https://forum.revolutionarygamesstudio.com/t/tutorial-redux/554 , https://forum.revolutionarygamesstudio.com/t/improving-thrives-fun/313 , https://forum.revolutionarygamesstudio.com/t/tutorial/106 | Developer forum | A |
| F48 | Thrive brought tutorials back in 0.5.2 (2020): movement, then resource collection, then the editor's screens. Players can turn them off. In 2025 it added a mode that shows only tutorials not seen before. | https://revolutionarygamesstudio.com/devblog-26-learning-the-basics (P). The 2025 note is from a search summary of a March 2025 progress update. I did not open it (A). | Developer statement | P and A |
| F49 | Thrive's players could not tell what a time-skip had changed, and respawned into the failure that had killed them. | `design.md:52-57`, `research/prior-art.md:204-205` | Player reviews | Repo note |
| F50 | Bibites: a world of random brains does nothing for hours. One reviewer dismissed the brain as a "trigger -> action system". Viewers fill with useless neurons. | `design.md:266-268`, `research/prior-art.md:209-210`. The Bibites FAQ returned 402 to my fetch. | FAQ and reviews | Repo note |
| F51 | Niche: players called the tutorial "not very intuitive" and said it leaves out the mutation menu. An education review lists "lacking enough in-game help" and tells teachers to give a genetics lesson first. Players could not work out dominance from play. | https://steamcommunity.com/app/440650/discussions/1/1473096694452963294 , https://www.commonsense.org/education/game/niche-a-genetics-survival-game | Player and reviewer reports | A |
| F52 | Cell Lab teaches by challenge: 45 challenges, each an environment to survive in, and solving them unlocks genes. Its own listing still says "reading the instructions will be necessary". | https://www.taptap.io/app/16414 | Store listing | A |
| F53 | Equilinox is liked as a calm puzzle, and faulted on the word "evolution": "you will NOT see evolution in this game as you are the one placing everything". | https://www.gamingonlinux.com/2018/11/relaxing-nature-sim-equilinox-is-out-seems-to-be-a-hit-with-users/page=1/ (comments) | Player comments | A |
| F54 | Spore's theme promised evolution and its mechanics were a parts shop. | Soren Johnson, `research/prior-art.md:217`. F37 above. | Designer testimony; expert review | Repo note |
| F55 | Empty time is a common complaint: Ecosystem's early stage "very boring", Thrive's "massive empty areas", Bibites "just sitting there doing nothing". | `research/prior-art.md:126`, `:211`, `:216` | Player reviews | Repo note |
| F56 | Adapt's demo had a tutorial that could soft-lock. | `research/prior-art.md:147` | Player comments | Repo note |
| F57 | Creatures 2 was judged "much more difficult" and frustrating than the first game. | `research/prior-art.md:139` | Wikipedia | Repo note |
| F58 | Keiwan's Evolution keeps its network diagram in the settings screen. | `research/prior-art.md:150` | Developer forum | Repo note |

Not found for this section: how Spore's cell stage itself onboards (prompts, timing), any onboarding account for Species: ALRE, and any review of Equilinox's or Creatures' tutorial. See section 5.

### 1.4 Misconceptions to design against

Each row: the wrong idea, the source that says it is common, and one way to show the truth by interaction. The "show" column is my design proposal. It is not a finding.

| Wrong idea | Source | Show it, do not state it |
|---|---|---|
| **An individual evolves.** | F34, F36 (the most frequent error in media, 22%) | The player's own body and brain never change in a life. At a bud, put parent and child side by side and mark the 1 to 3 differences. All change sits at the birth. Keep the word "evolve" off every button that acts on one body. |
| **Evolution has a goal. Organisms get what they need.** | F34, F36, F38 | The skip report states a cause with no purpose: "Bodies with one eye left more young here." Never "lost the eye to save energy". Show lineages that needed a trait, did not have the variant, and died out. |
| **Fitness is strength, speed, or size.** | F34 | Score nothing but descendants. The one number on the HUD is already "Descendants alive" (`src/ui/App.tsx:66`). In the chronicle, show a small slow line that out-bred a large fast one. |
| **Evolution is random.** Or its mirror: **mutation aims.** | F34 | At each bud, show the mutation as drawn, with no label of good or bad. Most children are no better. Then show the trait histogram move one way over a skip. Two views: the draw is random, the survivors are not. Watch mode (M7): a mutation-off switch and a "food everywhere" switch show each half alone. |
| **Evolution is progress, a ladder.** | F34, F36 | The chronicle is a tree with dead branches. The skip report must report losses ("lost its second eye", `design.md:51`). An heir can be simpler than its ancestor. |
| **Every trait is an adaptation. Selection perfects.** | F34 | The viewer already dims neurons that never fire (`design.md:267`). Say what they are: copied, costly, not yet removed. A new part "arrives with a few weak random connections" (`design.md:135`). Show that state. |
| **The brain learns while it lives.** | F44 ("continuous learning") | In the brain viewer, the lines never change width in a life. Add a count: "Changes since birth: 0". The Lab's learning switch (later milestone, `design.md:149-152`) turns the count into an experiment. |
| **The network was trained** (by gradient descent, by a programmer, on data). | F44 ("programmed", "user-trained") | "Compare with ancestor" (`design.md:158-159`) steps back through parents. Each step differs by a few connections. There is no training screen because there is no training: say so in the note. State openly that the founders of the baked world had hand-wired brains (`design.md:266`). |
| **A weight is a memory.** | No study found. My inference from F44 ("data storage"). | Two visibly different things in the viewer. A weight is a line: fixed, inherited. A neuron's state is a glow: it fades at the neuron's own rate (`design.md:143-144`) and is gone at death. Show a slow neuron still lit after the food has left the eye's cone. |
| **The player designs the creature** (the Spore reading). | F37, F53, F54 | There is no parts shop (`design.md:251`). Say what the player's two choices are: mate and heir. They are selection by a chooser, the same act as a breeder's. The game should say this in the note, not hide it. |

---

## 2. Design principles for Tidepool's onboarding

1. **Do not teach what play already teaches.** (F1, F2, F4, F6) Steering and eating are found by trying. Give them no tutorial step and no blocking overlay. Keep the present one-line hints (`src/ui/App.tsx:34-45`, `src/app/main.ts:484`). Example: no "press W to swim" card. A hint for movement shows only if the player has not moved 4 seconds after possession.

2. **Spend the teaching on what is unfamiliar.** (F1, F3, F47) Three things in Tidepool are unlike other games: letting go, the brain viewer, and continuing as a descendant. These get in-context teaching. Example: the first time the released brain turns toward food, the Brain button pulses once.

3. **Act first, then one true sentence.** (F29, F30, F43, F23) A concept is not learned from play alone, and not from text read ahead of play. Let the event happen, then name it in one line at that moment. Example: the child swims off, then "Your child. A copy with 2 changes."

4. **Ask for a guess before a reveal, at most once per life.** (F24, F26) Example: before the time-skip, one tap: "What will your line be like in 200 generations? Faster. Bigger. Fewer eyes. No guess." The skip report answers it. It can be skipped with no penalty.

5. **Eight words, no OK button, three ideas at most.** (F7, F14, F32) A hint is one passive line that leaves when the player acts. Never two new things in one beat. Example: "Green is food. Fill your ring and you will bud." is two ideas in ten words. Split it: "Green is food." Then, at half a ring, "A full ring buds a child."

6. **Hints react to the player and never repeat for one who knows.** (F7, F31, F48, F9) Each beat has a done-flag kept in browser storage. A player who has let go once never sees "let go" again. A skill unused for a long time gets one reminder. The audience is developers (`design.md:21-22`): many will know neural networks, so the deeper notes must not stand between them and play.

7. **Safe while learning. The first threat is seen before it is felt.** (F11, F14, F16) The start area has dense plants and no hunters (`design.md:170`). From M4, the first predator the player meets is shown eating something else, at a distance. Starvation in the first two minutes should be near impossible.

8. **Death is the lesson, so it must not read as failure.** (F16, F49, `design.md:58-59`) Dying moves the player from an individual to a lineage. That is the central idea of the game. Example: the death screen leads with the living descendants, not the cause, on the first death.

9. **Never write a purpose into a cause.** (F34, F36, F38, F12) Every string that explains a change is checked for "to", "so that", "in order to", "needs", "wants", "learned", "better". The brain sentence may say what a body senses and does ("Sees a plant on the right. Turns right."). It must not say why in terms of wishes. This is a lint rule on UI text, not a style note.

10. **Show a population, not a hero.** (F28, F39, F41, F36) Change over time is drawn as a distribution that moves: many small bodies, a histogram before and after (`design.md:51-53`). Never one creature that morphs.

11. **The deep layer hangs on the thing it explains.** (F5, F17, F25, F26, F58) No "Help" page and no manual. A small mark on the brain panel, the bud card, the death card, and the skip report opens a note of three sentences, with "more" for the full account. Detail on demand, in place. Most players will not open it (F25), so nothing needed for play may live only there.

12. **Tell the truth about the machine.** (F45, F50, F37, `design.md:268`) State what is so: outputs are thrust, turn, and triggers; the founders' brains were wired by hand before the bake; sizes are capped for speed (`design.md:113-114`); a Filter mouth eats on contact with no brain output (`design.md:139-141`); the player's mate and heir choices are selection by a chooser.

---

## 3. A proposed walkthrough

Times are targets for a first play. "Knows" is what the game can detect with no server. Beats 1 to 4 are the roadmap's 60-second test (`roadmap.md:163-164`).

| # | When | The player does | The game shows | The one idea | Kind | The game knows when | Needs |
|---|---|---|---|---|---|---|---|
| 1 | 0 to 5 s | Looks | A living world, the camera drifting. Creatures feed, turn, bud. One line: "Click any creature to become it." (exists) | It was alive before you came. | Game | A click lands on a creature. A miss gives "Nothing there." (exists) | Now |
| 2 | 5 to 20 s | Clicks, then moves | The ring on the body. The view cone. No text unless still for 4 s. | You are one of them, with the same body rules. | Game | The body has moved 3 body lengths under player input. | Now |
| 3 | 20 to 40 s | Eats a plant | The ring fills by a step. "Green is food." | Energy is the one currency. | Biology | First plant eaten under player input. | Now |
| 4 | 40 to 60 s | Lets go | After the first meal: "Let go." The body keeps swimming and finds the next plant. "Your instincts are steering. Move to take over." (exists) | This body has a brain of its own. So has every other. | Neural networks | No input for 3 s while the brain eats or closes on food. | Now |
| 5 | 1 to 2 min | Opens the brain | The Brain button pulses once at the first clear brain-led turn. The panel shows the strongest path and its sentence: "Sees a plant on the right. Turns right." | Senses feed numbers in. Numbers flow along lines. Two numbers come out: thrust and turn. | Neural networks | Panel open for 5 s. | Now |
| 6 | 2 min | Steers against the brain | In the panel, the "you" ring and the "what the brain wants" dot split apart (exists). | The brain runs every tick, even while you hold the controls. | Computer science | The two markers differ by a set margin for 1 s while the panel is open. | Now |
| 7 | 2 to 3 min | Taps the mark on the panel (optional) | "Changes since birth: 0." The lines have not changed width. Note: "Born with this wiring. It does not learn." | No learning in a life. A weight is a gene. | Neural networks | Note opened. Optional: never blocks. | Now |
| 8 | 2 to 4 min | Fills the ring, buds | At half a ring: "A full ring buds a child." The child splits off and swims away under its own brain. A card for 4 s: parent and child side by side, the changes marked ("tail 6% longer", "1 connection changed"). | A child is a copy with a few random changes. | Evolution | First bud. Card seen or tapped. | Now |
| 9 | 3 to 5 min | Watches the counter | "Descendants alive: 3." Then 2. A tap opens a short family list: alive, dead, how many young each left. | Success here is descendants left. Not size, not speed. | Evolution | Counter tapped, or two descendants have died. | Now |
| 10 | When a mate is near | Holds to court | The overlay compares the two bodies and brain sizes. The other brain answers yes or no. On yes: "Your next brood mixes both." | Two genomes can mix. Its brain decides, not a rule. | Biology | One courtship, accepted or refused. | M3 (mixing) |
| 11 | From M4 | Sees a hunter | The first hunter is shown catching another creature at a distance. A low audio cue. No text. | Other lines evolved too, and some eat yours. | Biology | A hunter was on screen for 2 s before any bite on the player. | M4 |
| 12 | 3 to 6 min | Dies | The world freezes. First death only: the living descendants are shown first, then the cause. "You are gone. Your line is not." From M4 the card shows the killer's brain at the kill. | The individual ends. The lineage goes on. | Evolution | The player picks a descendant, without leaving the page. | Now (plain). M4 (death card). |
| 13 | At the skip | Guesses, then watches | One tap to guess what the line will be like. Then the montage: population bands, the body of the line changing across many small bodies, a histogram sliding. | A population changes. No body in it did. | Evolution | Guess made or skipped. Montage not closed early. | M5 |
| 14 | After the skip | Reads the report | Specific sentences with before and after histograms. The guess is marked right or wrong. A loss is reported as plainly as a gain. | No goal. Traits are lost when they cost more than they return here. | Evolution | The report was open for 5 s, or one histogram was tapped. | M5 |
| 15 | After the report | Picks an heir | 3 to 5 descendants that differ, with the differences stated. Note on the mark: "They already differed. You are choosing among them." | Variation comes first. Selection only chooses. Here the chooser is you. | Evolution | An heir is picked. Which one, against the guess. | M5 |
| 16 | Later lives | Dives | The view narrows as light falls. A sighted body is near blind below. | No body is best everywhere. | Biology | First crossing of a shelf gap. | M6 |
| 17 | Any time after the first life | Leaves the body, or taps "compare with ancestor" | Watch mode. The family tree with dead branches. The brain of the current body beside that of an ancestor, the added and lost connections marked. A note: how long the baked world ran, and that its founders had hand-wired brains. | Everything here was made by copy, change, and unequal survival. Nothing was trained. | Computer science | Ancestor compare opened, or one chart opened in Watch. | M3 (compare). M7 (Watch). |
| 18 | End state | Plays with the Lab | Switch mutation off: the histograms stop moving. Make food uniform: traits drift. Switch learning on (later): "Changes since birth" starts to count. | It is an algorithm, and you can break each part to see what it did. | Computer science | Any Lab switch changed and a chart watched for 10 s. | M7. Learning switch: later. |

Order rules:

- Beats 1 to 4 run in order and fit in 60 seconds. Nothing else may claim attention in that minute.
- Beats 5 to 9 are armed by events, not by a clock. If the player buds before opening the brain, beat 8 fires first.
- No beat blocks play. No beat pauses the simulation in Play. A beat the player ignores retires after two showings.
- A beat that needs a later milestone is left out until then. The walkthrough at M3 is beats 1 to 10, 12, and the compare part of 17.

### The deeper layer: "How this really works"

Opened from a small mark on the thing itself. Each note: three sentences, then "more". None is needed to play.

| Where the mark sits | Short note (draft) | "More" covers |
|---|---|---|
| Brain panel | "Each line carries a number. A neuron adds what comes in and passes on a squashed sum. Thrust and turn are the last two sums." | Weight, bias, sign. Recurrent loops. The time constant: a slow neuron holds a trace, which is this brain's only memory (`design.md:143-144`). Low-level outputs, stated openly (`design.md:268`). |
| Brain panel, "Changes since birth: 0" | "This wiring was set at birth. It does not change while the body lives. Brains here change only between parent and child." | Evolving against learning. Gradient descent, and why none is used here. Such et al. 2017 as the proof that this can work at scale. The Lab switch, when it exists. |
| Bud card | "The child is a copy of your genes with a few random changes. Most changes do little. Some hurt." | Mutation kinds: nudge, add, remove, duplicate (`design.md:109-110`). Brain mutations (`design.md:132-133`). |
| Mate overlay | "Each gene has an id from the day it first appeared. Mixing lines up genes by id and takes each from one parent." | History ids and crossover (`design.md:111-112`). NEAT's innovation numbers (Stanley and Miikkulainen 2002) as the source of the method. |
| Descendants counter | "The only score is descendants. A slow small body that leaves four young beats a fast large one that leaves two." | Fitness as reproductive success. Old age (`design.md:65`). |
| Death card | "You were one body. Your line is every body descended from one you played." | Lineage as a tree, donors as cross-links (`design.md:124-126`). |
| Skip report | "No body changed. Bodies with some traits left more young, so those traits are now common." | Selection, drift, cost of parts and neurons (`design.md:92-93`, `:145`). Why a trait can be lost. |
| Heir picker | "These differ because of mutation. Your pick is selection by a chooser, as a breeder does." | Natural against artificial selection. |
| Watch mode | "This world ran for a long time before you opened it. Its first creatures had brains wired by hand so that they could feed." | The bake (`design.md:193-195`, `:266`). The seeded, repeatable simulation. Caps on brain and part count (`design.md:113-114`). |

Glossary, reached from any note: gene, mutation, selection, fitness, lineage, neuron, weight, time constant, recurrent, crossover, history id, neuroevolution, seed. One sentence each.

---

## 4. What to measure

Tidepool has no server and no account (`design.md:19`). So the measures are moderated playtests, plus counters kept in the browser that a tester can export.

**The 60-second test** (`roadmap.md:163-164`). A person who has never seen the game, on a phone and on a laptop, with no words from the tester. Pass: within 60 seconds they have possessed a creature, let go for 3 seconds, and say unprompted something that means "they are all alive" or "it thinks for itself". Record the time of each: first click, possession, first meal, first let-go, brain panel open.

**Beat completion.** For each beat in section 3, the share of testers who trigger its "knows" condition, and the time. The funnel should not lose more than a few testers between beats 1 and 4.

**Comprehension check** (F15: ask them to explain, never "was that clear?"). After 10 minutes, four open questions, answers recorded word for word:

1. "Why does your descendant look different from the creature you started as?"
2. "Did your creature get better at finding food while you played it?"
3. "After the skip, the eye was gone. Why?" (M5)
4. "How did these brains get their wiring?"

Code each answer as correct, purpose-based ("so it could", "it needed"), individual-change ("it adapted", "it learned"), or designed ("I chose", "the game gave"). Open answers and multiple choice give different counts of misconceptions for the same students (Nehm and Schonfeld, J. Research in Science Teaching 45(10), 2008, https://www.ccny.cuny.edu/sites/default/files/2022-03/Nehm-Schonfeld%2C%202008%20JRST.pdf , checked A). So use open answers here. If a standard instrument is wanted, the Conceptual Inventory of Natural Selection has 20 multiple-choice items (Anderson, Fisher, Norman, J. Research in Science Teaching 39(10), 2002, https://eclass-b.uoa.gr/modules/document/file.php/ECD129/Anderson.pdf , checked A).

**What counts as failure:**

- A tester reads a hint aloud and does not act on it.
- Fewer than most testers let go within 60 seconds.
- A tester stops moving to read. Measure: the gap between a hint and the next input.
- Fewer than half open the brain panel in the first life.
- A tester leaves at the first death, or calls it "game over".
- Any tester says "it learned", "it evolved an eye so it could see", or "I designed it" after 10 minutes. This is the Spore outcome (F37).
- A hint variant lowers the share who come back for a second session. Tutorials have done this in browser games (F2, F5).
- An expert tester (the hiring audience) is slowed by any note, or cannot find the true account of the brain within a minute of looking (F31).

---

## 5. Not confirmed

Claims I could not source, and where I looked:

- **Sinha and Kapur's effect size.** The SAGE page returned 403, and a mirror was gone. Only press summaries were read. I give no number.
- **Mayer's effect sizes per principle.** Sources disagree by edition (one review abstract in search results gave coherence d = 0.70, a University of Michigan deck gave 0.82 to 1.11). I did not open the book. I give no number.
- **Gregory 2009 and Bean et al. 2010, full text.** Springer redirected every fetch to a login. Gregory is cited from its abstract. Bean et al. is cited through Ferguson et al. 2022.
- **Archie Tse's talk** ("Why We Are Doing Fewer Interactives"). Known only through the Distill review. Nieman Lab returned 403. The often-quoted lines about clicking and scrolling are not confirmed here.
- **Miyamoto's words on World 1-1.** Eurogamer blocked the fetch. Quoted from two news write-ups and Wikipedia.
- **George Fan's talk.** Not watched. Two independent write-ups agree on all ten rules. The "eight words" figure comes from them.
- **Half-Life 2 and Portal commentary.** Read as a fan wiki's transcript of the in-game commentary, not in the game.
- **Hodent's Warframe figure.** The page says "80% of all players ever kept playing after one hour". I could not check the data behind it.
- **GameAnalytics and Google figures.** Read in summaries, not in the vendors' own reports.
- **The Bibites FAQ** returned 402. Its claim rests on the repo's earlier note (`design.md:266`).
- **Spore's cell stage onboarding.** I found no account of its prompts or timing, and no designer statement. Searched for Chaim Gingold's writing and for reviews.
- **Species: ALRE, Creatures, Equilinox onboarding.** No review of their tutorials found. The rows in 1.3 cover other complaints.
- **Primer.** No statement by its author on method, and no study of its effect.
- **Shtulman 2006** (transformational against variational thinking). Only the citation was found, so I left it out of the findings.
- **"A weight is not a memory" as a studied misconception.** No study found. The row in 1.4 is my inference from the "data storage" finding in Marx et al.
- **Predict-observe-explain** by that name (White and Gunstone, 1992). Not fetched. The support for prediction in section 1.2 is Kim et al. 2017 through the Distill review, and the existence of Brod's 2021 review (https://link.springer.com/10.3758/s13423-021-01904-1), whose text PMC would not serve.
- **Worked examples** as a separate result. Covered only inside Alfieri et al. and Kalyuga et al., both at abstract level.
- **No study was found of any game that puts a steered player inside a neuroevolution simulation.** Every learning result above comes from a neighboring form: a classroom tool, an exhibit, a storybook, an article.

Open questions for the owner:

1. **Does the first death come too soon?** A life is 3 to 6 minutes and old age is mandatory (`design.md:42`, `:65`). Hodent's data says struggle in onboarding costs retention (F16). The proposal reframes the first death. The other choice is a longer first life. Which?
2. **Is one prediction tap before the skip acceptable?** It is the only step in the walkthrough that asks for a click that is not play. The evidence for it is real but indirect (F26). It could be cut, or made the default-off deeper layer.
3. **May the game say that the player's heir and mate choices are artificial selection?** It is true and it guards against the Spore reading. It also admits that the player's line is not shaped by natural selection alone.
4. **May the game say that the founders' brains were hand-wired?** Truthful (`design.md:266`). Some players may read it as "so it did not really evolve".
5. **How will beats be measured after release with no server?** Playtests only, or a local export, or a privacy-safe counter on the host?
6. **Who is the comprehension check for?** The stated audience is developers (`design.md:21-22`). The misconception research is on students and museum visitors. If the page is also meant to teach a general visitor, that should be said, because it changes how much the short notes must carry.
7. **Sound.** The game has generated audio (`design.md:240-241`). Mayer's reviews favor spoken words over printed ones in games (F33). No voice is planned. Is a voiced line for beats 4 and 12 worth a test?
8. **The text lint in principle 9.** Should it be a real check in `make check` over UI strings?
