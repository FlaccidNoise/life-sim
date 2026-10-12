# M2 long run: the accepted set at tick 144,000 on 10 seeds

Date: 2026-10-12. Commit: e268576. One run per seed. A reading, not a trial. It is the baseline for
any change that is made for the audit's findings H2 and M3 (`m2-audit.md`).

## Result

**By tick 144,000 every world is slower, 6 of 10 have lost the scent sense, and 1 of 10 has lost its
eyes too.** The kind of claim is "evolution uses it", denied: evolution removes what a body needs to
find food and to travel to it.

| Reading | Tick 36,000, seeds 1 to 10 | Tick 144,000, seeds 1 to 10 |
|---|---|---|
| `speed`, mean top speed | 0.84 to 1.16 | 0.63 to 0.92. Lower on 10 of 10 |
| `flagellum` sum (a founder has 0.6) | 0.39 to 0.51 | 0.20 to 0.34. Lower on 10 of 10 |
| `chemo` sum (a founder has 0.5) | 0.03 to 0.28 | 0.12 to 0.15 on seeds 1, 2, 3, 10. 0.02 to 0.07 on seeds 4 to 9 |
| `eye` sum (a founder has 0.2) | 0.15 to 0.22 | 0.17 to 0.24 on 9 seeds. 0.03 on seed 8 |
| `senseless`, the share with no sense part | 0.00 to 0.14 | 0.00 to 0.16 on 9 seeds. 0.83 on seed 8 |
| `area` | 66 to 89 | 47 to 77 on 9 seeds, lower on each. 130 on seed 8 |
| `turn` | 0.075 to 0.104 | 0.081 to 0.117 on 9 seeds. 0.042 on seed 8 |
| `creatures` | 1,200 to 1,470 | 1,303 to 1,774 on 9 seeds. 1,104 on seed 8 |
| `reserve01` | 0.29 to 0.37 | 0.23 to 0.29 |

- **The eyes hold on 9 of 10 seeds.** The loss of both senses is seed 8 alone. That world is long
  bodies (`len` 19.2) that turn at half the rate of the others.
- **The tail and the speed fall everywhere.** No band and no gate reads either.
- **Not measured:** whether a slower world looks less alive on the page, a second run of any seed,
  and anything past tick 144,000.

## Rows

