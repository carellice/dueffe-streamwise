package it.dueffe.streamwise

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import kotlin.math.roundToInt
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Design tokens: slate surfaces with a deep cinema-red accent gradient. */
internal object Sw {
    val Background = Color(0xFF0A0B10)
    val Surface = Color(0xFF14161E)
    val Raised = Color(0xFF1D2029)
    val Outline = Color(0xFF2C303C)
    val Ink = Color(0xFFF7F5F3)
    val Muted = Color(0xFFA4A8B5)
    val Red = Color(0xFFD7142B)
    val Coral = Color(0xFFFF4B45)
    val Accent = Color(0xFFFF5964)
    val Amber = Color(0xFFFFC24D)
    val Blue = Color(0xFF4C8DFF)
    val Brand = Brush.linearGradient(listOf(Red, Coral))
    val Emphasized = CubicBezierEasing(.2f, 0f, 0f, 1f)
    val Decelerate = CubicBezierEasing(.05f, .7f, .1f, 1f)
}

internal fun Modifier.brandGlow(shape: Shape, elevation: Dp = 10.dp): Modifier =
    shadow(elevation, shape, ambientColor = Sw.Red.copy(alpha = .6f), spotColor = Sw.Coral.copy(alpha = .7f))
        .background(Sw.Brand, shape)
        .border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = .32f), Color.White.copy(alpha = .04f))), shape)

/** Translucent slate surface with a hairline highlight on the top edge. */
internal fun Modifier.glass(shape: Shape, alpha: Float = .78f): Modifier =
    clip(shape)
        .background(Sw.Surface.copy(alpha = alpha))
        .border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = .16f), Color.White.copy(alpha = .03f))), shape)

@Composable
internal fun Modifier.pressScale(interaction: InteractionSource, pressed: Float = .95f): Modifier {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (isPressed) pressed else 1f,
        spring(dampingRatio = .45f, stiffness = 650f),
        label = "press-scale"
    )
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

/** Fades and lifts content the first time it appears; the flag survives scrolling in lazy lists. */
@Composable
internal fun Modifier.reveal(delayMillis: Int = 0, distance: Dp = 36.dp): Modifier {
    var shown by rememberSaveable { mutableStateOf(false) }
    val progress = remember { Animatable(if (shown) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!shown) {
            kotlinx.coroutines.delay(delayMillis.toLong())
            progress.animateTo(1f, tween(560, easing = Sw.Decelerate))
            shown = true
        }
    }
    return graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * distance.toPx()
    }
}

/** Slowly drifting ember glows behind the app content. Drawn in its own layer so it never recomposes. */
@Composable
internal fun AuroraBackground(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "aurora")
    val phase by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(16000, easing = LinearEasing), RepeatMode.Reverse), label = "aurora-phase")
    Canvas(modifier.fillMaxSize().graphicsLayer()) {
        drawRect(Sw.Background)
        val w = size.width
        val h = size.height
        val first = Offset(w * (.05f + .45f * phase), h * (.02f + .08f * phase))
        drawCircle(Brush.radialGradient(listOf(Sw.Red.copy(alpha = .22f), Color.Transparent), first, w * .85f), w * .85f, first)
        val second = Offset(w * (.95f - .35f * phase), h * (.18f + .12f * phase))
        drawCircle(Brush.radialGradient(listOf(Sw.Coral.copy(alpha = .14f), Color.Transparent), second, w * .7f), w * .7f, second)
        val third = Offset(w * (.2f + .5f * phase), h * (.85f - .1f * phase))
        drawCircle(Brush.radialGradient(listOf(Sw.Blue.copy(alpha = .08f), Color.Transparent), third, w * .9f), w * .9f, third)
    }
}

/** Diagonal light sweep, used to make gradient call-to-action cards feel alive. */
@Composable
internal fun Modifier.lightSweep(periodMillis: Int = 3800): Modifier {
    val transition = rememberInfiniteTransition(label = "sweep")
    val x by transition.animateFloat(-1f, 2.2f, infiniteRepeatable(tween(periodMillis, easing = LinearEasing)), label = "sweep-x")
    return drawBehind {
        val center = size.width * x
        drawRect(Brush.linearGradient(
            listOf(Color.Transparent, Color.White.copy(alpha = .22f), Color.Transparent),
            start = Offset(center - size.width * .35f, 0f),
            end = Offset(center + size.width * .1f, size.height)
        ))
    }
}

