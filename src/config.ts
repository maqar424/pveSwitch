/**
 * App configuration. Server IP addresses now live in the save file (editable in
 * the Servers popup); only their fixed metadata (names, ports, hierarchy) and
 * the first-run defaults live here.
 */

export type ServerKey = 'nas' | 'pve' | 'vm';

export interface ServerMeta {
  key: ServerKey;
  label: string;
  /** Port used for the reachability check (NAS = broker port). */
  port: number;
  /** Reachability strictness: when true only an open port counts as up. */
  strict?: boolean;
}

/** Fixed hierarchy + names + ports, top → bottom. Names/order are not editable. */
export const SERVERS: ServerMeta[] = [
  { key: 'nas', label: 'NAS', port: 1883 }, // mosquitto
  { key: 'pve', label: 'pve', port: 8006 }, // Proxmox web UI
  { key: 'vm', label: 'Ubuntu VM', port: 22, strict: true }, // SSH
];

/** Servers checked by TCP ping (everything below the NAS, which uses the MQTT link). */
export const PING_SERVERS = SERVERS.filter((s) => s.key !== 'nas');

export const BROKER_PORT = 1883;

/** First-run defaults (the previously hard-coded Tailscale IPs). */
export const DEFAULT_SERVER_IPS: Record<ServerKey, string[]> = {
  nas: ['100.108.70.1'],
  pve: ['100.111.213.5'],
  vm: ['100.111.150.88'],
};

/**
 * Graceful pve shutdown via a small token-protected HTTP service running on the
 * pve host (POST /shutdown over Tailscale). `port` is that service's port; an
 * empty `token` disables graceful shutdown (off just cuts power).
 */
export interface ShutdownConfig {
  port: number;
  token: string;
}

export const DEFAULT_SHUTDOWN: ShutdownConfig = {
  port: 8723,
  token: '',
};

/** Zigbee2MQTT topics for the pve switch (which we control). */
export const SET_TOPIC = 'zigbee2mqtt/pveSwitch/set';
export const STATE_TOPIC = 'zigbee2mqtt/pveSwitch';
export const GET_TOPIC = 'zigbee2mqtt/pveSwitch/get';

/**
 * nasSwitch is MONITOR-ONLY. Never publish to a `…/set` topic for it — turning
 * it off cuts power to the NAS and the broker itself. There is deliberately no
 * NAS_SET_TOPIC constant.
 */
export const NAS_STATE_TOPIC = 'zigbee2mqtt/nasSwitch';
export const NAS_GET_TOPIC = 'zigbee2mqtt/nasSwitch/get';

export const ENERGY_UNIT = 'kWh';
export const DEFAULT_CURRENCY = '€';

/** How often to re-check pve / VM reachability. */
export const REACH_INTERVAL_MS = 2000;
