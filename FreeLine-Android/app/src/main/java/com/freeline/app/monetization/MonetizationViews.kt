package com.freeline.app.monetization

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.freeline.app.config.AdConfiguration
import kotlinx.coroutines.delay

@Composable
fun UsageOverviewCard(
    summary: UsageSummary,
    remainingRewardClaims: Int,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = if (summary.shouldWarn) {
                MaterialTheme.colorScheme.tertiaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerHigh
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Usage Overview",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.weight(1f))
                if (remainingRewardClaims > 0) {
                    Text(
                        text = "$remainingRewardClaims ad unlocks left",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(summary.messagesLabel, style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                progress = { summary.messageProgress },
                modifier = Modifier.fillMaxWidth(),
                color = if (summary.shouldWarn) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
            )

            Text(summary.callsLabel, style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                progress = { summary.callProgress },
                modifier = Modifier.fillMaxWidth(),
                color = if (summary.shouldWarn) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary,
            )

            if (summary.shouldWarn) {
                Text(
                    text = "You are close to your beta cap.",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
            }
        }
    }
}

@Composable
fun DevBannerAdCard(
    placement: String,
    isHidden: Boolean,
    onImpression: () -> Unit,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (isHidden) {
        return
    }

    var hasTrackedImpression by remember(placement) { mutableStateOf(false) }

    LaunchedEffect(placement) {
        if (!hasTrackedImpression) {
            hasTrackedImpression = true
            onImpression()
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        onClick = onTap,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Sponsored",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = AdConfiguration.BANNER_UNIT_ID,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            Text(
                text = "FreeLine beta is ad-supported. Tap to preview the banner action for $placement.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}

@Composable
fun SponsoredConversationCard(
    onImpression: () -> Unit,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var hasTrackedImpression by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (!hasTrackedImpression) {
            hasTrackedImpression = true
            onImpression()
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        onClick = onTap,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Sponsored",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Text(
                        text = "Native",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Text(
                    text = "Unlock more reach with the same clean second-line setup FreeLine uses internally.",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Text(
                    text = "Placement: inbox_native • ${AdConfiguration.BANNER_UNIT_ID}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(MaterialTheme.colorScheme.tertiary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Ad",
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onTertiary,
                )
            }
        }
    }
}

@Composable
fun UsageCapDialog(
    prompt: UsagePromptState,
    canUseRewardedAds: Boolean,
    onDismiss: () -> Unit,
    onWatchAd: () -> Unit,
    onUpgrade: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Usage limit reached") },
        text = { Text(prompt.message) },
        confirmButton = {
            Button(onClick = onUpgrade) {
                Text("Upgrade")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canUseRewardedAds) {
                    OutlinedButton(onClick = onWatchAd) {
                        Text(prompt.rewardType.buttonTitle)
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Not now")
                }
            }
        },
    )
}

@Composable
fun InterstitialAdDialog(
    request: InterstitialAdRequest,
    onDismiss: () -> Unit,
    onImpression: () -> Unit,
    onTap: () -> Unit,
) {
    var hasTrackedImpression by remember(request.placement) { mutableStateOf(false) }

    LaunchedEffect(request.placement) {
        if (!hasTrackedImpression) {
            hasTrackedImpression = true
            onImpression()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                Color(0xFFE57C22),
                                Color(0xFFF1C95B),
                            ),
                        ),
                    ),
            ) {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(28.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Sponsored",
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            text = "Interstitial",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White,
                        )
                    }
                    Text(
                        text = "FreeLine stays free because short, well-timed ad breaks cover part of the line cost.",
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White,
                    )
                    Text(
                        text = "Placement: ${request.placement}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.9f),
                    )
                    Button(onClick = onTap) {
                        Text("Preview sponsor action")
                    }
                    OutlinedButton(onClick = onDismiss) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

@Composable
fun RewardedAdDialog(
    request: RewardedAdRequest,
    isClaiming: Boolean,
    onAbandon: () -> Unit,
    onComplete: () -> Unit,
    onImpression: () -> Unit,
) {
    var hasTrackedImpression by remember(request.placement) { mutableStateOf(false) }
    var secondsRemaining by remember(request.placement) { mutableIntStateOf(5) }

    LaunchedEffect(request.placement) {
        if (!hasTrackedImpression) {
            hasTrackedImpression = true
            onImpression()
        }
        while (secondsRemaining > 0) {
            delay(1000)
            secondsRemaining -= 1
        }
    }

    Dialog(
        onDismissRequest = onAbandon,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                Color(0xFF0D47A1),
                                Color(0xFF29B6F6),
                            ),
                        ),
                    ),
            ) {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(28.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Rewarded Ad",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White.copy(alpha = 0.9f),
                    )
                    Text(
                        text = request.rewardType.rewardDescription,
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                    )
                    Text(
                        text = "Stay on this screen for ${secondsRemaining}s to unlock the reward.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.9f),
                    )
                    LinearProgressIndicator(
                        progress = { (5 - secondsRemaining) / 5f },
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.25f),
                    )
                    Button(
                        onClick = onComplete,
                        enabled = secondsRemaining == 0 && !isClaiming,
                    ) {
                        Text(
                            if (secondsRemaining == 0) {
                                "Claim ${request.rewardType.rewardDescription}"
                            } else {
                                "Keep watching"
                            },
                        )
                    }
                    OutlinedButton(onClick = onAbandon, enabled = !isClaiming) {
                        Text("Not now")
                    }
                }
            }
        }
    }
}
