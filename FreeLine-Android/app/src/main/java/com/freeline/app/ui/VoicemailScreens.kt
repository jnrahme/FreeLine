package com.freeline.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Voicemail", style = MaterialTheme.typography.headlineSmall)
        }

        if (appState.errorMessage != null) {
            item {
                Card {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Status", style = MaterialTheme.typography.titleSmall)
                        Text(
                            text = appState.errorMessage.orEmpty(),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }

        if (playbackStatus != null) {
            item {
                Card {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Playback", style = MaterialTheme.typography.titleSmall)
                        Text(
                            text = playbackStatus.orEmpty(),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        if (appState.voicemails.isEmpty()) {
            item {
                Card {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("No voicemails yet", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Inbound voicemail persistence is wired on the backend; APNs/FCM wake still needs live credentials for real device proof.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            items(appState.voicemails, key = { it.id }) { voicemail ->
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
    Card {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(voicemail.displayNumber, style = MaterialTheme.typography.titleMedium)
            Text(
                text = voicemail.transcription ?: "Recording available",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "${voicemail.durationLabel} • ${formatVoicemailTimestamp(voicemail.createdAt)}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )

            Button(
                onClick = {
                    voicemailPlayer.toggle(voicemail, onPlaybackError)
                },
            ) {
                Text(
                    when {
                        voicemailPlayer.isPlaying(voicemail) -> "Pause recording"
                        voicemailPlayer.isPreparing && voicemailPlayer.activeVoicemailId == voicemail.id -> "Loading recording"
                        else -> "Play recording"
                    },
                )
            }

            if (!voicemail.isRead) {
                Button(onClick = onMarkRead) {
                    Text("Mark read")
                }
            }

            Button(onClick = onDelete) {
                Text("Delete")
            }
        }
    }
}

private fun formatVoicemailTimestamp(iso8601: String): String {
    return runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrElse { iso8601 }
}
