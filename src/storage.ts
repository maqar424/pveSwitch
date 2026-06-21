/**
 * Persistent encrypted "save file" for pveSwitch, stored as AES ciphertext in
 * the app's document directory. Holds two energy series (pve + nas), boot
 * durations, a price history, the currency, and the per-server IP lists.
 *
 * load/save are async (encryption key comes from the secure keystore). Existing
 * plaintext files (pre-encryption) are detected and read once, then re-saved
 * encrypted.
 */
import { File, Paths } from 'expo-file-system';
import {
  DEFAULT_CURRENCY,
  DEFAULT_SERVER_IPS,
  DEFAULT_SSH,
  type ServerKey,
  type SshConfig,
} from './config';
import { cryptoRoundTrip, decryptString, encryptString, peekKey, secureStoreRoundTrip } from './crypto';

const FILE_NAME = 'pveswitch-data.json';
const DATA_VERSION = 5;

let idCounter = 0;
export function genId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface EnergySeries {
  baseline: number | null;
  baselineAt: string | null;
  byDay: Record<string, number>;
}

export interface PriceEntry {
  id: string;
  start: string | null; // null = since the beginning
  end: string | null; // null = current / ongoing
  price: number;
}

export interface PveData {
  version: number;
  pve: EnergySeries;
  nas: EnergySeries;
  bootTimes: number[];
  prices: PriceEntry[];
  currency: string;
  /** Per-server candidate IPs (the app uses whichever is reachable). */
  servers: Record<ServerKey, string[]>;
  /** SSH details for the graceful pve shutdown. */
  ssh: SshConfig;
}

const emptySeries = (): EnergySeries => ({ baseline: null, baselineAt: null, byDay: {} });

/** In-memory placeholder before the file is loaded — empty IPs so nothing connects. */
export const emptyData = (): PveData => ({
  version: DATA_VERSION,
  pve: emptySeries(),
  nas: emptySeries(),
  bootTimes: [],
  prices: [],
  currency: DEFAULT_CURRENCY,
  servers: { nas: [], pve: [], vm: [] },
  ssh: DEFAULT_SSH,
});

function fileRef(): File {
  return new File(Paths.document, FILE_NAME);
}

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayKeysFromTo(startISO: string, end: Date = new Date()): string[] {
  const start = new Date(startISO);
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const keys: string[] = [];
  const cursor = s;
  let guard = 0;
  while (cursor <= e && guard < 5000) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys.length > 0 ? keys : [dayKey(e)];
}

function normalizePrices(arr: unknown): PriceEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: PriceEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, any>;
    const price = Number(e.price);
    if (!Number.isFinite(price)) continue;
    if ('start' in e || 'end' in e) {
      out.push({ id: typeof e.id === 'string' ? e.id : genId(), start: e.start ?? null, end: e.end ?? null, price });
    } else if ('from' in e) {
      out.push({ id: genId(), start: e.from ?? null, end: null, price });
    }
  }
  return out;
}

function normalizeServers(s: unknown): Record<ServerKey, string[]> {
  const obj = (s ?? {}) as Record<string, any>;
  const pick = (k: ServerKey): string[] => {
    const v = obj[k];
    if (Array.isArray(v)) {
      const ips = v.filter((x) => typeof x === 'string' && x.trim().length > 0);
      return ips.length > 0 ? ips : DEFAULT_SERVER_IPS[k];
    }
    return DEFAULT_SERVER_IPS[k];
  };
  return { nas: pick('nas'), pve: pick('pve'), vm: pick('vm') };
}

function normalizeSsh(s: unknown): SshConfig {
  const o = (s ?? {}) as Record<string, any>;
  const port = Number(o.port);
  return {
    user: typeof o.user === 'string' && o.user ? o.user : DEFAULT_SSH.user,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_SSH.port,
    password: typeof o.password === 'string' ? o.password : DEFAULT_SSH.password,
    command: typeof o.command === 'string' && o.command ? o.command : DEFAULT_SSH.command,
  };
}

