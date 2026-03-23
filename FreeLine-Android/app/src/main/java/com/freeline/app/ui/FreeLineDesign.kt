package com.freeline.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions

private object FreeLinePalette {
    val Accent = Color(0xFF216BF7)
    val AccentDeep = Color(0xFF153DBD)
    val Mint = Color(0xFF3EC2B8)
    val Coral = Color(0xFFF58B73)
    val Warning = Color(0xFFF6A44D)
    val BackgroundTop = Color(0xFFF3F8FF)
    val BackgroundMid = Color(0xFFF5F6FB)
    val BackgroundBottom = Color(0xFFF8F1EA)
    val TextPrimary = Color(0xFF17243A)
    val TextSecondary = Color(0xFF55617A)
    val Stroke = Color.White.copy(alpha = 0.70f)
    val GlassTop = Color.White.copy(alpha = 0.90f)
    val GlassBottom = Color.White.copy(alpha = 0.60f)
    val GlassMuted = Color.White.copy(alpha = 0.40f)
    val Shadow = Color(0x1F000000)
}

private val FreeLineTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 42.sp,
        lineHeight = 46.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        lineHeight = 38.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 32.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 28.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 24.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 22.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 18.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 23.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 21.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        color = FreeLinePalette.TextSecondary,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        color = FreeLinePalette.TextPrimary,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        color = FreeLinePalette.TextSecondary,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        color = FreeLinePalette.TextSecondary,
    ),
)

private val FreeLineShapes = Shapes(
    extraSmall = RoundedCornerShape(16.dp),
    small = RoundedCornerShape(20.dp),
    medium = RoundedCornerShape(24.dp),
    large = RoundedCornerShape(30.dp),
    extraLarge = RoundedCornerShape(36.dp),
)

private val FreeLineColorScheme = lightColorScheme(
    primary = FreeLinePalette.Accent,
    onPrimary = Color.White,
    primaryContainer = FreeLinePalette.Accent.copy(alpha = 0.16f),
    onPrimaryContainer = FreeLinePalette.AccentDeep,
    secondary = FreeLinePalette.Mint,
    onSecondary = Color.White,
    secondaryContainer = FreeLinePalette.Mint.copy(alpha = 0.20f),
    onSecondaryContainer = FreeLinePalette.TextPrimary,
    tertiary = FreeLinePalette.Warning,
    onTertiary = Color.White,
    tertiaryContainer = FreeLinePalette.Warning.copy(alpha = 0.18f),
    onTertiaryContainer = FreeLinePalette.TextPrimary,
    background = FreeLinePalette.BackgroundTop,
    onBackground = FreeLinePalette.TextPrimary,
    surface = FreeLinePalette.GlassTop,
    onSurface = FreeLinePalette.TextPrimary,
    surfaceVariant = FreeLinePalette.GlassMuted,
    onSurfaceVariant = FreeLinePalette.TextSecondary,
    surfaceContainer = Color.White.copy(alpha = 0.60f),
    surfaceContainerHigh = Color.White.copy(alpha = 0.72f),
    surfaceContainerHighest = Color.White.copy(alpha = 0.80f),
    error = FreeLinePalette.Coral,
    onError = Color.White,
    errorContainer = FreeLinePalette.Coral.copy(alpha = 0.18f),
    onErrorContainer = FreeLinePalette.TextPrimary,
    outline = FreeLinePalette.Stroke,
    outlineVariant = FreeLinePalette.Stroke.copy(alpha = 0.68f),
    scrim = Color(0x66000000),
)

@Composable
fun FreeLineTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FreeLineColorScheme,
        typography = FreeLineTypography,
        shapes = FreeLineShapes,
        content = content,
    )
}

@Composable
fun FreeLineScreen(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        FreeLinePalette.BackgroundTop,
                        FreeLinePalette.BackgroundMid,
                        FreeLinePalette.BackgroundBottom,
                    ),
                ),
            ),
    ) {
        FreeLineAtmosphere()
        content()
    }
}

@Composable
fun FreeLineAtmosphere(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .size(320.dp)
                .offset(x = 180.dp, y = (-110).dp)
                .blur(44.dp)
                .background(
                    color = FreeLinePalette.Accent.copy(alpha = 0.15f),
                    shape = CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(260.dp)
                .offset(x = (-70).dp, y = 44.dp)
                .blur(36.dp)
                .background(
                    color = FreeLinePalette.Mint.copy(alpha = 0.15f),
                    shape = CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(300.dp)
                .offset(x = (-120).dp, y = 560.dp)
                .blur(40.dp)
                .background(
                    color = FreeLinePalette.Coral.copy(alpha = 0.12f),
                    shape = CircleShape,
                ),
        )
    }
}

