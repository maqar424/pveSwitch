/**
 * Owns the persistent MQTT connection and exposes the plug's live state, its
 * latest energy reading, NAS reachability (derived from the connection), and a
 * single `toggle()` that flips it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MqttClient } from './mqtt';
import { BROKER, GET_TOPIC, SET_TOPIC, STATE_TOPIC } from './config';
import type { Reach } from './useReachability';

export type PlugState = 'on' | 'off' | null;

/** Grace window before a missing connection is reported as "down" (vs "checking"). */
const NAS_GRACE_MS = 5000;

export interface PlugApi {
  /** NAS reachability, derived from the live MQTT link. */
  nas: Reach;
  connected: boolean;
  state: PlugState;
  energy: number | null;
  pending: boolean;
  toggle: () => void;
}

export function usePlug(): PlugApi {
  const [connected, setConnected] = useState(false);
  const [nasChecking, setNasChecking] = useState(true);
  const [state, setState] = useState<PlugState>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const clientRef = useRef<MqttClient | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const startGrace = () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
      setNasChecking(true);
      graceTimer.current = setTimeout(() => setNasChecking(false), NAS_GRACE_MS);
    };

    startGrace();

    const client = new MqttClient(
      { host: BROKER.host, port: BROKER.port, keepAliveSeconds: 60 },
      {
        onConnect: () => {
          setConnected(true);
          setNasChecking(false);
          if (graceTimer.current) clearTimeout(graceTimer.current);
          client.subscribe(STATE_TOPIC);
          // Ask the device to report its current state + energy right away.
          client.publish(GET_TOPIC, JSON.stringify({ state: '', energy: '' }));
        },
        onDisconnect: () => {
          setConnected(false);
          startGrace();
        },
        onMessage: (topic, payload) => {
          if (topic !== STATE_TOPIC) return;
          try {
            const data = JSON.parse(payload.toString('utf8'));
            if (data.state === 'ON' || data.state === 'OFF') {
              setState(data.state === 'ON' ? 'on' : 'off');
            }
            if (typeof data.energy === 'number') setEnergy(data.energy);
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
  }, []);

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

    // After powering on, ask for a fresh energy reading shortly after.
    if (target === 'ON') {
      setTimeout(
        () => clientRef.current?.publish(GET_TOPIC, JSON.stringify({ energy: '' })),
        1500,
      );
    }

    // Safety net: stop showing the spinner even if no report arrives.
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPending(false), 6000);
  }, [connected, state, pending]);

  const nas: Reach = connected ? 'up' : nasChecking ? 'checking' : 'down';

  return { nas, connected, state, energy, pending, toggle };
}
