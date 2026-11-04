/// Receipts on a Bluetooth thermal printer (58 / 80 mm, ESC/POS). The web app builds the receipt bytes
/// (document-generator/src/services/thermal.js → escposBytes) and the printer chosen in Settings → Printer;
/// this sends them to the paired printer.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

/// The Bluetooth side, replaceable in tests.
abstract class ThermalPrinter {
  /// Paired printers: [{name, address}]. Throws a message the user can act on.
  Future<List<Map<String, String>>> paired();

  /// Sends the bytes to the printer at [address]; true when written.
  Future<bool> print(String address, List<int> bytes);
}

class BluetoothThermalPrinter implements ThermalPrinter {
  Future<void> _ready() async {
    // Android 12+: the "Nearby devices" permission; older versions need none at run time.
    final status = await Permission.bluetoothConnect.request();
    if (status.isPermanentlyDenied) throw StateError('Allow "Nearby devices" for DocGen in your phone settings to use the printer.');
    if (!await PrintBluetoothThermal.bluetoothEnabled) throw StateError('Bluetooth is off. Switch it on and try again.');
  }

  @override
  Future<List<Map<String, String>>> paired() async {
    await _ready();
    final list = await PrintBluetoothThermal.pairedBluetooths;
    return [
      for (final p in list) {'name': p.name, 'address': p.macAdress},
    ];
  }

  @override
  Future<bool> print(String address, List<int> bytes) async {
    await _ready();
    if (!await PrintBluetoothThermal.connectionStatus || _connected != address) {
      if (_connected != null) await PrintBluetoothThermal.disconnect;
      if (!await PrintBluetoothThermal.connect(macPrinterAddress: address)) {
        _connected = null;
        return false;
      }
      _connected = address;
    }
    return PrintBluetoothThermal.writeBytes(bytes);
  }

  String? _connected;
}

/// The bridge calls printer.list and printer.print.
class Printers {
  Printers([ThermalPrinter? printer]) : _printer = printer ?? BluetoothThermalPrinter();
  final ThermalPrinter _printer;

  Future<Map<String, Object?>> list() async {
    try {
      return {'ok': true, 'printers': await _printer.paired()};
    } on StateError catch (e) {
      return {'ok': false, 'printers': const [], 'reason': e.message};
    } catch (e) {
      debugPrint('Printers not available: $e');
      return {'ok': false, 'printers': const [], 'reason': 'Bluetooth is not available on this phone.'};
    }
  }

  Future<Map<String, Object?>> print(String address, String base64Bytes) async {
    if (!RegExp(r'^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$').hasMatch(address)) return {'ok': false, 'reason': 'Choose your printer in Settings → Printer.'};
    List<int> bytes;
    try {
      bytes = base64Decode(base64Bytes);
    } catch (_) {
      return {'ok': false, 'reason': 'The receipt could not be prepared.'};
    }
    if (bytes.isEmpty || bytes.length > 200000) return {'ok': false, 'reason': 'The receipt could not be prepared.'};
    try {
      final ok = await _printer.print(address, bytes);
      return ok ? {'ok': true} : {'ok': false, 'reason': 'The printer did not answer. Is it switched on, paired and nearby?'};
    } on StateError catch (e) {
      return {'ok': false, 'reason': e.message};
    } catch (e) {
      return {'ok': false, 'reason': 'Printing failed. Switch the printer off and on, then try again.'};
    }
  }
}
