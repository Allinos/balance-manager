package `in`.reynrel.docgen_android

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.telephony.SmsManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Phone services for DocGen (lib/phone.dart):
 *  - sendSms: an SMS through the phone's own SMS service (needs the SEND_SMS permission, asked by the app);
 *  - saveDownload: a file (PDF, CSV, backup) saved to the phone's Downloads folder.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "in.reynrel.docgen/phone").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "sendSms" -> {
                        val phone = call.argument<String>("phone") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        sendSms(phone, text)
                        result.success(true)
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

    private fun sendSms(phone: String, text: String) {
        val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
        val parts = sms.divideMessage(text)
        if (parts.size > 1) sms.sendMultipartTextMessage(phone, null, parts, null, null)
        else sms.sendTextMessage(phone, null, text, null, null)
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
