// Dynamic Expo config. app.json remains the single source of truth; this file
// only layers on config that depends on the environment/filesystem:
//
//   • android.googleServicesFile — required for FCM device push tokens on
//     Android production builds. Wired automatically from either source:
//       1. GOOGLE_SERVICES_JSON — an EAS *file* environment variable
//          (recommended; the file is gitignored so this is how EAS builds get
//          it). Create once with:
//            eas env:create --scope project --name GOOGLE_SERVICES_JSON \
//              --type file --value ./google-services.json \
//              --environment production
//       2. ./google-services.json at the repo root (local prebuilds).
//     Until one exists, builds still work — Android push registration just
//     no-ops (registerForPushNotificationsAsync tolerates it).
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON; // EAS file env var → absolute path on the build VM
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = fromEnv && fs.existsSync(fromEnv) ? fromEnv : fs.existsSync(local) ? './google-services.json' : null;
  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }
  return config;
};
