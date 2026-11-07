/// Free accounts in Firebase (not the DocGen server). You log in with your mobile number and your 6-digit PIN:
/// Firebase Authentication (email/password) keeps the login, with the mobile number turned into a login name that is
/// never shown or emailed (919876543210@users.docgen.app) and the PIN as the password — so a reinstall or a new
/// phone gets the same account back. The profile users/{uid} = {name, business, phone, plan, createdAt} is the only
/// thing in Firestore: bills, customers and payments never leave the phone.
library;

import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'firebase_options.dart';
import 'pin.dart';

/// A problem the user can act on (wrong PIN, no internet, number already registered …); the message is shown as is.
class AccountError implements Exception {
  AccountError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The mobile number as digits with the country code (India by default): "098765 43210" → "919876543210".
String phoneKey(String phone) {
  var d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('00')) d = d.substring(2);
  if (d.length == 11 && d.startsWith('0')) d = d.substring(1);
  if (d.length == 10) d = '91$d';
  return d;
}

/// The Firebase side, replaceable in tests.
abstract class AccountCloud {
  /// False when Firebase is not set up in this build (test builds): the account then stays on the phone only.
  Future<bool> get available;

  /// A new login for this mobile number with the PIN as its password, and the profile; returns the user id.
  Future<String> signUp(String phone, String pin, Map<String, dynamic> profile);

  /// Log in with the mobile number and PIN; returns the user id and the saved profile.
  Future<({String uid, Map<String, dynamic> profile})> signIn(String phone, String pin);

  /// Write profile fields of the signed-in user (returns false when nobody is signed in).
  Future<bool> update(Map<String, dynamic> fields);

  /// The PIN is the password: change it (needs the current one).
  Future<void> changePin(String phone, String current, String next);
}

class FirebaseAccountCloud implements AccountCloud {
  static Future<bool>? _ready;

  static Future<bool> _init() {
    return _ready ??= () async {
      if (!DefaultFirebaseOptions.configured) return false;
      try {
        if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: DefaultFirebaseOptions.android);
        return true;
      } catch (e) {
        debugPrint('Firebase not available: $e');
        return false;
      }
    }();
  }

  static String _login(String phone) => '${phoneKey(phone)}@users.docgen.app';

  /// Firebase's error codes in plain words.
  static AccountError _plain(Object e) {
    final code = e is FirebaseException ? e.code : '';
    debugPrint('Firebase account: $e');
    return AccountError(switch (code) {
      'email-already-in-use' => 'This mobile number already has a DocGen account. Tap "Log in" and enter your PIN.',
      'invalid-credential' || 'wrong-password' || 'user-not-found' || 'invalid-login-credentials' => 'The mobile number or PIN is not correct.',
      'too-many-requests' => 'Too many tries. Please wait a few minutes and try again.',
      'network-request-failed' || 'unavailable' => 'No internet connection. Connect to the internet and try again.',
      'operation-not-allowed' ||
      'admin-restricted-operation' => 'Login is not switched on yet (Firebase → Authentication → Email/Password). Please contact support.',
      'permission-denied' => 'The account could not be saved (Firestore rules). Please contact support.',
      'user-disabled' => 'This account has been switched off. Please contact support.',
      'weak-password' => 'Please choose a 6-digit PIN.',
      _ => 'The account could not be reached. Please try again.',
    });
  }

  @override
  Future<bool> get available => _init();

  @override
  Future<String> signUp(String phone, String pin, Map<String, dynamic> profile) async {
    if (!await _init()) throw AccountError('Accounts are not set up in this version of DocGen.');
    try {
      final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(email: _login(phone), password: pin);
      final user = cred.user!;
      try {
        await FirebaseFirestore.instance.collection('users').doc(user.uid).set({...profile, 'platform': 'android', 'updatedAt': FieldValue.serverTimestamp()});
      } catch (e) {
        // No half-made account: without its profile the login is removed again, so the number can sign up again.
        await user.delete().catchError((_) {});
        rethrow;
      }
      return user.uid;
    } catch (e) {
      throw _plain(e);
    }
  }

  @override
  Future<({String uid, Map<String, dynamic> profile})> signIn(String phone, String pin) async {
    if (!await _init()) throw AccountError('Accounts are not set up in this version of DocGen.');
    try {
      final cred = await FirebaseAuth.instance.signInWithEmailAndPassword(email: _login(phone), password: pin);
      final uid = cred.user!.uid;
      final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
      return (uid: uid, profile: doc.data() ?? <String, dynamic>{});
    } catch (e) {
      throw _plain(e);
    }
  }

  @override
  Future<bool> update(Map<String, dynamic> fields) async {
    if (!await _init()) return false;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || user.isAnonymous) return false;
    try {
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({...fields, 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
      return true;
    } catch (e) {
      throw _plain(e);
    }
  }

  @override
  Future<void> changePin(String phone, String current, String next) async {
    if (!await _init()) return;
    try {
      final auth = FirebaseAuth.instance;
      var user = auth.currentUser;
      // Changing a password needs a fresh login: log in again with the current PIN first.
      final cred = EmailAuthProvider.credential(email: _login(phone), password: current);
      user = user == null ? (await auth.signInWithCredential(cred)).user! : (await user.reauthenticateWithCredential(cred)).user!;
      await user.updatePassword(next);
    } catch (e) {
      throw _plain(e);
    }
  }
}

