/**
 * Owns the persistent MQTT connection and exposes the pve plug's live state,
 * both plugs' energy readings, NAS reachability, a `toggle()` and a manual
 * `reconnect()`. The broker IPs come from the store (multiple candidates — the
 * client cycles to whichever is reachable). With no IPs it stays idle.
 *
 * Safety: only ever publishes to the pve switch's SET topic; nasSwitch is
 * monitor-only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MqttClient } from './mqtt';
import { GET_TOPIC, NAS_GET_TOPIC, NAS_STATE_TOPIC, SET_TOPIC, STATE_TOPIC } from './config';
import { tcpPing } from './ping';
import type { Reach } from './useReachability';

export type PlugState = 'on' | 'off' | null;

const NAS_GRACE_MS = 5000;
const PROBE_INTERVAL_MS = 4000;

export interface PlugApi {
  nas: Reach;
  connected: boolean;
  state: PlugState;
  pveEnergy: number | null;
  nasEnergy: number | null;
  pending: boolean;
  setPower: (on: boolean) => void;
  reconnect: () => void;
}

export function usePlug({ hosts, port }: { hosts: string[]; port: number }): PlugApi {
  const [connected, setConnected] = useState(false);
  const [nasChecking, setNasChecking] = useState(true);
  const [state, setState] = useState<PlugState>(null);
  const [pveEnergy, setPveEnergy] = useState<number | null>(null);
  const [nasEnergy, setNasEnergy] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const clientRef = useRef<MqttClient | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startGrace = useCallback(() => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    setNasChecking(true);
    graceTimer.current = setTimeout(() => setNasChecking(false), NAS_GRACE_MS);
  }, []);

  const hostsKey = hosts.join(',');

  useEffect(() => {
    if (hosts.length === 0) {
      setConnected(false);
      setNasChecking(true);
      return;
    }
    startGrace();

    const client = new MqttClient(
      { hosts, port, keepAliveSeconds: 60 },
      {
        onConnect: () => {
          setConnected(true);
          setNasChecking(false);
          if (graceTimer.current) clearTimeout(graceTimer.current);
          client.subscribe(STATE_TOPIC);
          client.subscribe(NAS_STATE_TOPIC);
          client.publish(GET_TOPIC, JSON.stringify({ state: '', energy: '' }));
          client.publish(NAS_GET_TOPIC, JSON.stringify({ energy: '' }));
        },
        onDisconnect: () => {
          setConnected(false);
          startGrace();
        },
        onMessage: (topic, payload) => {
          try {
            const data = JSON.parse(payload.toString('utf8'));
            if (topic === STATE_TOPIC) {
              if (data.state === 'ON' || data.state === 'OFF') {
                setState(data.state === 'ON' ? 'on' : 'off');
              }
              if (typeof data.energy === 'number') setPveEnergy(data.energy);
            } else if (topic === NAS_STATE_TOPIC) {
              if (typeof data.energy === 'number') setNasEnergy(data.energy);
            }
          } catch {
            // ignore malformed payloads
          }
        },
      },
    );
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsKey, port, startGrace]);

  // Recover when connectivity returns (e.g. Tailscale comes up after the app
  // launched offline): while disconnected, probe the broker directly and force a
  // fresh connect once it answers. The socket-level retry can wedge on Android
  // after dialing unreachable Tailscale IPs, leaving the app offline until a
  // manual restart — this is the bridge that gets it back without one.
  useEffect(() => {
    if (connected || hosts.length === 0) return;
    let active = true;
    const id = setInterval(async () => {
      const checks = await Promise.all(hosts.map((h) => tcpPing(h, port, 2000)));
      if (active && checks.some(Boolean) && !clientRef.current?.isConnected()) {
        clientRef.current?.reconnect();
      }
    }, PROBE_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, hostsKey, port]);

  useEffect(() => {
    setPending(false);
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, [state]);

  const setPower = useCallback(
    (on: boolean) => {
      if (!connected) return;
      setPending(true);
      clientRef.current?.publish(SET_TOPIC, JSON.stringify({ state: on ? 'ON' : 'OFF' }));
      // Refresh pve energy shortly after (captures the reading at on/off).
      setTimeout(
        () => clientRef.current?.publish(GET_TOPIC, JSON.stringify({ energy: '' })),
        1500,
      );
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => setPending(false), 6000);
    },
    [connected],
  );

  const reconnect = useCallback(() => {
    startGrace();
    clientRef.current?.reconnect();
  }, [startGrace]);

  const nas: Reach = connected ? 'up' : nasChecking ? 'checking' : 'down';

  return { nas, connected, state, pveEnergy, nasEnergy, pending, setPower, reconnect };
}
