package com.freeline.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.freeline.app.ui.FreeLineApp
import com.freeline.app.ui.FreeLineTheme
import com.freeline.app.ui.MessageLaunchRoute
import com.freeline.app.ui.Phase5ProofScenario

class MainActivity : ComponentActivity() {
    private var proofScenario by mutableStateOf<Phase5ProofScenario?>(null)
    private var launchRoute by mutableStateOf<MessageLaunchRoute?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        updateLaunchState(intent)
        enableEdgeToEdge()
        setContent {
            FreeLineTheme {
                FreeLineApp(
                    proofScenario = proofScenario,
                    launchRoute = launchRoute,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        updateLaunchState(intent)
    }

    private fun updateLaunchState(intent: Intent?) {
        Phase5ProofScenario.fromIntent(intent)?.let { proofScenario = it }
        launchRoute = MessageLaunchRoute.fromIntent(intent)
    }
}
