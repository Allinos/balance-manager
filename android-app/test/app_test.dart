import 'package:docgen_android/account.dart';
import 'package:docgen_android/ads.dart';
import 'package:docgen_android/bridge.dart';
import 'package:docgen_android/config.dart';
import 'package:docgen_android/dues.dart';
import 'package:docgen_android/printer.dart';
import 'package:docgen_android/pin.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Firebase stand-in: logins (mobile → PIN) and profiles; can be "offline".
class FakeCloud implements AccountCloud {
  bool offline = false;
  bool setUp = true;
  final logins = <String, String>{};
  final profiles = <String, Map<String, dynamic>>{};
  String? signedIn;

  void _online() {
    if (offline) throw AccountError('No internet connection. Connect to the internet and try again.');
  }

  @override
  Future<bool> get available async => setUp;

  @override
  Future<String> signUp(String phone, String pin, Map<String, dynamic> profile) async {
    _online();
    final key = phoneKey(phone);
    if (logins.containsKey(key)) throw AccountError('This mobile number already has a DocGen account.');
    logins[key] = pin;
    profiles[key] = {...profile};
    return signedIn = 'uid-$key';
  }

  @override
  Future<({String uid, Map<String, dynamic> profile})> signIn(String phone, String pin) async {
    _online();
    final key = phoneKey(phone);
    if (logins[key] != pin) throw AccountError('The mobile number or PIN is not correct.');
    signedIn = 'uid-$key';
    return (uid: signedIn!, profile: {...profiles[key]!});
  }

  @override
  Future<bool> update(Map<String, dynamic> fields) async {
    _online();
    if (signedIn == null) return false;
    profiles[signedIn!.substring(4)]!.addAll(fields);
    return true;
  }

