/**
 * TCP reachability check ("ping" without ICMP).
 *
 * React Native / Expo can't send raw ICMP echo packets without extra native
 * code, so instead we open a short-lived TCP connection. The key insight: we
 * don't need the port to be open. Three outcomes:
 *   - connection succeeds        -> host reachable (port open)
 *   - connection refused / reset -> host reachable (port closed, but it answered)
 *   - timeout / unreachable      -> host NOT reachable
 */
import TcpSocket from 'react-native-tcp-socket';

export function tcpPing(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
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
