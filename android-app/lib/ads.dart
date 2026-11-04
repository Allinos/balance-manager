/// AdMob for free-plan users only. No banners.
///  - Rewarded ad, the user's choice: when the free plan's 20 documents (or payments) are used up, the app offers
///    "Watch a short ad · +1 document". Watching the whole ad earns one more place (web app: useFreeLimit).
///  - Full-screen (interstitial) ad: at most once every 10 minutes, never in the first 3 minutes, only right after a
///    bill or payment was saved (never while typing), and never straight after a rewarded ad.
/// With a license (upgrade) there are no ads at all.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'config.dart';

/// When a full-screen ad may show. Pure logic, tested in test/app_test.dart.
class InterstitialPolicy {
  InterstitialPolicy({required this.started, this.every = AppConfig.interstitialEvery, this.notBefore = AppConfig.interstitialNotBefore});
  final DateTime started;
  final Duration every;
  final Duration notBefore;
  DateTime? lastShown;

  bool mayShow({required bool free, required DateTime now}) {
    if (!free) return false;
    if (now.difference(started) < notBefore) return false;
    return lastShown == null || now.difference(lastShown!) >= every;
  }

  void shown(DateTime now) => lastShown = now;
}

/// Shows one rewarded ad; resolves true when the reward was earned (the whole ad watched), false when closed early,
/// null when no ad could be loaded.
typedef RewardedRunner = Future<bool?> Function();

class AdsController {
  /// [startAds] starts AdMob and loads the first full-screen ad; [runRewarded] shows a rewarded ad (both replaced in tests).
  AdsController({DateTime? started, Future<void> Function(AdsController)? startAds, this.runRewarded})
    : policy = InterstitialPolicy(started: started ?? DateTime.now()),
      _startAds = startAds ?? _startAdMob;

  static Future<void> _startAdMob(AdsController c) async {
    await MobileAds.instance.initialize();
    c._loadInterstitial();
    c._loadRewarded();
  }

  final Future<void> Function(AdsController) _startAds;
  /// Shows a rewarded ad (AdMob by default; replaced in tests).
  final RewardedRunner? runRewarded;

  final InterstitialPolicy policy;
  bool _free = false;
  String _path = '';
  bool _initialised = false;
  InterstitialAd? _interstitial;
  bool _loadingInterstitial = false;
  RewardedAd? _rewarded;
  Completer<RewardedAd?>? _rewardedLoading;

  bool get free => _free;
  String get path => _path;

  /// The web app tells which screen shows and whether the user is on the free plan.
  void screen(String path, bool free) {
    _path = path;
    _free = free;
    if (free) {
      _init();
    } else {
      _drop();
    }
  }

  Future<void> _init() async {
    if (_initialised) return;
    _initialised = true;
    try {
      await _startAds(this);
    } catch (e) {
      debugPrint('Ads not available: $e');
    }
  }

  void _loadInterstitial() {
    if (_interstitial != null || _loadingInterstitial || !_free) return;
    _loadingInterstitial = true;
    InterstitialAd.load(
      adUnitId: AppConfig.interstitialAdUnit,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          _loadingInterstitial = false;
          _interstitial = ad;
        },
        onAdFailedToLoad: (_) => _loadingInterstitial = false,
      ),
    );
  }

  /// Loads a rewarded ad (one kept ready); resolves the ad or null.
  Future<RewardedAd?> _loadRewarded() {
    if (_rewarded != null) return Future.value(_rewarded);
    final pending = _rewardedLoading;
    if (pending != null) return pending.future;
    final done = Completer<RewardedAd?>();
    _rewardedLoading = done;
    RewardedAd.load(
      adUnitId: AppConfig.rewardedAdUnit,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          _rewarded = ad;
          _rewardedLoading = null;
          done.complete(ad);
        },
        onAdFailedToLoad: (_) {
          _rewardedLoading = null;
          done.complete(null);
        },
      ),
    );
    return done.future;
  }

  void _drop() {
    _interstitial?.dispose();
    _interstitial = null;
    _rewarded?.dispose();
    _rewarded = null;
  }

  /// Something happened in the app ('doc_saved'): maybe a full-screen ad, within the policy.
  void event(String name) {
    if (name != 'doc_saved') return;
    final now = DateTime.now();
    final ad = _interstitial;
    if (ad == null) {
      if (_initialised) _loadInterstitial();
      return;
    }
    if (!policy.mayShow(free: _free, now: now)) return;
    policy.shown(now);
    _interstitial = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        _loadInterstitial();
      },
      onAdFailedToShowFullScreenContent: (ad, _) {
        ad.dispose();
        _loadInterstitial();
      },
    );
    ad.show();
  }

  /// "Watch a short ad · +1 document": shows a rewarded ad. Answers {rewarded: true} only when it was watched.
  Future<Map<String, Object?>> rewarded() async {
    if (!_free) return {'rewarded': false, 'reason': 'There are no ads with a license.'};
    await _init();
    bool? earned;
    try {
      earned = await (runRewarded ?? _showRewardedAdMob)();
    } catch (e) {
      earned = null;
    }
    // No full-screen ad straight after a rewarded one.
    if (earned != null) policy.shown(DateTime.now());
    if (earned == true) return {'rewarded': true};
    if (earned == false) return {'rewarded': false, 'reason': 'Watch the whole ad to get one more document.'};
    return {'rewarded': false, 'reason': 'No ad is available right now. Check your internet connection and try again.'};
  }

  Future<bool?> _showRewardedAdMob() async {
    final ad = await _loadRewarded().timeout(const Duration(seconds: 15), onTimeout: () => null);
    if (ad == null) return null;
    _rewarded = null;
    final result = Completer<bool?>();
    var earned = false;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        if (!result.isCompleted) result.complete(earned);
        _loadRewarded();
      },
      onAdFailedToShowFullScreenContent: (ad, _) {
        ad.dispose();
        if (!result.isCompleted) result.complete(null);
        _loadRewarded();
      },
    );
    await ad.show(onUserEarnedReward: (_, _) => earned = true);
    return result.future;
  }
}