```
$ target/release/tidepool-headless probe-census --seeds 1,2,3,4,5,6,7,8,9,10 --ticks 144000 --every 36000
seed=1 tick=36000 creatures=1470 plants=2229 juv=0.38 len=11.8 wid=0.52 egg=0.66 old=3650 area=72.4 flagellum=0.46 cilia=0.36 filter=0.74 chemo=0.14 fin=0.00 eye=0.22 parts=5.2 senseless=0.01 speed=1.11 turn=0.104 eaten=189.82 reserve01=0.36
seed=1 tick=72000 creatures=1564 plants=2229 juv=0.36 len=11.3 wid=0.46 egg=0.67 old=3337 area=59.3 flagellum=0.20 cilia=0.54 filter=0.72 chemo=0.14 fin=0.00 eye=0.24 parts=4.9 senseless=0.08 speed=0.68 turn=0.117 eaten=186.36 reserve01=0.28
seed=1 tick=108000 creatures=1766 plants=2229 juv=0.39 len=10.6 wid=0.43 egg=0.66 old=3209 area=47.9 flagellum=0.19 cilia=0.53 filter=0.79 chemo=0.12 fin=0.00 eye=0.24 parts=5.0 senseless=0.02 speed=0.67 turn=0.122 eaten=177.13 reserve01=0.26
seed=1 tick=144000 creatures=1691 plants=2229 juv=0.39 len=10.4 wid=0.43 egg=0.67 old=3179 area=46.7 flagellum=0.21 cilia=0.49 filter=0.81 chemo=0.13 fin=0.01 eye=0.24 parts=5.7 senseless=0.01 speed=0.64 turn=0.117 eaten=174.43 reserve01=0.29
seed=2 tick=36000 creatures=1361 plants=2076 juv=0.37 len=12.8 wid=0.49 egg=0.66 old=3996 area=80.3 flagellum=0.43 cilia=0.28 filter=0.71 chemo=0.15 fin=0.00 eye=0.18 parts=4.4 senseless=0.12 speed=1.01 turn=0.085 eaten=172.28 reserve01=0.37
seed=2 tick=72000 creatures=1583 plants=2076 juv=0.43 len=11.6 wid=0.49 egg=0.62 old=3537 area=65.1 flagellum=0.36 cilia=0.30 filter=0.76 chemo=0.20 fin=0.01 eye=0.20 parts=5.2 senseless=0.01 speed=0.82 turn=0.093 eaten=172.41 reserve01=0.31
seed=2 tick=108000 creatures=1589 plants=2076 juv=0.39 len=11.2 wid=0.41 egg=0.66 old=3131 area=51.5 flagellum=0.33 cilia=0.35 filter=0.78 chemo=0.13 fin=0.01 eye=0.22 parts=5.6 senseless=0.00 speed=0.73 turn=0.102 eaten=166.08 reserve01=0.30
seed=2 tick=144000 creatures=1601 plants=2076 juv=0.38 len=11.5 wid=0.36 egg=0.67 old=2925 area=49.1 flagellum=0.26 cilia=0.42 filter=0.79 chemo=0.13 fin=0.01 eye=0.22 parts=5.9 senseless=0.00 speed=0.70 turn=0.102 eaten=161.74 reserve01=0.27
seed=3 tick=36000 creatures=1390 plants=1965 juv=0.38 len=11.9 wid=0.45 egg=0.66 old=3610 area=66.0 flagellum=0.43 cilia=0.31 filter=0.73 chemo=0.28 fin=0.00 eye=0.21 parts=5.1 senseless=0.00 speed=0.84 turn=0.091 eaten=169.39 reserve01=0.34
seed=3 tick=72000 creatures=1525 plants=1965 juv=0.42 len=11.8 wid=0.39 egg=0.64 old=3337 area=56.2 flagellum=0.37 cilia=0.40 filter=0.78 chemo=0.17 fin=0.00 eye=0.19 parts=5.6 senseless=0.00 speed=0.88 turn=0.103 eaten=164.37 reserve01=0.32
seed=3 tick=108000 creatures=1526 plants=1965 juv=0.42 len=11.4 wid=0.41 egg=0.65 old=3193 area=54.2 flagellum=0.34 cilia=0.37 filter=0.80 chemo=0.19 fin=0.00 eye=0.19 parts=6.2 senseless=0.01 speed=0.84 turn=0.101 eaten=161.59 reserve01=0.31
seed=3 tick=144000 creatures=1682 plants=1965 juv=0.38 len=10.7 wid=0.42 egg=0.67 old=3249 area=49.6 flagellum=0.31 cilia=0.34 filter=0.79 chemo=0.15 fin=0.00 eye=0.22 parts=6.3 senseless=0.05 speed=0.78 turn=0.101 eaten=160.36 reserve01=0.27
seed=4 tick=36000 creatures=1200 plants=1764 juv=0.38 len=12.4 wid=0.52 egg=0.67 old=3902 area=81.6 flagellum=0.42 cilia=0.28 filter=0.75 chemo=0.17 fin=0.01 eye=0.20 parts=5.0 senseless=0.04 speed=1.05 turn=0.086 eaten=159.76 reserve01=0.37
seed=4 tick=72000 creatures=1215 plants=1764 juv=0.40 len=13.0 wid=0.50 egg=0.67 old=3820 area=86.2 flagellum=0.35 cilia=0.22 filter=0.73 chemo=0.07 fin=0.00 eye=0.17 parts=4.7 senseless=0.10 speed=0.91 turn=0.075 eaten=155.16 reserve01=0.34
seed=4 tick=108000 creatures=1244 plants=1764 juv=0.35 len=12.5 wid=0.51 egg=0.67 old=3948 area=79.0 flagellum=0.24 cilia=0.28 filter=0.72 chemo=0.04 fin=0.00 eye=0.19 parts=5.1 senseless=0.25 speed=0.71 turn=0.083 eaten=151.25 reserve01=0.30
seed=4 tick=144000 creatures=1303 plants=1764 juv=0.36 len=12.2 wid=0.51 egg=0.67 old=3638 area=77.2 flagellum=0.23 cilia=0.34 filter=0.75 chemo=0.03 fin=0.00 eye=0.20 parts=5.8 senseless=0.16 speed=0.73 turn=0.095 eaten=149.00 reserve01=0.28
seed=5 tick=36000 creatures=1451 plants=2178 juv=0.36 len=12.7 wid=0.51 egg=0.67 old=4150 area=84.3 flagellum=0.44 cilia=0.26 filter=0.70 chemo=0.08 fin=0.00 eye=0.15 parts=4.5 senseless=0.14 speed=1.11 turn=0.089 eaten=195.06 reserve01=0.35
seed=5 tick=72000 creatures=1830 plants=2178 juv=0.38 len=11.2 wid=0.45 egg=0.67 old=3336 area=57.5 flagellum=0.38 cilia=0.29 filter=0.75 chemo=0.02 fin=0.00 eye=0.20 parts=4.5 senseless=0.04 speed=0.83 turn=0.100 eaten=185.94 reserve01=0.27
seed=5 tick=108000 creatures=1805 plants=2178 juv=0.39 len=10.8 wid=0.41 egg=0.67 old=2982 area=47.8 flagellum=0.23 cilia=0.40 filter=0.86 chemo=0.04 fin=0.00 eye=0.23 parts=5.5 senseless=0.01 speed=0.64 turn=0.103 eaten=179.86 reserve01=0.28
seed=5 tick=144000 creatures=1774 plants=2178 juv=0.38 len=11.6 wid=0.37 egg=0.67 old=3191 area=49.4 flagellum=0.20 cilia=0.48 filter=0.86 chemo=0.04 fin=0.01 eye=0.22 parts=6.1 senseless=0.00 speed=0.63 turn=0.105 eaten=176.64 reserve01=0.24
seed=6 tick=36000 creatures=1233 plants=1851 juv=0.36 len=11.9 wid=0.50 egg=0.66 old=4138 area=71.1 flagellum=0.45 cilia=0.31 filter=0.75 chemo=0.20 fin=0.00 eye=0.18 parts=5.4 senseless=0.00 speed=1.01 turn=0.095 eaten=159.95 reserve01=0.37
seed=6 tick=72000 creatures=1427 plants=1851 juv=0.40 len=10.8 wid=0.52 egg=0.66 old=3642 area=61.5 flagellum=0.34 cilia=0.31 filter=0.73 chemo=0.20 fin=0.00 eye=0.21 parts=5.2 senseless=0.00 speed=0.72 turn=0.099 eaten=158.49 reserve01=0.33
seed=6 tick=108000 creatures=1472 plants=1851 juv=0.39 len=10.7 wid=0.49 egg=0.67 old=3534 area=57.6 flagellum=0.24 cilia=0.35 filter=0.79 chemo=0.10 fin=0.01 eye=0.19 parts=5.5 senseless=0.00 speed=0.71 turn=0.099 eaten=154.64 reserve01=0.29
seed=6 tick=144000 creatures=1678 plants=1851 juv=0.39 len=10.3 wid=0.49 egg=0.67 old=3491 area=53.6 flagellum=0.25 cilia=0.34 filter=0.81 chemo=0.07 fin=0.00 eye=0.21 parts=5.1 senseless=0.00 speed=0.74 turn=0.104 eaten=152.94 reserve01=0.26
seed=7 tick=36000 creatures=1459 plants=2058 juv=0.37 len=12.7 wid=0.50 egg=0.67 old=3946 area=81.8 flagellum=0.46 cilia=0.25 filter=0.67 chemo=0.07 fin=0.02 eye=0.19 parts=4.7 senseless=0.02 speed=1.16 turn=0.088 eaten=183.27 reserve01=0.34
seed=7 tick=72000 creatures=1492 plants=2058 juv=0.38 len=12.9 wid=0.46 egg=0.67 old=3738 area=82.4 flagellum=0.29 cilia=0.30 filter=0.66 chemo=0.04 fin=0.00 eye=0.18 parts=4.3 senseless=0.10 speed=0.84 turn=0.084 eaten=179.24 reserve01=0.30
seed=7 tick=108000 creatures=1600 plants=2058 juv=0.39 len=12.1 wid=0.44 egg=0.66 old=3316 area=70.6 flagellum=0.28 cilia=0.35 filter=0.77 chemo=0.03 fin=0.00 eye=0.19 parts=4.8 senseless=0.04 speed=0.76 turn=0.094 eaten=175.24 reserve01=0.29
seed=7 tick=144000 creatures=1562 plants=2058 juv=0.36 len=12.8 wid=0.39 egg=0.66 old=3673 area=73.0 flagellum=0.30 cilia=0.34 filter=0.77 chemo=0.02 fin=0.00 eye=0.17 parts=4.9 senseless=0.06 speed=0.82 turn=0.089 eaten=173.96 reserve01=0.24
seed=8 tick=36000 creatures=1370 plants=1731 juv=0.37 len=12.9 wid=0.51 egg=0.68 old=3916 area=85.5 flagellum=0.39 cilia=0.21 filter=0.74 chemo=0.03 fin=0.00 eye=0.15 parts=4.0 senseless=0.10 speed=1.01 turn=0.075 eaten=173.43 reserve01=0.29
seed=8 tick=72000 creatures=1240 plants=1731 juv=0.34 len=15.9 wid=0.43 egg=0.67 old=3888 area=109.0 flagellum=0.39 cilia=0.03 filter=0.70 chemo=0.03 fin=0.00 eye=0.03 parts=3.0 senseless=0.53 speed=1.03 turn=0.043 eaten=169.88 reserve01=0.29
seed=8 tick=108000 creatures=1179 plants=1731 juv=0.34 len=17.0 wid=0.41 egg=0.68 old=4079 area=121.3 flagellum=0.35 cilia=0.05 filter=0.66 chemo=0.02 fin=0.00 eye=0.03 parts=3.0 senseless=0.71 speed=0.96 turn=0.041 eaten=163.16 reserve01=0.27
seed=8 tick=144000 creatures=1104 plants=1731 juv=0.35 len=19.2 wid=0.35 egg=0.68 old=4166 area=129.6 flagellum=0.34 cilia=0.09 filter=0.65 chemo=0.02 fin=0.01 eye=0.03 parts=3.3 senseless=0.83 speed=0.92 turn=0.042 eaten=159.35 reserve01=0.24
seed=9 tick=36000 creatures=1241 plants=1917 juv=0.36 len=13.3 wid=0.50 egg=0.68 old=4069 area=88.9 flagellum=0.51 cilia=0.27 filter=0.70 chemo=0.15 fin=0.00 eye=0.19 parts=4.9 senseless=0.08 speed=1.15 turn=0.086 eaten=179.09 reserve01=0.36
seed=9 tick=72000 creatures=1326 plants=1917 juv=0.37 len=13.5 wid=0.40 egg=0.65 old=3514 area=73.0 flagellum=0.39 cilia=0.33 filter=0.76 chemo=0.09 fin=0.00 eye=0.18 parts=4.9 senseless=0.04 speed=0.96 turn=0.088 eaten=172.92 reserve01=0.30
seed=9 tick=108000 creatures=1514 plants=1917 juv=0.36 len=13.3 wid=0.34 egg=0.66 old=3146 area=60.0 flagellum=0.29 cilia=0.32 filter=0.84 chemo=0.02 fin=0.01 eye=0.18 parts=4.5 senseless=0.02 speed=0.74 turn=0.080 eaten=164.65 reserve01=0.25
seed=9 tick=144000 creatures=1545 plants=1917 juv=0.38 len=13.5 wid=0.33 egg=0.66 old=3685 area=62.0 flagellum=0.21 cilia=0.35 filter=0.73 chemo=0.02 fin=0.00 eye=0.19 parts=4.8 senseless=0.01 speed=0.68 turn=0.081 eaten=158.96 reserve01=0.23
seed=10 tick=36000 creatures=1329 plants=1884 juv=0.35 len=12.0 wid=0.51 egg=0.68 old=3938 area=73.8 flagellum=0.48 cilia=0.26 filter=0.72 chemo=0.18 fin=0.00 eye=0.19 parts=4.7 senseless=0.01 speed=1.07 turn=0.092 eaten=174.41 reserve01=0.34
seed=10 tick=72000 creatures=1386 plants=1884 juv=0.36 len=11.2 wid=0.51 egg=0.66 old=3401 area=65.0 flagellum=0.36 cilia=0.34 filter=0.75 chemo=0.16 fin=0.00 eye=0.20 parts=5.1 senseless=0.00 speed=0.90 turn=0.101 eaten=164.51 reserve01=0.29
seed=10 tick=108000 creatures=1400 plants=1884 juv=0.37 len=11.6 wid=0.42 egg=0.66 old=3196 area=57.7 flagellum=0.22 cilia=0.43 filter=0.73 chemo=0.14 fin=0.00 eye=0.20 parts=5.6 senseless=0.00 speed=0.69 turn=0.100 eaten=160.38 reserve01=0.26
seed=10 tick=144000 creatures=1507 plants=1884 juv=0.39 len=11.1 wid=0.43 egg=0.64 old=3390 area=53.4 flagellum=0.23 cilia=0.42 filter=0.75 chemo=0.12 fin=0.00 eye=0.22 parts=6.1 senseless=0.00 speed=0.70 turn=0.105 eaten=155.29 reserve01=0.23
```
