package com.freeline.app.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.util.UUID

class SessionStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "freeline_secure_store",
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun loadSession(): AuthSessionPayload? {
        val raw = prefs.getString(KEY_AUTH_SESSION, null) ?: return null
        val json = JSONObject(raw)
        val tokens = json.getJSONObject("tokens")
        val user = json.getJSONObject("user")

        return AuthSessionPayload(
            tokens = AuthTokens(
                accessToken = tokens.getString("accessToken"),
                refreshToken = tokens.getString("refreshToken"),
                accessTokenExpiresAt = tokens.getString("accessTokenExpiresAt"),
                refreshTokenExpiresAt = tokens.getString("refreshTokenExpiresAt"),
            ),
            user = AuthenticatedUser(
                id = user.getString("id"),
                email = user.getString("email"),
                displayName = user.optString("displayName").ifBlank { null },
            ),
        )
    }

    fun saveSession(session: AuthSessionPayload) {
        val json = JSONObject()
            .put(
                "tokens",
                JSONObject()
                    .put("accessToken", session.tokens.accessToken)
                    .put("refreshToken", session.tokens.refreshToken)
                    .put("accessTokenExpiresAt", session.tokens.accessTokenExpiresAt)
                    .put("refreshTokenExpiresAt", session.tokens.refreshTokenExpiresAt),
            )
            .put(
                "user",
                JSONObject()
                    .put("id", session.user.id)
                    .put("email", session.user.email)
                    .put("displayName", session.user.displayName),
            )

        prefs.edit().putString(KEY_AUTH_SESSION, json.toString()).apply()
    }

    fun clearSession() {
        prefs.edit().remove(KEY_AUTH_SESSION).apply()
    }

    fun getOrCreateFingerprint(): String {
        val existing = prefs.getString(KEY_DEVICE_FINGERPRINT, null)
        if (!existing.isNullOrBlank()) {
            return existing
        }

        val fingerprint = UUID.randomUUID().toString().lowercase()
        prefs.edit().putString(KEY_DEVICE_FINGERPRINT, fingerprint).apply()
        return fingerprint
    }

    private companion object {
        const val KEY_AUTH_SESSION = "auth_session"
        const val KEY_DEVICE_FINGERPRINT = "device_fingerprint"
    }
}
