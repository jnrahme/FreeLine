package com.freeline.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.freeline.app.ui.FreeLineApp
import com.freeline.app.ui.Phase5ProofScenario

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FreeLineApp(
                proofScenario = Phase5ProofScenario.fromIntent(intent),
            )
        }
    }
}
