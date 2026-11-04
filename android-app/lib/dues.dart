/// Due date reminders: an Android notification on the morning a customer's bill falls due
/// ("Payment due today · INV-00012 · ABC Traders · ₹5,900"). Tapping it opens the bill.
///
/// The bills live in the web app's database, so the web app sends the list of unpaid bills with a due date
/// (bridge call `dues.sync`) when it starts and after every save; all reminders are then planned again.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// One reminder to schedule. Pure data, so the planning can be tested without a phone.
class DueReminder {
  const DueReminder({required this.id, required this.when, required this.title, required this.body, required this.payload});
  final int id;
  final DateTime when;
  final String title;
  final String body;

  /// The app path opened when the notification is tapped, e.g. /doc/12.
  final String payload;
}

class DueReminders {
  DueReminders({FlutterLocalNotificationsPlugin? plugin}) : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const hour = 9;
  static const minute = 30;
  static const maxScheduled = 40;
  static const _channel = AndroidNotificationDetails(
    'dues',
    'Payment due dates',
    channelDescription: 'A reminder on the morning a customer bill falls due',
    importance: Importance.defaultImportance,
    priority: Priority.defaultPriority,
    category: AndroidNotificationCategory.reminder,
  );

  final FlutterLocalNotificationsPlugin _plugin;
  bool _ready = false;
  bool _asked = false;

  /// Plans the reminders: one at 9:30 on each due date still ahead (today's only if 9:30 has not passed),
  /// soonest first, at most [maxScheduled].
  static List<DueReminder> plan(List<Map<String, dynamic>> bills, DateTime now) {
    final out = <DueReminder>[];
    for (final b in bills) {
      final date = DateTime.tryParse('${b['dueDate'] ?? ''}');
      final id = int.tryParse('${b['id'] ?? ''}');
      if (date == null || id == null) continue;
      final when = DateTime(date.year, date.month, date.day, hour, minute);
      if (!when.isAfter(now)) continue;
      final number = '${b['number'] ?? ''}'.trim();
      final party = '${b['party'] ?? ''}'.trim();
      final amount = '${b['amount'] ?? ''}'.trim();
      out.add(
        DueReminder(
          id: id,
          when: when,
          title: 'Payment due today${amount.isEmpty ? '' : ' · $amount'}',
          body: [number, if (party.isNotEmpty) party].join(' · ') + (b['phone'] != null && '${b['phone']}'.isNotEmpty ? ' — tap to send a reminder' : ''),
          payload: '/doc/$id',
        ),
      );
    }
    out.sort((a, b) => a.when.compareTo(b.when));
    return out.take(maxScheduled).toList();
  }

  Future<void> init(void Function(String path) onOpen) async {
    if (_ready) return;
    try {
      tzdata.initializeTimeZones();
      try {
        final zone = await FlutterTimezone.getLocalTimezone();
        tz.setLocalLocation(tz.getLocation(zone.identifier));
      } catch (_) {
        tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));
      }
      await _plugin.initialize(
        settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
        onDidReceiveNotificationResponse: (r) {
          final path = r.payload;
          if (path != null && path.startsWith('/')) onOpen(path);
        },
      );
      // Opened from a notification while the app was closed.
      final launch = await _plugin.getNotificationAppLaunchDetails();
      final path = launch?.notificationResponse?.payload;
      if (launch?.didNotificationLaunchApp == true && path != null && path.startsWith('/')) onOpen(path);
      _ready = true;
    } catch (e) {
      debugPrint('Notifications not available: $e');
    }
  }

  /// Replaces every scheduled reminder with those for [bills]. With [enabled] false, all are removed.
  Future<Map<String, Object?>> sync(List<Map<String, dynamic>> bills, {required bool enabled}) async {
    if (!_ready) return {'ok': false, 'scheduled': 0};
    await _plugin.cancelAll();
    if (!enabled) return {'ok': true, 'scheduled': 0};
    final reminders = plan(bills, DateTime.now());
    if (reminders.isEmpty) return {'ok': true, 'scheduled': 0};
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (!_asked) {
      _asked = true;
      final granted = await android?.requestNotificationsPermission();
      if (granted == false) return {'ok': false, 'scheduled': 0, 'reason': 'permission'};
    }
    var count = 0;
    for (final r in reminders) {
      try {
        await _plugin.zonedSchedule(
          id: r.id,
          title: r.title,
          body: r.body,
          scheduledDate: tz.TZDateTime.from(r.when, tz.local),
          notificationDetails: const NotificationDetails(android: _channel),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          payload: r.payload,
        );
        count += 1;
      } catch (e) {
        debugPrint('Reminder not scheduled: $e');
      }
    }
    return {'ok': true, 'scheduled': count};
  }
}
