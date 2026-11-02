/// The calls the web app makes (server/mobile/src/lib/native.js → window.flutter_inappwebview.callHandler).
/// Each handler takes one map argument and answers a map. Kept free of WebView types so it can be tested.
library;

import 'account.dart';
import 'ads.dart';
import 'phone.dart';
import 'pin.dart';

typedef Handler = Future<Object?> Function(Map<String, dynamic> args);

class Bridge {
  Bridge({required this.accounts, required this.pins, required this.ads, this.sendSms = Phone.sendSms, this.smsPermission = Phone.smsPermission, this.open = Phone.open, this.saveFile = Phone.saveToDownloads, this.shareFile = Phone.share});

  final AccountService accounts;
  final PinStore pins;
  final AdsController ads;
  final Future<Map<String, Object?>> Function(String phone, String text) sendSms;
  final Future<bool> Function({bool ask}) smsPermission;
  final Future<bool> Function(String url) open;
  final Future<bool> Function(String name, String mime, String base64) saveFile;
  final Future<bool> Function(String name, String mime, String base64, String text) shareFile;

  static String _s(Map<String, dynamic> a, String key) => (a[key] ?? '').toString();

  late final Map<String, Handler> handlers = {
    'account.get': (_) async => {'account': AccountService.public(await accounts.get())},
    'account.create': (a) async {
      try {
        final account = await accounts.create(name: _s(a, 'name'), business: _s(a, 'business'), phone: _s(a, 'phone'), pin: _s(a, 'pin'));
        return {'ok': true, 'account': AccountService.public(account)};
      } on ArgumentError catch (e) {
        return {'ok': false, 'error': e.message.toString()};
      }
    },
    'account.upgraded': (a) async {
      await accounts.upgraded(_s(a, 'licenseKey'));
      return {'ok': true};
    },
    'pin.get': (_) async => {'enabled': await pins.enabled},
    'pin.set': (a) async {
      final pin = _s(a, 'pin');
      if (!validPin(pin)) return {'ok': false, 'error': 'The PIN must be 4 digits.'};
      await pins.set(pin);
      return {'ok': true};
    },
    'pin.disable': (a) async => (await pins.disable(_s(a, 'pin'))) ? {'ok': true} : {'ok': false, 'error': 'That PIN is not correct.'},
    'sms.permission': (_) async => {'granted': await smsPermission(ask: true)},
    'sms.send': (a) => sendSms(_s(a, 'phone'), _s(a, 'text')),
    'open': (a) async => {'ok': await open(_s(a, 'url'))},
    'file.save': (a) async => {'ok': await saveFile(_s(a, 'name'), _s(a, 'mime'), _s(a, 'base64'))},
    'file.share': (a) async => {'ok': await shareFile(_s(a, 'name'), _s(a, 'mime'), _s(a, 'base64'), _s(a, 'text'))},
    'screen': (a) async {
      ads.screen(_s(a, 'path'), a['free'] == true);
      return {'ok': true};
    },
    'event': (a) async {
      ads.event(_s(a, 'name'));
      return {'ok': true};
    },
  };

  /// Answer one call; never throws into the WebView.
  Future<Object?> handle(String name, List<dynamic> args) async {
    final handler = handlers[name];
    if (handler == null) return {'ok': false, 'error': 'unknown call'};
    final first = args.isNotEmpty && args.first is Map ? Map<String, dynamic>.from(args.first as Map) : <String, dynamic>{};
    try {
      return await handler(first);
    } catch (e) {
      return {'ok': false, 'error': 'Something went wrong. Please try again.'};
    }
  }
}
