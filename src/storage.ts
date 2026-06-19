/**
 * Persistent "save file" for pveSwitch, stored as JSON in the app's document
 * directory via expo-file-system. Holds:
 *   - per-day energy consumption deltas (kWh), keyed by 'YYYY-MM-DD'
 *   - recorded boot durations (seconds)
 *   - the energy baseline (last cumulative reading) used to compute deltas
 */
import { File, Paths } from 'expo-file-system';

const FILE_NAME = 'pveswitch-data.json';
const DATA_VERSION = 1;

export interface PveData {
  version: number;
  /** Last cumulative energy reading (kWh) — the baseline for the next delta. */
  energyBaseline: number | null;
  /** Energy consumed per day in kWh, keyed by 'YYYY-MM-DD'. Deltas are summed. */
  energyByDay: Record<string, number>;
  /** Recorded boot durations, in seconds (most recent last). */
  bootTimes: number[];
}

export const emptyData = (): PveData => ({
  version: DATA_VERSION,
  energyBaseline: null,
  energyByDay: {},
  bootTimes: [],
});

function fileRef(): File {
  return new File(Paths.document, FILE_NAME);
}

/** Local 'YYYY-MM-DD' for a date (defaults to now). */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadData(): PveData {
  try {
    const file = fileRef();
    if (!file.exists) return emptyData();
    const parsed = JSON.parse(file.textSync());
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
}

export function saveData(data: PveData): void {
  try {
    const file = fileRef();
    if (!file.exists) file.create();
    file.write(JSON.stringify(data));
  } catch {
    // ignore write failures — losing a delta is not worth crashing over
  }
}
