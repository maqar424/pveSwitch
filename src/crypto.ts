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

async function getKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Buffer.from(bytes).toString('base64');
    await SecureStore.setItemAsync(KEY_NAME, key);
  }
  return key;
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

export async function decryptString(ciphertext: string): Promise<string> {
  const key = await getKey();
  return CryptoJS.AES.decrypt(ciphertext, key).toString(CryptoJS.enc.Utf8);
}
