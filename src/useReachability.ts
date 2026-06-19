/**
 * Polls the configured (non-NAS) hosts with a TCP reachability check on an
 * interval and returns each host's status keyed by `PingHost.key`.
 */
import { useEffect, useState } from 'react';
import { PING_HOSTS, REACH_INTERVAL_MS } from './config';
import { tcpPing } from './ping';

export type Reach = 'checking' | 'up' | 'down';

const initial = (): Record<string, Reach> =>
  Object.fromEntries(PING_HOSTS.map((h) => [h.key, 'checking'])) as Record<string, Reach>;

export function useReachability(intervalMs = REACH_INTERVAL_MS): Record<string, Reach> {
  const [status, setStatus] = useState<Record<string, Reach>>(initial);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const results = await Promise.all(
        PING_HOSTS.map(
          async (h) =>
            [h.key, (await tcpPing(h.host, h.port, 2500, h.strict)) ? 'up' : 'down'] as const,
        ),
      );
      if (active) setStatus(Object.fromEntries(results) as Record<string, Reach>);
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
