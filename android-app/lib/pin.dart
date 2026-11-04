/// PIN lock: a 4-digit PIN instead of a password. Only a salted SHA-256 hash is kept, in the phone's
/// encrypted storage (Android Keystore). When the lock is on, the PIN is asked every time DocGen opens.
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

/// Where secrets are kept. Replaceable in tests.
abstract class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureSecretStore implements SecretStore {
  static const _s = FlutterSecureStorage();
  @override
  Future<String?> read(String key) => _s.read(key: key);
  @override
  Future<void> write(String key, String value) => _s.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _s.delete(key: key);
}

class MemorySecretStore implements SecretStore {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

final _pinPattern = RegExp(r'^\d{4}$');
bool validPin(String pin) => _pinPattern.hasMatch(pin);

String hashPin(String pin, String salt) => sha256.convert(utf8.encode('docgen-pin:$salt:$pin')).toString();

class PinStore {
  PinStore(this.store, {Random? random}) : _random = random ?? Random.secure();
  final SecretStore store;
  final Random _random;

  static const _hashKey = 'pin.hash';
  static const _saltKey = 'pin.salt';

  Future<bool> get enabled async => (await store.read(_hashKey)) != null;

  /// Set (or change) the PIN; switches the lock on.
  Future<void> set(String pin) async {
    if (!validPin(pin)) throw ArgumentError('The PIN must be 4 digits.');
    final salt = base64Url.encode(List<int>.generate(16, (_) => _random.nextInt(256)));
    await store.write(_saltKey, salt);
    await store.write(_hashKey, hashPin(pin, salt));
  }

  Future<bool> check(String pin) async {
    final hash = await store.read(_hashKey);
    final salt = await store.read(_saltKey);
    if (hash == null || salt == null) return true;
    return validPin(pin) && hashPin(pin, salt) == hash;
  }

  /// Switch the lock off (the current PIN is required).
  Future<bool> disable(String pin) async {
    if (!await check(pin)) return false;
    await store.delete(_hashKey);
    await store.delete(_saltKey);
    return true;
  }
}

/// The lock screen: the brand colour edge to edge, a greeting, four dots and a large number pad. A wrong PIN shakes
/// the dots; after too many wrong PINs it waits before the next try. "Forgot PIN?" explains what to do.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key, required this.pins, required this.onUnlocked, this.name = '', this.business = ''});
  final PinStore pins;
  final VoidCallback onUnlocked;

  /// The account's name and business (shown as "Welcome back, Ravi" and "Ravi Traders"); may be empty.
  final String name;
  final String business;

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> with SingleTickerProviderStateMixin {
  static const _brand = Color(0xFF224CC8);
  static const _brandDark = Color(0xFF16307F);
  String _entered = '';
  int _wrong = 0;
  DateTime? _waitUntil;
  String _message = '';
  bool _checking = false;
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));

  bool get _waiting => _waitUntil != null && DateTime.now().isBefore(_waitUntil!);

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  Future<void> _press(String digit) async {
    if (_checking || _waiting || _entered.length >= 4) return;
    HapticFeedback.selectionClick();
    setState(() {
      _entered += digit;
      _message = '';
    });
    if (_entered.length < 4) return;
    _checking = true;
    final ok = await widget.pins.check(_entered);
    _checking = false;
    if (!mounted) return;
    if (ok) {
      widget.onUnlocked();
      return;
    }
    HapticFeedback.heavyImpact();
    _shake.forward(from: 0);
    _wrong += 1;
    setState(() {
      _entered = '';
      if (_wrong >= AppConfig.maxPinTries) {
        _wrong = 0;
        _waitUntil = DateTime.now().add(AppConfig.pinWait);
        _message = 'Too many wrong PINs. Try again in ${AppConfig.pinWait.inSeconds} seconds.';
        Future.delayed(AppConfig.pinWait, () => mounted ? setState(() => _message = '') : null);
      } else {
        _message = 'Wrong PIN. ${AppConfig.maxPinTries - _wrong} tries left.';
      }
    });
  }

  void _delete() {
    if (_entered.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _entered = _entered.substring(0, _entered.length - 1));
  }

  void _forgot() {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Forgot your PIN?'),
        content: const Text(
          'For your security the PIN cannot be shown or reset from this screen.\n\n'
          'If you have a backup (Settings → Backup), reinstall DocGen and restore it. '
          'Reinstalling removes the PIN and the data on this phone.\n\n'
          'Need help? Write to info.reynrel@gmail.com.',
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
      ),
    );
  }

  Widget _key(String label, {VoidCallback? onTap, Widget? child, String? semantics}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: SizedBox(
        width: 74,
        height: 74,
        child: Material(
          color: child == null ? Colors.white.withValues(alpha: 0.12) : Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            key: ValueKey('pin-key-$label'),
            customBorder: const CircleBorder(),
            onTap: onTap ?? () => _press(label),
            child: Center(
              child:
                  child ??
                  Text(
                    label,
                    semanticsLabel: semantics ?? label,
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w500, color: Colors.white),
                  ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final first = widget.name.trim().split(RegExp(r'\s+')).first;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: _brandDark,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [_brand, _brandDark]),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, box) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: box.maxHeight),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 48, 24, 0),
                        child: Column(
                          children: [
                            Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 8))],
                              ),
                              padding: const EdgeInsets.all(10),
                              child: Image.asset(
                                'assets/web/app/icons/icon-192.png',
                                errorBuilder: (_, _, _) => const Icon(Icons.receipt_long, color: _brand, size: 40),
                              ),
                            ),
                            const SizedBox(height: 20),
                            Text(
                              first.isEmpty ? 'Welcome back' : 'Welcome back, $first',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
                            ),
                            if (widget.business.trim().isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                widget.business.trim(),
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 15),
                              ),
                            ],
                            const SizedBox(height: 28),
                            Text('Enter your 4-digit PIN', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 15)),
                            const SizedBox(height: 18),
                            AnimatedBuilder(
                              animation: _shake,
                              builder: (context, child) {
                                final t = _shake.value;
                                final dx = t == 0 ? 0.0 : 10 * (1 - t) * ((t * 10).floor().isEven ? 1 : -1);
                                return Transform.translate(offset: Offset(dx, 0), child: child);
                              },
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: List.generate(
                                  4,
                                  (i) => AnimatedContainer(
                                    duration: const Duration(milliseconds: 120),
                                    margin: const EdgeInsets.symmetric(horizontal: 11),
                                    width: i < _entered.length ? 18 : 16,
                                    height: i < _entered.length ? 18 : 16,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: i < _entered.length ? Colors.white : Colors.transparent,
                                      border: Border.all(color: Colors.white, width: 2),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            SizedBox(
                              height: 44,
                              child: Center(
                                child: Text(
                                  _message,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Color(0xFFFFD7D7), fontWeight: FontWeight.w600),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Column(
                          children: [
                            for (final row in const [
                              ['1', '2', '3'],
                              ['4', '5', '6'],
                              ['7', '8', '9'],
                            ])
                              Row(mainAxisSize: MainAxisSize.min, children: [for (final d in row) _key(d)]),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _key(
                                  'help',
                                  onTap: _forgot,
                                  child: const Text(
                                    'Forgot\nPIN?',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: Colors.white, fontSize: 13),
                                  ),
                                ),
                                _key('0'),
                                _key(
                                  'del',
                                  onTap: _delete,
                                  child: const Icon(Icons.backspace_outlined, color: Colors.white, semanticLabel: 'Delete'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