@Composable
internal fun GlassIconButton(
    icon: Int,
    description: String?,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    tint: Color = Sw.Ink,
    highlighted: Boolean = false,
    onClick: (Rect?) -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    var bounds by remember { mutableStateOf<Rect?>(null) }
    Box(
        modifier
            .size(size)
            .onGloballyPositioned { bounds = it.boundsInRoot() }
            .pressScale(interaction, .88f)
            .then(if (highlighted) Modifier.brandGlow(CircleShape, 8.dp) else Modifier.glass(CircleShape))
            .clip(CircleShape)
            .clickable(interaction, indication = null) { onClick(bounds) },
        contentAlignment = Alignment.Center
    ) {
        Icon(painterResource(icon), description, tint = if (highlighted) Color.White else tint, modifier = Modifier.size(size * .48f))
    }
}

/** Equal-width segmented control with a springy gradient thumb. */
@Composable
internal fun SegmentedPills(options: List<String>, selected: Int, modifier: Modifier = Modifier, height: Dp = 44.dp, onSelect: (Int) -> Unit) {
    val haptics = LocalHapticFeedback.current
    BoxWithConstraints(
        modifier.height(height).glass(CircleShape, .85f).padding(4.dp)
    ) {
        val itemWidth = maxWidth / options.size
        val offset by animateDpAsState(itemWidth * selected, spring(dampingRatio = .72f, stiffness = Spring.StiffnessMediumLow), label = "segment-thumb")
        Box(Modifier.offset(x = offset).width(itemWidth).fillMaxHeight().clip(CircleShape).background(Sw.Brand))
        Row(Modifier.fillMaxSize()) {
            options.forEachIndexed { index, label ->
                val color by animateColorAsState(if (index == selected) Color.White else Sw.Muted, label = "segment-label")
                Box(
                    Modifier.weight(1f).fillMaxHeight().clip(CircleShape)
                        .clickable(remember { MutableInteractionSource() }, indication = null) {
                            if (index != selected) {
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onSelect(index)
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(label, color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                }
            }
        }
    }
}

/** Scrollable chip tabs; the selected chip fills with the brand gradient and shows its count. */
@Composable
internal fun ChipTabs(options: List<Pair<String, Int?>>, selected: Int, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    val haptics = LocalHapticFeedback.current
    LazyRow(modifier, contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(options) { index, (label, count) ->
            val active = index == selected
            val fill by animateFloatAsState(if (active) 1f else 0f, tween(260), label = "chip-fill")
            val interaction = remember { MutableInteractionSource() }
            Row(
                Modifier.height(40.dp)
                    .pressScale(interaction, .92f)
                    .clip(CircleShape)
                    .background(Sw.Raised)
                    .drawBehind { drawRoundRect(Sw.Brand, cornerRadius = CornerRadius(size.height / 2), alpha = fill) }
                    .border(1.dp, Color.White.copy(alpha = .08f * (1f - fill)), CircleShape)
                    .clickable(interaction, indication = null) {
                        if (!active) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(index)
                    }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(label, color = if (active) Color.White else Sw.Ink.copy(alpha = .8f), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                if (count != null) {
                    Box(
                        Modifier.padding(start = 8.dp).height(22.dp).widthIn(min = 22.dp).clip(CircleShape)
                            .background(if (active) Color.White.copy(alpha = .25f) else Color.White.copy(alpha = .08f))
                            .padding(horizontal = 4.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "$count", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black, maxLines = 1,
                            style = androidx.compose.ui.text.TextStyle(
                                platformStyle = androidx.compose.ui.text.PlatformTextStyle(includeFontPadding = false),
                                lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(
                                    androidx.compose.ui.text.style.LineHeightStyle.Alignment.Center,
                                    androidx.compose.ui.text.style.LineHeightStyle.Trim.Both
                                )
                            )
                        )
                    }
                }
            }
        }
    }
}

internal data class NavItem(val label: String, val icon: Int)

/** Floating glass navigation pill: the active destination widens and reveals its label. */
@Composable
internal fun FloatingNavBar(items: List<NavItem>, selected: Int, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(
        modifier
            .navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 10.dp)
            .fillMaxWidth()
            .shadow(28.dp, CircleShape, ambientColor = Color.Black, spotColor = Color.Black)
            .glass(CircleShape, .94f)
            .padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        items.forEachIndexed { index, item ->
            val active = index == selected
            val weight by animateFloatAsState(if (active) 2f else 1f, spring(dampingRatio = .7f, stiffness = 420f), label = "nav-weight")
            val fill by animateFloatAsState(if (active) 1f else 0f, tween(280), label = "nav-fill")
            val iconScale by animateFloatAsState(if (active) 1.08f else 1f, spring(dampingRatio = .35f, stiffness = 500f), label = "nav-icon")
            val interaction = remember { MutableInteractionSource() }
            Box(
                Modifier.weight(weight).height(54.dp)
                    .pressScale(interaction, .9f)
                    .clip(CircleShape)
                    .drawBehind { drawRoundRect(Sw.Brand, cornerRadius = CornerRadius(size.height / 2), alpha = fill) }
                    .clickable(interaction, indication = null) {
                        if (!active) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(index)
                    },
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painterResource(item.icon), item.label,
                        tint = if (active) Color.White else Sw.Muted,
                        modifier = Modifier.size(23.dp).graphicsLayer { scaleX = iconScale; scaleY = iconScale }
                    )
                    AnimatedVisibility(active, enter = fadeIn(tween(220, 80)) + expandHorizontally(tween(260)), exit = fadeOut(tween(90)) + shrinkHorizontally(tween(220))) {
                        Text(item.label, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, softWrap = false, modifier = Modifier.padding(start = 7.dp))
                    }
                }
            }
        }
    }
}

@Composable
internal fun SectionHeader(title: String, modifier: Modifier = Modifier, eyebrow: String? = null, action: String? = null, onAction: ((Rect?) -> Unit)? = null) {
    var bounds by remember { mutableStateOf<Rect?>(null) }
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            if (eyebrow != null) Text(eyebrow.uppercase(), color = Sw.Accent, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
            Text(title, color = Sw.Ink, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-.3).sp)
        }
        if (onAction != null) {
            val interaction = remember { MutableInteractionSource() }
            Row(
                Modifier.padding(start = 8.dp, end = 8.dp, bottom = 2.dp)
                    .onGloballyPositioned { bounds = it.boundsInRoot() }
                    .pressScale(interaction, .9f)
                    .height(34.dp)
                    .clip(CircleShape)
                    .background(Sw.Accent.copy(alpha = .12f))
                    .border(1.dp, Sw.Accent.copy(alpha = .35f), CircleShape)
                    .clickable(interaction, indication = null) { onAction(bounds) }
                    .padding(start = 13.dp, end = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(action ?: "Vedi tutto", color = Sw.Accent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Sw.Accent, modifier = Modifier.padding(start = 2.dp).size(17.dp))
            }
        }
    }
}

