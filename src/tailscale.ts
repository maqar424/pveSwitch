/**
 * Opens Tailscale to help the user connect when the NAS is unreachable.
 *
 * We can't toggle the VPN for them (Android forbids that from another app), so
 * we bring the Tailscale app to the foreground by launching it by package name.
 * If it isn't installed (or can't be launched), we fall back to the website.
 *
 * Launching another app by package on Android 11+ needs the package declared in
 * <queries> — see plugins/withTailscaleQueries.js.
 */
import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const TAILSCALE_PACKAGE = 'com.tailscale.ipn';
const WEB_FALLBACK = 'https://login.tailscale.com/';
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

export async function openTailscale(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        category: 'android.intent.category.LAUNCHER',
        packageName: TAILSCALE_PACKAGE,
        flags: FLAG_ACTIVITY_NEW_TASK,
      });
      return;
    } catch {
      // Tailscale not installed / can't be launched — fall through to the web.
    }
  }

  try {
    await Linking.openURL(WEB_FALLBACK);
  } catch {
    // Nothing more we can do.
  }
}
