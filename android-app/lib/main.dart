/// DocGen for Android.
///
/// The app runs the DocGen mobile web app (server/mobile — the same screens, GST engine, templates and PDF as
/// the phone web app) offline inside a WebView, served from the app's own files at http://localhost:47312/app/.
/// Flutter adds what a browser cannot: the PIN lock, free accounts in Firebase, AdMob for free users, SMS
/// through the phone, saving to Downloads, sharing files and opening WhatsApp. See lib/bridge.dart.
library;

import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'account.dart';
import 'ads.dart';
import 'bridge.dart';
import 'config.dart';
import 'phone.dart';
import 'pin.dart';

final _server = InAppLocalhostServer(port: AppConfig.localPort, documentRoot: 'assets/web', shared: true);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Color(0xFF224CC8), statusBarIconBrightness: Brightness.light));
  if (!_server.isRunning()) await _server.start();
  final store = SecureSecretStore();
  final pins = PinStore(store);
  final accounts = AccountService(store, pins);
  // An account made offline (or before Firebase was set up) is copied to Firebase now, in the background.
  accounts.sync();
  runApp(DocGenApp(pins: pins, accounts: accounts, locked: await pins.enabled));
}

class DocGenApp extends StatefulWidget {
  const DocGenApp({super.key, required this.pins, required this.accounts, required this.locked});
  final PinStore pins;
  final AccountService accounts;
  final bool locked;

  @override
  State<DocGenApp> createState() => _DocGenAppState();
}

class _DocGenAppState extends State<DocGenApp> with WidgetsBindingObserver {
  late bool _locked = widget.locked;
  DateTime? _leftAt;
  final _ads = AdsController();
  late final _bridge = Bridge(accounts: widget.accounts, pins: widget.pins, ads: _ads);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ads.dispose();
    super.dispose();
  }

  /// The PIN is asked every time DocGen is opened again (after a short grace for sharing and coming back).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _leftAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final away = _leftAt == null ? Duration.zero : DateTime.now().difference(_leftAt!);
      _leftAt = null;
      if (away >= AppConfig.lockAfter) {
        widget.pins.enabled.then((on) {
          if (on && mounted) setState(() => _locked = true);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DocGen',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF224CC8), useMaterial3: true),
      home: Stack(
        children: [
          // The web app stays alive under the lock screen, so unlocking is instant.
          WebHost(bridge: _bridge, ads: _ads),
          if (_locked) Positioned.fill(child: LockScreen(pins: widget.pins, onUnlocked: () => setState(() => _locked = false))),
        ],
      ),
    );
  }
}

class WebHost extends StatefulWidget {
  const WebHost({super.key, required this.bridge, required this.ads});
  final Bridge bridge;
  final AdsController ads;

  @override
  State<WebHost> createState() => _WebHostState();
}

class _WebHostState extends State<WebHost> {
  InAppWebViewController? _web;
  static const _origin = 'http://localhost:${AppConfig.localPort}';

  /// Set before the page loads: the web app sees it is inside the Android app (server/mobile/src/lib/native.js).
  static final _nativeScript = UserScript(
    source: 'window.DOCGEN_NATIVE = ${jsonEncode({'platform': 'android', 'version': AppConfig.version, 'server': AppConfig.server})};',
    injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
  );

  bool _ownPage(WebUri? uri) => uri != null && (uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data' || '${uri.scheme}://${uri.host}:${uri.port}' == _origin);

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final web = _web;
        if (web != null && await web.canGoBack()) {
          await web.goBack();
        } else {
          await SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF4F6FB),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: InAppWebView(
                  initialUrlRequest: URLRequest(url: WebUri('$_origin/app/index.html#/')),
                  initialUserScripts: UnmodifiableListView([_nativeScript]),
                  initialSettings: InAppWebViewSettings(
                    javaScriptEnabled: true,
                    domStorageEnabled: true,
                    databaseEnabled: true,
                    useShouldOverrideUrlLoading: true,
                    supportMultipleWindows: true,
                    javaScriptCanOpenWindowsAutomatically: true,
                    allowFileAccess: false,
                    allowContentAccess: true,
                    textZoom: 100,
                    supportZoom: false,
                    isInspectable: kDebugMode,
                    mixedContentMode: MixedContentMode.MIXED_CONTENT_NEVER_ALLOW,
                  ),
                  onWebViewCreated: (controller) {
                    _web = controller;
                    for (final name in widget.bridge.handlers.keys) {
                      controller.addJavaScriptHandler(handlerName: name, callback: (args) => widget.bridge.handle(name, args));
                    }
                  },
                  // Links to anything but the app itself (WhatsApp, the website, email) open in the phone's apps.
                  shouldOverrideUrlLoading: (controller, action) async {
                    final uri = action.request.url;
                    if (_ownPage(uri)) return NavigationActionPolicy.ALLOW;
                    if (uri != null) await Phone.open(uri.toString());
                    return NavigationActionPolicy.CANCEL;
                  },
                  onCreateWindow: (controller, action) async {
                    final uri = action.request.url;
                    if (uri != null && !_ownPage(uri)) await Phone.open(uri.toString());
                    return false;
                  },
                  onPermissionRequest: (controller, request) async => PermissionResponse(resources: request.resources, action: PermissionResponseAction.DENY),
                ),
              ),
              ListenableBuilder(
                listenable: widget.ads,
                builder: (context, _) => widget.ads.bannerVisible ? const BannerSlot() : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
