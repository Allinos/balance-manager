/// Android services the web app cannot reach: SMS through the phone's own SMS service, saving files to
/// Downloads, sharing files, and opening links in other apps (WhatsApp, browser, email).
/// The Kotlin side is android/app/src/main/kotlin/in/reynrel/docgen_android/MainActivity.kt.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

class Phone {
  static const _channel = MethodChannel('in.reynrel.docgen/phone');

  /// A safe file name.
  static String cleanName(String name) {
    final cleaned = name.replaceAll(RegExp(r'[\x00-\x1f\\/:*?"<>|]'), '-').trim();
    if (cleaned.isEmpty) return 'document';
    return cleaned.length > 150 ? cleaned.substring(0, 150) : cleaned;
  }

  /// Whether this build can send SMS by itself: the SEND_SMS permission is in the app (a Play Store build can leave
  /// it out, see README) and the phone has a SIM / mobile network feature.
  static Future<bool> smsAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('smsAvailable') == true;
    } on Exception {
      return false;
    }
  }

  /// The SMS permission. With [ask] Android's permission dialog is shown when it was not refused for good.
  static Future<bool> smsPermission({bool ask = true}) async {
    if (!await smsAvailable()) return false;
    var status = await Permission.sms.status;
    if (!status.isGranted && ask && !status.isPermanentlyDenied) status = await Permission.sms.request();
    return status.isGranted;
  }

  /// What the SMS alerts switch needs: 'granted', 'denied' (asked, refused) or 'blocked' (refused for good — only
  /// the phone's settings can change it) or 'unavailable' (no SIM feature, or a build without SMS).
  static Future<String> smsPermissionState({bool ask = true}) async {
    if (!await smsAvailable()) return 'unavailable';
    if (await smsPermission(ask: ask)) return 'granted';
    return (await Permission.sms.status).isPermanentlyDenied ? 'blocked' : 'denied';
  }

  /// The app's page in Android settings (to allow a permission refused for good).
  static Future<bool> openSettings() => openAppSettings();

  /// Send an SMS with the phone's SMS service and wait until the phone reports it sent. With [ask] the SMS
  /// permission is asked first when needed. Without the permission, or when the phone cannot send (no SIM ready,
  /// airplane mode …), the SMS app opens with the message filled in, so the user only taps Send.
  static Future<Map<String, Object?>> sendSms(String phone, String text, {bool ask = false}) async {
    final number = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (number.length < 8 || text.trim().isEmpty) return {'sent': false, 'reason': 'no phone'};
    String? error;
    if (await smsPermission(ask: ask)) {
      try {
        await _channel.invokeMethod('sendSms', {'phone': number, 'text': text});
        return {'sent': true};
      } on PlatformException catch (e) {
        error = e.message ?? 'failed';
      }
    }
    // Encoded by hand: queryParameters would turn spaces into '+', which some SMS apps show as is.
    final uri = Uri.parse('sms:$number?body=${Uri.encodeComponent(text)}');
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return {'sent': false, 'reason': opened ? 'composer' : 'failed', 'error': ?error};
  }

  /// Save to Downloads (MediaStore). Returns true when saved.
  static Future<bool> saveToDownloads(String name, String mime, String base64Data) async {
    final args = {'name': cleanName(name), 'mime': mime, 'bytes': base64Decode(base64Data)};
    try {
      return await _channel.invokeMethod<bool>('saveDownload', args) == true;
    } on PlatformException {
      // Android 9 and older need the storage permission for Downloads.
      if (!(await Permission.storage.request()).isGranted) return false;
      return await _channel.invokeMethod<bool>('saveDownload', args) == true;
    }
  }

  /// Share through Android's share sheet (WhatsApp, email, Drive …).
  static Future<bool> share(String name, String mime, String base64Data, String text) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/${cleanName(name)}');
    await file.writeAsBytes(base64Decode(base64Data), flush: true);
    final result = await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: mime)],
        text: text.isEmpty ? null : text,
      ),
    );
    return result.status != ShareResultStatus.unavailable;
  }

  static const _schemes = {'https', 'http', 'mailto', 'tel', 'sms', 'whatsapp', 'upi', 'intent'};

  /// Open a link outside the app (WhatsApp for wa.me links, the browser for the website …).
  static Future<bool> open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !_schemes.contains(uri.scheme) || url.length > 8192) return false;
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
