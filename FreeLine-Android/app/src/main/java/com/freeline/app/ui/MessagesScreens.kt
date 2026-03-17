package com.freeline.app.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.freeline.app.config.AdConfiguration
import com.freeline.app.messaging.ChatMessage
import com.freeline.app.messaging.ConversationSummary
import com.freeline.app.monetization.DevBannerAdCard
import com.freeline.app.monetization.SponsoredConversationCard
import com.freeline.app.monetization.UsageOverviewCard
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun MessagesTabScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    var isComposing by remember { mutableStateOf(false) }

    LaunchedEffect(appState.currentNumber?.phoneNumber) {
        appState.loadConversations()
    }

    when {
        isComposing -> NewMessageScreen(
            appState = appState,
            onBack = { isComposing = false },
            onSend = { recipient, body ->
                coroutineScope.launch {
                    val conversation = appState.sendMessage(recipient, body)
                    if (conversation != null) {
                        isComposing = false
                    }
                }
            },
        )
        appState.currentConversation != null -> ConversationThreadScreen(
            appState = appState,
            conversation = appState.currentConversation!!,
            onBack = { appState.clearCurrentConversation() },
            onBlock = {
                coroutineScope.launch {
                    if (appState.blockCurrentConversation()) {
                        appState.clearCurrentConversation()
                    }
                }
            },
            onRefresh = {
                coroutineScope.launch {
                    appState.loadCurrentConversationMessages()
                }
            },
            onReport = {
                coroutineScope.launch {
                    appState.reportCurrentConversation()
                }
            },
            onSend = { body ->
                coroutineScope.launch {
                    appState.sendMessage(appState.currentConversation!!.participantNumber, body)
                }
            },
        )
        else -> ConversationsListScreen(
            appState = appState,
            onCompose = { isComposing = true },
            onOpenConversation = { conversation ->
                coroutineScope.launch {
                    appState.openConversation(conversation)
                }
            },
            onRefresh = {
                coroutineScope.launch {
                    appState.loadConversations()
                }
            },
        )
    }
}

