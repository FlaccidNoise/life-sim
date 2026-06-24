# Life-history observation — seed 3, 4000 ticks, world 8192²

Final pop 24 · total births 73 · deaths 1049 · ALIVE · hash d1df854d

## Cohort (every individual that ever lived)
- Individuals tracked: **1073**  (1000 founders, 73 born in-sim)
- Still alive at run end: 24 · died during run: 1049
- Lifespan of the dead (ticks): min 5 · p25 121 · median 896 · p75 1599 · p90 2234 · max 3980 · mean 999
- Ever reproduced: **50/1073** (5%)
- Offspring among breeders: median 1 · max 3 · mean 1.5
- Age at first breed (breeders): median 360
- **Validation** (ground truth via onBirth hook): attributed breedings 73 + unattributed 0 = 73 vs world.totalBirths 73 (Δ 0)

## Evolution — birth-gene means, early cohort (born ≤t800) → late cohort (born ≥t3200)
Early cohort n=1032, late cohort n=12
```
gene                 early    late    Δ
MAX_SPEED               5.97    5.34  -0.63 ↓
EAT_RATE                1.96    1.87  -0.09 ↓
SENSE_RANGE            63.40   65.61 +  2.22 ↑
SIZE                   11.25   11.76 +  0.51 ↑
MAX_TURN                0.35    0.23  -0.13 ↓
MAX_THRUST              1.00    1.08 +  0.08 ↑
METAB_EFF               1.00    0.88  -0.12 ↓
REPRO_THRESHOLD        60.08   73.81 + 13.73 ↑
SATIATED_THRESHOLD    101.03   81.56 -19.47 ↓
BIRTH_ENERGY           24.98   24.51  -0.47 ↓
DIET                    0.10    0.09  -0.01 ↓
DAMAGE                 11.94   12.23 +  0.29 ↑
VISION_RANGE          139.66  173.13 + 33.47 ↑
VISION_FOV              1.01    1.18 +  0.17 ↑
VISION_ACUITY           1.00    1.30 +  0.30 ↑
SHELTER_DRIVE           0.06    0.04  -0.02 ↓
COHESION_DRIVE          0.15    0.14  -0.01 ↓
FORAGE_PREF             0.49    0.17  -0.32 ↓
FORAGE_PREF_C           0.50    0.50 +  0.00  
SENSE_RANGE_B          64.00   64.00 +  0.00  
SENSE_RANGE_C          64.00   64.00 +  0.00  
PHERO_DEPOSIT           1.00    1.30 +  0.30 ↑
MATURITY_AGE           99.71   62.78 -36.93 ↓
SENESCENCE_AGE        399.97  418.50 + 18.53 ↑
DISPLAY                 0.50    0.35  -0.15 ↓
PREFERENCE              0.50    0.47  -0.04 ↓
```
Hue-lineage bins (of 20): early 20 → late 3 (lineages CONVERGING — a few dynasties dominate)

## Lineage & generations (ground-truth child→parent links)
- Deepest generation reached: **gen 10** (founders = gen 0)
- Founders: 1000 seeded · 28 left descendants · 5 still alive at run end
- Population by generation:
```
  gen  0:  1000  █████████████████████████████████████
  gen  1:    36  █
  gen  2:    11  
  gen  3:     5  
  gen  4:     3  
  gen  5:     3  
  gen  6:     4  
  gen  7:     3  
  gen  8:     4  
  gen  9:     3  
  gen 10:     1  
```
- Largest founding dynasties (transitive descendants):
  - 150:1 (hue 0.05, grazer): **27 descendants**, 1 direct children, bred 1×
  - 733:1 (hue 0.78, grazer): **6 descendants**, 2 direct children, bred 2×
  - 479:1 (hue 0.13, grazer): **6 descendants**, 2 direct children, bred 2×
  - 658:1 (hue 0.21, grazer): **3 descendants**, 2 direct children, bred 2×
  - 239:1 (hue 0.78, grazer): **2 descendants**, 2 direct children, bred 2×

