package com.freeline.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.PhoneInTalk
import androidx.compose.material.icons.rounded.RecordVoiceOver
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SettingsSuggest
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.ui.graphics.vector.ImageVector

enum class AppTab(
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector,
) {
    Messages(
        label = "Messages",
        icon = Icons.Rounded.ChatBubbleOutline,
        selectedIcon = Icons.Rounded.Sms,
    ),
    Calls(
        label = "Calls",
        icon = Icons.Rounded.PhoneInTalk,
        selectedIcon = Icons.Rounded.RecordVoiceOver,
    ),
    Voicemail(
        label = "Voicemail",
        icon = Icons.Rounded.GraphicEq,
        selectedIcon = Icons.Rounded.GraphicEq,
    ),
    Settings(
        label = "Settings",
        icon = Icons.Rounded.Settings,
        selectedIcon = Icons.Rounded.SettingsSuggest,
    ),
}
