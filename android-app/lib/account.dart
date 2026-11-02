/// Free accounts in Firebase (not the DocGen server): anonymous sign-in plus a profile document
/// users/{uid} = {name, business, phone, plan, createdAt}. No password — the app is protected by the PIN.
/// The account is also kept on the phone, so it works offline; it is copied to Firebase when possible.
/// After an upgrade the profile is marked as paid and the data goes to the DocGen server (web app → /api/app/migrate).
library;

import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'firebase_options.dart';
import 'pin.dart';

/// The Firebase side, replaceable in tests.
abstract class AccountCloud {
  /// Signs in (anonymously) and writes the profile; returns the user id.
  Future<String> save(Map<String, dynamic> profile, {String? uid});
  Future<void> update(String uid, Map<String, dynamic> fields);
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

  @override
  Future<String> save(Map<String, dynamic> profile, {String? uid}) async {
    if (!await _init()) throw StateError('Firebase is not set up');
    final auth = FirebaseAuth.instance;
    final user = auth.currentUser ?? (await auth.signInAnonymously()).user!;
    await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
      ...profile,
      'platform': 'android',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    return user.uid;
  }

  @override
  Future<void> update(String uid, Map<String, dynamic> fields) async {
    if (!await _init()) throw StateError('Firebase is not set up');
    await FirebaseFirestore.instance.collection('users').doc(uid).set({...fields, 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
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
      : {'uid': a['uid'] ?? '', 'name': a['name'], 'business': a['business'], 'phone': a['phone'], 'plan': a['plan'] ?? 'free', 'synced': a['synced'] == true};

  /// Create the free account: profile on the phone and in Firebase, and the PIN (lock on).
  Future<Map<String, dynamic>> create({required String name, required String business, required String phone, required String pin}) async {
    name = name.trim();
    business = business.trim();
    phone = phone.trim();
    if (name.isEmpty || name.length > 120) throw ArgumentError('Please enter your name.');
    if (business.isEmpty || business.length > 160) throw ArgumentError('Please enter your business name.');
    if (!_phone.hasMatch(phone)) throw ArgumentError('Please enter a valid mobile number.');
    if (!validPin(pin)) throw ArgumentError('The PIN must be 4 digits.');
    final account = <String, dynamic>{
      'uid': '',
      'name': name,
      'business': business,
      'phone': phone,
      'plan': 'free',
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'synced': false,
    };
    await pins.set(pin);
    await _put(account);
    await sync();
    return (await get())!;
  }

  /// Copy the account to Firebase when it is not there yet (offline, or Firebase set up later). Never throws.
  Future<void> sync() async {
    final a = await get();
    if (a == null || a['synced'] == true) return;
    try {
      final uid = await cloud.save({
        'name': a['name'],
        'business': a['business'],
        'phone': a['phone'],
        'plan': a['plan'] ?? 'free',
        'createdAt': a['createdAt'],
        if (a['licenseKeyHint'] != null) 'licenseKeyHint': a['licenseKeyHint'],
        if (a['upgradedAt'] != null) 'upgradedAt': a['upgradedAt'],
      }, uid: (a['uid'] as String?)?.isNotEmpty == true ? a['uid'] as String : null);
      await _put({...a, 'uid': uid, 'synced': true});
    } catch (e) {
      debugPrint('Account kept on the phone for now: $e');
    }
  }

  /// After an upgrade: mark the account as paid (the data itself goes to the DocGen server from the web app).
  Future<void> upgraded(String licenseKey) async {
    final a = await get();
    if (a == null) return;
    // Only the first block of the key: enough to recognise it, useless to anyone else.
    final hint = licenseKey.length >= 4 ? '${licenseKey.substring(0, 4)}-••••-••••' : '';
    await _put({...a, 'plan': 'paid', 'licenseKeyHint': hint, 'upgradedAt': DateTime.now().toUtc().toIso8601String(), 'synced': false});
    await sync();
  }
}
