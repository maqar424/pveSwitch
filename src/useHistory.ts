/**
 * Records history into the persistent save file and derives the average boot
 * time. Owns the `PveData` state so the energy popup can read + edit it.
 *
 *  - pve energy: each increase is added to *today's* bucket (accurate, because
 *    the user drives the pve server through the app).
 *  - nas energy: each increase is **spread evenly across the days since the last
 *    reading**, so an occasional collection doesn't spike one day — the NAS draws
 *    steady power and the app is opened only now and then.
 *  - Boot: timed from plug-on until the VM is reachable; only boots observed
 *    starting from off (while running) are recorded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dayKey,
  dayKeysFromTo,
  genId,
  loadData,
  saveData,
  type PriceEntry,
  type PveData,
} from './storage';
import type { PlugState } from './usePlug';

const MAX_BOOT_SAMPLES = 50;
const MAX_PLAUSIBLE_BOOT_SEC = 3600;

export interface HistoryApi {
  data: PveData;
  averageBootSeconds: number | null;
  bootStartedAt: number | null;
  addPrice: (start: string | null, end: string | null, price: number) => void;
  removePrice: (id: string) => void;
  setCurrency: (currency: string) => void;
}

const average = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function useHistory(params: {
  pveEnergy: number | null;
  nasEnergy: number | null;
  state: PlugState;
  vmUp: boolean;
}): HistoryApi {
  const { pveEnergy, nasEnergy, state, vmUp } = params;

  const [data, setData] = useState<PveData>(() => loadData());
  const dataRef = useRef(data);
  dataRef.current = data;

  const commit = useCallback((next: PveData) => {
    dataRef.current = next;
    saveData(next);
    setData(next);
  }, []);

  const [bootStartedAt, setBootStartedAt] = useState<number | null>(null);
  const prevState = useRef<PlugState>(null);
  const prevVmUp = useRef<boolean>(false);
  const bootStartRef = useRef<number | null>(null);
  const bootRecordable = useRef<boolean>(false);

  // pve energy: add the delta to today (no smoothing).
  useEffect(() => {
    if (pveEnergy == null) return;
    const d = dataRef.current;
    const s = d.pve;
    const nowISO = new Date().toISOString();
    if (s.baseline == null) {
      commit({ ...d, pve: { ...s, baseline: pveEnergy, baselineAt: nowISO } });
      return;
    }
    if (pveEnergy > s.baseline) {
      const key = dayKey();
      const byDay = { ...s.byDay, [key]: (s.byDay[key] ?? 0) + (pveEnergy - s.baseline) };
      commit({ ...d, pve: { baseline: pveEnergy, baselineAt: nowISO, byDay } });
    } else if (pveEnergy < s.baseline) {
      commit({ ...d, pve: { ...s, baseline: pveEnergy, baselineAt: nowISO } });
    }
  }, [pveEnergy, commit]);

  // nas energy: spread the delta evenly across the days since the last reading.
  useEffect(() => {
    if (nasEnergy == null) return;
    const d = dataRef.current;
    const s = d.nas;
    const nowISO = new Date().toISOString();
    if (s.baseline == null) {
      commit({ ...d, nas: { ...s, baseline: nasEnergy, baselineAt: nowISO } });
      return;
    }
    if (nasEnergy > s.baseline) {
      const delta = nasEnergy - s.baseline;
      const days = dayKeysFromTo(s.baselineAt ?? nowISO);
      const per = delta / days.length;
      const byDay = { ...s.byDay };
      for (const k of days) byDay[k] = (byDay[k] ?? 0) + per;
      commit({ ...d, nas: { baseline: nasEnergy, baselineAt: nowISO, byDay } });
    } else if (nasEnergy < s.baseline) {
      commit({ ...d, nas: { ...s, baseline: nasEnergy, baselineAt: nowISO } });
    }
  }, [nasEnergy, commit]);

  // Boot timing.
  useEffect(() => {
    if (vmUp && !prevVmUp.current && bootStartRef.current !== null) {
      const elapsed = (Date.now() - bootStartRef.current) / 1000;
      if (bootRecordable.current && elapsed > 0 && elapsed < MAX_PLAUSIBLE_BOOT_SEC) {
        const d = dataRef.current;
        const bootTimes = [...d.bootTimes, Math.round(elapsed)].slice(-MAX_BOOT_SAMPLES);
        commit({ ...d, bootTimes });
      }
      bootStartRef.current = null;
      bootRecordable.current = false;
      setBootStartedAt(null);
    }

    // Start timing a boot ONLY on a real off->on transition (i.e. the user just
    // powered it on). Not on app-open-while-on, nor a transient VM/Tailscale drop.
    if (state === 'on' && prevState.current === 'off' && !vmUp && bootStartRef.current === null) {
      const now = Date.now();
      bootStartRef.current = now;
      bootRecordable.current = true;
      setBootStartedAt(now);
    }

    if ((state === 'off' || state === null) && bootStartRef.current !== null) {
      bootStartRef.current = null;
      bootRecordable.current = false;
      setBootStartedAt(null);
    }

    prevState.current = state;
    prevVmUp.current = vmUp;
  }, [state, vmUp, commit]);

  const addPrice = useCallback(
    (start: string | null, end: string | null, price: number) => {
      const d = dataRef.current;
      const entry: PriceEntry = { id: genId(), start, end, price };
      commit({ ...d, prices: [...d.prices, entry] });
    },
    [commit],
  );

  const removePrice = useCallback(
    (id: string) => {
      const d = dataRef.current;
      commit({ ...d, prices: d.prices.filter((p) => p.id !== id) });
    },
    [commit],
  );

  const setCurrency = useCallback(
    (currency: string) => {
      commit({ ...dataRef.current, currency });
    },
    [commit],
  );

  const averageBootSeconds = data.bootTimes.length > 0 ? average(data.bootTimes) : null;

  return { data, averageBootSeconds, bootStartedAt, addPrice, removePrice, setCurrency };
}
