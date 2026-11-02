/// AdMob for free-plan users only — kept quiet on purpose:
///  - a small banner under the list screens (Home, Documents, Products, Parties, Reports, Settings); never on
///    the bill editor, a document or a form, and it never covers a button (it sits below the app, not on it);
///  - a full-screen ad at most once every 10 minutes, never in the first 3 minutes, and only right after a bill
///    or payment was saved (never while typing).
/// With a license (upgrade) there are no ads at all.
library;

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'config.dart';

/// When a full-screen ad may show. Pure logic, tested in test/ads_policy_test.dart.
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

class AdsController extends ChangeNotifier {
  /// [startAds] starts AdMob and loads the first full-screen ad (replaced in tests).
  AdsController({DateTime? started, Future<void> Function(AdsController)? startAds})
      : policy = InterstitialPolicy(started: started ?? DateTime.now()),
        _startAds = startAds ?? _startAdMob;

  static Future<void> _startAdMob(AdsController c) async {
    await MobileAds.instance.initialize();
    c._loadInterstitial();
  }

  final Future<void> Function(AdsController) _startAds;

  final InterstitialPolicy policy;
  bool _free = false;
  String _path = '';
  bool _initialised = false;
  InterstitialAd? _interstitial;
  bool _loadingInterstitial = false;

  bool get free => _free;
  bool get bannerVisible => _free && AppConfig.bannerOn(_path);

  /// The web app tells which screen shows and whether the user is on the free plan.
  void screen(String path, bool free) {
    final changed = path != _path || free != _free;
    _path = path;
    _free = free;
    if (free) _init();
    if (!free) _dropInterstitial();
    if (changed) notifyListeners();
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

  void _dropInterstitial() {
    _interstitial?.dispose();
    _interstitial = null;
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
}

/// The banner under the app (adaptive width). Takes no space until an ad is loaded.
class BannerSlot extends StatefulWidget {
  const BannerSlot({super.key});
  @override
  State<BannerSlot> createState() => _BannerSlotState();
}

class _BannerSlotState extends State<BannerSlot> {
  BannerAd? _ad;
  bool _loaded = false;
  int? _width;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final width = MediaQuery.sizeOf(context).width.truncate();
    if (width != _width) {
      _width = width;
      _load(width);
    }
  }

  Future<void> _load(int width) async {
    _ad?.dispose();
    _loaded = false;
    final size = await AdSize.getLargeAnchoredAdaptiveBannerAdSize(width);
    if (!mounted || size == null) return;
    final ad = BannerAd(
      adUnitId: AppConfig.bannerAdUnit,
      size: size,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) => mounted ? setState(() => _loaded = true) : null,
        onAdFailedToLoad: (ad, _) {
          ad.dispose();
          if (mounted) setState(() => _loaded = false);
        },
      ),
    );
    _ad = ad;
    await ad.load();
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    if (!_loaded || ad == null) return const SizedBox.shrink();
    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: SizedBox(width: ad.size.width.toDouble(), height: ad.size.height.toDouble(), child: AdWidget(ad: ad)),
      ),
    );
  }
}
