import { type NeuralNetwork } from './network';
import { SensorChannel } from './network';
import { type CellArrays } from '../memory/cell-store';
import { CellType } from '../cells/types';
import { ambientLight } from '../environment/cycle';
import { type TemperatureField } from '../environment/temperature-field';
import { type ToxinField } from '../environment/toxin-field';
import { type GlowField } from '../environment/glow-field';

/**
 * Precompute scalar values for SENSOR cells with channel >= AMBIENT_LIGHT (2).
 *
 * Channels < 2 (FWD_GRAD / LAT_GRAD) are handled by the existing food-gradient
 * projection in think(); this function only fills in the scalar channels.
 *
 * Written into `net.sensorScalar[i]`; read later by think() during sensor
 * injection. Allocation-free; iterates only sensorCount (small).
 *
 * Fields are nullable for robustness but always exist on World.
 */
export function senseScalars(
  net: NeuralNetwork,
  f: CellArrays,
  tick: number,
  dayLength: number,
  dayNightDepth: number,
  temp: TemperatureField | null,
  toxin: ToxinField | null,
  glow: GlowField | null,
): void {
  const sn = net.sensorCount;
  if (sn === 0) return;

  const sc = net.sensorCell;
  const ch = net.sensorChannel;
  const dst = net.sensorScalar;

  for (let k = 0; k < sn; k++) {
    const i = sc[k]!;
    if (f.cellType[i]! !== CellType.SENSOR) continue;

    const channel = ch[k]!;
    if (channel < SensorChannel.AMBIENT_LIGHT) continue;

    switch (channel) {
      case SensorChannel.AMBIENT_LIGHT:
        dst[i] = ambientLight(tick, dayLength, dayNightDepth);
        break;
      case SensorChannel.TEMP:
        dst[i] = temp !== null ? temp.sampleAt(f.posX[i]!, f.posY[i]!) : 0;
        break;
      case SensorChannel.TOXIN:
        dst[i] = toxin !== null ? toxin.sampleAt(f.posX[i]!, f.posY[i]!) : 0;
        break;
      case SensorChannel.GLOW:
        dst[i] = glow !== null ? glow.sampleAt(f.posX[i]!, f.posY[i]!) : 0;
        break;
      default:
        // Unknown channel — leave as 0.
        break;
    }
  }
}