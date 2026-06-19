/**
 * Persistent "save file" for pveSwitch, stored as JSON in the app's document
 * directory via expo-file-system. Holds two energy series (pve + nas), recorded
 * boot durations, and a price history (price per kWh, valid from a date).
 */
import { File, Paths } from 'expo-file-system';
import { DEFAULT_CURRENCY } from './config';

const FILE_NAME = 'pveswitch-data.json';
const DATA_VERSION = 3;

let idCounter = 0;
/** Small unique id for price entries. */
export function genId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface EnergySeries {
  /** Last cumulative reading (kWh) — the baseline for the next delta. */
  baseline: number | null;
  /** ISO timestamp of that reading (used to spread NAS deltas over time). */
  baselineAt: string | null;
  /** Energy consumed per day in kWh, keyed by 'YYYY-MM-DD'. */
  byDay: Record<string, number>;
}

/**
 * A kWh price valid over a date range (inclusive). `start === null` means "since
 * the very beginning"; `end === null` means "current" (ongoing).
 */
export interface PriceEntry {
  id: string;
  start: string | null; // 'YYYY-MM-DD' or null
  end: string | null; // 'YYYY-MM-DD' or null
  price: number; // currency per kWh
}

export interface PveData {
  version: number;
  pve: EnergySeries;
  nas: EnergySeries;
  bootTimes: number[]; // seconds, most recent last
  prices: PriceEntry[]; // sorted ascending by `from`
  currency: string;
}

const emptySeries = (): EnergySeries => ({ baseline: null, baselineAt: null, byDay: {} });

export const emptyData = (): PveData => ({
  version: DATA_VERSION,
  pve: emptySeries(),
  nas: emptySeries(),
  bootTimes: [],
  prices: [],
  currency: DEFAULT_CURRENCY,
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

/** Inclusive list of day keys from the date in `startISO` to `end`. */
export function dayKeysFromTo(startISO: string, end: Date = new Date()): string[] {
  const start = new Date(startISO);
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const keys: string[] = [];
  const cursor = s;
  let guard = 0;
  while (cursor <= e && guard < 5000) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys.length > 0 ? keys : [dayKey(e)];
}

/** Accept both the old `{from, price}` and the new `{start, end, price}` shapes. */
function normalizePrices(arr: unknown): PriceEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: PriceEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, any>;
    const price = Number(e.price);
    if (!Number.isFinite(price)) continue;
    if ('start' in e || 'end' in e) {
      out.push({
        id: typeof e.id === 'string' ? e.id : genId(),
        start: e.start ?? null,
        end: e.end ?? null,
        price,
      });
    } else if ('from' in e) {
      out.push({ id: genId(), start: e.from ?? null, end: null, price });
    }
  }
  return out;
}

function migrate(parsed: unknown): PveData {
  const base = emptyData();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Record<string, any>;

  // v2/v3 share the same series shape; only the price model changed (handled
  // by normalizePrices). Detect by the presence of the energy series.
  if (p.pve && p.nas) {
    return {
      ...base,
      pve: { ...emptySeries(), ...p.pve },
      nas: { ...emptySeries(), ...p.nas },
      bootTimes: Array.isArray(p.bootTimes) ? p.bootTimes : [],
      prices: normalizePrices(p.prices),
      currency: typeof p.currency === 'string' ? p.currency : DEFAULT_CURRENCY,
      version: DATA_VERSION,
    };
  }

  // v1: { energyBaseline, energyByDay, bootTimes } -> becomes the pve series.
  if (Array.isArray(p.bootTimes)) base.bootTimes = p.bootTimes;
  if (p.energyByDay || typeof p.energyBaseline === 'number') {
    base.pve = {
      baseline: typeof p.energyBaseline === 'number' ? p.energyBaseline : null,
      baselineAt: null,
      byDay: p.energyByDay && typeof p.energyByDay === 'object' ? p.energyByDay : {},
    };
  }
  return base;
}

export function loadData(): PveData {
  try {
    const file = fileRef();
    if (!file.exists) return emptyData();
    return migrate(JSON.parse(file.textSync()));
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
    // ignore write failures
  }
}
