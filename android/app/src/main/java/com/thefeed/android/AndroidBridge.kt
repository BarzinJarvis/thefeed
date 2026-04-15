package com.thefeed.android

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

class AndroidBridge(private val activity: Activity) {

    private val prefs by lazy {
        activity.getSharedPreferences(ThefeedService.PREFS_NAME, Context.MODE_PRIVATE)
    }

    // ===== Identity =====

    @JavascriptInterface
    fun isAndroid(): Boolean = true

    /**
     * Change the app's launcher icon and name.
     * If iconBase64 is non-empty, disables the default launcher alias and
     * pins a new shortcut with the custom image — the result looks like
     * the app itself changed.
     * If iconBase64 is empty, only saves the custom name (used on lock screen).
     */
    @JavascriptInterface
    fun setAppIdentity(name: String, iconBase64: String): Boolean {
        return try {
            prefs.edit().putString(PREF_CUSTOM_APP_NAME, name).apply()

            if (iconBase64.isBlank()) return true // name-only change

            val raw = if (iconBase64.contains(",")) iconBase64.substringAfter(",") else iconBase64
            val bytes = Base64.decode(raw, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return false

            val iconFile = File(activity.filesDir, "custom_icon.png")
            FileOutputStream(iconFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            prefs.edit().putString(PREF_CUSTOM_ICON_PATH, iconFile.absolutePath).apply()

            // Create pinned shortcut with custom icon/name
            val icon = IconCompat.createWithBitmap(bitmap)
            val shortcut = ShortcutInfoCompat.Builder(activity, "custom_launcher")
                .setShortLabel(name)
                .setLongLabel(name)
                .setIcon(icon)
                .setIntent(
                    Intent(activity, MainActivity::class.java).apply {
                        action = Intent.ACTION_MAIN
                    }
                )
                .build()
            ShortcutManagerCompat.requestPinShortcut(activity, shortcut, null)

            // Hide original launcher icon
            activity.packageManager.setComponentEnabledSetting(
                ComponentName(activity, "${activity.packageName}.DefaultLauncher"),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /** Returns the custom display name, or empty string if using defaults. */
    @JavascriptInterface
    fun getCustomAppName(): String {
        return prefs.getString(PREF_CUSTOM_APP_NAME, "") ?: ""
    }

    /** Returns the display name for the app — custom name if set, otherwise "thefeed". */
    @JavascriptInterface
    fun getAppDisplayName(): String {
        val custom = prefs.getString(PREF_CUSTOM_APP_NAME, null)
        return if (!custom.isNullOrBlank()) custom else "thefeed"
    }

    /** Restore original app icon and name. */
    @JavascriptInterface
    fun resetAppIdentity() {
        prefs.edit()
            .remove(PREF_CUSTOM_APP_NAME)
            .remove(PREF_CUSTOM_ICON_PATH)
            .apply()
        val iconFile = File(activity.filesDir, "custom_icon.png")
        if (iconFile.exists()) iconFile.delete()

        // Restore original launcher icon
        try {
            activity.packageManager.setComponentEnabledSetting(
                ComponentName(activity, "${activity.packageName}.DefaultLauncher"),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )
        } catch (_: Exception) { }

        // Remove dynamic shortcut
        try {
            ShortcutManagerCompat.removeDynamicShortcuts(activity, listOf("custom_launcher"))
        } catch (_: Exception) { }
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
        const val PREF_CUSTOM_APP_NAME = "custom_app_name"
        const val PREF_CUSTOM_ICON_PATH = "custom_icon_path"
        const val PREF_PASSWORD_HASH = "password_hash"
        const val PREF_LANG = "app_lang"
    }
}
