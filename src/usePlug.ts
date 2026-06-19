/**
 * Owns the persistent MQTT connection and exposes the plug's live state,
 * its latest energy reading, and a single `toggle()` that flips it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MqttClient } from './mqtt';
import { BROKER, GET_TOPIC, SET_TOPIC, STATE_TOPIC } from './config';

export type PlugState = 'on' | 'off' | null;

export interface PlugApi {
  connected: boolean;
  state: PlugState;
  energy: number | null;
  pending: boolean;
  toggle: () => void;
}

export function usePlug(): PlugApi {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<PlugState>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const clientRef = useRef<MqttClient | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = new MqttClient(
      { host: BROKER.host, port: BROKER.port, keepAliveSeconds: 60 },
      {
        onConnect: () => {
          setConnected(true);
          client.subscribe(STATE_TOPIC);
          // Ask the device to report its current state + energy right away.
          client.publish(GET_TOPIC, JSON.stringify({ state: '', energy: '' }));
        },
        onDisconnect: () => setConnected(false),
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

  return { connected, state, energy, pending, toggle };
}
