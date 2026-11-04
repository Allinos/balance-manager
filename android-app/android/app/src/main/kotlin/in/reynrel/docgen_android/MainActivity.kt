package `in`.reynrel.docgen_android

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Phone services for DocGen (lib/phone.dart):
 *  - smsAvailable: whether this build has the SEND_SMS permission and the phone can send SMS;
 *  - sendSms: an SMS through the phone's own SMS service, on the default SMS SIM (needs the SEND_SMS permission,
 *    asked by the app); answers once the phone reports the message sent, or with the reason it failed;
 *  - saveDownload: a file (PDF, CSV, backup) saved to the phone's Downloads folder.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "in.reynrel.docgen/phone").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "smsAvailable" -> result.success(smsAvailable())
                    "sendSms" -> {
                        val phone = call.argument<String>("phone") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        sendSms(phone, text, result)
                    }
                    "saveDownload" -> {
                        val name = call.argument<String>("name") ?: "document"
                        val mime = call.argument<String>("mime") ?: "application/octet-stream"
                        val bytes = call.argument<ByteArray>("bytes") ?: ByteArray(0)
                        result.success(saveDownload(name, mime, bytes))
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("FAILED", e.message ?: "failed", null)
            }
        }
    }

    private fun smsAvailable(): Boolean {
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) return false
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
        }
        return info.requestedPermissions?.contains(Manifest.permission.SEND_SMS) == true
    }

    /** The SMS service of the SIM chosen for SMS (dual-SIM phones), else the phone's default. */
    private fun smsManager(): SmsManager {
        val sub = SmsManager.getDefaultSmsSubscriptionId()
        val valid = sub != SubscriptionManager.INVALID_SUBSCRIPTION_ID
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val base = getSystemService(SmsManager::class.java)
            if (valid) base.createForSubscriptionId(sub) else base
        } else {
            @Suppress("DEPRECATION")
            if (valid) SmsManager.getSmsManagerForSubscriptionId(sub) else SmsManager.getDefault()
        }
    }

    private var smsCount = 0

    private fun smsError(code: Int): String = when (code) {
        SmsManager.RESULT_ERROR_RADIO_OFF -> "The phone is in airplane mode or the SIM is off."
        SmsManager.RESULT_ERROR_NO_SERVICE -> "No mobile network right now."
        SmsManager.RESULT_ERROR_NULL_PDU, SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "The SMS could not be sent (check the SIM and its balance)."
        else -> "The SMS could not be sent (error $code)."
    }

    /** Sends and answers when every part is reported sent (or after 30 s, when the phone has queued it). */
    private fun sendSms(phone: String, text: String, result: MethodChannel.Result) {
        val sms = smsManager()
        val parts = sms.divideMessage(text)
        val action = "$packageName.SMS_SENT.${++smsCount}"
        val main = Handler(Looper.getMainLooper())
        var waiting = parts.size
        var failure: Int? = null
        var answered = false
        lateinit var receiver: BroadcastReceiver
        fun answer() {
            if (answered) return
            answered = true
            try {
                unregisterReceiver(receiver)
            } catch (ignored: Exception) {
            }
            val code = failure
            if (code == null) result.success(true) else result.error("SMS_FAILED", smsError(code), code)
        }
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (resultCode != Activity.RESULT_OK) failure = resultCode
                waiting -= 1
                if (waiting <= 0) answer()
            }
        }
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
        val sent = ArrayList<PendingIntent>()
        for (i in parts.indices) {
            val intent = Intent(action).setPackage(packageName)
            sent.add(PendingIntent.getBroadcast(this, smsCount * 100 + i, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT))
        }
        try {
            if (parts.size > 1) sms.sendMultipartTextMessage(phone, null, parts, sent, null)
            else sms.sendTextMessage(phone, null, text, sent[0], null)
        } catch (e: Exception) {
            answered = true
            try {
                unregisterReceiver(receiver)
            } catch (ignored: Exception) {
            }
            result.error("SMS_FAILED", e.message ?: "The SMS could not be sent.", null)
            return
        }
        main.postDelayed({ answer() }, 30_000)
    }

    private fun saveDownload(name: String, mime: String, bytes: ByteArray): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return true
        }
        @Suppress("DEPRECATION")
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!dir.exists()) dir.mkdirs()
        var file = File(dir, name)
        var n = 1
        while (file.exists()) {
            val dot = name.lastIndexOf('.')
            file = File(dir, if (dot > 0) "${name.substring(0, dot)} ($n)${name.substring(dot)}" else "$name ($n)")
            n++
        }
        file.writeBytes(bytes)
        return true
    }
}
