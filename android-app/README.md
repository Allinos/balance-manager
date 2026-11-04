# DocGen for Android (Flutter)

The Android app of DocGen. It runs the DocGen mobile app (`server/mobile`, with the same screens, GST engine, 10 templates, ledger and PDF as the phone web app) **offline inside the app**, and adds what only an Android app can do:

| Feature | Where |
|---|---|
| **Free plan without a license**: every feature, up to 20 documents, 20 payments and 20 customers & vendors | `server/mobile/src/lib/plan.js`, engine limits in `engine/commands.js` |
| **First start**: Welcome → create a free account (name, business, mobile, **4-digit PIN, no password**) or *Explore first*. A free account is required before the first document (or ledger entry): exploring users see the account form first. Premium (a license) removes the limits and ads | `screens/Android.jsx` (web) · `lib/account.dart` (Firebase) |
| **Firebase accounts**: anonymous sign-in plus profile `users/{uid}`; works offline and syncs later | `lib/account.dart`, `firestore.rules` |
| **Upgrade**: opens the website checkout (name and mobile filled in); the license key (or account) is entered in Plan & Account. No limits and no ads after that. The data stays on the phone — there is no online copy for now | `screens/Android.jsx` |
| **PIN lock** on or off in Settings → Security; asked every time the app opens (30-second grace for sharing). Full-screen lock in the brand colour with a greeting ("Welcome back, Ravi"), a large keypad, a shake on a wrong PIN and "Forgot PIN?" help | `lib/pin.dart` |
| **Ledger (Payment & Ledger on)**: compact balance with *Unpaid bills (n)*; **Given** (left) and **Received** (right) at the bottom add an entry straight away — reason, date, amount, mode (a payment reason saves a receipt / voucher that clears the oldest bills); oldest entry at the top and the latest at the bottom, **Filter** by date in the top bar; one compact row above the buttons — an optional due date and **Send reminder** (WhatsApp or SMS; SMS goes out by itself after asking for the SMS permission) | `screens/PartyLedger.jsx`, `ledgerService.recordLedgerEntry` |
| **Thermal receipts**: *Receipt* on a document — a 58 / 80 mm preview, printed straight to a paired Bluetooth printer (ESC/POS; Settings → Printer: choose the printer, paper, test print) | `services/thermal.js` · `lib/printer.dart` |
| **Issue on save** (on for new installs; Settings → Documents): bills are saved as Issued, so a bill paid on saving is Paid at once | `documentService.issuesOnSave` |
| **Payments due**: Home lists overdue bills and those due this week, each with a WhatsApp reminder. **Due date reminders** (Settings → Features, on by default): an Android notification at 9:30 on the day a customer's bill is due; tapping it opens the bill. Payments received later (oldest bills first) count, so paid bills drop out | `lib/dues.js` (web) · `lib/dues.dart` |
| **SMS alerts** (Settings → Features): an SMS through the phone's own SMS service (the SIM chosen for SMS) for every new bill or payment; the permission is asked when switched on, and a permission refused for good opens the app's settings | `lib/notify.js` (web) · `lib/phone.dart`, `MainActivity.kt` |
| **WhatsApp payment reminders**: in the bill's payment section, on an unpaid bill and on a customer's ledger | `lib/notify.js` |
| **Retail Bill (no GST)**: simple counter bill (Retail template, A5, UPI QR), shared straight from the bill | `RETAIL_BILL` in `document-generator/src/config/documentTypes.js` |
| **Reports** tab, rightmost: sales, purchases, money in / out, what customers owe, sales by month, top customers | `screens/Reports.jsx` |
| **Modern date and choice fields**: dates open a calendar sheet (Today / Yesterday, month and year), choices open a list sheet — instead of the WebView's old Android dialogs | `components/DateInput.jsx`, `Select` in `components/ui.jsx` |
| **Home → Customize → Summary cards**: figures and small charts (sales this month, money received, customers owe you, purchases, sales of the last 6 months, top customers) above the document cards | `components/SummaryCards.jsx` |
| **Home first**; bottom tabs: Home · Documents · Products · (Parties) · Settings · Reports | `App.jsx` |
| **AdMob for free users only, no banners**: once the 20 free documents (or payments) are used, *Watch ad · +1 document* — a rewarded ad watched to the end earns one more and the bill is saved at once; and a full-screen ad at most once every 7 days (remembered across restarts; `--dart-define=ADS_EVERY_DAYS=n`), only after a save, never straight after a rewarded ad. No ads with a license | `lib/ads.dart`, `useFreeLimit` in `screens/Android.jsx` |

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
   - pass the ad units with `--dart-define=ADMOB_REWARDED=ca-app-pub-…/…` and `--dart-define=ADMOB_INTERSTITIAL=ca-app-pub-…/…`.
