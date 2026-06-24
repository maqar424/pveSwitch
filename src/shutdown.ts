/**
 * Triggers the graceful pve shutdown by POSTing to the small token-protected
 * HTTP service on the pve host. It's reached over Tailscale (which encrypts the
 * link), so plain HTTP is fine — no TLS, no SSH. Tries each candidate pve IP
 * until one accepts; the service replies immediately, then powers the host off.
 */
export interface ShutdownOptions {
  hosts: string[];
  port: number;
  token: string;
}

const REQUEST_TIMEOUT_MS = 8000;

export async function runRemoteShutdown(opts: ShutdownOptions): Promise<void> {
  if (!opts.token.trim()) throw new Error('No shutdown token set');

  let lastError: unknown = null;
  for (const host of opts.hosts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`http://${host}:${opts.port}/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.token}` },
        signal: controller.signal,
      });
      if (res.ok) return; // a pve IP accepted the request
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e; // unreachable on this IP — try the next
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Shutdown service unreachable');
}
