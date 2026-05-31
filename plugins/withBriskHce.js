/**
 * Expo config plugin for Brisk's custom Android HCE module (the "Brisk
 * Terminal"). react-native-hce is unusable on RN 0.81/AGP 8 (no namespace,
 * broken gradle), so we ship our own tiny native module instead:
 *
 *  - HceNdefService.kt   — HostApduService emulating an NDEF Type-4 tag
 *  - BriskHceModule.kt    — RN bridge (setNdefMessage / stop)
 *  - BriskHcePackage.kt   — ReactPackage
 *
 * This plugin copies those Kotlin sources into the app, registers the service
 * (+ aid_list.xml, AID D2760000850101) in the manifest, and adds the package to
 * MainApplication. All of it survives `expo prebuild` (CNG). iOS is untouched
 * (HCE is Android-only); the customer-side NFC read uses react-native-nfc-manager.
 */
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const HCE_PACKAGE = "com.gkouvas.brisk.hce";
const SERVICE_CLASS = `${HCE_PACKAGE}.HceNdefService`;
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

// Copy the Kotlin sources + aid_list.xml into the generated android project.
function withNativeSources(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const srcDir = path.join(cfg.modRequest.projectRoot, "plugins/hce-android");
      const javaDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/java",
        HCE_PACKAGE.replace(/\./g, "/"),
      );
      fs.mkdirSync(javaDir, { recursive: true });
      for (const file of ["HceNdefService.kt", "BriskHceModule.kt", "BriskHcePackage.kt"]) {
        fs.copyFileSync(path.join(srcDir, file), path.join(javaDir, file));
      }

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

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    if (!app.service.some((s) => s.$ && s.$["android:name"] === SERVICE_CLASS)) {
      app.service.push({
        $: {
          "android:name": SERVICE_CLASS,
          "android:exported": "true",
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

// Register BriskHcePackage in MainApplication.kt (it isn't autolinked).
function withPackageRegistration(config) {
  return withMainApplication(config, (cfg) => {
    const add = `add(${HCE_PACKAGE}.BriskHcePackage())`;
    if (!cfg.modResults.contents.includes(add)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(\/\/ add\(MyReactNativePackage\(\)\))/,
        `$1\n              ${add}`,
      );
    }
    return cfg;
  });
}

module.exports = function withBriskHce(config) {
  config = withNativeSources(config);
  config = withHceManifest(config);
  config = withPackageRegistration(config);
  return config;
};
