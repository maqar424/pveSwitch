/**
 * Sends the graceful shutdown command to pve over SSH. Tries each candidate IP
 * and uses the first that authenticates. Once connected, the command is sent
 * best-effort — `shutdown` often drops the SSH session as the system goes down,
 * so an `execute` error after a successful connect is not treated as a failure.
 */
import SSHClient from '@dylankenneally/react-native-ssh-sftp';

export interface ShutdownOptions {
  hosts: string[];
  port: number;
  user: string;
  password: string;
  command: string;
}

export async function runRemoteShutdown(opts: ShutdownOptions): Promise<void> {
  let lastError: unknown = null;

  for (const host of opts.hosts) {
    try {
      const client = await SSHClient.connectWithPassword(host, opts.port, opts.user, opts.password);
      try {
        await client.execute(opts.command);
      } catch {
        // The shutdown may drop the SSH session mid-command — that's expected.
      }
      try {
        client.disconnect();
      } catch {
        // ignore
      }
      return; // a host authenticated and the command was sent
    } catch (e) {
      lastError = e; // couldn't connect/auth on this host — try the next
    }
  }

  throw lastError instanceof Error ? lastError : new Error('SSH connection failed');
}
