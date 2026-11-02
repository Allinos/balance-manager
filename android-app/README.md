# DocGen for Android (Flutter)

The Android app of DocGen. It runs the DocGen mobile app (`server/mobile`, with the same screens, GST engine, 10 templates, ledger and PDF as the phone web app) **offline inside the app**, and adds what only an Android app can do:

| Feature | Where |
|---|---|
| **Free plan without a license**: every feature, up to 20 documents, 20 payments and 20 customers & vendors | `server/mobile/src/lib/plan.js`, engine limits in `engine/commands.js` |
| **First start**: Welcome → create a free account (name, business, mobile, **4-digit PIN, no password**) or *Explore first* | `screens/Android.jsx` (web) · `lib/account.dart` (Firebase) |
| **Firebase accounts**: anonymous sign-in plus profile `users/{uid}`; works offline and syncs later | `lib/account.dart`, `firestore.rules` |
| **Upgrade**: opens the website checkout (name and mobile filled in). After the license is activated, all the data on the phone is copied to the server (`POST /api/app/migrate`) | `screens/Android.jsx`, `server/backend/src/routes/app.js` |
| **PIN lock** on or off in Settings → Security; asked every time the app opens (30-second grace for sharing) | `lib/pin.dart` |
| **SMS alerts** (Settings → Features): an SMS through the phone's own SMS service for every new bill or payment | `lib/notify.js` (web) · `lib/phone.dart`, `MainActivity.kt` |
| **WhatsApp payment reminders**: in the bill's payment section, on an unpaid bill and on a customer's ledger | `lib/notify.js` |
| **Retail Bill (no GST)**: simple counter bill (Retail template, A5, UPI QR), shared straight from the bill | `RETAIL_BILL` in `document-generator/src/config/documentTypes.js` |
| **Reports** tab, rightmost: sales, purchases, money in / out, what customers owe, sales by month, top customers | `screens/Reports.jsx` |
| **Home first**; bottom tabs: Home · Documents · Products · (Parties) · Settings · Reports | `App.jsx` |
| **AdMob for free users only**: a small banner under list screens, and a full-screen ad at most every 10 minutes, only after a save. No ads with a license | `lib/ads.dart`, `lib/config.dart` |

How it fits together: `lib/main.dart` serves the built web app from the app's own files at `http://localhost:47312/app/`. The page sets `window.DOCGEN_NATIVE` so the web app knows it is inside Android, and talks to Flutter through `lib/bridge.dart`. In a normal browser (the PWA) none of this is active, and the web app works exactly as before.

## Build

```bash
# 1. Flutter 3.47+ and the Android SDK (Android Studio, or the command-line tools), Java 17
# 2. Put the web app into the assets (needs Node 20+):
./tool/build_web.sh
# 3. Test and build:
flutter pub get && flutter analyze && flutter test
flutter build apk --release          # build/app/outputs/flutter-apk/app-release.apk
flutter build appbundle --release    # for the Play Store
```

Without Android Studio, **GitHub Actions → "DocGen Android build"** (`.github/workflows/android-build.yml`) builds the APK and AAB on every change and publishes them under **Releases → DocGen Android latest build**.

## Before publishing: your own IDs

The app works out of the box with **test values**: Google's test ads, accounts kept on the phone only, and a debug signing key. Replace them before going to the Play Store.

1. **Server**: `--dart-define=DOCGEN_SERVER=https://your-domain` (default `https://docgen.reynrel.in`). The server allows the app's origin `http://localhost:47312` for `/api/app` only; change it with `APP_ORIGINS` if needed.
2. **AdMob** (admob.google.com → Apps → Add app → Android):
   - put the app ID in `android/gradle.properties` as `ADMOB_APP_ID=ca-app-pub-…~…`;
   - pass the ad units with `--dart-define=ADMOB_BANNER=ca-app-pub-…/…` and `--dart-define=ADMOB_INTERSTITIAL=ca-app-pub-…/…`.
3. **Firebase** (console.firebase.google.com):
   - add an Android app with package `in.reynrel.docgen`;
   - enable **Authentication → Anonymous**;
   - create **Firestore** and publish `firestore.rules`;
   - fill in `lib/firebase_options.dart`, run `flutterfire configure`, or pass `--dart-define=FIREBASE_API_KEY=… FIREBASE_APP_ID=… FIREBASE_SENDER_ID=… FIREBASE_PROJECT_ID=…`.

   These are public client IDs, not secrets.
4. **Signing**: create an upload key and `android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); it is never committed. In GitHub Actions use the `ANDROID_KEYSTORE_*` secrets listed in the workflow.

In GitHub Actions, the same values are repository **variables** (listed at the top of the workflow).

## Google Play notes

- **SMS permission**: Google Play allows `SEND_SMS` only for apps whose core function needs it, and asks for a *Permissions declaration*. If it is not approved, remove `SEND_SMS` from `AndroidManifest.xml`. SMS alerts then open the SMS app with the message filled in, and the user taps Send (`lib/phone.dart` does this automatically when the permission is missing).
- **Ads**: declare "Contains ads" in the Play Console. For users in the EU/UK, add Google's consent form (UMP) before showing ads.
- **Data safety**: name, business and mobile go to Firebase for the account. Business data stays on the phone until the user upgrades; it is then copied to the DocGen server with the license.

## Tests

| Test | Command |
|---|---|
| Flutter: PIN (hash only, wrong PIN, lock screen), account (Firebase, offline then synced, upgrade), ad rules (free users only, never in the first 3 minutes, at most every 10 minutes, banner only on lists), bridge calls | `flutter test` |
| Web side inside the Android app (Chromium with a recording bridge, real server): Welcome, account with PIN, tabs, retail bill, SMS, WhatsApp, share and save, Reports, PIN settings, 20-document limit, upgrade with data copied to the server | `cd server && npm run test:android` |
