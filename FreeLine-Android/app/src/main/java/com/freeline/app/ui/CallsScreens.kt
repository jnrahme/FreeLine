package com.freeline.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Backspace
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Dialpad
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.PhoneForwarded
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RecordVoiceOver
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.freeline.app.calls.ActiveCallSession
import com.freeline.app.calls.CallHistoryEntry
import com.freeline.app.calls.DialAction
import com.freeline.app.calls.dialActionFor
import com.freeline.app.calls.formatCallDuration
import com.freeline.app.calls.formatCallPhoneNumber
import com.freeline.app.config.AdConfiguration
import com.freeline.app.monetization.BannerAdCard
import com.freeline.app.monetization.UsageOverviewCard
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun CallsTabScreen(appState: FreeLineAppState) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var dialedNumber by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }
    var pendingCallNumber by remember { mutableStateOf<String?>(null) }
    val microphonePermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val requestedNumber = pendingCallNumber
        pendingCallNumber = null

        if (!granted || requestedNumber.isNullOrBlank()) {
            note = "Microphone access is required before placing a call."
            return@rememberLauncherForActivityResult
        }

        coroutineScope.launch {
            if (appState.startOutgoingCall(requestedNumber)) {
                note = null
                dialedNumber = ""
            } else {
                note = appState.errorMessage
            }
        }
    }

    fun startVoipCall(number: String) {
        val permissionState = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        )

        if (permissionState == PackageManager.PERMISSION_GRANTED) {
            coroutineScope.launch {
                if (appState.startOutgoingCall(number)) {
                    note = null
                    dialedNumber = ""
                } else {
                    note = appState.errorMessage
                }
            }
            return
        }

        pendingCallNumber = number
        note = "Allow microphone access to place the call."
        microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    LaunchedEffect(appState.currentNumber?.phoneNumber) {
        appState.loadCallHistory()
    }

    when (val activeCall = appState.activeCallSession) {
        null -> Scaffold(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            bottomBar = {
                BannerAdCard(
                    placement = "calls_bottom_banner",
                    isHidden = !appState.adsEnabled,
                    onImpression = {
                        coroutineScope.launch {
                            appState.trackAdImpression(
                                adType = "banner",
                                placement = "calls_bottom_banner",
                                adUnitId = AdConfiguration.BANNER_UNIT_ID,
                            )
                        }
                    },
                    onTap = {
                        coroutineScope.launch {
                            appState.trackAdClick(
                                adType = "banner",
                                placement = "calls_bottom_banner",
                            )
                        }
                    },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            },
        ) { paddingValues ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 16.dp),
                contentPadding = PaddingValues(top = 20.dp, bottom = 100.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    FreeLineGlassCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(18.dp),
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                FreeLineSectionTitle(
                                    eyebrow = "Voice",
                                    title = "Calls",
                                    subtitle = "Place in-app U.S. calls over data, with a guarded free-tier allowance and native 911 handoff.",
                                )
                                FreeLineGlassGroup {
                                    FreeLinePill(
                                        text = "US only",
                                        icon = Icons.Rounded.Shield,
                                    )
                                    FreeLinePill(
                                        text = "911 uses dialer",
                                        icon = Icons.Rounded.PhoneForwarded,
                                        tint = MaterialTheme.colorScheme.tertiary,
                                    )
                                }
                            }
                            FreeLineHeroIcon(icon = Icons.Rounded.RecordVoiceOver)
                        }
                    }
                }

                item {
                    val summary = appState.usageSummary
                    if (summary != null) {
                        UsageOverviewCard(
                            summary = summary,
                            remainingRewardClaims = appState.remainingRewardClaims,
                        )
                    }
                }

                item {
                    val allowance = appState.callAllowance
                    if (allowance != null) {
                        FreeLineGlassCard {
                            Text(
                                text = "Minutes",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                                FreeLineStatStrip(
                                    title = "Remaining",
                                    value = "${allowance.monthlyRemainingMinutes} min",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.weight(1f),
                                )
                                FreeLineStatStrip(
                                    title = "Used",
                                    value = "${allowance.monthlyUsedMinutes} min",
                                    tint = MaterialTheme.colorScheme.secondary,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            Text(
                                text = "${allowance.monthlyCapMinutes} minute cap this month",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                if (appState.errorMessage != null) {
                    item {
                        FreeLineNoticeCard(
                            title = "Call status",
                            message = appState.errorMessage.orEmpty(),
                            icon = Icons.Rounded.Phone,
                        )
                    }
                }

                item {
                    FreeLineGlassCard {
                        Text(
                            text = if (dialedNumber.isBlank()) "Enter a U.S. number" else dialedNumber,
                            style = MaterialTheme.typography.headlineMedium,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                        )

                        DialPad(
                            currentValue = dialedNumber,
                            onAppend = { dialedNumber += it },
                            onBackspace = {
                                if (dialedNumber.isNotEmpty()) {
                                    dialedNumber = dialedNumber.dropLast(1)
                                }
                            },
                            onClear = {
                                dialedNumber = ""
                            },
                        )

                        FreeLinePrimaryButton(
                            onClick = {
                                when (dialActionFor(dialedNumber)) {
                                    DialAction.NativeEmergencyDial -> {
                                        note = "Emergency calls use your phone's built-in dialer."
                                        context.startActivity(
                                            Intent(Intent.ACTION_DIAL, Uri.parse("tel:911")),
                                        )
                                    }

                                    DialAction.Voip -> {
                                        startVoipCall(dialedNumber)
                                    }

                                    null -> {
                                        note = "Enter a valid U.S. phone number."
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = dialedNumber.isNotBlank() && !appState.isLoading,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Phone,
                                contentDescription = null,
                            )
                            Spacer(modifier = Modifier.size(10.dp))
                            Text("Call")
                        }

                        if (note != null) {
                            Text(
                                text = note.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                item {
                    Text(
                        text = "Recent Calls",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                if (appState.callHistory.isEmpty()) {
                    item {
                        FreeLineNoticeCard(
                            title = "No calls yet",
                            message = "Device fingerprint: ${appState.fingerprint}",
                            icon = Icons.Rounded.History,
                            tone = MaterialTheme.colorScheme.freeLineSuccessTone(),
                        )
                    }
                    item {
                        FreeLineSecondaryButton(
                            onClick = {
                                coroutineScope.launch {
                                    appState.loadCallHistory()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Refresh,
                                contentDescription = null,
                            )
                            Spacer(modifier = Modifier.size(10.dp))
                            Text("Refresh")
                        }
                    }
                } else {
                    items(appState.callHistory, key = { call -> call.id }) { call ->
                        CallHistoryCard(call = call) {
                            dialedNumber = call.remoteNumber
                        }
                    }
                }
            }
        }

        else -> ActiveCallScreen(
            appState = appState,
            session = activeCall,
            onEnd = {
                coroutineScope.launch { appState.endActiveCall() }
            },
        )
    }
}

@Composable
private fun DialPad(
    currentValue: String,
    onAppend: (String) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("*", "0", "#"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                row.forEach { key ->
                    FreeLineSecondaryButton(
                        onClick = { onAppend(key) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(key)
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FreeLineSecondaryButton(
                onClick = onClear,
                modifier = Modifier.weight(1f),
                enabled = currentValue.isNotEmpty(),
            ) {
                Text("Clear")
            }
            FreeLineSecondaryButton(
                onClick = onBackspace,
                modifier = Modifier.weight(1f),
                enabled = currentValue.isNotEmpty(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Backspace,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Delete")
            }
        }
    }
}

@Composable
private fun ActiveCallScreen(
    appState: FreeLineAppState,
    session: ActiveCallSession,
    onEnd: () -> Unit,
) {
    var showKeypad by remember { mutableStateOf(false) }
    var dtmfDigits by remember { mutableStateOf("") }
    var elapsedSeconds by remember { mutableLongStateOf(0L) }

    LaunchedEffect(session.timerAnchorEpochMillis) {
        while (true) {
            elapsedSeconds = ((System.currentTimeMillis() - session.timerAnchorEpochMillis) / 1000).coerceAtLeast(0)
            delay(1000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        FreeLineGlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    FreeLineSectionTitle(
                        eyebrow = "Active call",
                        title = session.displayNumber,
                        subtitle = "Calling from ${session.fromNumber.formatCallPhoneNumber()}",
                    )
                    FreeLineGlassGroup {
                        FreeLinePill(
                            text = session.statusText,
                            icon = Icons.Rounded.Phone,
                        )
                    }
                }
                FreeLineHeroIcon(icon = Icons.Rounded.RecordVoiceOver)
            }

            Text(
                text = formatCallDuration(elapsedSeconds.toInt()),
                style = MaterialTheme.typography.displayLarge,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
        }

        FreeLineGlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ToggleChip(
                    title = "Mute",
                    icon = Icons.Rounded.Mic,
                    enabled = session.isMuted,
                    modifier = Modifier.weight(1f),
                ) {
                    appState.toggleMuteActiveCall()
                }
                ToggleChip(
                    title = "Speaker",
                    icon = Icons.Rounded.VolumeUp,
                    enabled = session.isSpeakerOn,
                    modifier = Modifier.weight(1f),
                ) {
                    appState.toggleSpeakerActiveCall()
                }
                ToggleChip(
                    title = "Keypad",
                    icon = Icons.Rounded.Dialpad,
                    enabled = showKeypad,
                    modifier = Modifier.weight(1f),
                ) {
                    showKeypad = !showKeypad
                }
            }

            if (showKeypad) {
                DialPad(
                    currentValue = dtmfDigits,
                    onAppend = {
                        dtmfDigits += it
                        appState.sendDigitsToActiveCall(it)
                    },
                    onBackspace = {
                        if (dtmfDigits.isNotEmpty()) {
                            dtmfDigits = dtmfDigits.dropLast(1)
                        }
                    },
                    onClear = {
                        dtmfDigits = ""
                    },
                )
            }

            FreeLinePrimaryButton(
                onClick = onEnd,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.CallEnd,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text("End Call")
            }
        }
    }
}

@Composable
private fun ToggleChip(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onToggle: () -> Unit,
) {
    FreeLineActionPill(
        text = title,
        icon = icon,
        onClick = onToggle,
        modifier = modifier,
        selected = enabled,
    )
}

@Composable
private fun CallHistoryCard(
    call: CallHistoryEntry,
    onTap: () -> Unit,
) {
    FreeLineGlassCard(onClick = onTap, padding = 18.dp) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            FreeLineHeroIcon(
                icon = Icons.Rounded.Phone,
                modifier = Modifier.size(62.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = call.displayNumber,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = formatTimestamp(call.endedAt ?: call.startedAt ?: call.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = call.statusLabel,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }
        }
    }
}

private fun formatTimestamp(iso8601: String): String {
    return runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrElse { iso8601 }
}
