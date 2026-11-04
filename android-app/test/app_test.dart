import 'package:docgen_android/account.dart';
import 'package:docgen_android/ads.dart';
import 'package:docgen_android/bridge.dart';
import 'package:docgen_android/config.dart';
import 'package:docgen_android/dues.dart';
import 'package:docgen_android/printer.dart';
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

/// A phone-sized screen (1080 × 2340 at 3×), like a typical Android phone.
void phoneScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
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
      phoneScreen(tester);
      final pins = PinStore(MemorySecretStore());
      await pins.set('2580');
      var unlocked = false;
      await tester.pumpWidget(
        MaterialApp(
          home: LockScreen(pins: pins, onUnlocked: () => unlocked = true),
        ),
      );
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

    testWidgets('lock screen greets the account and explains a forgotten PIN', (tester) async {
      phoneScreen(tester);
      final pins = PinStore(MemorySecretStore());
      await pins.set('2580');
      await tester.pumpWidget(
        MaterialApp(
          home: LockScreen(pins: pins, name: 'Ravi Kumar', business: 'Ravi Traders', onUnlocked: () {}),
        ),
      );
      expect(find.text('Welcome back, Ravi'), findsOneWidget);
      expect(find.text('Ravi Traders'), findsOneWidget);
      expect(find.text('Enter your 4-digit PIN'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('pin-key-help')));
      await tester.pumpAndSettle();
      expect(find.text('Forgot your PIN?'), findsOneWidget);
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
    test('full-screen: free users only, not in the first 3 minutes, at most every 10 minutes (when set so)', () {
      final p = InterstitialPolicy(started: start, every: const Duration(minutes: 10));
      expect(p.mayShow(free: true, now: start.add(const Duration(minutes: 2))), isFalse);
      expect(p.mayShow(free: false, now: start.add(const Duration(minutes: 30))), isFalse);
      final first = start.add(const Duration(minutes: 4));
      expect(p.mayShow(free: true, now: first), isTrue);
      p.shown(first);
      expect(p.mayShow(free: true, now: first.add(const Duration(minutes: 9))), isFalse);
      expect(p.mayShow(free: true, now: first.add(const Duration(minutes: 10))), isTrue);
    });

    test('no banner ads: rewarded ad only on request, for free users; it earns a place only when watched to the end', () async {
      var shown = 0;
      bool? result = true;
      final ads = AdsController(
        started: start,
        startAds: (_) async {},
        runRewarded: () async {
          shown += 1;
          return result;
        },
      );
      ads.screen('/documents', false);
      expect((await ads.rewarded())['rewarded'], isFalse, reason: 'licensed: no ads at all');
      expect(shown, 0);
      ads.screen('/documents', true);
      expect(await ads.rewarded(), {'rewarded': true});
      result = false;
      final early = await ads.rewarded();
      expect(early['rewarded'], isFalse);
      expect('${early['reason']}', contains('whole ad'));
      result = null;
      expect('${(await ads.rewarded())['reason']}', contains('No ad is available'));
      expect(shown, 3);
    });

    test('by default at most one full-screen ad every 7 days, remembered across restarts', () async {
      expect(AppConfig.interstitialEvery, const Duration(days: 7));
      final store = MemorySecretStore();
      final shownAt = DateTime.now().subtract(const Duration(days: 2));
      store.values['ads.lastShown'] = shownAt.toIso8601String();
      final ads = AdsController(started: DateTime.now().subtract(const Duration(hours: 1)), startAds: (_) async {}, store: store);
      await Future<void>.delayed(Duration.zero);
      expect(ads.policy.lastShown, shownAt, reason: 'the last ad, from before the restart');
      expect(ads.policy.mayShow(free: true, now: DateTime.now()), isFalse, reason: 'only 2 days ago');
      expect(ads.policy.mayShow(free: true, now: shownAt.add(const Duration(days: 7))), isTrue);
      final rewarded = AdsController(started: DateTime.now(), startAds: (_) async {}, runRewarded: () async => true, store: store);
      rewarded.screen('/', true);
      await rewarded.rewarded();
      expect(DateTime.parse(store.values['ads.lastShown']!).isAfter(shownAt), isTrue, reason: 'a rewarded ad counts too');
    });

    test('no full-screen ad straight after a rewarded one', () async {
      final ads = AdsController(started: DateTime.now().subtract(const Duration(hours: 1)), startAds: (_) async {}, runRewarded: () async => true);
      ads.screen('/', true);
      expect(ads.policy.mayShow(free: true, now: DateTime.now()), isTrue);
      await ads.rewarded();
      expect(ads.policy.mayShow(free: true, now: DateTime.now()), isFalse);
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
        ads: AdsController(startAds: (_) async {}, runRewarded: () async => true),
        sendSms: (phone, text, {bool ask = false}) async {
          sms.add([phone, text, if (ask) 'ask']);
          return {'sent': true};
        },
        smsPermission: ({bool ask = true}) async => 'granted',
        openSettings: () async => true,
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
      expect(
        (await bridge.handle('pin.disable', [
          {'pin': '0000'},
        ]) as Map)['ok'],
        isFalse,
      );
      expect(
        (await bridge.handle('pin.disable', [
          {'pin': '1234'},
        ]) as Map)['ok'],
        isTrue,
      );
      expect(await bridge.handle('pin.get', []), {'enabled': false});
    });

    test('SMS, links, files, screens; unknown calls answer safely', () async {
      expect(
        await bridge.handle('sms.send', [
          {'phone': '919876543210', 'text': 'Hi'},
        ]),
        {'sent': true},
      );
      expect(sms.single, ['919876543210', 'Hi']);
      // A reminder asks for the SMS permission first (ask: true); the switch reads the permission state.
      await bridge.handle('sms.send', [
        {'phone': '919876543210', 'text': 'Pay', 'ask': true},
      ]);
      expect(sms.last, ['919876543210', 'Pay', 'ask']);
      expect(await bridge.handle('sms.permission', [{}]), {'granted': true, 'state': 'granted'});
      expect(await bridge.handle('app.settings', []), {'ok': true});
      await bridge.handle('open', [
        {'url': 'https://wa.me/919876543210?text=Hi'},
      ]);
      expect(opened.single, startsWith('https://wa.me/'));
      expect(
        await bridge.handle('file.save', [
          {'name': 'INV-1.pdf', 'mime': 'application/pdf', 'base64': ''},
        ]),
        {'ok': true},
      );
      expect(
        await bridge.handle('screen', [
          {'path': '/', 'free': true},
        ]),
        {'ok': true},
      );
      expect(bridge.ads.free, isTrue);
      expect(await bridge.handle('ads.rewarded', []), {'rewarded': true});
      expect(
        await bridge.handle('dues.sync', [
          {'bills': [], 'enabled': true},
        ]),
        {'ok': false, 'scheduled': 0},
        reason: 'no reminders service in tests',
      );
      expect((await bridge.handle('nope', []) as Map)['ok'], isFalse);
    });
  });

  group('due date reminders', () {
    final now = DateTime(2026, 11, 4, 10, 0);
    test('one at 9:30 on each due date still ahead, soonest first, opening the bill', () {
      final plan = DueReminders.plan([
        {'id': 7, 'number': 'INV-00007', 'party': 'ABC Traders', 'amount': '₹5,900.00', 'dueDate': '2026-11-10', 'phone': '9876543210'},
        {'id': 3, 'number': 'INV-00003', 'party': 'Meena', 'amount': '₹300.00', 'dueDate': '2026-11-05'},
        {'id': 4, 'number': 'INV-00004', 'party': 'Past', 'amount': '₹1.00', 'dueDate': '2026-11-01'},
        {'id': 5, 'number': 'INV-00005', 'party': 'Today, after 9:30', 'amount': '₹1.00', 'dueDate': '2026-11-04'},
        {'id': 'x', 'dueDate': '2026-11-20'},
      ], now);
      expect(plan.map((r) => r.id), [3, 7]);
      expect(plan.first.when, DateTime(2026, 11, 5, 9, 30));
      expect(plan.first.title, 'Payment due today · ₹300.00');
      expect(plan.first.body, 'INV-00003 · Meena');
      expect(plan.last.body, contains('tap to send a reminder'));
      expect(plan.last.payload, '/doc/7');
    });

    test('at most 40 reminders', () {
      final many = List.generate(60, (i) => {'id': i + 1, 'number': 'INV-$i', 'dueDate': '2026-12-${(i % 28 + 1).toString().padLeft(2, '0')}'});
      expect(DueReminders.plan(many, now).length, DueReminders.maxScheduled);
    });
  });

  group('thermal printer', () {
    test('lists paired printers and prints the receipt bytes to the chosen one', () async {
      final fake = FakePrinter();
      final printers = Printers(fake);
      expect(await printers.list(), {
        'ok': true,
        'printers': [
          {'name': 'RPP02N', 'address': '66:22:7A:1B:2C:3D'},
        ],
      });
      final r = await printers.print('66:22:7A:1B:2C:3D', 'G0AKSGVsbG8K');
      expect(r, {'ok': true});
      expect(fake.sent.single.key, '66:22:7A:1B:2C:3D');
      expect(fake.sent.single.value.take(2), [0x1b, 0x40]);
    });

    test('a missing printer, bad bytes or a printer that does not answer give a clear message', () async {
      final fake = FakePrinter()..answers = false;
      final printers = Printers(fake);
      expect('${(await printers.print('', 'AA=='))['reason']}', contains('Settings → Printer'));
      expect('${(await printers.print('66:22:7A:1B:2C:3D', '***'))['reason']}', contains('could not be prepared'));
      expect('${(await printers.print('66:22:7A:1B:2C:3D', 'G0A='))['reason']}', contains('did not answer'));
      fake.error = StateError('Bluetooth is off. Switch it on and try again.');
      expect((await printers.list())['reason'], 'Bluetooth is off. Switch it on and try again.');
    });
  });
}

class FakePrinter implements ThermalPrinter {
  bool answers = true;
  StateError? error;
  final sent = <MapEntry<String, List<int>>>[];
  @override
  Future<List<Map<String, String>>> paired() async {
    if (error != null) throw error!;
    return [
      {'name': 'RPP02N', 'address': '66:22:7A:1B:2C:3D'},
    ];
  }

  @override
  Future<bool> print(String address, List<int> bytes) async {
    sent.add(MapEntry(address, bytes));
    return answers;
  }
}
