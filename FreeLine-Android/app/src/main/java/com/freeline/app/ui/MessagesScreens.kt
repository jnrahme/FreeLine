package com.freeline.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.MarkEmailUnread
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.freeline.app.config.AdConfiguration
import com.freeline.app.messaging.ChatMessage
import com.freeline.app.messaging.ConversationSummary
import com.freeline.app.monetization.BannerAdCard
import com.freeline.app.monetization.SponsoredConversationAdCard
import com.freeline.app.monetization.UsageOverviewCard
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun MessagesTabScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(appState.currentNumber?.phoneNumber) {
        appState.loadConversations()
    }

    when {
        appState.isComposingMessage -> NewMessageScreen(
            appState = appState,
            onBack = { appState.dismissMessageComposer() },
            onSend = { recipient, body ->
                coroutineScope.launch {
                    val conversation = appState.sendMessage(recipient, body)
                    if (conversation != null) {
                        appState.dismissMessageComposer()
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
            onCompose = { appState.showMessageComposer() },
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
    val unreadCount = appState.conversations.sumOf { it.unreadCount }

    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            BannerAdCard(
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
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                contentPadding = PaddingValues(top = 20.dp, bottom = 120.dp),
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
                                    eyebrow = "Inbox",
                                    title = "Messages",
                                    subtitle = "Conversations for ${appState.currentNumber?.nationalFormat ?: "your FreeLine number"}.",
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FreeLinePill(
                                        text = "US only",
                                        icon = Icons.Rounded.Shield,
                                    )
                                    if (unreadCount > 0) {
                                        FreeLinePill(
                                            text = "$unreadCount unread",
                                            icon = Icons.Rounded.MarkEmailUnread,
                                            tint = MaterialTheme.colorScheme.secondary,
                                        )
                                    }
                                }
                            }
                            FreeLineHeroIcon(icon = Icons.Rounded.Sms)
                        }
                    }
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
                        FreeLineNoticeCard(
                            title = "No conversations yet",
                            message = "Start your first thread with the compose button or refresh to pull recent activity.",
                            icon = Icons.Rounded.Forum,
                            tone = MaterialTheme.colorScheme.freeLineSuccessTone(),
                        )
                    }
                    item {
                        FreeLineSecondaryButton(
                            onClick = onRefresh,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !appState.isLoading,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Refresh,
                                contentDescription = null,
                            )
                            Spacer(modifier = Modifier.size(10.dp))
                            Text("Refresh")
                        }
                    }
                } else {
                    itemsIndexed(
                        items = appState.conversations,
                        key = { _, conversation -> conversation.id },
                    ) { index, conversation ->
                        ConversationCard(
                            conversation = conversation,
                            onOpen = { onOpenConversation(conversation) },
                        )

                        if (appState.adsEnabled && (index + 1) % 5 == 0) {
                            Spacer(modifier = Modifier.height(4.dp))
                            SponsoredConversationAdCard(
                                onImpression = {
                                    coroutineScope.launch {
                                        appState.trackAdImpression(
                                            adType = "native",
                                            placement = "messages_inbox_native",
                                            adUnitId = AdConfiguration.NATIVE_UNIT_ID,
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

            FreeLinePrimaryButton(
                onClick = onCompose,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 98.dp)
                    .width(164.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Add,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text("Compose")
            }
        }
    }
}

@Composable
private fun ConversationCard(
    conversation: ConversationSummary,
    onOpen: () -> Unit,
) {
    FreeLineGlassCard(onClick = onOpen, padding = 18.dp) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            FreeLineHeroIcon(
                icon = Icons.Rounded.Forum,
                modifier = Modifier.size(64.dp),
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = conversation.displayNumber,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )

                    if (conversation.lastMessageAt != null) {
                        Text(
                            text = formatTimestamp(conversation.lastMessageAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Text(
                    text = conversation.lastMessagePreview ?: "No messages yet",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (conversation.lastMessageStatus != null) {
                        FreeLinePill(
                            text = conversation.lastMessageStatus.replaceFirstChar(Char::titlecase),
                            icon = Icons.Rounded.Send,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (conversation.unreadCount > 0) {
                        FreeLinePill(
                            text = minOf(conversation.unreadCount, 99).toString(),
                            icon = Icons.Rounded.MarkEmailUnread,
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        FreeLineGlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                FreeLineIconButton(
                    icon = Icons.Rounded.ArrowBack,
                    contentDescription = "Back",
                    onClick = onBack,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = conversation.displayNumber,
                        style = MaterialTheme.typography.titleLarge,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = "Live thread for your FreeLine number",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                FreeLineIconButton(
                    icon = Icons.Rounded.Refresh,
                    contentDescription = "Refresh",
                    onClick = onRefresh,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FreeLineActionPill(
                    text = "Report",
                    icon = Icons.Rounded.Flag,
                    onClick = onReport,
                )
                FreeLineActionPill(
                    text = "Block",
                    icon = Icons.Rounded.Block,
                    onClick = onBlock,
                )
            }
        }

        if (appState.currentConversation?.isOptedOut == true || conversation.isOptedOut) {
            FreeLineNoticeCard(
                title = "Outbound messaging blocked",
                message = "This contact opted out. You can still read the thread, but new sends stay disabled.",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                icon = Icons.Rounded.Block,
            )
        }

        LazyColumn(
            state = lazyListState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(top = 12.dp),
            contentPadding = PaddingValues(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(appState.currentMessages, key = { message -> message.id }) { message ->
                MessageBubble(message = message)
            }
        }

        FreeLineGlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 16.dp),
            padding = 16.dp,
        ) {
            FreeLineTextField(
                value = draft,
                onValueChange = { draft = it },
                label = "Message",
                leadingIcon = Icons.Rounded.Sms,
                minLines = 3,
            )
            FreeLinePrimaryButton(
                onClick = {
                    onSend(draft)
                    draft = ""
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = draft.isNotBlank() &&
                    !appState.isLoading &&
                    !(appState.currentConversation?.isOptedOut == true || conversation.isOptedOut),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Send,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text("Send")
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val shape = RoundedCornerShape(
        topStart = 24.dp,
        topEnd = 24.dp,
        bottomEnd = if (message.isOutgoing) 10.dp else 24.dp,
        bottomStart = if (message.isOutgoing) 24.dp else 10.dp,
    )

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
                    .clip(shape)
                    .background(
                        brush = if (message.isOutgoing) {
                            Brush.linearGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.84f),
                                ),
                            )
                        } else {
                            Brush.linearGradient(
                                colors = listOf(
                                    Color.White.copy(alpha = 0.82f),
                                    Color.White.copy(alpha = 0.54f),
                                ),
                            )
                        },
                        shape = shape,
                    )
                    .border(
                        width = 1.dp,
                        color = if (message.isOutgoing) {
                            Color.White.copy(alpha = 0.22f)
                        } else {
                            Color.White.copy(alpha = 0.68f)
                        },
                        shape = shape,
                    )
                    .padding(horizontal = 16.dp, vertical = 12.dp),
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
                modifier = Modifier.padding(top = 6.dp, start = 4.dp, end = 4.dp),
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        FreeLineGlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                FreeLineIconButton(
                    icon = Icons.Rounded.ArrowBack,
                    contentDescription = "Back",
                    onClick = onBack,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "New Message",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = "Send a personal 1:1 message from your FreeLine number.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                FreeLineHeroIcon(
                    icon = Icons.Rounded.Add,
                    modifier = Modifier.size(64.dp),
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 14.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                FreeLineGlassCard {
                    FreeLineTextField(
                        value = appState.composerRecipientDraft,
                        onValueChange = { appState.updateComposerRecipientDraft(it) },
                        label = "U.S. phone number",
                        leadingIcon = Icons.Rounded.Forum,
                    )

                    FreeLineTextField(
                        value = appState.composerBodyDraft,
                        onValueChange = { appState.updateComposerBodyDraft(it) },
                        label = "Message",
                        leadingIcon = Icons.Rounded.Sms,
                        minLines = 5,
                    )

                    FreeLinePrimaryButton(
                        onClick = { onSend(appState.composerRecipientDraft, appState.composerBodyDraft) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = appState.composerRecipientDraft.isNotBlank() &&
                            appState.composerBodyDraft.isNotBlank() &&
                            !appState.isLoading,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Send,
                            contentDescription = null,
                        )
                        Spacer(modifier = Modifier.size(10.dp))
                        Text("Send message")
                    }
                }
            }

            item {
                val allowance = appState.messageAllowance
                if (allowance != null) {
                    FreeLineGlassCard {
                        Text(
                            text = "Allowance",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FreeLinePill(
                                text = "${allowance.dailyRemaining} daily left",
                                icon = Icons.Rounded.MarkEmailUnread,
                            )
                            FreeLinePill(
                                text = "${allowance.monthlyRemaining} monthly left",
                                icon = Icons.Rounded.Shield,
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }
                }
            }

            if (appState.errorMessage != null) {
                item {
                    FreeLineNoticeCard(
                        title = "Message failed",
                        message = appState.errorMessage.orEmpty(),
                        icon = Icons.Rounded.Flag,
                    )
                }
            }
        }
    }
}

private fun formatTimestamp(iso8601: String): String =
    runCatching {
        OffsetDateTime.parse(iso8601).format(DateTimeFormatter.ofPattern("h:mm a"))
    }.getOrDefault(iso8601)
