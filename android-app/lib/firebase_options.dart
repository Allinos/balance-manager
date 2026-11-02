// Firebase for free accounts (lib/account.dart).
//
// Fill these in from Firebase console → Project settings → Your apps → Android app (package in.reynrel.docgen),
// or run `flutterfire configure`, which rewrites this file. These are public client identifiers, not secrets:
// access is controlled by the Firestore rules in android-app/firestore.rules.
//
// While the values below are placeholders, DocGen keeps the account on the phone only and copies it to
// Firebase automatically once a real configuration is built in.

import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_API_KEY', defaultValue: 'REPLACE_ME'),
    appId: String.fromEnvironment('FIREBASE_APP_ID', defaultValue: 'REPLACE_ME'),
    messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID', defaultValue: 'REPLACE_ME'),
    projectId: String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'REPLACE_ME'),
    storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET', defaultValue: ''),
  );

  static bool get configured => !android.apiKey.contains('REPLACE_ME') && !android.projectId.contains('REPLACE_ME');
}
