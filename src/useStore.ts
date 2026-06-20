/**
 * Owns the (decrypted) save-file data in memory. Only loads/decrypts while
 * `enabled` (i.e. the app is unlocked); on re-lock it drops the data so nothing
 * decrypted lingers in memory. Exposes the data plus mutators.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyData, genId, loadData, saveData, type PveData } from './storage';
import type { ServerKey } from './config';

export interface Store {
  data: PveData;
  loaded: boolean;
  getData: () => PveData;
  commit: (next: PveData) => void;
  addPrice: (start: string | null, end: string | null, price: number) => void;
  removePrice: (id: string) => void;
  setCurrency: (currency: string) => void;
  setServerIps: (key: ServerKey, ips: string[]) => void;
  setServers: (servers: Record<ServerKey, string[]>) => void;
}

export function useStore(enabled: boolean): Store {
  const [data, setData] = useState<PveData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!enabled) {
      // Re-locked: drop decrypted data from memory.
      setLoaded(false);
      setData(emptyData());
      return;
    }
    let active = true;
    (async () => {
      const next = await loadData();
      if (!active) return;
      dataRef.current = next;
      setData(next);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  const commit = useCallback((next: PveData) => {
    dataRef.current = next;
    void saveData(next);
    setData(next);
  }, []);

  const getData = useCallback(() => dataRef.current, []);

  const addPrice = useCallback(
    (start: string | null, end: string | null, price: number) => {
      const d = dataRef.current;
      commit({ ...d, prices: [...d.prices, { id: genId(), start, end, price }] });
    },
    [commit],
  );

  const removePrice = useCallback(
    (id: string) => {
      const d = dataRef.current;
      commit({ ...d, prices: d.prices.filter((p) => p.id !== id) });
    },
    [commit],
  );

  const setCurrency = useCallback(
    (currency: string) => {
      commit({ ...dataRef.current, currency });
    },
    [commit],
  );

  const setServerIps = useCallback(
    (key: ServerKey, ips: string[]) => {
      const d = dataRef.current;
      commit({ ...d, servers: { ...d.servers, [key]: ips } });
    },
    [commit],
  );

  const setServers = useCallback(
    (servers: Record<ServerKey, string[]>) => {
      commit({ ...dataRef.current, servers });
    },
    [commit],
  );

  return {
    data,
    loaded,
    getData,
    commit,
    addPrice,
    removePrice,
    setCurrency,
    setServerIps,
    setServers,
  };
}
