/**
 * crypto-js 4.2.0 removed its insecure Math.random fallback and now throws in
 * React Native ("Native crypto module could not be used to get secure random
 * number") because there's no global `crypto.getRandomValues`. expo-crypto
 * ships a real CSPRNG getRandomValues — install it on globalThis so crypto-js
 * can generate the salt/IV it needs.
 *
 * MUST be imported before 'crypto-js' (crypto-js captures the crypto object at
 * module-init time). crypto.ts imports this first.
 */
import { getRandomValues } from 'expo-crypto';

const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: any) => any } };
if (!g.crypto) {
  g.crypto = {};
}
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = (array: any) => getRandomValues(array);
}
