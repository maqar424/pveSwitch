/**
 * Graceful pve shutdown flow:
 *   idle → sending (HTTP) → waiting (poll pve reachability) → cut power → idle
 * `error` if the shutdown service can't be reached. While waiting, power is cut
 * once pve has been unreachable for a short confirm window, or after a hard time
 * cap. The caller can `forceOff()` at any point to cut power immediately.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { runRemoteShutdown } from './shutdown';
import type { ShutdownConfig } from './config';
import type { Reach } from './useReachability';

const DOWN_CONFIRM_MS = 10000; // pve must look down this long before we cut power
const MAX_WAIT_MS = 180000; // safety cap: cut power after ~3 min regardless

export type ShutdownPhase = 'idle' | 'sending' | 'waiting' | 'error';

export interface ShutdownApi {
  phase: ShutdownPhase;
  error: string | null;
  start: () => void;
  forceOff: () => void;
}

export function useShutdown(params: {
  pveReach: Reach;
  pveHosts: string[];
  shutdown: ShutdownConfig;
  powerOff: () => void;
}): ShutdownApi {
  const { pveReach, pveHosts, shutdown, powerOff } = params;

  const [phase, setPhase] = useState<ShutdownPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const pveReachRef = useRef(pveReach);
  pveReachRef.current = pveReach;
  const powerOffRef = useRef(powerOff);
  powerOffRef.current = powerOff;

  const start = useCallback(async () => {
    setError(null);
    setPhase('sending');
    try {
      await runRemoteShutdown({
        hosts: pveHosts,
        port: shutdown.port,
        token: shutdown.token,
      });
      setPhase('waiting');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Shutdown failed');
      setPhase('error');
    }
  }, [pveHosts, shutdown.port, shutdown.token]);

  const forceOff = useCallback(() => {
    powerOffRef.current();
    setError(null);
    setPhase('idle');
  }, []);

  useEffect(() => {
    if (phase !== 'waiting') return;
    const startedAt = Date.now();
    let downSince: number | null = null;

    const finish = () => {
      clearInterval(id);
      powerOffRef.current();
      setPhase('idle');
    };

    const id = setInterval(() => {
      const now = Date.now();
      if (pveReachRef.current === 'down') {
        if (downSince == null) downSince = now;
        if (now - downSince >= DOWN_CONFIRM_MS) return finish();
      } else {
        downSince = null;
      }
      if (now - startedAt >= MAX_WAIT_MS) finish();
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  return { phase, error, start, forceOff };
}