  @override
  Future<void> changePin(String phone, String current, String next) async {
    _online();
    final key = phoneKey(phone);
    if (logins[key] != current) throw AccountError('The mobile number or PIN is not correct.');
    logins[key] = next;
  }
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
      await pins.set('482190');
      expect(await pins.enabled, isTrue);
      expect(await pins.length, 6);
      expect(store.values.values.any((v) => v.contains('482190')), isFalse);
      expect(await pins.check('482190'), isTrue);
      expect(await pins.check('111111'), isFalse);
      expect(await pins.check('4821901'), isFalse);
    });

    test('switching off needs the current PIN; new PINs must be 6 digits; old 4-digit PINs still unlock', () async {
      final store = MemorySecretStore();
      final pins = PinStore(store);
      await pins.set('123456');
      expect(await pins.disable('999999'), isFalse);
      expect(await pins.enabled, isTrue);
      expect(await pins.disable('123456', keep: true), isTrue);
      expect(await pins.enabled, isFalse, reason: 'lock off');
      expect(await pins.hasPin, isTrue, reason: 'the PIN stays: it is the login');
      expect(await pins.resume('000000'), isFalse);
      expect(await pins.resume('123456'), isTrue);
      expect(await pins.enabled, isTrue);
      expect(await pins.disable('123456'), isTrue);
      expect(await pins.hasPin, isFalse);
      expect(() => pins.set('12a456'), throwsArgumentError);
      expect(() => pins.set('1234'), throwsArgumentError);
      // A PIN saved by an earlier version (4 digits, no length stored).
      store.values['pin.salt'] = 'salt';
      store.values['pin.hash'] = hashPin('2580', 'salt');
      expect(await pins.length, 4);
      expect(await pins.check('2580'), isTrue);
    });

    testWidgets('lock screen: wrong PIN shows tries left, right PIN unlocks', (tester) async {
      phoneScreen(tester);
      final pins = PinStore(MemorySecretStore());
      await pins.set('258000');
      var unlocked = false;
      await tester.pumpWidget(
        MaterialApp(
          home: LockScreen(pins: pins, onUnlocked: () => unlocked = true),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> enter(String pin) async {
        for (final d in pin.split('')) {
          await tester.tap(find.byKey(ValueKey('pin-key-$d')));
          await tester.pump();
        }
        await tester.pumpAndSettle();
      }

      await enter('111111');
      expect(unlocked, isFalse);
      expect(find.textContaining('${AppConfig.maxPinTries - 1} tries left'), findsOneWidget);
      await enter('258000');
      expect(unlocked, isTrue);
    });

    testWidgets('lock screen greets the account and explains a forgotten PIN', (tester) async {
      phoneScreen(tester);
      final pins = PinStore(MemorySecretStore());
      await pins.set('258000');
      await tester.pumpWidget(
        MaterialApp(
          home: LockScreen(pins: pins, name: 'Ravi Kumar', business: 'Ravi Traders', onUnlocked: () {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Welcome back, Ravi'), findsOneWidget);
      expect(find.text('Ravi Traders'), findsOneWidget);
      expect(find.text('Enter your 6-digit PIN'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('pin-key-help')));
      await tester.pumpAndSettle();
      expect(find.text('Forgot your PIN?'), findsOneWidget);
    });
  });

  group('free account', () {
    test('sign up: a login (mobile + PIN) in Firebase, the profile, and the PIN lock', () async {
      final store = MemorySecretStore();
      final cloud = FakeCloud();
      final accounts = AccountService(store, PinStore(store), cloud: cloud);
      final a = await accounts.create(name: ' Ravi ', business: 'Ravi Traders', phone: '98765 43210', pin: '135790');
      expect(a['name'], 'Ravi');
      expect(a['uid'], 'uid-919876543210');
      expect(a['synced'], isTrue);
      expect(cloud.profiles['919876543210']!['plan'], 'free');
      expect(cloud.profiles['919876543210']!.containsKey('pin'), isFalse, reason: 'the PIN is the password, never in the profile');
      expect(await PinStore(store).check('135790'), isTrue);
      await expectLater(
        AccountService(
          MemorySecretStore(),
          PinStore(MemorySecretStore()),
          cloud: cloud,
        ).create(name: 'X', business: 'Y', phone: '+91 98765 43210', pin: '111111'),
        throwsA(isA<AccountError>().having((e) => e.message, 'message', contains('already has'))),
      );
    });

    test('log in on a new phone with the mobile number and PIN: the account comes back', () async {
      final cloud = FakeCloud();
      final first = MemorySecretStore();
      await AccountService(first, PinStore(first), cloud: cloud).create(name: 'Asha', business: 'Asha Stores', phone: '9876543210', pin: '246800');
      final phone2 = MemorySecretStore();
      final accounts = AccountService(phone2, PinStore(phone2), cloud: cloud);
      await expectLater(accounts.login(phone: '9876543210', pin: '000000'), throwsA(isA<AccountError>()));
      final a = await accounts.login(phone: '098765 43210', pin: '246800');
      expect(a['business'], 'Asha Stores');
      expect(a['login'], isTrue);
      expect(await PinStore(phone2).check('246800'), isTrue, reason: 'the same PIN locks the new phone');
    });

    test('offline: sign up and log in need the internet once; upgrade marks it paid with a key hint only', () async {
      final store = MemorySecretStore();
      final cloud = FakeCloud()..offline = true;
      final accounts = AccountService(store, PinStore(store), cloud: cloud);
      await expectLater(accounts.create(name: 'Asha', business: 'Asha Stores', phone: '+919876543210', pin: '246800'), throwsA(isA<AccountError>()));
      expect(await accounts.get(), isNull, reason: 'nothing half-made on the phone');
      cloud.offline = false;
      await accounts.create(name: 'Asha', business: 'Asha Stores', phone: '+919876543210', pin: '246800');
      cloud.offline = true;
      await accounts.upgraded('AB12-CD34-EF56');
      expect((await accounts.get())!['synced'], isFalse, reason: 'kept on the phone until online');
      cloud.offline = false;
      await accounts.sync();
      final p = cloud.profiles['919876543210']!;
      expect(p['plan'], 'paid');
      expect(p['licenseKeyHint'], 'AB12-••••-••••');
      expect(p.toString().contains('CD34'), isFalse);
      expect((await accounts.get())!['synced'], isTrue);
    });

    test('changing the PIN changes the login too', () async {
      final store = MemorySecretStore();
      final cloud = FakeCloud();
      final accounts = AccountService(store, PinStore(store), cloud: cloud);
      await accounts.create(name: 'Ravi', business: 'Ravi Traders', phone: '9876543210', pin: '111111');
      await expectLater(accounts.changePin('999999', '222222'), throwsA(isA<AccountError>()));
      await accounts.changePin('111111', '222222');
      expect(cloud.logins['919876543210'], '222222');
      expect(await PinStore(store).check('222222'), isTrue);
    });

    test('without Firebase (test builds) the account stays on the phone', () async {
      final store = MemorySecretStore();
      final accounts = AccountService(store, PinStore(store), cloud: FakeCloud()..setUp = false);
      final a = await accounts.create(name: 'Ravi', business: 'Ravi Traders', phone: '9876543210', pin: '111111');
      expect(a['login'], isFalse);
      await expectLater(accounts.login(phone: '9876543210', pin: '111111'), throwsA(isA<AccountError>()));
    });

    test('bad details are refused', () async {
      final store = MemorySecretStore();
      final accounts = AccountService(store, PinStore(store), cloud: FakeCloud());
      expect(() => accounts.create(name: '', business: 'X', phone: '9876543210', pin: '123456'), throwsA(isA<AccountError>()));
      expect(() => accounts.create(name: 'A', business: 'X', phone: 'abc', pin: '123456'), throwsA(isA<AccountError>()));
      expect(() => accounts.create(name: 'A', business: 'X', phone: '9876543210', pin: '1234'), throwsA(isA<AccountError>()));
      expect(phoneKey('+91 98765-43210'), '919876543210');
      expect(phoneKey('09876543210'), '919876543210');
    });
  });

  group('ads are not irritating', () {
    final start = DateTime(2026, 11, 2, 10);
    test('full-screen: free users only, not in the first minutes, at most every 10 minutes (when set so)', () {
      final p = InterstitialPolicy(started: start, every: const Duration(minutes: 10));
      expect(AppConfig.interstitialNotBefore, const Duration(minutes: 1));
      expect(p.mayShow(free: true, now: start.add(const Duration(seconds: 50))), isFalse);
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

    test('by default at most one full-screen ad every 2 days, remembered across restarts', () async {
      expect(AppConfig.interstitialEvery, const Duration(days: 2));
      final store = MemorySecretStore();
      final shownAt = DateTime.now().subtract(const Duration(days: 1));
      store.values['ads.lastShown'] = shownAt.toIso8601String();
      final ads = AdsController(started: DateTime.now().subtract(const Duration(hours: 1)), startAds: (_) async {}, store: store);
      await Future<void>.delayed(Duration.zero);
      expect(ads.policy.lastShown, shownAt, reason: 'the last ad, from before the restart');
      expect(ads.policy.mayShow(free: true, now: DateTime.now()), isFalse, reason: 'only 1 day ago');
      expect(ads.policy.mayShow(free: true, now: shownAt.add(const Duration(days: 2))), isTrue);
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
        {'name': 'A', 'business': 'B', 'phone': '9876543210', 'pin': '1234'},
      ]) as Map;
      expect(bad['ok'], isFalse);
      expect(bad['error'], contains('6 digits'));
      final ok = await bridge.handle('account.create', [
        {'name': 'Ravi', 'business': 'Ravi Traders', 'phone': '9876543210', 'pin': '123456'},
      ]) as Map;
      expect(ok['ok'], isTrue);
      expect((ok['account'] as Map)['business'], 'Ravi Traders');
      expect(await bridge.handle('pin.get', []), {'enabled': true, 'saved': true, 'digits': 6});
      expect(
        (await bridge.handle('pin.disable', [
          {'pin': '000000'},
        ]) as Map)['ok'],
        isFalse,
      );
      expect(
        (await bridge.handle('pin.disable', [
          {'pin': '123456'},
        ]) as Map)['ok'],
        isTrue,
      );
      expect(await bridge.handle('pin.get', []), {'enabled': false, 'saved': true, 'digits': 6}, reason: 'the PIN stays: it is the login');
      expect(
        (await bridge.handle('pin.resume', [
          {'pin': '123456'},
        ]) as Map)['ok'],
        isTrue,
      );
      final changed = await bridge.handle('pin.set', [
        {'current': '123456', 'pin': '654321'},
      ]) as Map;
      expect(changed['ok'], isTrue);
      final login = await bridge.handle('account.login', [
        {'phone': '9876543210', 'pin': '654321'},
      ]) as Map;
      expect(login['ok'], isTrue, reason: 'the new PIN is the login');
      final wrong = await bridge.handle('account.login', [
        {'phone': '9876543210', 'pin': '123456'},
      ]) as Map;
      expect(wrong['error'], contains('not correct'));
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
