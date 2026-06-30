# eSign MICO360 — Android App

A lightweight **native Android** client (Kotlin) for quick approvals on the go.
A full-screen WebView hosts a mobile-first UI (bundled in `app/src/main/assets/`)
that talks to your eSign MICO360 server's REST API.

Features: connect to server, mobile login, **pending approvals**, recent
documents, document detail (status, approval workflow, history), **approve /
reject with comments**, open the PDF in the device viewer, and a personal
activity summary.

## Connecting
On first launch the app asks for the **server URL** (e.g. `http://192.168.1.10:4400`
— your computer's LAN IP and the API port). The backend must be running and
reachable from the phone (same Wi-Fi). The URL and login are remembered.

> The app allows cleartext HTTP so it can reach a backend on your LAN. For
> production, host the API behind HTTPS and use that URL.

## Build the .apk

Requirements: Android SDK (platform 35, build-tools 35), JDK 17.

```bash
cd mobile
# point Gradle at your SDK (edit local.properties if needed):
#   sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
gradle assembleDebug          # or: ./gradlew assembleDebug (with the wrapper jar)
```
Output: `app/build/outputs/apk/debug/app-debug.apk` — install on a phone
(enable "install unknown apps") or `adb install app-debug.apk`.

Open the project in **Android Studio** for the easiest experience (it provides
Gradle + the wrapper automatically and can generate a signed release APK via
*Build ▸ Generate Signed Bundle / APK*).

## Project layout
```
mobile/
  build.gradle, settings.gradle, gradle.properties
  app/
    build.gradle
    src/main/
      AndroidManifest.xml
      java/com/mico360/esign/MainActivity.kt   # WebView host
      assets/index.html                        # mobile UI (vanilla JS -> API)
      assets/logo.png, logo-w.png
      res/values/strings.xml
```

## Notes
- Uses the default launcher icon; add `res/mipmap-*/ic_launcher` and
  `android:icon` in the manifest to brand it.
- Debug APKs are signed with the standard debug keystore (installable but not
  for store distribution). For release, configure a signing config in
  `app/build.gradle`.
