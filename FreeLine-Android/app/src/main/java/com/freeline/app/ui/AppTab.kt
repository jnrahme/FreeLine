package com.freeline.app.ui

enum class AppTab(
    val label: String,
    val iconLabel: String,
) {
    Messages(label = "Messages", iconLabel = "M"),
    Calls(label = "Calls", iconLabel = "C"),
    Voicemail(label = "Voicemail", iconLabel = "V"),
    Settings(label = "Settings", iconLabel = "S"),
}
