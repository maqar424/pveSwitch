// Declares <queries> package visibility so the app can see + launch the
// Tailscale app on Android 11+ (required to launch another app by package name).
const { withAndroidManifest } = require('@expo/config-plugins');

const PACKAGES = ['com.tailscale.ipn'];

module.exports = function withTailscaleQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [];
    }
    let queries = manifest.queries[0];
    if (!queries) {
      queries = {};
      manifest.queries.push(queries);
    }
    if (!Array.isArray(queries.package)) {
      queries.package = [];
    }
    for (const name of PACKAGES) {
      const exists = queries.package.some((p) => p && p.$ && p.$['android:name'] === name);
      if (!exists) {
        queries.package.push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
};
