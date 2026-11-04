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
import 'dues.dart';
import 'phone.dart';
import 'pin.dart';

final _server = InAppLocalhostServer(port: AppConfig.localPort, documentRoot: 'assets/web', shared: true);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The status bar sits on the app's white header (dark icons); the lock screen sets its own.
  SystemChrome.setSystemUIOverlayStyle(_appBars);
  if (!_server.isRunning()) await _server.start();
  final store = SecureSecretStore();
  final pins = PinStore(store);
  final accounts = AccountService(store, pins);
  // An account made offline (or before Firebase was set up) is copied to Firebase now, in the background.
  accounts.sync();
  runApp(DocGenApp(pins: pins, accounts: accounts, locked: await pins.enabled, account: await accounts.get()));
}

const _appBars = SystemUiOverlayStyle(
  statusBarColor: Colors.white,
  statusBarIconBrightness: Brightness.dark,
  systemNavigationBarColor: Colors.white,
  systemNavigationBarIconBrightness: Brightness.dark,
);

class DocGenApp extends StatefulWidget {
  const DocGenApp({super.key, required this.pins, required this.accounts, required this.locked, this.account});
  final PinStore pins;
  final AccountService accounts;
  final bool locked;

  /// The free account (name and business on the lock screen), if one was created.
  final Map<String, dynamic>? account;

  @override
  State<DocGenApp> createState() => _DocGenAppState();
}

class _DocGenAppState extends State<DocGenApp> with WidgetsBindingObserver {
  late bool _locked = widget.locked;
  late Map<String, dynamic>? _account = widget.account;
  DateTime? _leftAt;
  final _ads = AdsController();
  final _dues = DueReminders();

  /// A screen of the web app to open (a tapped due date reminder: /doc/12).
  final _openPath = ValueNotifier<String?>(null);
  late final _bridge = Bridge(accounts: widget.accounts, pins: widget.pins, ads: _ads, dues: _dues);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _dues.init((path) => _openPath.value = path);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _openPath.dispose();
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
        widget.pins.enabled.then((on) async {
          if (!on || !mounted) return;
          final account = await widget.accounts.get();
          if (!mounted) return;
          setState(() {
            _account = account;
            _locked = true;
          });
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
          WebHost(bridge: _bridge, ads: _ads, openPath: _openPath),
          if (_locked)
            Positioned.fill(
              child: LockScreen(
                pins: widget.pins,
                name: '${_account?['name'] ?? ''}',
                business: '${_account?['business'] ?? ''}',
                onUnlocked: () => setState(() => _locked = false),
              ),
            ),
        ],
      ),
    );
  }
}

class WebHost extends StatefulWidget {
  const WebHost({super.key, required this.bridge, required this.ads, required this.openPath});
  final Bridge bridge;
  final AdsController ads;
  final ValueNotifier<String?> openPath;

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

  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    widget.openPath.addListener(_open);
  }

  @override
  void dispose() {
    widget.openPath.removeListener(_open);
    super.dispose();
  }

  /// Opens a screen of the web app (from a notification) once the page is ready.
  void _open() {
    final path = widget.openPath.value;
    final web = _web;
    if (path == null || web == null || !_loaded) return;
    widget.openPath.value = null;
    web.evaluateJavascript(source: 'window.location.hash = ${jsonEncode('#$path')};');
  }

  bool _ownPage(WebUri? uri) =>
      uri != null && (uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data' || '${uri.scheme}://${uri.host}:${uri.port}' == _origin);

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
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: _appBars,
        child: Scaffold(
          // White behind the status and navigation bars, like the app's header and bottom tabs (no grey band).
          backgroundColor: Colors.white,
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
                    onLoadStop: (controller, url) {
                      _loaded = true;
                      _open();
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
