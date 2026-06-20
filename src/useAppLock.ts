/**
 * App lock via the device's biometric / credential prompt (expo-local-
 * authentication). The app starts locked, authenticates on launch, re-locks
 * whenever it goes to the background, and re-authenticates on return.
 *
 * If the device has no lock configured at all, we don't lock the user out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export interface AppLock {
  unlocked: boolean;
  authenticate: () => Promise<void>;
}

export function useAppLock(): AppLock {
  const [unlocked, setUnlocked] = useState(false);
  // Authoritative + synchronous mirror of `unlocked`, so the AppState handler
  // never reads a stale value during fast background/foreground flips.
  const unlockedRef = useRef(false);
  const authenticating = useRef(false);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  const lock = useCallback(() => {
    unlockedRef.current = false;
    setUnlocked(false);
  }, []);

  const unlock = useCallback(() => {
    unlockedRef.current = true;
    setUnlocked(true);
  }, []);

  const authenticate = useCallback(async () => {
    if (authenticating.current || unlockedRef.current) return;
    authenticating.current = true;
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        unlock(); // no device lock set up — don't lock them out of their own app
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock pveSwitch',
        cancelLabel: 'Cancel',
      });
      if (result.success) unlock();
    } catch {
      // Unexpected error -> stay locked; user can retry from the lock screen.
    } finally {
      authenticating.current = false;
    }
  }, [unlock]);

  useEffect(() => {
    authenticate();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        authenticate();
      } else if (next === 'background' && !authenticating.current) {
        lock();
      }
    });
    return () => sub.remove();
  }, [authenticate, lock]);

  return { unlocked, authenticate };
}
