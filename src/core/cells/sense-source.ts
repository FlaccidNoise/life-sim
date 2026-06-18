/** What FILLS a sensor cell's (senseX, senseY) each tick: which field/query feeds it.
 *  Parallel to (and orthogonal to) SensorChannel, which projects that vector to a scalar. */
export const SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const;
export type SenseSourceValue = (typeof SenseSource)[keyof typeof SenseSource];

/** What a SIGHT eye looks for; only meaningful when senseSource === SIGHT. */
export const SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const;
export type SightTargetValue = (typeof SightTarget)[keyof typeof SightTarget];
