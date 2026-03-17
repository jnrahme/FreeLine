package com.freeline.app.auth

import android.net.Uri
import com.freeline.app.config.APIConfiguration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class AuthApiClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
) {
    suspend fun startEmailAuth(
        email: String,
        password: String,
    ): PendingEmailVerification = withContext(Dispatchers.IO) {
        val response = post(
            path = "/v1/auth/email/start",
            body = mapOf(
                "email" to email,
                "password" to password,
            ),
        )

        val previewLink = response.getString("previewLink")
        val token = Uri.parse(previewLink).getQueryParameter("token")
            ?: throw IllegalStateException("Verification token missing from preview link.")

        PendingEmailVerification(
            email = email,
            previewLink = previewLink,
            suggestedToken = token,
        )
    }

    suspend fun verifyEmail(
        token: String,
        fingerprint: String,
    ): AuthSessionPayload = withContext(Dispatchers.IO) {
        postSession(
            path = "/v1/auth/email/verify",
            body = mapOf(
                "fingerprint" to fingerprint,
                "platform" to "android",
                "token" to token,
            ),
        )
    }

    suspend fun continueWithDevProvider(
        provider: DevAuthProvider,
        fingerprint: String,
    ): AuthSessionPayload = withContext(Dispatchers.IO) {
        val suffix = UUID.randomUUID().toString().lowercase()
        val identityToken =
            "dev:${provider.routeName}-$suffix:${provider.routeName}+$suffix@freeline.dev:${provider.displayName}"

        postSession(
            path = "/v1/auth/oauth/${provider.routeName}",
            body = mapOf(
                "fingerprint" to fingerprint,
                "identityToken" to identityToken,
                "platform" to "android",
            ),
        )
    }

    private fun postSession(
        path: String,
        body: Map<String, String>,
    ): AuthSessionPayload {
        val response = post(path, body)
        val tokens = response.getJSONObject("tokens")
        val user = response.getJSONObject("user")

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

    private fun post(
        path: String,
        body: Map<String, String>,
    ): JSONObject {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }

        try {
            val jsonBody = JSONObject()
            body.forEach { (key, value) ->
                jsonBody.put(key, value)
            }

            connection.outputStream.use { stream ->
                stream.write(jsonBody.toString().toByteArray())
            }

            val statusCode = connection.responseCode
            val responseText = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }

            if (statusCode !in 200..299) {
                val message = runCatching {
                    JSONObject(responseText).getJSONObject("error").getString("message")
                }.getOrNull() ?: "Authentication request failed."

                throw IllegalStateException(message)
            }

            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }
}
