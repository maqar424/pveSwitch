/**
 * Placeholder for the graceful SSH shutdown.
 *
 * The native SSH library (@dylankenneally/react-native-ssh-sftp) was removed
 * because it would not build on Expo 56 / RN 0.85. For now the off action does a
 * direct power cut; the shutdown flow, its on-screen states, and the stored SSH
 * details are kept dormant so a working mechanism (e.g. the Proxmox API) can be
 * dropped in here without rewiring the UI.
 */
export interface ShutdownOptions {
  hosts: string[];
  port: number;
  user: string;
  password: string;
  command: string;
}

export async function runRemoteShutdown(_opts: ShutdownOptions): Promise<void> {
  throw new Error('Graceful shutdown is not available in this build yet');
}
