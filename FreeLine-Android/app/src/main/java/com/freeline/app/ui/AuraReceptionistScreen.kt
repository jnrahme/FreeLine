package com.freeline.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MarkChatUnread
import androidx.compose.material.icons.rounded.PhoneForwarded
import androidx.compose.material.icons.rounded.QuestionAnswer
import androidx.compose.material.icons.rounded.RecordVoiceOver
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Voicemail
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun AuraReceptionistScreen(
    onClose: () -> Unit,
) {
    val transcript = remember { AuraDemoScript.deliveryDriver }
    var visibleTranscriptCount by remember { mutableIntStateOf(0) }
    var selectedAction by remember { mutableStateOf(AuraDemoAction.ReplyByText) }

    LaunchedEffect(transcript.size) {
        visibleTranscriptCount = 0
        transcript.indices.forEach { index ->
            delay(850)
            visibleTranscriptCount = index + 1
        }
    }

    FreeLineScreen {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color.White.copy(alpha = 0.60f))
                        .border(
                            width = 1.dp,
                            color = Color.White.copy(alpha = 0.76f),
                            shape = RoundedCornerShape(999.dp),
                        )
                        .clickable(onClick = onClose)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ArrowBack,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = "Calls",
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }

                Spacer(modifier = Modifier.weight(1f))

                FreeLinePill(
                    text = "Aura live",
                    icon = Icons.Rounded.AutoAwesome,
                )
            }

            FreeLineGlassCard {
                Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            FreeLineSectionTitle(
                                eyebrow = "AI Receptionist",
                                title = "Aura",
                                subtitle = "Screen unknown callers live, understand why they called, and decide what happens next before you answer.",
                            )
                            FreeLineGlassGroup {
                                FreeLinePill(
                                    text = "Unknown caller",
                                    icon = Icons.Rounded.PhoneForwarded,
                                    tint = MaterialTheme.colorScheme.tertiary,
                                )
                                FreeLinePill(
                                    text = "Low risk",
                                    icon = Icons.Rounded.Shield,
                                    tint = MaterialTheme.colorScheme.secondary,
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Box(
                            modifier = Modifier.weight(0.95f),
                            contentAlignment = Alignment.Center,
                        ) {
                            AuraOrb(
                                tone = selectedAction.tint,
                                isAnimating = visibleTranscriptCount < transcript.size,
                            )
                        }

                        Column(
                            modifier = Modifier.weight(1.05f),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            AuraSummaryRow(
                                title = "Name",
                                value = "Mike from FedEx",
                                tint = MaterialTheme.colorScheme.onSurface,
                            )
                            AuraSummaryRow(
                                title = "Reason",
                                value = "Delivery access",
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            AuraSummaryRow(
                                title = "Urgency",
                                value = "Medium",
                                tint = MaterialTheme.colorScheme.tertiary,
                            )
                            AuraSummaryRow(
                                title = "Recommended",
                                value = selectedAction.title,
                                tint = selectedAction.tint,
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        FreeLineStatStrip(
                            title = "Spam Confidence",
                            value = "14%",
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.weight(1f),
                        )
                        FreeLineStatStrip(
                            title = "Live Reply Time",
                            value = "< 2 sec",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            FreeLineGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "Live Transcript",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    FreeLinePill(
                        text = "$visibleTranscriptCount/${transcript.size} moments",
                        icon = Icons.Rounded.RecordVoiceOver,
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    transcript.forEachIndexed { index, entry ->
                        AnimatedVisibility(
                            visible = index < visibleTranscriptCount,
                            enter = fadeIn(animationSpec = tween(durationMillis = 220)) + slideInVertically(
                                animationSpec = tween(durationMillis = 280),
                                initialOffsetY = { it / 4 },
                            ),
                        ) {
                            AuraTranscriptCard(entry = entry)
                        }
                    }
                }
            }

            FreeLineGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = "Next move",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            text = selectedAction.supportingText,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    FreeLinePill(
                        text = selectedAction.shortLabel,
                        icon = selectedAction.icon,
                        tint = selectedAction.tint,
                    )
                }

                FreeLineGlassGroup {
                    AuraDemoAction.entries.forEach { action ->
                        AuraActionChip(
                            action = action,
                            selected = action == selectedAction,
                            onClick = {
                                selectedAction = action
                            },
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "Drafted follow-up",
                        style = MaterialTheme.typography.labelLarge.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                    Text(
                        text = selectedAction.replyPreview,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(22.dp))
                            .background(Color.White.copy(alpha = 0.62f))
                            .border(
                                width = 1.dp,
                                color = Color.White.copy(alpha = 0.76f),
                                shape = RoundedCornerShape(22.dp),
                            )
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    )
                }

                FreeLinePrimaryButton(
                    onClick = {
                        selectedAction = AuraDemoAction.ReplyByText
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AutoAwesome,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                    Text("Make Aura my unknown-caller default")
                }
            }
        }
    }
}

@Composable
private fun AuraOrb(
    tone: Color,
    isAnimating: Boolean,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "auraOrb")
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = if (isAnimating) 1300 else 2200,
                easing = LinearEasing,
            ),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "auraOrbPulse",
    )

    Box(
        modifier = Modifier.size(170.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(160.dp)
                .scale(pulse)
                .blur(18.dp)
                .background(
                    color = tone.copy(alpha = 0.14f),
                    shape = CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(132.dp)
                .scale((pulse + 0.02f).coerceAtMost(1.12f))
                .border(
                    width = 16.dp,
                    brush = Brush.linearGradient(
                        colors = listOf(
                            tone.copy(alpha = 0.20f),
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                        ),
                    ),
                    shape = CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(104.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            tone,
                            MaterialTheme.colorScheme.primary,
                        ),
                    ),
                    shape = CircleShape,
                )
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.30f),
                    shape = CircleShape,
                )
                .padding(26.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.RecordVoiceOver,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun AuraTranscriptCard(
    entry: AuraTranscriptEntry,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Color.White.copy(alpha = 0.60f))
            .border(
                width = 1.dp,
                color = Color.White.copy(alpha = 0.74f),
                shape = RoundedCornerShape(22.dp),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(entry.tint.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = entry.icon,
                contentDescription = null,
                tint = entry.tint,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = entry.speaker,
                style = MaterialTheme.typography.labelLarge.copy(color = entry.tint),
            )
            Text(
                text = entry.text,
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}

@Composable
private fun AuraActionChip(
    action: AuraDemoAction,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(
                if (selected) {
                    action.tint
                } else {
                    Color.White.copy(alpha = 0.58f)
                },
            )
            .border(
                width = 1.dp,
                color = if (selected) action.tint.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.72f),
                shape = RoundedCornerShape(20.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = action.icon,
            contentDescription = null,
            tint = if (selected) Color.White else action.tint,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = action.shortLabel,
            style = MaterialTheme.typography.labelLarge.copy(
                color = if (selected) Color.White else action.tint,
            ),
        )
    }
}

@Composable
private fun AuraSummaryRow(
    title: String,
    value: String,
    tint: Color,
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge.copy(
                fontWeight = FontWeight.SemiBold,
                color = tint,
            ),
        )
    }
}

