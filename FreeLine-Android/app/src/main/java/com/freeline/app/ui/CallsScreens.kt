package com.freeline.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Calls", style = MaterialTheme.typography.headlineSmall)
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
                        Card {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text("Minutes", style = MaterialTheme.typography.titleSmall)
                                Text("${allowance.monthlyRemainingMinutes} of ${allowance.monthlyCapMinutes} min remaining")
                                Text(
                                    "${allowance.monthlyUsedMinutes} minutes used this month",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                if (appState.errorMessage != null) {
                    item {
                        Card {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("Call Status", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    text = appState.errorMessage.orEmpty(),
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }

                item {
                    Card {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = if (dialedNumber.isBlank()) "Enter a number" else dialedNumber,
                                style = MaterialTheme.typography.headlineSmall,
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

                            Button(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    when (dialActionFor(dialedNumber)) {
                                        DialAction.NativeEmergencyDial -> {
                                            note = "Emergency calls use your phone's built-in dialer."
                                            context.startActivity(
                                                Intent(Intent.ACTION_DIAL, Uri.parse("tel:911"))
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
                                enabled = dialedNumber.isNotBlank() && !appState.isLoading,
                            ) {
                                Text("Call")
                            }

                            if (note != null) {
                                Text(
                                    text = note.orEmpty(),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }

                item {
                    Text("Recent Calls", style = MaterialTheme.typography.titleMedium)
                }

                if (appState.callHistory.isEmpty()) {
                    item {
                        Card {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("No calls yet", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Device fingerprint: ${appState.fingerprint}",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                TextButton(
                                    onClick = {
                                        coroutineScope.launch { appState.loadCallHistory() }
                                    },
                                ) {
                                    Text("Refresh")
                                }
                            }
                        }
                    }
                } else {
                    items(appState.callHistory, key = { it.id }) { call ->
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
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { key ->
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = { onAppend(key) },
                    ) {
                        Text(key)
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                modifier = Modifier.weight(1f),
                onClick = onClear,
                enabled = currentValue.isNotEmpty(),
            ) {
                Text("Clear")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = onBackspace,
                enabled = currentValue.isNotEmpty(),
            ) {
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
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(24.dp))
        Text(session.displayNumber, style = MaterialTheme.typography.headlineMedium)
        Text(
            "Calling from ${session.fromNumber.formatCallPhoneNumber()}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            formatCallDuration(elapsedSeconds.toInt()),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            session.statusText,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ToggleChip(title = "Mute", enabled = session.isMuted) {
                appState.toggleMuteActiveCall()
            }
            ToggleChip(title = "Speaker", enabled = session.isSpeakerOn) {
                appState.toggleSpeakerActiveCall()
            }
            ToggleChip(title = "Keypad", enabled = showKeypad) {
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

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onEnd,
        ) {
            Text("End Call")
        }
    }
}

@Composable
private fun ToggleChip(
    title: String,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Box(
        modifier = Modifier
            .background(
                color = if (enabled) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                else MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onToggle)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(title)
    }
}

@Composable
private fun CallHistoryCard(
    call: CallHistoryEntry,
    onTap: () -> Unit,
) {
    Card(onClick = onTap) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
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
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun formatTimestamp(iso8601: String): String {
    return runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrElse { iso8601 }
}
