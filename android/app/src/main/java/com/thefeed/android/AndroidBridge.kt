package com.thefeed.android

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import java.security.MessageDigest

class AndroidBridge(private val activity: Activity) {

    private val prefs by lazy {
        activity.getSharedPreferences(ThefeedService.PREFS_NAME, Context.MODE_PRIVATE)
    }

    @JavascriptInterface
    fun isAndroid(): Boolean = true

    @JavascriptInterface
    fun showNotification(title: String, body: String) {
        val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                MSG_CHANNEL_ID, "New Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for new channel messages"
                enableVibration(true)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            }
            manager.createNotificationChannel(channel)
        }

        val openIntent = Intent(activity, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            activity, 2, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(activity, MSG_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        manager.notify(MSG_NOTIFICATION_BASE + (System.currentTimeMillis() % 100).toInt(), notification)
    }

    // ===== Language =====

    @JavascriptInterface
    fun setLang(lang: String) {
        prefs.edit().putString(PREF_LANG, lang).apply()
    }

    @JavascriptInterface
    fun getLang(): String {
        return prefs.getString(PREF_LANG, "fa") ?: "fa"
    }

    // ===== Password =====

    @JavascriptInterface
    fun hasPassword(): Boolean {
        return prefs.getString(PREF_PASSWORD_HASH, null) != null
    }

    @JavascriptInterface
    fun setPassword(password: String): Boolean {
        if (password.isEmpty()) return false
        prefs.edit().putString(PREF_PASSWORD_HASH, sha256(password)).apply()
        return true
    }

    @JavascriptInterface
    fun removePassword(currentPassword: String): Boolean {
        val stored = prefs.getString(PREF_PASSWORD_HASH, null) ?: return false
        if (sha256(currentPassword) != stored) return false
        prefs.edit().remove(PREF_PASSWORD_HASH).apply()
        return true
    }

    @JavascriptInterface
    fun checkPassword(password: String): Boolean {
        val stored = prefs.getString(PREF_PASSWORD_HASH, null) ?: return true
        return sha256(password) == stored
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val PREF_PASSWORD_HASH = "password_hash"
        const val PREF_LANG = "app_lang"
        const val MSG_CHANNEL_ID = "thefeed_messages"
        const val MSG_NOTIFICATION_BASE = 2000
    }
}