@Composable
fun FreeLineSectionTitle(
    title: String,
    subtitle: String? = null,
    eyebrow: String? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (eyebrow != null) {
            Text(
                text = eyebrow.uppercase(),
                style = MaterialTheme.typography.labelMedium.copy(
                    letterSpacing = 1.4.sp,
                    color = FreeLinePalette.AccentDeep.copy(alpha = 0.84f),
                ),
            )
        }

        Text(
            text = title,
            style = MaterialTheme.typography.headlineLarge,
        )

        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

@Composable
fun FreeLineHeroIcon(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    tint: Color = Color.White,
) {
    Box(
        modifier = modifier.size(90.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(90.dp)
                .blur(14.dp)
                .background(
                    color = FreeLinePalette.Accent.copy(alpha = 0.18f),
                    shape = CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            FreeLinePalette.Accent,
                            FreeLinePalette.AccentDeep,
                        ),
                    ),
                    shape = CircleShape,
                )
                .shadow(
                    elevation = 18.dp,
                    shape = CircleShape,
                    ambientColor = FreeLinePalette.Accent.copy(alpha = 0.32f),
                    spotColor = FreeLinePalette.Accent.copy(alpha = 0.28f),
                )
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.30f),
                    shape = CircleShape,
                )
                .clip(CircleShape)
                .background(Color.Transparent)
                .padding(19.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
fun FreeLinePill(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    tint: Color = FreeLinePalette.AccentDeep,
    backgroundColor: Color = Color.White.copy(alpha = 0.56f),
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(backgroundColor)
            .border(
                width = 1.dp,
                color = Color.White.copy(alpha = 0.66f),
                shape = RoundedCornerShape(999.dp),
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(14.dp),
            )
        }

        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge.copy(color = tint),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FreeLineGlassGroup(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    FlowRow(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(Color.White.copy(alpha = 0.34f))
            .border(
                width = 1.dp,
                color = Color.White.copy(alpha = 0.56f),
                shape = RoundedCornerShape(24.dp),
            )
            .padding(horizontal = 10.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = { content() },
    )
}

@Composable
fun FreeLineGlassCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: Dp = 22.dp,
    spacing: Dp = 14.dp,
    tone: Color = FreeLinePalette.GlassBottom,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(28.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && onClick != null) 0.992f else 1f,
        label = "glassCardScale",
    )
    val clickableModifier = if (onClick != null) {
        Modifier.clickable(
            interactionSource = interactionSource,
            indication = null,
            onClick = onClick,
        )
    } else {
        Modifier
    }

    Column(
        modifier = modifier
            .scale(scale)
            .shadow(
                elevation = 22.dp,
                shape = shape,
                ambientColor = FreeLinePalette.Accent.copy(alpha = 0.12f),
                spotColor = FreeLinePalette.Shadow,
            )
            .clip(shape)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        FreeLinePalette.GlassTop,
                        tone,
                    ),
                ),
                shape = shape,
            )
            .border(
                width = 1.dp,
                color = FreeLinePalette.Stroke,
                shape = shape,
            )
            .then(clickableModifier)
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

@Composable
fun FreeLineNoticeCard(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    tone: Color = Color.Unspecified,
) {
    val resolvedTone = if (tone == Color.Unspecified) {
        MaterialTheme.colorScheme.freeLineDangerTone()
    } else {
        tone
    }

    FreeLineGlassCard(
        modifier = modifier,
        tone = resolvedTone,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }

            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
            )
        }

        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
    }
}

