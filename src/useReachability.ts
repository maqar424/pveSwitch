/**
 * Polls the configured hosts with a TCP reachability check on an interval and
 * returns each host's status keyed by `HostCheck.key`.
 */
import { useEffect, useState } from 'react';
import { HOSTS } from './config';
import { tcpPing } from './ping';

export type Reach = 'checking' | 'up' | 'down';

const initial = (): Record<string, Reach> =>
  Object.fromEntries(HOSTS.map((h) => [h.key, 'checking'])) as Record<string, Reach>;

export function useReachability(intervalMs = 5000): Record<string, Reach> {
  const [status, setStatus] = useState<Record<string, Reach>>(initial);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const results = await Promise.all(
        HOSTS.map(
          async (h) => [h.key, (await tcpPing(h.host, h.port)) ? 'up' : 'down'] as const,
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
