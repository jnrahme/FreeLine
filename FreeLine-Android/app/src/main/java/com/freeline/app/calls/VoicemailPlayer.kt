package com.freeline.app.calls

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

class VoicemailPlayer {
    var activeVoicemailId by mutableStateOf<String?>(null)
        private set

    var isPreparing by mutableStateOf(false)
        private set

    private var mediaPlayer: MediaPlayer? = null

    fun isPlaying(voicemail: VoicemailEntry): Boolean {
        return activeVoicemailId == voicemail.id && (mediaPlayer?.isPlaying == true)
    }

    fun toggle(
        voicemail: VoicemailEntry,
        onError: (String) -> Unit,
    ) {
        if (isPlaying(voicemail)) {
            pause()
            return
        }

        play(voicemail, onError)
    }

    fun pause() {
        mediaPlayer?.pause()
    }

    fun stop() {
        mediaPlayer?.release()
        mediaPlayer = null
        activeVoicemailId = null
        isPreparing = false
    }

    private fun play(
        voicemail: VoicemailEntry,
        onError: (String) -> Unit,
    ) {
        stop()

        val nextPlayer = MediaPlayer()
        nextPlayer.setAudioAttributes(
            AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build(),
        )
        nextPlayer.setDataSource(voicemail.audioUrl)
        nextPlayer.setOnPreparedListener { preparedPlayer ->
            activeVoicemailId = voicemail.id
            isPreparing = false
            preparedPlayer.start()
        }
        nextPlayer.setOnCompletionListener {
            stop()
        }
        nextPlayer.setOnErrorListener { _, _, _ ->
            stop()
            onError("Unable to play this voicemail recording.")
            true
        }

        isPreparing = true
        mediaPlayer = nextPlayer
        runCatching {
            nextPlayer.prepareAsync()
        }.onFailure { error ->
            stop()
            onError(error.message ?: "Unable to play this voicemail recording.")
        }
    }
}
