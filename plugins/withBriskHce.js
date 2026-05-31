/**
 * Expo config plugin: register react-native-hce's HostApduService so the Android
 * "Brisk Terminal" can emulate an NFC Forum Type-4 tag (the invoice). Expo CNG
 * regenerates AndroidManifest on every prebuild, so this must run as a plugin —
 * manual native edits would be wiped. Mirrors the manual steps in the
 * react-native-hce README (CardService + aid_list.xml, AID D2760000850101).
 *
 * iOS is untouched (no HCE on iOS); the customer-side NFC *reading* entitlement
 * + usage string come from the react-native-nfc-manager plugin in app.json.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const AID = "D2760000850101"; // NFC Forum Type-4 NDEF tag AID

const AID_LIST_XML = `<?xml version="1.0" encoding="utf-8"?>
<host-apdu-service xmlns:android="http://schemas.android.com/apk/res/android"
                   android:description="@string/app_name"
                   android:requireDeviceUnlock="false">
  <aid-group android:category="other"
             android:description="@string/app_name">
    <aid-filter android:name="${AID}" />
  </aid-group>
</host-apdu-service>
`;

function withAidListXml(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "aid_list.xml"), AID_LIST_XML);
      return cfg;
    },
  ]);
}

function withHceManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // <uses-feature android:name="android.hardware.nfc.hce" android:required="false" />
    // required=false so the single APK still installs on customer Androids that
    // only need to *read* (not emulate).
    manifest.manifest["uses-feature"] = manifest.manifest["uses-feature"] || [];
    if (
      !manifest.manifest["uses-feature"].some(
        (f) => f.$ && f.$["android:name"] === "android.hardware.nfc.hce",
      )
    ) {
      manifest.manifest["uses-feature"].push({
        $: { "android:name": "android.hardware.nfc.hce", "android:required": "false" },
      });
    }

    // <service com.reactnativehce.services.CardService ...> inside <application>
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    const SERVICE = "com.reactnativehce.services.CardService";
    if (!app.service.some((s) => s.$ && s.$["android:name"] === SERVICE)) {
      app.service.push({
        $: {
          "android:name": SERVICE,
          "android:exported": "true",
          "android:enabled": "false", // library flips this on when emulation starts
          "android:permission": "android.permission.BIND_NFC_SERVICE",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.nfc.cardemulation.action.HOST_APDU_SERVICE" } },
            ],
            category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.nfc.cardemulation.host_apdu_service",
              "android:resource": "@xml/aid_list",
            },
          },
        ],
      });
    }

    return cfg;
  });
}

module.exports = function withBriskHce(config) {
  config = withAidListXml(config);
  config = withHceManifest(config);
  return config;
};
