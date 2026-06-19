/**
 * App configuration — everything you might want to change lives here.
 */

export interface DisplayHost {
  key: string;
  label: string;
  host: string;
}

/** The NAS / Tailscale gateway. Tracked via the live MQTT link, not a ping. */
export const NAS: DisplayHost = { key: 'nas', label: 'NAS', host: '100.108.70.1' };

export const BROKER = {
  host: NAS.host,
  port: 1883,
} as const;

/** Zigbee2MQTT topics for the pve switch. */
export const SET_TOPIC = 'zigbee2mqtt/pveSwitch/set'; // publish {"state":"ON"|"OFF"}
export const STATE_TOPIC = 'zigbee2mqtt/pveSwitch'; // device reports {"state":..,"energy":..}
export const GET_TOPIC = 'zigbee2mqtt/pveSwitch/get'; // ask the device to report now

export const ENERGY_UNIT = 'kWh';

export interface PingHost extends DisplayHost {
  port: number;
  /**
   * When true, only a real (open-port) connection counts as reachable — a
   * refused/reset connection is treated as "not up yet". Use this to detect a
   * service actually being ready (e.g. the VM's SSH) rather than just the host
   * answering, so it reports online only once it has genuinely booted.
   */
  strict?: boolean;
}

/**
 * Hosts checked by TCP, below the NAS in the hierarchy. The NAS itself is not
 * here — it's derived from the persistent MQTT connection, which is far more
 * reliable than repeatedly opening throwaway sockets to the broker.
 */
export const PING_HOSTS: PingHost[] = [
  { key: 'pve', label: 'pve', host: '100.111.213.5', port: 8006 }, // Proxmox web UI
  { key: 'vm', label: 'Ubuntu VM', host: '100.111.150.88', port: 22, strict: true }, // SSH ready
];

/** How often to re-check pve / VM reachability. */
export const REACH_INTERVAL_MS = 2000;
