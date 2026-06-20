/**
 * AES encryption for the save file. The key is a random 256-bit value kept in
 * the OS secure keystore (expo-secure-store), generated once on first use.
 * crypto-js handles the AES + salt; the work is trivial for a few KB of JSON.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';

const KEY_NAME = 'pveswitch_data_key';

// Cache the key resolution so concurrent first-use callers share ONE key.
// On a fresh install the pve + nas energy baselines (and an IP save) can all
// trigger encryption in the same tick; without this guard each racing caller
// saw "no key", generated a different one, and the file could end up encrypted
// with a key the keystore no longer held — making every later launch fail to
// decrypt and silently reset to defaults (losing saved IPs + history).
let keyPromise: Promise<string> | null = null;

function getKey(): Promise<string> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(KEY_NAME);
      if (existing) return existing;
      const bytes = await Crypto.getRandomBytesAsync(32);
      const key = Buffer.from(bytes).toString('base64');
      await SecureStore.setItemAsync(KEY_NAME, key);
      return key;
    })().catch((e) => {
      keyPromise = null; // don't cache a failure — allow a later retry
      throw e;
    });
  }
  return keyPromise;
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

export async function decryptString(ciphertext: string): Promise<string> {
  const key = await getKey();
  return CryptoJS.AES.decrypt(ciphertext, key).toString(CryptoJS.enc.Utf8);
}
