/**
 * Records history into the persistent save file and derives the average boot
 * time. Driven by the live plug state, the VM's reachability, and the plug's
 * energy reading.
 *
 *  - Energy: the first reading seen becomes the baseline (0 deltas). Each later
 *    increase is added to today's bucket; a decrease resets the baseline.
 *  - Boot: timed from the plug turning on until the VM becomes reachable. Only
 *    boots whose start we actually observed (off -> on while running) are
 *    recorded, so the average stays accurate.
 */
import { useEffect, useRef, useState } from 'react';
import { dayKey, loadData, saveData, type PveData } from './storage';
import type { PlugState } from './usePlug';

const MAX_BOOT_SAMPLES = 50;
const MAX_PLAUSIBLE_BOOT_SEC = 3600;

export interface HistoryApi {
  /** Mean recorded boot time in seconds, or null if nothing recorded yet. */
  averageBootSeconds: number | null;
  /** Timestamp (ms) the current boot began, or null when not booting. */
  bootStartedAt: number | null;
  /** Total energy consumed since tracking began (kWh) — sum of all deltas. */
  consumptionKWh: number;
}

const average = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sumDeltas = (data: PveData): number =>
  Object.values(data.energyByDay).reduce((a, b) => a + b, 0);

export function useHistory(params: {
  energy: number | null;
  state: PlugState;
  vmUp: boolean;
}): HistoryApi {
  const { energy, state, vmUp } = params;

  const dataRef = useRef<PveData | null>(null);
  const [averageBootSeconds, setAverageBootSeconds] = useState<number | null>(null);
  const [bootStartedAt, setBootStartedAt] = useState<number | null>(null);
  const [consumptionKWh, setConsumptionKWh] = useState(0);

  const prevState = useRef<PlugState>(null);
  const prevVmUp = useRef<boolean>(false);
  const bootStartRef = useRef<number | null>(null);
  const bootRecordable = useRef<boolean>(false);

  // Load the save file once.
  useEffect(() => {
    const data = loadData();
    dataRef.current = data;
    if (data.bootTimes.length > 0) setAverageBootSeconds(average(data.bootTimes));
    setConsumptionKWh(sumDeltas(data));
  }, []);

  // Energy deltas.
  useEffect(() => {
    const data = dataRef.current;
    if (!data || energy === null) return;

    if (data.energyBaseline === null) {
      data.energyBaseline = energy; // first reading -> baseline, no delta
      saveData(data);
      return;
    }
    if (energy > data.energyBaseline) {
      const key = dayKey();
      data.energyByDay[key] = (data.energyByDay[key] ?? 0) + (energy - data.energyBaseline);
      data.energyBaseline = energy;
      saveData(data);
      setConsumptionKWh(sumDeltas(data));
    } else if (energy < data.energyBaseline) {
      data.energyBaseline = energy; // counter reset on the device
      saveData(data);
    }
  }, [energy]);

  // Boot timing.
  useEffect(() => {
    const data = dataRef.current;

    // Boot finished: the VM just became reachable while we were timing.
    if (vmUp && !prevVmUp.current && bootStartRef.current !== null) {
      const elapsed = (Date.now() - bootStartRef.current) / 1000;
      if (bootRecordable.current && data && elapsed > 0 && elapsed < MAX_PLAUSIBLE_BOOT_SEC) {
        data.bootTimes = [...data.bootTimes, Math.round(elapsed)].slice(-MAX_BOOT_SAMPLES);
        saveData(data);
        setAverageBootSeconds(average(data.bootTimes));
      }
      bootStartRef.current = null;
      bootRecordable.current = false;
      setBootStartedAt(null);
    }

    // Boot in progress: plug on, VM not up yet.
    if (state === 'on' && !vmUp && bootStartRef.current === null) {
      const now = Date.now();
      bootStartRef.current = now;
      // Only record boots we saw start from off (mid-boot at app open isn't reliable).
      bootRecordable.current = prevState.current === 'off';
      setBootStartedAt(now);
    }

    // Server off: cancel any in-progress timing.
    if ((state === 'off' || state === null) && bootStartRef.current !== null) {
      bootStartRef.current = null;
      bootRecordable.current = false;
      setBootStartedAt(null);
    }

    prevState.current = state;
    prevVmUp.current = vmUp;
  }, [state, vmUp]);

  return { averageBootSeconds, bootStartedAt, consumptionKWh };
}
