package com.freeline.app.numbers

data class AvailableNumberOption(
    val phoneNumber: String,
    val nationalFormat: String,
    val locality: String,
    val region: String,
    val provider: String,
) {
    val areaCode: String
        get() = phoneNumber.removePrefix("+1").take(3)
}

data class AssignedNumber(
    val assignmentId: String,
    val assignedAt: String,
    val activationDeadline: String,
    val areaCode: String,
    val externalId: String,
    val locality: String,
    val nationalFormat: String,
    val phoneNumber: String,
    val phoneNumberId: String,
    val provider: String,
    val quarantineUntil: String?,
    val region: String,
    val releasedAt: String?,
    val status: String,
    val userId: String,
)