@Composable
private fun ConversationsListScreen(
    appState: FreeLineAppState,
    onCompose: () -> Unit,
    onOpenConversation: (ConversationSummary) -> Unit,
    onRefresh: () -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = onCompose) {
                Text("+", style = MaterialTheme.typography.headlineMedium)
            }
        },
        bottomBar = {
            DevBannerAdCard(
                placement = "messages_bottom_banner",
                isHidden = !appState.adsEnabled,
                onImpression = {
                    coroutineScope.launch {
                        appState.trackAdImpression(
                            adType = "banner",
                            placement = "messages_bottom_banner",
                            adUnitId = AdConfiguration.BANNER_UNIT_ID,
                        )
                    }
                },
                onTap = {
                    coroutineScope.launch {
                        appState.trackAdClick(
                            adType = "banner",
                            placement = "messages_bottom_banner",
                        )
                    }
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
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
                Text("Messages", style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "Inbox for ${appState.currentNumber?.nationalFormat ?: "your FreeLine"}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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

            if (appState.conversations.isEmpty()) {
                item {
                    Card {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text("No conversations yet", style = MaterialTheme.typography.titleMedium)
                            Text("Start your first thread with the compose button.")
                            Button(onClick = onRefresh, enabled = !appState.isLoading) {
                                Text("Refresh")
                            }
                        }
                    }
                }
            } else {
                items(appState.conversations.size, key = { index -> appState.conversations[index].id }) { index ->
                    val conversation = appState.conversations[index]
                    ConversationCard(
                        conversation = conversation,
                        onOpen = { onOpenConversation(conversation) },
                    )

                    if (appState.adsEnabled && (index + 1) % 5 == 0) {
                        SponsoredConversationCard(
                            onImpression = {
                                coroutineScope.launch {
                                    appState.trackAdImpression(
                                        adType = "native",
                                        placement = "messages_inbox_native",
                                        adUnitId = AdConfiguration.BANNER_UNIT_ID,
                                    )
                                }
                            },
                            onTap = {
                                coroutineScope.launch {
                                    appState.trackAdClick(
                                        adType = "native",
                                        placement = "messages_inbox_native",
                                    )
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationCard(
    conversation: ConversationSummary,
    onOpen: () -> Unit,
) {
    Card(onClick = onOpen) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = conversation.displayNumber,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )

                if (conversation.unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .background(
                                color = MaterialTheme.colorScheme.primary,
                                shape = CircleShape,
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = minOf(conversation.unreadCount, 99).toString(),
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    Spacer(modifier = Modifier.size(8.dp))
                }

                val lastMessageAt = conversation.lastMessageAt
                if (lastMessageAt != null) {
                    Text(
                        text = formatTimestamp(lastMessageAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(
                text = conversation.lastMessagePreview ?: "No messages yet",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (conversation.lastMessageStatus != null) {
                Text(
                    text = conversation.lastMessageStatus.replaceFirstChar(Char::titlecase),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ConversationThreadScreen(
    appState: FreeLineAppState,
    conversation: ConversationSummary,
    onBack: () -> Unit,
    onBlock: () -> Unit,
    onRefresh: () -> Unit,
    onReport: () -> Unit,
    onSend: (String) -> Unit,
) {
    val lazyListState = rememberLazyListState()
    var draft by remember { mutableStateOf("") }

    LaunchedEffect(conversation.id) {
        appState.openConversation(conversation)
    }

    LaunchedEffect(appState.currentMessages.size) {
        val lastIndex = appState.currentMessages.lastIndex
        if (lastIndex >= 0) {
            lazyListState.animateScrollToItem(lastIndex)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) {
                Text("Back")
            }
            Text(
                text = conversation.displayNumber,
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRefresh) {
                Text("Refresh")
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
        ) {
            TextButton(onClick = onReport) {
                Text("Report")
            }
            TextButton(onClick = onBlock) {
                Text("Block")
            }
        }

        if (appState.currentConversation?.isOptedOut == true || conversation.isOptedOut) {
            Text(
                text = "This contact opted out. Outbound messaging is disabled.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        LazyColumn(
            state = lazyListState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(appState.currentMessages, key = { it.id }) { message ->
                MessageBubble(message = message)
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                label = { Text("Message") },
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = {
                    onSend(draft)
                    draft = ""
                },
                enabled = draft.isNotBlank() &&
                    !appState.isLoading &&
                    !(appState.currentConversation?.isOptedOut == true || conversation.isOptedOut),
            ) {
                Text("Send")
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isOutgoing) {
            Arrangement.End
        } else {
            Arrangement.Start
        },
    ) {
        Column(
            horizontalAlignment = if (message.isOutgoing) Alignment.End else Alignment.Start,
        ) {
            Box(
                modifier = Modifier
                    .background(
                        color = if (message.isOutgoing) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        shape = RoundedCornerShape(18.dp),
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Text(
                    text = message.body,
                    color = if (message.isOutgoing) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
            }

            Text(
                text = "${message.status.replaceFirstChar(Char::titlecase)} • ${formatTimestamp(message.createdAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun NewMessageScreen(
    appState: FreeLineAppState,
    onBack: () -> Unit,
    onSend: (String, String) -> Unit,
) {
    var recipient by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) {
                Text("Back")
            }
            Text(
                text = "New Message",
                style = MaterialTheme.typography.headlineSmall,
            )
        }

        OutlinedTextField(
            value = recipient,
            onValueChange = { recipient = it },
            label = { Text("U.S. phone number") },
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = body,
            onValueChange = { body = it },
            label = { Text("Message") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 4,
        )

        val allowance = appState.messageAllowance
        if (allowance != null) {
            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("Allowance", style = MaterialTheme.typography.titleSmall)
                    Text("${allowance.dailyRemaining} daily texts remaining")
                    Text("${allowance.monthlyRemaining} monthly texts remaining")
                }
            }
        }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onSend(recipient, body) },
            enabled = recipient.isNotBlank() && body.isNotBlank() && !appState.isLoading,
        ) {
            Text("Send message")
        }
    }
}

private fun formatTimestamp(iso8601: String): String =
    runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("h:mm a"))
    }.getOrDefault(iso8601)
