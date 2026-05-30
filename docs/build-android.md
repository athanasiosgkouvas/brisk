# Building & Installing the Android APK

End-to-end flow for building a release APK and installing it on a USB-connected device. Used to produce the demo recording.

## Prerequisites

- Android SDK installed at `~/Library/Android/sdk`
- Device connected via USB with USB Debugging enabled
- `android/local.properties` must exist with:

  ```
  sdk.dir=/Users/<you>/Library/Android/sdk
  ```

## 1. Start the backend on a public URL

Devices cannot reach `localhost`. Run the backend and tunnel it:

```bash
cd backend
npm run dev
```

In a second terminal:

```bash
npx ngrok http 3001
```

Copy the ngrok HTTPS URL and set `EXPO_PUBLIC_BACKEND_URL` in `.env` to it.

## 2. Build the release APK

```bash
cd android
ANDROID_HOME=$HOME/Library/Android/sdk \
  ./gradlew assembleRelease -x lintVitalAnalyzeRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## 3. Verify the device is connected

```bash
$HOME/Library/Android/sdk/platform-tools/adb devices
```

You should see your device serial with status `device`.

## 4. Install the APK

```bash
$HOME/Library/Android/sdk/platform-tools/adb \
  -s <DEVICE_SERIAL> install -r \
  android/app/build/outputs/apk/release/app-release.apk
```

## 5. (Optional) Watch logs

```bash
$HOME/Library/Android/sdk/platform-tools/adb \
  -s <DEVICE_SERIAL> logcat -s ReactNativeJS
```