private enum class AuraDemoAction(
    val title: String,
    val shortLabel: String,
    val supportingText: String,
    val replyPreview: String,
    val icon: ImageVector,
    val tint: Color,
) {
    TakeOver(
        title = "Take over now",
        shortLabel = "Take over",
        supportingText = "Jump into the live call yourself once Aura confirms who is calling.",
        replyPreview = "Join the call live now and keep the screening summary pinned beside the in-call controls.",
        icon = Icons.Rounded.Call,
        tint = Color(0xFF1D5BDB),
    ),
    AskOneMore(
        title = "Ask one more question",
        shortLabel = "Ask more",
        supportingText = "Let Aura clarify the exact reason for the call before you commit.",
        replyPreview = "Aura follow-up: “Can you confirm the exact entrance and how long you’ll be there?”",
        icon = Icons.Rounded.QuestionAnswer,
        tint = Color(0xFFF2A33C),
    ),
    ReplyByText(
        title = "Reply by text",
        shortLabel = "Text instead",
        supportingText = "Keep control and answer with a drafted text while the caller is still at the door.",
        replyPreview = "I’m on my way down now. If I miss you, please leave it with the front desk.",
        icon = Icons.Rounded.MarkChatUnread,
        tint = Color(0xFF3DBEA8),
    ),
    Voicemail(
        title = "Send to voicemail",
        shortLabel = "Voicemail",
        supportingText = "Move the call aside without losing context or transcript history.",
        replyPreview = "Send this caller to voicemail and keep the recap card pinned in Recents.",
        icon = Icons.Rounded.Voicemail,
        tint = Color(0xFFE97D64),
    ),
}

private data class AuraTranscriptEntry(
    val speaker: String,
    val text: String,
    val icon: ImageVector,
    val tint: Color,
)

private object AuraDemoScript {
    val deliveryDriver = listOf(
        AuraTranscriptEntry(
            speaker = "Aura",
            text = "Hi, this line uses call screening. Please say your name and why you're calling.",
            icon = Icons.Rounded.AutoAwesome,
            tint = Color(0xFF1D5BDB),
        ),
        AuraTranscriptEntry(
            speaker = "Caller",
            text = "Hey, this is Mike from FedEx. I'm downstairs and need the gate code for your delivery.",
            icon = Icons.Rounded.PhoneForwarded,
            tint = Color(0xFFF2A33C),
        ),
        AuraTranscriptEntry(
            speaker = "Aura",
            text = "Got it. Are you at the building now, and should I let them know you're coming down?",
            icon = Icons.Rounded.QuestionAnswer,
            tint = Color(0xFF1D5BDB),
        ),
        AuraTranscriptEntry(
            speaker = "Caller",
            text = "Yes, I'm by the loading entrance right now.",
            icon = Icons.Rounded.LocationOn,
            tint = Color(0xFF3DBEA8),
        ),
    )
}
