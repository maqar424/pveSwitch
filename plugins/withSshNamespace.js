// @dylankenneally/react-native-ssh-sftp@1.7.0 still declares its package in the
// AndroidManifest with no build.gradle `namespace`, which AGP 8 (Expo SDK 56 /
// RN 0.85) rejects. This patches the library during prebuild — deterministic on
// EAS (prebuild always runs there), unlike relying on a postinstall patch.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG = '@dylankenneally/react-native-ssh-sftp';
const NAMESPACE = 'me.dylankenneally.rnssh';

module.exports = function withSshNamespace(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const base = path.join(cfg.modRequest.projectRoot, 'node_modules', PKG, 'android');

      try {
        const gradlePath = path.join(base, 'build.gradle');
        let g = fs.readFileSync(gradlePath, 'utf8');
        if (!/\bnamespace\s/.test(g)) {
          g = g.replace(/android\s*\{/, `android {\n    namespace '${NAMESPACE}'`);
          fs.writeFileSync(gradlePath, g);
        }
      } catch (e) {
        // library layout changed — leave it to patch-package
      }

      try {
        const manifestPath = path.join(base, 'src', 'main', 'AndroidManifest.xml');
        let m = fs.readFileSync(manifestPath, 'utf8');
        if (/\spackage="/.test(m)) {
          m = m.replace(/\s+package="[^"]*"/, '');
          fs.writeFileSync(manifestPath, m);
        }
      } catch (e) {
        // ignore
      }

      return cfg;
    },
  ]);
};
