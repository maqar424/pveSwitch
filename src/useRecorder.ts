/**
 * Records energy deltas + boot durations into the store.
 *  - pve energy: each increase added to today's bucket.
 *  - nas energy: each increase spread evenly across days since the last reading.
 *  - boot: timed from a real off→on transition until the VM is reachable.
 */
import { useEffect, useRef, useState } from 'react';
import { dayKey, dayKeysFromTo } from './storage';
import type { Store } from './useStore';
import type { PlugState } from './usePlug';

const MAX_BOOT_SAMPLES = 50;
const MAX_PLAUSIBLE_BOOT_SEC = 3600;
const average = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface RecorderApi {
  averageBootSeconds: number | null;
  bootStartedAt: number | null;
}

export function useRecorder(
  store: Store,
  params: { pveEnergy: number | null; nasEnergy: number | null; state: PlugState; vmUp: boolean },
): RecorderApi {
  const { pveEnergy, nasEnergy, state, vmUp } = params;
  const { getData, commit, data } = store;

  const [bootStartedAt, setBootStartedAt] = useState<number | null>(null);
  const prevState = useRef<PlugState>(null);
  const prevVmUp = useRef<boolean>(false);
  const bootStartRef = useRef<number | null>(null);
  const bootRecordable = useRef<boolean>(false);

  useEffect(() => {
    if (pveEnergy == null) return;
    const d = getData();
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
  }, [pveEnergy, getData, commit]);

  useEffect(() => {
    if (nasEnergy == null) return;
    const d = getData();
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
  }, [nasEnergy, getData, commit]);

  useEffect(() => {
    if (vmUp && !prevVmUp.current && bootStartRef.current !== null) {
      const elapsed = (Date.now() - bootStartRef.current) / 1000;
      if (bootRecordable.current && elapsed > 0 && elapsed < MAX_PLAUSIBLE_BOOT_SEC) {
        const d = getData();
        const bootTimes = [...d.bootTimes, Math.round(elapsed)].slice(-MAX_BOOT_SAMPLES);
        commit({ ...d, bootTimes });
      }
      bootStartRef.current = null;
      bootRecordable.current = false;
      setBootStartedAt(null);
    }

    // Start timing only on a real off→on transition (the power-on press).
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
  }, [state, vmUp, getData, commit]);

  const averageBootSeconds = data.bootTimes.length > 0 ? average(data.bootTimes) : null;
  return { averageBootSeconds, bootStartedAt };
}