function migrate(parsed: unknown): PveData {
  const base = emptyData();
  const p = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, any>;

  if (p.pve && p.nas) {
    return {
      ...base,
      pve: { ...emptySeries(), ...p.pve },
      nas: { ...emptySeries(), ...p.nas },
      bootTimes: Array.isArray(p.bootTimes) ? p.bootTimes : [],
      prices: normalizePrices(p.prices),
      currency: typeof p.currency === 'string' ? p.currency : DEFAULT_CURRENCY,
      servers: normalizeServers(p.servers),
      ssh: normalizeSsh(p.ssh),
      version: DATA_VERSION,
    };
  }

  // v1 shape, or a brand-new install: start from defaults.
  base.servers = normalizeServers(p.servers);
  base.ssh = normalizeSsh(p.ssh);
  if (Array.isArray(p.bootTimes)) base.bootTimes = p.bootTimes;
  if (p.energyByDay || typeof p.energyBaseline === 'number') {
    base.pve = {
      baseline: typeof p.energyBaseline === 'number' ? p.energyBaseline : null,
      baselineAt: null,
      byDay: p.energyByDay && typeof p.energyByDay === 'object' ? p.energyByDay : {},
    };
  }
  return base;
}

let lastLoadInfo = 'not-loaded';
export function getLastLoadInfo(): string {
  return lastLoadInfo;
}

export async function loadData(): Promise<PveData> {
  try {
    const file = fileRef();
    if (!file.exists) {
      lastLoadInfo = 'no-file';
      return migrate({});
    }
    const raw = file.textSync();
    // Encrypted files are base64 ("U2FsdGVk…"); legacy files are plain JSON ("{").
    const isPlain = raw.trimStart().startsWith('{');
    const json = isPlain ? raw : await decryptString(raw);
    if (!json) {
      lastLoadInfo = `decrypt-empty (raw ${raw.length})`;
      return migrate({});
    }
    const result = migrate(JSON.parse(json));
    lastLoadInfo = isPlain ? 'plaintext-ok' : 'decrypt-ok';
    return result;
  } catch (e) {
    lastLoadInfo = 'error: ' + String(e);
    return migrate({});
  }
}

/** Temporary: reports the state of each persistence layer to locate the bug. */
export async function storageDiag(): Promise<string[]> {
  const out: string[] = [`load: ${lastLoadInfo}`];
  try {
    const f = fileRef();
    if (f.exists) {
      const t = f.textSync();
      out.push(`file: yes len=${t.length} head="${t.slice(0, 8)}"`);
    } else {
      out.push('file: MISSING');
    }
  } catch (e) {
    out.push('file: ERR ' + String(e));
  }
  try {
    const k = await peekKey();
    out.push(`key: ${k ? 'set len=' + k.length : 'MISSING'}`);
  } catch (e) {
    out.push('key: ERR ' + String(e));
  }
  out.push('ss-roundtrip: ' + (await secureStoreRoundTrip()));
  out.push('crypto: ' + (await cryptoRoundTrip()));
  out.push('save: ' + lastSaveInfo);
  return out;
}

let lastSaveInfo = 'not-saved';
export function getLastSaveInfo(): string {
  return lastSaveInfo;
}

export async function saveData(data: PveData): Promise<void> {
  // Persist the data no matter what: encrypt when crypto-js works, but fall back
  // to a plain write if it throws — a failed encrypt must not silently drop the
  // save (which is exactly what lost the IPs before). loadData reads either form.
  const json = JSON.stringify(data);
  let content = json;
  let note = 'plaintext';
  try {
    content = await encryptString(json);
    note = 'encrypted';
  } catch (e) {
    note = 'plaintext (encrypt threw: ' + String(e) + ')';
  }
  try {
    const file = fileRef();
    if (!file.exists) file.create();
    file.write(content);
    lastSaveInfo = `wrote ${note} len=${content.length}`;
  } catch (e) {
    lastSaveInfo = `write FAILED (${note}): ` + String(e);
  }
}
