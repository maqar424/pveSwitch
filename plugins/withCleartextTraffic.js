// The graceful-shutdown call is plain HTTP to the pve helper service (encrypted
// at the network layer by Tailscale). Modern Android (targetSdk >= 28) blocks
// cleartext HTTP by default, which would make that fetch fail, so opt the app
// into cleartext. The app otherwise only talks to Tailscale-internal hosts.
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
