/**
 * TCP reachability check ("ping" without ICMP).
 *
 * React Native / Expo can't send raw ICMP echo packets without extra native
 * code, so instead we open a short-lived TCP connection. The key insight: we
 * don't need the port to be open. Three outcomes:
 *   - connection succeeds        -> host reachable (port open)
 *   - connection refused / reset -> host reachable (port closed, but it answered)
 *   - timeout / unreachable      -> host NOT reachable
 *
 * In `strict` mode a refused/reset connection does NOT count as reachable —
 * only an actually-open port does. Use it when you want to detect a service
 * being ready (e.g. SSH on a freshly-booted VM), not just the host answering.
 */
import TcpSocket from 'react-native-tcp-socket';

export function tcpPing(
  host: string,
  port: number,
  timeoutMs = 2500,
  strict = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(reachable);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const socket = TcpSocket.createConnection({ host, port }, () => finish(true));

    socket.on('error', (err: unknown) => {
      if (strict) {
        // Only a successful connection counts; anything else is "not up".
        finish(false);
        return;
      }
      const e = err as { code?: string; message?: string };
      const text = `${e?.code ?? ''} ${e?.message ?? ''}`.toLowerCase();
      // A refused/reset connection still means the host answered -> reachable.
      const reachable =
        text.includes('refused') ||
        text.includes('econnrefused') ||
        text.includes('reset') ||
        text.includes('econnreset');
      finish(reachable);
    });
  });
}
