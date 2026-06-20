/**
 * Opens Tailscale to help the user connect when the NAS is unreachable.
 *
 * We can't toggle the VPN for them (Android forbids that from another app), so
 * the best we can do is bring Tailscale to the foreground:
 *   1. try the `tailscale://` scheme — opens the installed app directly;
 *   2. otherwise open https://login.tailscale.com/ — which opens the app if it
 *      has registered that URL as an Android App Link, else the login page.
 */
import { Linking } from 'react-native';

const APP_SCHEME = 'tailscale://';
const WEB_FALLBACK = 'https://login.tailscale.com/';

export async function openTailscale(): Promise<void> {
  try {
    await Linking.openURL(APP_SCHEME);
    return;
  } catch {
    // No app registered for the scheme — fall through to the web link.
  }
  try {
    await Linking.openURL(WEB_FALLBACK);
  } catch {
    // Nothing more we can do.
  }
}
