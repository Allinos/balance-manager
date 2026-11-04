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

  static Future<bool> smsPermission({bool ask = true}) async {
    var status = await Permission.sms.status;
    if (!status.isGranted && ask) status = await Permission.sms.request();
    return status.isGranted;
  }

  /// Send an SMS with the phone's SMS service. Without the SMS permission the SMS app opens with the message
  /// filled in, so the user only taps Send.
  static Future<Map<String, Object?>> sendSms(String phone, String text) async {
    final number = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (number.length < 8 || text.trim().isEmpty) return {'sent': false, 'reason': 'no phone'};
    if (await smsPermission(ask: false)) {
      try {
        await _channel.invokeMethod('sendSms', {'phone': number, 'text': text});
        return {'sent': true};
      } on PlatformException catch (e) {
        return {'sent': false, 'reason': e.message ?? 'failed'};
      }
    }
    // Encoded by hand: queryParameters would turn spaces into '+', which some SMS apps show as is.
    final uri = Uri.parse('sms:$number?body=${Uri.encodeComponent(text)}');
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return {'sent': false, 'reason': opened ? 'composer' : 'no sms app'};
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