3. **Firebase** (console.firebase.google.com):
   - add an Android app with package `in.reynrel.docgen`;
   - enable **Authentication → Anonymous**;
   - create **Firestore** and publish `firestore.rules`;
   - fill in `lib/firebase_options.dart`, run `flutterfire configure`, or pass `--dart-define=FIREBASE_API_KEY=… FIREBASE_APP_ID=… FIREBASE_SENDER_ID=… FIREBASE_PROJECT_ID=…`.

   These are public client IDs, not secrets.
4. **Signing**: create an upload key and `android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); it is never committed. In GitHub Actions use the `ANDROID_KEYSTORE_*` secrets listed in the workflow.

In GitHub Actions, the same values are repository **variables** (listed at the top of the workflow).

## App icon and store graphics

The launcher icon is the DocGen logo (`../document-generator/assets/app-icon.png`): an adaptive icon for Android 8+
(`mipmap-anydpi-v26`, logo on blue `#0040D4`), a round and a standard icon for Android 7, and the splash screen
(Android 12+ shows the icon on white). `store/` has the Play Store icon (512 × 512) and the feature graphic
(1024 × 500). After changing the logo, run `bash tool/make_icons.sh` (needs ImageMagick).

## Publishing on Google Play — checklist

1. **Version**: raise `version:` in `pubspec.yaml` for every upload (`2.5.1+1` → `2.5.2+2`; the number after `+` must
   always go up).
2. **Your IDs** (above): AdMob app and ad units, Firebase, `DOCGEN_SERVER`.
3. **Upload key**: sign with your own key (`android/key.properties` or the `ANDROID_KEYSTORE_*` secrets) and turn on
   *Play App Signing*. Keep the key and its passwords safe: every update must be signed with it.
4. **Build the bundle**: `flutter build appbundle --release` (or take `DocGen-<version>.aab` from the GitHub release).
5. **SMS permission** — choose one:
   - *Keep direct SMS* (reminders and alerts go out by themselves): fill in the **Permissions declaration** for
     `SEND_SMS` in the Play Console (App content → Sensitive permissions). Google allows it only when sending SMS is a
     core feature and may refuse it;
   - *Play-safe build*: set `DOCGEN_SMS=false` (in `android/gradle.properties`, or as a GitHub variable). The release
     then has no `SEND_SMS` permission, and SMS opens the SMS app with the message ready (the user taps Send).
     Use this if the declaration is refused or while it is being reviewed.
6. **Store listing**: icon `store/play-icon-512.png`, feature graphic `store/feature-graphic-1024x500.png`, at least 2
   phone screenshots, short and full description, a privacy policy URL (your website's privacy page).
7. **App content**: *Contains ads* = yes. *Data safety*: name, business name and mobile number are collected for the
   free account (Firebase, encrypted in transit, not shared, the user can ask for deletion); advertising ID by AdMob
   for free users. Business data (bills, customers, payments) stays on the phone and is not collected.
   For users in the EU/UK, add Google's consent form (UMP) before showing ads.
8. **Testing first**: upload to *Internal testing*, install from the Play link on a real phone and try: account and
   PIN, a bill, Send reminder → SMS (the permission dialog appears), a Bluetooth receipt, a due date notification.

## Tests

| Test | Command |
|---|---|
| Flutter: PIN (hash only, wrong PIN, lock screen and its greeting / Forgot PIN), account (Firebase, offline then synced, upgrade), ads (free users only; rewarded only when watched to the end; full-screen never in the first 3 minutes, at most every 10 minutes, not after a rewarded one), due date reminders (9:30 on each due date ahead, soonest first, at most 40), bridge calls | `flutter test` |
| Android walk-through on a 360-px phone as a new shop owner: no errors, nothing scrolling sideways, all six bottom tabs visible, a credit invoice in Payments due until the customer pays | `cd server && npm run test:android` |
| Web side inside the Android app (Chromium with a recording bridge, real server): Welcome, account with PIN, tabs, retail bill, SMS, WhatsApp, share and save, Reports, PIN settings, 20-document limit, upgrade (no limits, no ads, data stays on the phone) | `cd server && npm run test:android` |
