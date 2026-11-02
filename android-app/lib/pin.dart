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

/// The lock screen: 4 dots and a number pad. After too many wrong PINs it waits before the next try.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key, required this.pins, required this.onUnlocked, this.title = 'Enter your PIN'});
  final PinStore pins;
  final VoidCallback onUnlocked;
  final String title;

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  String _entered = '';
  int _wrong = 0;
  DateTime? _waitUntil;
  String _message = '';
  bool _checking = false;

  bool get _waiting => _waitUntil != null && DateTime.now().isBefore(_waitUntil!);

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
    setState(() => _entered = _entered.substring(0, _entered.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    const brand = Color(0xFF224CC8);
    Widget key(String label, {VoidCallback? onTap, Widget? child}) => SizedBox(
          width: 76,
          height: 76,
          child: TextButton(
            key: ValueKey('pin-key-$label'),
            style: TextButton.styleFrom(shape: const CircleBorder(), foregroundColor: const Color(0xFF0F172A)),
            onPressed: onTap ?? () => _press(label),
            child: child ?? Text(label, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w500)),
          ),
        );
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_outline, size: 40, color: brand),
                const SizedBox(height: 12),
                Text(widget.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                const SizedBox(height: 20),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(
                    4,
                    (i) => Container(
                      margin: const EdgeInsets.symmetric(horizontal: 9),
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i < _entered.length ? brand : Colors.transparent,
                        border: Border.all(color: brand, width: 2),
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  height: 44,
                  child: Center(child: Text(_message, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFB91C1C)))),
                ),
                for (final row in const [
                  ['1', '2', '3'],
                  ['4', '5', '6'],
                  ['7', '8', '9'],
                ])
                  Row(mainAxisSize: MainAxisSize.min, children: [for (final d in row) key(d)]),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(width: 76, height: 76),
                    key('0'),
                    key('del', onTap: _delete, child: const Icon(Icons.backspace_outlined, semanticLabel: 'Delete')),
                  ],
                ),
                const SizedBox(height: 16),
                const Text(
                  'Forgot your PIN? Reinstalling DocGen removes the PIN and the data on this phone. Keep a backup.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
