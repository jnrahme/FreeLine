package com.freeline.app.calls

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.twilio.audioswitch.AudioDevice
import com.twilio.audioswitch.AudioSwitch
import com.twilio.voice.Call
import com.twilio.voice.CallException
import com.twilio.voice.ConnectOptions
import com.twilio.voice.Voice

class TwilioVoiceTransport(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val audioSwitch = AudioSwitch(appContext, null, true)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var audioStarted = false
    private var currentCall: Call? = null
    private var eventHandler: ((VoiceCallEvent) -> Unit)? = null

    fun startOutgoingCall(
        token: String,
        to: String,
        eventHandler: (VoiceCallEvent) -> Unit,
    ) {
        check(isLikelyJwt(token)) {
            "Voice provider is not configured yet. Add Twilio voice credentials to the backend first."
        }

        this.eventHandler = eventHandler
        emit(VoiceCallEvent.Connecting)
        ensureAudioStarted()

        val connectOptions = ConnectOptions.Builder(token)
            .params(mapOf("to" to to))
            .build()

        currentCall = Voice.connect(appContext, connectOptions, object : Call.Listener {
            override fun onRinging(call: Call) {
                emit(VoiceCallEvent.Ringing)
            }

            override fun onConnectFailure(
                call: Call,
                callException: CallException,
            ) {
                currentCall = null
                audioSwitch.deactivate()
                emit(VoiceCallEvent.Failed(formatCallException(callException)))
            }

            override fun onConnected(call: Call) {
                currentCall = call
                audioSwitch.activate()
                setSpeakerEnabled(true)
                emit(VoiceCallEvent.Connected(System.currentTimeMillis()))
            }

            override fun onReconnecting(
                call: Call,
                callException: CallException,
            ) {
                emit(VoiceCallEvent.Reconnecting(formatCallException(callException)))
            }

            override fun onReconnected(call: Call) {
                emit(VoiceCallEvent.Reconnected)
            }

            override fun onDisconnected(
                call: Call,
                callException: CallException?,
            ) {
                currentCall = null
                audioSwitch.deactivate()
                emit(VoiceCallEvent.Disconnected(callException?.let(::formatCallException)))
            }

            override fun onCallQualityWarningsChanged(
                call: Call,
                currentWarnings: Set<Call.CallQualityWarning>,
                previousWarnings: Set<Call.CallQualityWarning>,
            ) {
                return
            }
        })
    }

    fun endActiveCall() {
        currentCall?.disconnect()
        currentCall = null
        audioSwitch.deactivate()
    }

    fun setMuted(isMuted: Boolean) {
        currentCall?.mute(isMuted)
    }

    fun setSpeakerEnabled(isEnabled: Boolean) {
        val nextDevice = if (isEnabled) {
            audioSwitch.availableAudioDevices.firstOrNull { it is AudioDevice.Speakerphone }
        } else {
            audioSwitch.availableAudioDevices.firstOrNull { it !is AudioDevice.Speakerphone }
        }

        if (nextDevice != null) {
            audioSwitch.selectDevice(nextDevice)
        }
    }

    fun sendDigits(digits: String) {
        if (digits.isNotBlank()) {
            currentCall?.sendDigits(digits)
        }
    }

    fun shutdown() {
        currentCall?.disconnect()
        currentCall = null
        audioSwitch.stop()
        audioStarted = false
    }

    private fun ensureAudioStarted() {
        if (!audioStarted) {
            audioSwitch.start()
            audioStarted = true
        }
    }

    private fun emit(event: VoiceCallEvent) {
        mainHandler.post {
            eventHandler?.invoke(event)
        }
    }

    private fun isLikelyJwt(token: String): Boolean = token.split('.').size == 3

    private fun formatCallException(callException: CallException): String {
        return "${callException.errorCode}: ${callException.message ?: "Call failed."}"
    }
}