@Composable
fun FreeLinePrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && enabled) 0.988f else 1f,
        label = "primaryButtonScale",
    )

    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        modifier = modifier
            .scale(scale)
            .shadow(
                elevation = 14.dp,
                shape = shape,
                ambientColor = FreeLinePalette.Accent.copy(alpha = 0.18f),
                spotColor = FreeLinePalette.Accent.copy(alpha = 0.22f),
            ),
        shape = shape,
        contentPadding = PaddingValues(0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = Color.White.copy(alpha = 0.66f),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            FreeLinePalette.Accent,
                            FreeLinePalette.AccentDeep,
                        ),
                    ),
                    shape = shape,
                )
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.26f),
                    shape = shape,
                )
                .padding(horizontal = 18.dp, vertical = 15.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

@Composable
fun FreeLineSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && enabled) 0.992f else 1f,
        label = "secondaryButtonScale",
    )

    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        modifier = modifier.scale(scale),
        shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = FreeLinePalette.TextPrimary,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = FreeLinePalette.TextSecondary.copy(alpha = 0.7f),
        ),
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    color = Color.White.copy(alpha = if (enabled) 0.56f else 0.28f),
                    shape = shape,
                )
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = if (enabled) 0.70f else 0.34f),
                    shape = shape,
                )
                .padding(horizontal = 18.dp, vertical = 15.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

@Composable
fun FreeLineActionPill(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
) {
    val shape = RoundedCornerShape(18.dp)
    val tint = if (selected) {
        FreeLinePalette.AccentDeep
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = shape,
        color = if (selected) {
            FreeLinePalette.Accent.copy(alpha = 0.14f)
        } else {
            Color.White.copy(alpha = 0.42f)
        },
        border = BorderStroke(
            width = 1.dp,
            color = if (selected) {
                FreeLinePalette.Accent.copy(alpha = 0.30f)
            } else {
                FreeLinePalette.Stroke
            },
        ),
        contentColor = tint,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
fun FreeLineIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = CircleShape,
        color = Color.White.copy(alpha = 0.56f),
        border = BorderStroke(1.dp, FreeLinePalette.Stroke),
        shadowElevation = 0.dp,
        tonalElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
fun FreeLineTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    enabled: Boolean = true,
    minLines: Int = 1,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        minLines = minLines,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        label = {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
            )
        },
        leadingIcon = leadingIcon?.let { icon ->
            {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        },
        shape = RoundedCornerShape(20.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = MaterialTheme.colorScheme.onSurface,
            unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
            focusedContainerColor = Color.White.copy(alpha = 0.50f),
            unfocusedContainerColor = Color.White.copy(alpha = 0.38f),
            disabledContainerColor = Color.White.copy(alpha = 0.20f),
            focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.44f),
            unfocusedBorderColor = Color.White.copy(alpha = 0.68f),
            disabledBorderColor = Color.White.copy(alpha = 0.36f),
            focusedLabelColor = MaterialTheme.colorScheme.primary,
            unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
            cursorColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

@Composable
fun FreeLineStatStrip(
    title: String,
    value: String,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.1.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge.copy(color = tint),
        )
    }
}

@Composable
fun FreeLineDetailRow(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    monospaced: Boolean = false,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = if (monospaced) FontFamily.Monospace else FontFamily.SansSerif,
                color = MaterialTheme.colorScheme.onSurface,
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
fun FreeLineTabBar(
    tabs: List<AppTab>,
    selectedTab: AppTab,
    onSelect: (AppTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val barShape = RoundedCornerShape(30.dp)

    Box(
        modifier = modifier
            .padding(horizontal = 18.dp, vertical = 10.dp)
            .shadow(
                elevation = 18.dp,
                shape = barShape,
                ambientColor = FreeLinePalette.Accent.copy(alpha = 0.10f),
                spotColor = FreeLinePalette.Shadow,
            )
            .clip(barShape)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.86f),
                        Color.White.copy(alpha = 0.64f),
                    ),
                ),
                shape = barShape,
            )
            .border(1.dp, FreeLinePalette.Stroke, barShape),
    ) {
        NavigationBar(
            containerColor = Color.Transparent,
            tonalElevation = 0.dp,
        ) {
            tabs.forEach { tab ->
                NavigationBarItem(
                    selected = selectedTab == tab,
                    onClick = { onSelect(tab) },
                    icon = {
                        Icon(
                            imageVector = if (selectedTab == tab) tab.selectedIcon else tab.icon,
                            contentDescription = tab.label,
                        )
                    },
                    label = { Text(tab.label) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = FreeLinePalette.AccentDeep,
                        selectedTextColor = FreeLinePalette.AccentDeep,
                        indicatorColor = FreeLinePalette.Accent.copy(alpha = 0.14f),
                        unselectedIconColor = FreeLinePalette.TextSecondary,
                        unselectedTextColor = FreeLinePalette.TextSecondary,
                    ),
                )
            }
        }
    }
}

fun ColorScheme.freeLineDangerTone(): Color = error.copy(alpha = 0.20f)

fun ColorScheme.freeLineSuccessTone(): Color = secondary.copy(alpha = 0.16f)
