package com.freeline.app.numbers

import com.freeline.app.config.APIConfiguration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class NumberApiClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
) {
    suspend fun searchNumbers(areaCode: String): List<AvailableNumberOption> =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/numbers/search?areaCode=$areaCode",
                method = "GET",
                accessToken = null,
                body = null,
            )

            val numbers = response.getJSONArray("numbers")
            buildList {
                for (index in 0 until numbers.length()) {
                    add(numbers.getJSONObject(index).toAvailableNumber())
                }
            }
        }

    suspend fun getCurrentNumber(accessToken: String): AssignedNumber? =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/numbers/me",
                method = "GET",
                accessToken = accessToken,
                body = null,
            )

            if (response.isNull("number")) {
                null
            } else {
                response.getJSONObject("number").toAssignedNumber()
            }
        }

    suspend fun claimNumber(
        accessToken: String,
        number: AvailableNumberOption,
    ): AssignedNumber = withContext(Dispatchers.IO) {
        request(
            path = "/v1/numbers/claim",
            method = "POST",
            accessToken = accessToken,
            body = mapOf(
                "areaCode" to number.areaCode,
                "locality" to number.locality,
                "nationalFormat" to number.nationalFormat,
                "phoneNumber" to number.phoneNumber,
                "region" to number.region,
            ),
        ).getJSONObject("number").toAssignedNumber()
    }

    suspend fun releaseNumber(accessToken: String): AssignedNumber =
        withContext(Dispatchers.IO) {
            request(
                path = "/v1/numbers/release",
                method = "POST",
                accessToken = accessToken,
                body = null,
            ).getJSONObject("number").toAssignedNumber()
        }

    private fun request(
        path: String,
        method: String,
        accessToken: String?,
        body: Map<String, String>?,
    ): JSONObject {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            if (accessToken != null) {
                setRequestProperty("Authorization", "Bearer $accessToken")
            }
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }

        try {
            if (body != null) {
                val jsonBody = JSONObject()
                body.forEach { (key, value) ->
                    jsonBody.put(key, value)
                }
                connection.outputStream.use { stream ->
                    stream.write(jsonBody.toString().toByteArray())
                }
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
                }.getOrNull() ?: "Number request failed."

                throw IllegalStateException(message)
            }

            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.toAvailableNumber(): AvailableNumberOption =
        AvailableNumberOption(
            phoneNumber = getString("phoneNumber"),
            nationalFormat = getString("nationalFormat"),
            locality = getString("locality"),
            region = getString("region"),
            provider = getString("provider"),
        )

    private fun JSONObject.toAssignedNumber(): AssignedNumber =
        AssignedNumber(
            assignmentId = getString("assignmentId"),
            assignedAt = getString("assignedAt"),
            activationDeadline = getString("activationDeadline"),
            areaCode = getString("areaCode"),
            externalId = getString("externalId"),
            locality = getString("locality"),
            nationalFormat = getString("nationalFormat"),
            phoneNumber = getString("phoneNumber"),
            phoneNumberId = getString("phoneNumberId"),
            provider = getString("provider"),
            quarantineUntil = optString("quarantineUntil").ifBlank { null },
            region = getString("region"),
            releasedAt = optString("releasedAt").ifBlank { null },
            status = getString("status"),
            userId = getString("userId"),
        )
}