/** Small translucent pill used for metadata on artwork (rating, year, labels). */
@Composable
internal fun MetaPill(text: String, modifier: Modifier = Modifier, icon: Int? = null, tint: Color = Sw.Ink, background: Color = Color.Black.copy(alpha = .55f)) {
    Row(
        modifier.clip(CircleShape).background(background).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) Icon(painterResource(icon), null, tint = tint, modifier = Modifier.size(12.dp).padding(end = 0.dp))
        Text(text, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = if (icon != null) 3.dp else 0.dp))
    }
}

/** Pulsing dot used for "live" states. */
@Composable
internal fun PulsingDot(color: Color, modifier: Modifier = Modifier, size: Dp = 8.dp) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val pulse by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "pulse-value")
    Canvas(modifier.size(size * 2.4f)) {
        val radius = this.size.minDimension / 2.4f
        drawCircle(color.copy(alpha = (1f - pulse) * .5f), radius * (1f + pulse * 1.4f))
        drawCircle(color, radius)
    }
}

private fun transformContentAlpha(progress: Float) = ((progress - .28f) / .5f).coerceIn(0f, 1f)

/** What a tapped artwork looks like on screen, so a page can grow out of exactly that image. */
internal data class ArtworkLook(val url: String, val cornerPx: Float)

