/**
 * App configuration — everything you might want to change lives here.
 */

export const BROKER = {
  host: '100.108.70.1',
  port: 1883,
} as const;

/** Zigbee2MQTT topics for the pve switch. */
export const SET_TOPIC = 'zigbee2mqtt/pveSwitch/set'; // publish {"state":"ON"|"OFF"}
export const STATE_TOPIC = 'zigbee2mqtt/pveSwitch'; // device reports {"state":..,"energy":..}
export const GET_TOPIC = 'zigbee2mqtt/pveSwitch/get'; // ask the device to report now

export const ENERGY_UNIT = 'kWh';

export interface HostCheck {
  key: string;
  label: string;
  host: string;
  /**
   * TCP port used for the reachability check. We don't need the port to be
   * *open* — a refused connection still proves the host is reachable — but
   * picking a port that's usually open avoids false "offline" results on
   * firewalls that silently drop packets to closed ports.
   */
  port: number;
}

/**
 * Hierarchical reachability checks, ordered top → bottom:
 *   NAS (always on, the Tailscale gateway) → pve (boots when the plug is on)
 *   → Ubuntu VM (runs on pve).
 */
export const HOSTS: HostCheck[] = [
  { key: 'nas', label: 'NAS', host: '100.108.70.1', port: 1883 }, // mosquitto
  { key: 'pve', label: 'pve', host: '100.111.213.5', port: 8006 }, // Proxmox web UI
  { key: 'vm', label: 'Ubuntu VM', host: '100.111.150.88', port: 22 }, // SSH
];
