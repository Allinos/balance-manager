/// Settings of DocGen for Android. Replace the test values before publishing (see android-app/README.md).
library;

class AppConfig {
  /// The DocGen server: licenses, upgrades (website checkout) and the data transfer after an upgrade.
  /// Override when building: flutter build apk --dart-define=DOCGEN_SERVER=https://your-domain
  static const server = String.fromEnvironment('DOCGEN_SERVER', defaultValue: 'https://docgen.reynrel.in');

  /// The web app is served to the WebView from `http://localhost:<port>/app/` (a secure context, so the phone's
  /// database works). The server allows this origin for /api/app (APP_ORIGINS). Never change it after release:
  /// the data on the phone belongs to this exact address.
  static const localPort = 47312;

  static const version = '2.5.1';

  // ------------------------------------------------------------------ AdMob (free plan only)
  // Your AdMob ad units (AdMob → Apps → Ad units); --dart-define=ADMOB_REWARDED=… / ADMOB_INTERSTITIAL=… override them.
  /// Rewarded ad: "Watch a short ad, +1 document" once the free plan is used up.
  static const rewardedAdUnit = String.fromEnvironment('ADMOB_REWARDED', defaultValue: 'ca-app-pub-6476459310344533/7028056628');
  static const interstitialAdUnit = String.fromEnvironment('ADMOB_INTERSTITIAL', defaultValue: 'ca-app-pub-6476459310344533/8404717470');

  /// Not irritating: at most one full-screen ad every 2 days (remembered across restarts), never in the first
  /// minute, only right after a bill or payment is saved — never while typing.
  /// Change with --dart-define=ADS_EVERY_DAYS=n.
  static const interstitialEvery = Duration(days: int.fromEnvironment('ADS_EVERY_DAYS', defaultValue: 2));
  static const interstitialNotBefore = Duration(minutes: 1);

  // ------------------------------------------------------------------ PIN lock
  /// The PIN is asked when the app opens, and again when it comes back after this long in the background
  /// (a short grace so sharing a bill to WhatsApp and coming straight back does not ask again).
  static const lockAfter = Duration(seconds: 30);
  static const maxPinTries = 5;
  static const pinWait = Duration(seconds: 30);
}