/** Waits until a freshly added page has been composed, so the motion never starts on a heavy frame. */
internal suspend fun awaitTransformReady() {
    repeat(2) { withFrameNanos { } }
}

/**
 * Container transform: the page is revealed by a rounded clip that grows out of the tapped element,
 * so its content is never stretched. [preview] (the tapped artwork) fills the moving clip and
 * cross-fades into the page while the backdrop dims. Progress runs 0 (source) → 1 (full page).
 * Without a visible source the page simply fades and settles in place, with no preview.
 */
@Composable
internal fun ContainerTransform(
    progress: () -> Float,
    source: () -> Rect?,
    sourceCornerPx: () -> Float? = { null },
    preview: (@Composable (Modifier) -> Unit)? = null,
    content: @Composable () -> Unit
) {
    var origin by remember { mutableStateOf(Offset.Zero) }
    var area by remember { mutableStateOf(androidx.compose.ui.geometry.Size.Zero) }
    var contentReady by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { withFrameNanos { }; contentReady = true }
    val defaultCorner = with(androidx.compose.ui.platform.LocalDensity.current) { 24.dp.toPx() }
    fun visibleSource(): Rect? =
        source()?.translate(-origin.x, -origin.y)
            // Before the first layout the area is unknown: trust the source rather than flash a fallback.
            ?.takeIf { it.width > 1f && it.height > 1f && (area == androidx.compose.ui.geometry.Size.Zero || (it.bottom > 0f && it.top < area.height && it.right > 0f && it.left < area.width)) }
    fun rectFor(width: Float, height: Float, p: Float): Rect {
        val from = visibleSource() ?: return Rect(0f, 0f, width, height)
        return Rect(
            from.left + (0f - from.left) * p,
            from.top + (0f - from.top) * p,
            from.right + (width - from.right) * p,
            from.bottom + (height - from.bottom) * p
        )
    }
    Box(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot(); area = androidx.compose.ui.geometry.Size(it.size.width.toFloat(), it.size.height.toFloat()) }.pointerInput(Unit) {}) {
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = progress().coerceIn(0f, 1f) * .7f }.background(Color.Black))
        Box(Modifier.fillMaxSize().graphicsLayer {
            val p = progress()
            val rect = rectFor(size.width, size.height, p)
            val radius = (sourceCornerPx() ?: defaultCorner) * (1f - p)
            shape = GenericShape { _, _ -> addRoundRect(RoundRect(rect, CornerRadius(radius))) }
            clip = true
            if (visibleSource() == null) alpha = p.coerceIn(0f, 1f)
        }) {
            Box(Modifier.fillMaxSize().background(Sw.Surface))
            preview?.invoke(
                Modifier
                    .layout { measurable, constraints ->
                        val rect = rectFor(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat(), progress())
                        val placeable = measurable.measure(Constraints.fixed(rect.width.roundToInt().coerceAtLeast(1), rect.height.roundToInt().coerceAtLeast(1)))
                        layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(rect.left.roundToInt(), rect.top.roundToInt()) }
                    }
                    .graphicsLayer {
                        alpha = if (visibleSource() == null) 0f else 1f - transformContentAlpha(progress())
                    }
            )
            Box(Modifier.fillMaxSize().graphicsLayer {
                val p = progress()
                alpha = transformContentAlpha(p)
                val scale = .93f + .07f * p
                scaleX = scale
                scaleY = scale
                translationY = (1f - p) * 40.dp.toPx()
            }) { if (contentReady) content() }
        }
    }
}

@Composable
internal fun AnimatedCount(value: Int, content: @Composable (Int) -> Unit) {
    val animated = remember { Animatable(0f) }
    LaunchedEffect(value) { animated.animateTo(value.toFloat(), tween(900, easing = Sw.Decelerate)) }
    content(animated.value.toInt())
}
