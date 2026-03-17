package com.freeline.app.calls

import android.net.Uri
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

class FreeLineConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle,
        request: ConnectionRequest,
    ): Connection {
        val callerNumber = request.extras?.getString(IncomingCallContract.EXTRA_CALLER_NUMBER).orEmpty()
        val providerCallId = request.extras?.getString(IncomingCallContract.EXTRA_PROVIDER_CALL_ID).orEmpty()

        return FreeLineIncomingConnection(
            callerNumber = callerNumber,
            providerCallId = providerCallId,
        ).apply {
            setAddress(Uri.fromParts(PhoneAccount.SCHEME_TEL, callerNumber, null), TelecomManager.PRESENTATION_ALLOWED)
            setCallerDisplayName(callerNumber.formatCallPhoneNumber(), TelecomManager.PRESENTATION_ALLOWED)
            setInitializing()
            setRinging()
        }
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle,
        request: ConnectionRequest,
    ) {
        super.onCreateIncomingConnectionFailed(connectionManagerPhoneAccount, request)
    }

    companion object {
        fun extras(
            callerNumber: String,
            providerCallId: String,
        ): Bundle {
            return Bundle().apply {
                putString(IncomingCallContract.EXTRA_CALLER_NUMBER, callerNumber)
                putString(IncomingCallContract.EXTRA_PROVIDER_CALL_ID, providerCallId)
            }
        }
    }
}

private class FreeLineIncomingConnection(
    private val callerNumber: String,
    private val providerCallId: String,
) : Connection() {
    override fun onAnswer() {
        setActive()
    }

    override fun onReject() {
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
    }

    override fun onDisconnect() {
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
    }

    override fun onAbort() {
        setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
        destroy()
    }
}
