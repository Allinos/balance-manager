import 'package:docgen_android/account.dart';
import 'package:docgen_android/ads.dart';
import 'package:docgen_android/bridge.dart';
import 'package:docgen_android/config.dart';
import 'package:docgen_android/pin.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Firebase stand-in: records the profiles written; can be "offline".
class FakeCloud implements AccountCloud {
  bool offline = false;
  final saved = <Map<String, dynamic>>[];
  final updates = <String, Map<String, dynamic>>{};
  @override
  Future<String> save(Map<String, dynamic> profile, {String? uid}) async {
    if (offline) throw StateError('offline');
    saved.add(profile);
    return uid ?? 'uid-${saved.length}';
  }

  @override
  Future<void> update(String uid, Map<String, dynamic> fields) async => updates[uid] = fields;
}

void main() {
  group('PIN', () {
    test('only a salted hash is stored; the right PIN unlocks, a wrong one does not', () async {
      final store = MemorySecretStore();
      final pins = PinStore(store);
      expect(await pins.enabled, isFalse);
      expect(await pins.check('0000'), isTrue, reason: 'no PIN set: nothing to check');
      await pins.set('4821');
      expect(await pins.enabled, isTrue);
      expect(store.values.values.any((v) => v.contains('4821')), isFalse);
      expect(await pins.check('4821'), isTrue);
      expect(await pins.check('1111'), isFalse);
      expect(await pins.check('48211'), isFalse);
    });

    test('switching off needs the current PIN; PINs must be 4 digits', () async {
      final pins = PinStore(MemorySecretStore());
      await pins.set('1234');
      expect(await pins.disable('9999'), isFalse);
      expect(await pins.enabled, isTrue);
      expect(await pins.disable('1234'), isTrue);
      expect(await pins.enabled, isFalse);
      expect(() => pins.set('12a4'), throwsArgumentError);
      expect(() => pins.set('123'), throwsArgumentError);
    });

    testWidgets('lock screen: wrong PIN shows tries left, right PIN unlocks', (tester) async {
      final pins = PinStore(MemorySecretStore());
      await pins.set('2580');
      var unlocked = false;
      await tester.pumpWidget(MaterialApp(home: LockScreen(pins: pins, onUnlocked: () => unlocked = true)));
      Future<void> enter(String pin) async {
        for (final d in pin.split('')) {
          await tester.tap(find.byKey(ValueKey('pin-key-$d')));
          await tester.pump();
        }
        await tester.pumpAndSettle();
      }

      await enter('1111');
      expect(unlocked, isFalse);
      expect(find.textContaining('${AppConfig.maxPinTries - 1} tries left'), findsOneWidget);
      await enter('2580');
      expect(unlocked, isTrue);
    });
  });

  group('free account', () {
    test('created on the phone with a PIN and copied to Firebase', () async {
      final store = MemorySecretStore();
      final cloud = FakeCloud();
      final accounts = AccountService(store, PinStore(store), cloud: cloud);
      final a = await accounts.create(name: ' Ravi ', business: 'Ravi Traders', phone: '98765 43210', pin: '1357');
      expect(a['name'], 'Ravi');
      expect(a['uid'], 'uid-1');
      expect(a['synced'], isTrue);
      expect(cloud.saved.single['plan'], 'free');
      expect(cloud.saved.single.containsKey('pin'), isFalse, reason: 'the PIN never leaves the phone');
      expect(await PinStore(store).check('1357'), isTrue);
    });

    test('offline: kept on the phone and copied later; upgrade marks it paid with a key hint only', () async {
      final store = MemorySecretStore();
      final cloud = FakeCloud()..offline = true;
      final accounts = AccountService(store, PinStore(store), cloud: cloud);
      final a = await accounts.create(name: 'Asha', business: 'Asha Stores', phone: '+919876543210', pin: '2468');
      expect(a['synced'], isFalse);
      cloud.offline = false;
      await accounts.sync();
      expect((await accounts.get())!['synced'], isTrue);
      await accounts.upgraded('AB12-CD34-EF56');
      final last = cloud.saved.last;
      expect(last['plan'], 'paid');
      expect(last['licenseKeyHint'], 'AB12-••••-••••');
      expect(last.toString().contains('CD34'), isFalse);
    });

    test('bad details are refused', () async {
      final store = MemorySecretStore();
      final accounts = AccountService(store, PinStore(store), cloud: FakeCloud());
      expect(() => accounts.create(name: '', business: 'X', phone: '9876543210', pin: '1234'), throwsArgumentError);
      expect(() => accounts.create(name: 'A', business: 'X', phone: 'abc', pin: '1234'), throwsArgumentError);
      expect(() => accounts.create(name: 'A', business: 'X', phone: '9876543210', pin: '12'), throwsArgumentError);
    });
  });

  group('ads are not irritating', () {
    final start = DateTime(2026, 11, 2, 10);
    test('full-screen: free users only, not in the first 3 minutes, at most every 10 minutes', () {
      final p = InterstitialPolicy(started: start);
      expect(p.mayShow(free: true, now: start.add(const Duration(minutes: 2))), isFalse);
      expect(p.mayShow(free: false, now: start.add(const Duration(minutes: 30))), isFalse);
      final first = start.add(const Duration(minutes: 4));
      expect(p.mayShow(free: true, now: first), isTrue);
      p.shown(first);
      expect(p.mayShow(free: true, now: first.add(const Duration(minutes: 9))), isFalse);
      expect(p.mayShow(free: true, now: first.add(const Duration(minutes: 10))), isTrue);
    });

    test('banner: free users on list screens only, never in the editor or a document', () {
      final ads = AdsController(started: start, startAds: (_) async {});
      ads.screen('/doc/new/TAX_INVOICE', true);
      expect(ads.bannerVisible, isFalse);
      ads.screen('/doc/12', true);
      expect(ads.bannerVisible, isFalse);
      ads.screen('/settings/plan', true);
      expect(ads.bannerVisible, isFalse);
      for (final path in ['/', '/documents', '/reports', '/parties/all']) {
        ads.screen(path, true);
        expect(ads.bannerVisible, isTrue, reason: path);
      }
      ads.screen('/', false);
      expect(ads.bannerVisible, isFalse, reason: 'licensed: no ads');
    });
  });

  group('bridge', () {
    late Bridge bridge;
    late List<List<String>> sms;
    late List<String> opened;
    setUp(() {
      final store = MemorySecretStore();
      final pins = PinStore(store);
      sms = [];
      opened = [];
      bridge = Bridge(
        accounts: AccountService(store, pins, cloud: FakeCloud()),
        pins: pins,
        ads: AdsController(startAds: (_) async {}),
        sendSms: (phone, text) async {
          sms.add([phone, text]);
          return {'sent': true};
        },
        smsPermission: ({bool ask = true}) async => true,
        open: (url) async {
          opened.add(url);
          return true;
        },
        saveFile: (name, mime, data) async => name.endsWith('.pdf'),
        shareFile: (name, mime, data, text) async => true,
      );
    });

    test('account and PIN calls', () async {
      expect(await bridge.handle('account.get', []), {'account': null});
      final bad = await bridge.handle('account.create', [
        {'name': 'A', 'business': 'B', 'phone': '9876543210', 'pin': '12'},
      ]) as Map;
      expect(bad['ok'], isFalse);
      expect(bad['error'], contains('4 digits'));
      final ok = await bridge.handle('account.create', [
        {'name': 'Ravi', 'business': 'Ravi Traders', 'phone': '9876543210', 'pin': '1234'},
      ]) as Map;
      expect(ok['ok'], isTrue);
      expect((ok['account'] as Map)['business'], 'Ravi Traders');
      expect(await bridge.handle('pin.get', []), {'enabled': true});
      expect((await bridge.handle('pin.disable', [{'pin': '0000'}]) as Map)['ok'], isFalse);
      expect((await bridge.handle('pin.disable', [{'pin': '1234'}]) as Map)['ok'], isTrue);
      expect(await bridge.handle('pin.get', []), {'enabled': false});
    });

    test('SMS, links, files, screens; unknown calls answer safely', () async {
      expect(await bridge.handle('sms.send', [{'phone': '919876543210', 'text': 'Hi'}]), {'sent': true});
      expect(sms.single, ['919876543210', 'Hi']);
      await bridge.handle('open', [{'url': 'https://wa.me/919876543210?text=Hi'}]);
      expect(opened.single, startsWith('https://wa.me/'));
      expect(await bridge.handle('file.save', [{'name': 'INV-1.pdf', 'mime': 'application/pdf', 'base64': ''}]), {'ok': true});
      expect(await bridge.handle('screen', [{'path': '/', 'free': true}]), {'ok': true});
      expect(bridge.ads.bannerVisible, isTrue);
      expect((await bridge.handle('nope', []) as Map)['ok'], isFalse);
    });
  });
}