class AccountService {
  AccountService(this.store, this.pins, {AccountCloud? cloud}) : cloud = cloud ?? FirebaseAccountCloud();
  final SecretStore store;
  final PinStore pins;
  final AccountCloud cloud;
  static const _key = 'account';

  static final _phone = RegExp(r'^[+\d][\d\s-]{7,15}$');

  Future<Map<String, dynamic>?> get() async {
    final raw = await store.read(_key);
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> _put(Map<String, dynamic> account) => store.write(_key, jsonEncode(account));

  /// What the web app sees (no internal fields).
  static Map<String, dynamic>? public(Map<String, dynamic>? a) => a == null
      ? null
      : {
          'uid': a['uid'] ?? '',
          'name': a['name'],
          'business': a['business'],
          'phone': a['phone'],
          'plan': a['plan'] ?? 'free',
          'login': a['login'] == true,
          'synced': a['synced'] == true,
        };

  static void _checkLogin(String phone, String pin) {
    if (!_phone.hasMatch(phone) || phoneKey(phone).length < 10) throw AccountError('Please enter a valid mobile number.');
    if (!validNewPin(pin)) throw AccountError('The PIN must be 6 digits.');
  }

  /// Create the free account: the login in Firebase (needs the internet once), the profile, and the PIN lock.
  Future<Map<String, dynamic>> create({required String name, required String business, required String phone, required String pin}) async {
    name = name.trim();
    business = business.trim();
    phone = phone.trim();
    if (name.isEmpty || name.length > 120) throw AccountError('Please enter your name.');
    if (business.isEmpty || business.length > 160) throw AccountError('Please enter your business name.');
    _checkLogin(phone, pin);
    final profile = <String, dynamic>{
      'name': name,
      'business': business,
      'phone': phone,
      'plan': 'free',
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    var uid = '';
    // Test builds without Firebase keep the account on the phone only.
    if (await cloud.available) uid = await cloud.signUp(phone, pin, profile);
    await pins.set(pin);
    await _put({...profile, 'uid': uid, 'login': uid.isNotEmpty, 'synced': uid.isNotEmpty});
    return (await get())!;
  }

  /// Log in on this phone (after a reinstall, or on a new phone): the profile comes back and the PIN locks the app.
  Future<Map<String, dynamic>> login({required String phone, required String pin}) async {
    phone = phone.trim();
    _checkLogin(phone, pin);
    if (!await cloud.available) throw AccountError('Accounts are not set up in this version of DocGen.');
    final r = await cloud.signIn(phone, pin);
    final p = r.profile;
    final account = <String, dynamic>{
      'uid': r.uid,
      'name': '${p['name'] ?? ''}',
      'business': '${p['business'] ?? ''}',
      'phone': '${p['phone'] ?? phone}',
      'plan': p['plan'] == 'paid' ? 'paid' : 'free',
      'createdAt': '${p['createdAt'] ?? DateTime.now().toUtc().toIso8601String()}',
      if (p['licenseKeyHint'] != null) 'licenseKeyHint': p['licenseKeyHint'],
      'login': true,
      'synced': true,
    };
    await pins.set(pin);
    await _put(account);
    return account;
  }

  /// Copy changes made offline (e.g. the plan after an upgrade) to Firebase. Never throws.
  Future<void> sync() async {
    final a = await get();
    // Only accounts with a login (an account from an earlier version, signed in anonymously, stays on the phone).
    if (a == null || a['synced'] == true || a['login'] != true) return;
    try {
      final ok = await cloud.update({
        'name': a['name'],
        'business': a['business'],
        'phone': a['phone'],
        'plan': a['plan'] ?? 'free',
        if (a['licenseKeyHint'] != null) 'licenseKeyHint': a['licenseKeyHint'],
        if (a['upgradedAt'] != null) 'upgradedAt': a['upgradedAt'],
      });
      if (ok) await _put({...a, 'synced': true});
    } catch (e) {
      debugPrint('Account kept on the phone for now: $e');
    }
  }

  /// Change the PIN (it is also the login): Firebase first when there is an online account, then the lock.
  Future<void> changePin(String current, String next) async {
    if (!validNewPin(next)) throw AccountError('The new PIN must be 6 digits.');
    if (await pins.hasPin && !await pins.check(current)) throw AccountError('Your current PIN is not correct.');
    final a = await get();
    if (a != null && a['login'] == true) await cloud.changePin('${a['phone']}', current, next);
    await pins.set(next);
  }

  /// After an upgrade: mark the account as paid (only the plan — no business data leaves the phone).
  Future<void> upgraded(String licenseKey) async {
    final a = await get();
    if (a == null) return;
    // Only the first block of the key: enough to recognise it, useless to anyone else.
    final hint = licenseKey.length >= 4 ? '${licenseKey.substring(0, 4)}-••••-••••' : '';
    await _put({...a, 'plan': 'paid', 'licenseKeyHint': hint, 'upgradedAt': DateTime.now().toUtc().toIso8601String(), 'synced': false});
    await sync();
  }
}
