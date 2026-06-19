/**
 * Owns the persistent MQTT connection and exposes the pve plug's live state,
 * both plugs' energy readings (pve + nas), NAS reachability, a single
 * `toggle()`, and a manual `reconnect()`.
 *
 * Safety: this hook only ever publishes to the pve switch's SET topic. The NAS
 * switch is subscribed/queried for energy but is NEVER sent a state command —
 * switching it off would cut power to the NAS and the broker itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MqttClient } from './mqtt';
import {
  BROKER,
  GET_TOPIC,
  NAS_GET_TOPIC,
  NAS_STATE_TOPIC,
  SET_TOPIC,
  STATE_TOPIC,
} from './config';
import type { Reach } from './useReachability';

export type PlugState = 'on' | 'off' | null;

/** Grace window before a missing connection is reported as "down" (vs "checking"). */
const NAS_GRACE_MS = 5000;

export interface PlugApi {
  /** NAS reachability, derived from the live MQTT link. */
  nas: Reach;
  connected: boolean;
  state: PlugState;
  pveEnergy: number | null;
  nasEnergy: number | null;
  pending: boolean;
  toggle: () => void;
  reconnect: () => void;
}

export function usePlug(): PlugApi {
  const [connected, setConnected] = useState(false);
  const [nasChecking, setNasChecking] = useState(true);
  const [state, setState] = useState<PlugState>(null);
  const [pveEnergy, setPveEnergy] = useState<number | null>(null);
  const [nasEnergy, setNasEnergy] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const clientRef = useRef<MqttClient | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const startGrace = useCallback(() => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    setNasChecking(true);
    graceTimer.current = setTimeout(() => setNasChecking(false), NAS_GRACE_MS);
  }, []);

  useEffect(() => {
    startGrace();

    const client = new MqttClient(
      { host: BROKER.host, port: BROKER.port, keepAliveSeconds: 60 },
      {
        onConnect: () => {
          setConnected(true);
          setNasChecking(false);
          if (graceTimer.current) clearTimeout(graceTimer.current);
          client.subscribe(STATE_TOPIC);
          client.subscribe(NAS_STATE_TOPIC);
          // Ask both plugs to report their current state + energy right away.
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
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, [startGrace]);

  // Returning to the foreground (e.g. after enabling Tailscale) -> reconnect.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !connectedRef.current) {
        startGrace();
        clientRef.current?.reconnect();
      }
    });
    return () => sub.remove();
  }, [startGrace]);

  // Once the broker confirms a new state, the command is no longer pending.
  useEffect(() => {
    setPending(false);
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, [state]);

  const toggle = useCallback(() => {
    if (!connected || state === null || pending) return;
    const target = state === 'on' ? 'OFF' : 'ON';
    setPending(true);
    clientRef.current?.publish(SET_TOPIC, JSON.stringify({ state: target }));

    // Refresh pve energy on every toggle (on AND off) for accurate deltas.
    setTimeout(
      () => clientRef.current?.publish(GET_TOPIC, JSON.stringify({ energy: '' })),
      1500,
    );

    // Safety net: stop showing the spinner even if no report arrives.
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPending(false), 6000);
  }, [connected, state, pending]);

  const reconnect = useCallback(() => {
    startGrace();
    clientRef.current?.reconnect();
  }, [startGrace]);

  const nas: Reach = connected ? 'up' : nasChecking ? 'checking' : 'down';

  return { nas, connected, state, pveEnergy, nasEnergy, pending, toggle, reconnect };
}
