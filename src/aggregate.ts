/**
 * Turns the stored per-day energy series into totals and time-bucketed series
 * for the charts, applying the price history when the metric is cost.
 */
import type { PveData, PriceEntry } from './storage';

export type Duration = 'total' | 'year' | 'month';
export type Metric = 'kwh' | 'cost';

/** Colors for the three values shown across the charts. */
export const SERIES = {
  nas: '#60a5fa', // blue
  pve: '#34d399', // emerald
  sum: '#a78bfa', // violet
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Price per kWh valid on `day` (prices assumed sorted ascending by `from`). */
export function priceAt(prices: PriceEntry[], day: string): number {
  let price = 0;
  for (const entry of prices) {
    if (entry.from <= day) price = entry.price;
    else break;
  }
  return price;
}

function dayValue(
  byDay: Record<string, number>,
  prices: PriceEntry[],
  day: string,
  metric: Metric,
): number {
  const kwh = byDay[day] ?? 0;
  return metric === 'cost' ? kwh * priceAt(prices, day) : kwh;
}

export interface Totals {
  nas: number;
  pve: number;
  sum: number;
}

/** Total over every recorded day (optionally restricted to a 'YYYY-MM' prefix). */
export function totals(data: PveData, metric: Metric, prefix?: string): Totals {
  const days = new Set([...Object.keys(data.nas.byDay), ...Object.keys(data.pve.byDay)]);
  let nas = 0;
  let pve = 0;
  for (const d of days) {
    if (prefix && !d.startsWith(prefix)) continue;
    nas += dayValue(data.nas.byDay, data.prices, d, metric);
    pve += dayValue(data.pve.byDay, data.prices, d, metric);
  }
  return { nas, pve, sum: nas + pve };
}

export interface Bucket {
  key: string;
  label: string;
  nas: number;
  pve: number;
}

function sumPrefix(
  byDay: Record<string, number>,
  prices: PriceEntry[],
  prefix: string,
  metric: Metric,
): number {
  let total = 0;
  for (const day of Object.keys(byDay)) {
    if (day.startsWith(prefix)) total += dayValue(byDay, prices, day, metric);
  }
  return total;
}

/** Buckets for the chart x-axis: days (month), months (year), or months (total). */
export function buildBuckets(
  data: PveData,
  duration: Duration,
  metric: Metric,
  now = new Date(),
): Bucket[] {
  const buckets: Bucket[] = [];

  if (duration === 'month') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      buckets.push({
        key,
        label: String(d),
        nas: dayValue(data.nas.byDay, data.prices, key, metric),
        pve: dayValue(data.pve.byDay, data.prices, key, metric),
      });
    }
    return buckets;
  }

  if (duration === 'year') {
    const y = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const prefix = `${y}-${pad2(m + 1)}`;
      buckets.push({
        key: prefix,
        label: MONTHS[m],
        nas: sumPrefix(data.nas.byDay, data.prices, prefix, metric),
        pve: sumPrefix(data.pve.byDay, data.prices, prefix, metric),
      });
    }
    return buckets;
  }

  // total: month buckets from the earliest recorded month to the current one.
  const all = [...Object.keys(data.nas.byDay), ...Object.keys(data.pve.byDay)].sort();
  if (all.length === 0) return [];
  let [yy, mm] = all[0].slice(0, 7).split('-').map(Number);
  const lastY = now.getFullYear();
  const lastM = now.getMonth() + 1;
  let guard = 0;
  while (guard < 600) {
    const prefix = `${yy}-${pad2(mm)}`;
    buckets.push({
      key: prefix,
      label: `${pad2(mm)}/${String(yy).slice(2)}`,
      nas: sumPrefix(data.nas.byDay, data.prices, prefix, metric),
      pve: sumPrefix(data.pve.byDay, data.prices, prefix, metric),
    });
    if (yy === lastY && mm === lastM) break;
    mm += 1;
    if (mm > 12) {
      mm = 1;
      yy += 1;
    }
    guard += 1;
  }
  return buckets;
}

/** German-style number: comma decimal separator. */
export function formatNumber(v: number, decimals = 2): string {
  return v.toFixed(decimals).replace('.', ',');
}

/** "1,23 kWh" or "1,23 €". */
export function formatValue(v: number, metric: Metric, currency: string): string {
  return metric === 'cost' ? `${formatNumber(v)} ${currency}` : `${formatNumber(v)} kWh`;
}
