/**
 * Polls each (non-NAS) server's candidate IPs on an interval and reports it as
 * reachable if ANY of its IPs answers. The NAS isn't here — it's derived from
 * the live MQTT connection.
 */
import { useEffect, useState } from 'react';
import { PING_SERVERS, REACH_INTERVAL_MS, type ServerKey } from './config';
import { tcpPing } from './ping';

export type Reach = 'checking' | 'up' | 'down';

const initial = (): Record<string, Reach> =>
  Object.fromEntries(PING_SERVERS.map((s) => [s.key, 'checking'])) as Record<string, Reach>;

export function useReachability(
  serverIps: Record<ServerKey, string[]>,
  intervalMs = REACH_INTERVAL_MS,
): Record<string, Reach> {
  const [status, setStatus] = useState<Record<string, Reach>>(initial);

  const ipsKey = PING_SERVERS.map((s) => (serverIps[s.key] ?? []).join(',')).join('|');

  useEffect(() => {
    let active = true;

    const run = async () => {
      const results = await Promise.all(
        PING_SERVERS.map(async (meta) => {
          const ips = serverIps[meta.key] ?? [];
          if (ips.length === 0) return [meta.key, 'checking'] as const;
          const checks = await Promise.all(
            ips.map((ip) => tcpPing(ip, meta.port, 2500, meta.strict)),
          );
          return [meta.key, checks.some(Boolean) ? 'up' : 'down'] as const;
        }),
      );
      if (active) setStatus(Object.fromEntries(results) as Record<string, Reach>);
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipsKey, intervalMs]);

  return status;
}
