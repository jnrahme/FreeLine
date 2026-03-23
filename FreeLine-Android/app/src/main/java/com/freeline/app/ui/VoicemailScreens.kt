package com.freeline.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RecordVoiceOver
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.freeline.app.calls.VoicemailEntry
import com.freeline.app.calls.VoicemailPlayer
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun VoicemailTabScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    val voicemailPlayer = remember { VoicemailPlayer() }
    var playbackStatus by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(appState.currentNumber?.phoneNumber) {
        appState.loadVoicemails()
    }

    DisposableEffect(Unit) {
        onDispose {
            voicemailPlayer.stop()
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 20.dp, bottom = 32.dp),
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
                            eyebrow = "Voicemail",
                            title = "Voicemail",
                            subtitle = "Review missed callers, play archived recordings, and clear messages without leaving the app.",
                        )
                        FreeLineGlassGroup {
                            FreeLinePill(
                                text = "Backend archived audio",
                                icon = Icons.Rounded.GraphicEq,
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                            if (appState.voicemails.any { !it.isRead }) {
                                FreeLinePill(
                                    text = "${appState.voicemails.count { !it.isRead }} unread",
                                    icon = Icons.Rounded.MarkEmailRead,
                                    tint = MaterialTheme.colorScheme.tertiary,
                                )
                            }
                        }
                    }
                    FreeLineHeroIcon(icon = Icons.Rounded.RecordVoiceOver)
                }
            }
        }

        if (appState.errorMessage != null) {
            item {
                FreeLineNoticeCard(
                    title = "Voicemail problem",
                    message = appState.errorMessage.orEmpty(),
                    icon = Icons.Rounded.RecordVoiceOver,
                )
            }
        }

        if (playbackStatus != null) {
            item {
                FreeLineNoticeCard(
                    title = "Playback",
                    message = playbackStatus.orEmpty(),
                    icon = Icons.Rounded.GraphicEq,
                    tone = MaterialTheme.colorScheme.freeLineSuccessTone(),
                )
            }
        }

        if (appState.voicemails.isEmpty()) {
            item {
                FreeLineNoticeCard(
                    title = "No voicemails yet",
                    message = "Inbound voicemail persistence is wired on the backend; APNs and FCM wake still need live credentials for honest device proof.",
                    icon = Icons.Rounded.RecordVoiceOver,
                    tone = MaterialTheme.colorScheme.freeLineSuccessTone(),
                )
            }
        } else {
            items(appState.voicemails, key = { voicemail -> voicemail.id }) { voicemail ->
                VoicemailCard(
                    voicemailPlayer = voicemailPlayer,
                    voicemail = voicemail,
                    onMarkRead = {
                        coroutineScope.launch {
                            appState.markVoicemailRead(voicemail)
                        }
                    },
                    onPlaybackError = { playbackStatus = it },
                    onDelete = {
                        coroutineScope.launch {
                            appState.deleteVoicemail(voicemail)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun VoicemailCard(
    voicemailPlayer: VoicemailPlayer,
    voicemail: VoicemailEntry,
    onMarkRead: () -> Unit,
    onPlaybackError: (String) -> Unit,
    onDelete: () -> Unit,
) {
    FreeLineGlassCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            FreeLineHeroIcon(
                icon = Icons.Rounded.GraphicEq,
                modifier = Modifier.size(68.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = voicemail.displayNumber,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = voicemail.transcription ?: "Recording available",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
                Text(
                    text = "${voicemail.durationLabel} • ${formatVoicemailTimestamp(voicemail.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        FreeLinePrimaryButton(
            onClick = {
                voicemailPlayer.toggle(voicemail, onPlaybackError)
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = when {
                    voicemailPlayer.isPlaying(voicemail) -> Icons.Rounded.Pause
                    else -> Icons.Rounded.PlayArrow
                },
                contentDescription = null,
            )
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(10.dp))
            Text(
                when {
                    voicemailPlayer.isPlaying(voicemail) -> "Pause recording"
                    voicemailPlayer.isPreparing && voicemailPlayer.activeVoicemailId == voicemail.id -> "Loading recording"
                    else -> "Play recording"
                },
            )
        }

        if (!voicemail.isRead) {
            FreeLineSecondaryButton(
                onClick = onMarkRead,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.MarkEmailRead,
                    contentDescription = null,
                )
                androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(10.dp))
                Text("Mark read")
            }
        }

        FreeLineSecondaryButton(
            onClick = onDelete,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = Icons.Rounded.Delete,
                contentDescription = null,
            )
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(10.dp))
            Text("Delete")
        }
    }
}

private fun formatVoicemailTimestamp(iso8601: String): String {
    return runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrElse { iso8601 }
}