## Generation-vs-gene plot (mean birth-gene at each generation depth)
Sparkline runs gen 0 (founders) → gen 10. ▁ = that gene's min across generations, █ = its max. Reads WHEN a trait drifts as lineages deepen — complements the birth-tick cohort split above.
```
individuals/gen      █▁▁▁▁▁▁▁▁▁▁   gen0=1000 … gen10=1
                     ···········
MAX_SPEED            ▇▆█▃▁▄▅▅▅▅▄      5.97 →    4.88  ↓
EAT_RATE             ▆▃▄▁▁▃▄▂▄▄█      1.96 →    2.12  ↑
SENSE_RANGE          ▃▁▁▅█▂▃▄▄▃▃     63.55 →   65.16  ↑
SIZE                 ▂▂▃▄█▅▁▄▄▅▂     11.30 →   10.68  ↓
MAX_TURN             ▆▆█▅▄▁▂▁▁▁▃      0.35 →    0.28  ↓
MAX_THRUST           ▂▄▅▁▇▇█▇▄▅▇      1.00 →    1.17  ↑
METAB_EFF            ██▂▅▆▄▁▃▃▄█      1.00 →    1.00  ↑
REPRO_THRESHOLD      ▃▁▂▄▅▆▇▇█▇▆     60.20 →   69.09  ↑
SATIATED_THRESHOLD   ▆▆█▄▁▂▁▂▂▃▁    100.84 →   75.94  ↓
BIRTH_ENERGY         ▂▅█▆▄▂▃▃▁▁▁     24.94 →   24.61  ↓
DIET                 ▇▅▁▁▂▃▄▆▆██      0.10 →    0.12  ↑
DAMAGE               ▄▁▅▃▅▄▆█▅▂▂     11.97 →   11.48  ↓
VISION_RANGE         ▁▂▃▇▇▇██▆█▆    139.39 →  168.86  ↑
VISION_FOV           ▁▁▅█▅▅▅▄▅▆▃      1.01 →    1.10  ↑
VISION_ACUITY        ▁▂▃▆█▇▆▆▆▅▆      0.99 →    1.33  ↑
SHELTER_DRIVE        ▆▆▆█▄▅▅▃▃▃▁      0.06 →    0.02  ↓
COHESION_DRIVE       ▄▃▄▆█▆▇▂▅▁▃      0.15 →    0.15  ↓
FORAGE_PREF          █▆▆▆▅▂▂▂▁▂▁      0.49 →    0.15  ↓
FORAGE_PREF_C        ▅▅▅▅▅▅▅▅▅▅▅      0.50 →    0.50   
SENSE_RANGE_B        ▅▅▅▅▅▅▅▅▅▅▅     64.00 →   64.00   
SENSE_RANGE_C        ▅▅▅▅▅▅▅▅▅▅▅     64.00 →   64.00   
PHERO_DEPOSIT        ▃▃▁▃███▆▇▇▇      1.00 →    1.30  ↑
MATURITY_AGE         █▇▆▆▄▂▃▁▁▂▂     99.69 →   64.56  ↓
SENESCENCE_AGE       ▆▄█▁▅▅▆▇▇▇█    400.94 →  410.83  ↑
DISPLAY              █▇▅▃▅▄▃▃▃▂▁      0.50 →    0.31  ↓
PREFERENCE           ███▁▁▅▇▄▅▅▃      0.50 →    0.41  ↓
```

## Featured life-stories

### Most fecund (the "patriarch"): 651:2 (born t1300)
- gen 2 · parent 230:2 · 3 direct children
- lifespan 1145 ticks · died t2445 at age 1144, energy 0.1
- GRAZER diet 0.00 · size 9.6 · eff 0.95 · vision 174u · repro@60/breed@115 · hue 0.03
- reproduced **3×** (first at age 271; ticks 1571, 1738, 1939)
- mode split: survival 453 / reproductive 525 / satiated 167 ticks · peak energy 116 · mean 74
- energy arc: t1300:26s

### Longest-lived: 568:1 (founder)
- gen 0 · founding lineage · 0 direct children
- lifespan 3980 ticks · died t3980 at age 3979, energy 0.4
- GRAZER diet 0.00 · size 19.0 · eff 0.50 · vision 52u · repro@63/breed@564 · hue 0.12
- reproduced **0×** — never reached the breeding bar
- mode split: survival 109 / reproductive 2993 / satiated 877 ticks · peak energy 565 · mean 440
- energy arc: t1:29s

### Most successful founder: 239:1 (founder)
- gen 0 · founding lineage · 2 direct children
- lifespan 1536 ticks · died t1536 at age 1535, energy 0.0
- GRAZER diet 0.00 · size 7.2 · eff 1.22 · vision 153u · repro@64/breed@128 · hue 0.78
- reproduced **2×** (first at age 481; ticks 481, 1150)
- mode split: survival 270 / reproductive 883 / satiated 382 ticks · peak energy 128 · mean 102
- energy arc: t1:32s

### Median lifespan (typical): 471:1 (founder)
- gen 0 · founding lineage · 0 direct children
- lifespan 896 ticks · died t896 at age 895, energy 0.2
- GRAZER diet 0.00 · size 9.4 · eff 1.28 · vision 165u · repro@69/breed@205 · hue 0.45
- reproduced **0×** — never reached the breeding bar
- mode split: survival 528 / reproductive 367 / satiated 0 ticks · peak energy 86 · mean 58
- energy arc: t1:26s

### Longest life that never bred: 568:1 (founder)
- gen 0 · founding lineage · 0 direct children
- lifespan 3980 ticks · died t3980 at age 3979, energy 0.4
- GRAZER diet 0.00 · size 19.0 · eff 0.50 · vision 52u · repro@63/breed@564 · hue 0.12
- reproduced **0×** — never reached the breeding bar
- mode split: survival 109 / reproductive 2993 / satiated 877 ticks · peak energy 565 · mean 440
- energy arc: t1:29s

