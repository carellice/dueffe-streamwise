package it.dueffe.streamwise

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.LruCache
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.Crossfade
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.foundation.Canvas
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalOverscrollFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.grid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.withContext
import java.net.URL
import java.util.Locale
import java.util.UUID

private val DeepCrimson = Sw.Red
private val SoftCrimson = Sw.Accent
private val LikeGreen = Color(0xFF3DDC97)
private val DislikeRed = Color(0xFFFF5C7A)
private val FollowGold = Sw.Amber
private val imageCache = object : LruCache<String, Bitmap>(32 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = (value.byteCount / 1024).coerceAtLeast(1)
}
private val Ink: Color @Composable get() = MaterialTheme.colorScheme.onBackground
private val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
private val Crimson: Color @Composable get() = MaterialTheme.colorScheme.primary
private val CrimsonSoft: Color @Composable get() = MaterialTheme.colorScheme.secondary
private val Night: Color @Composable get() = MaterialTheme.colorScheme.background
private val Panel: Color @Composable get() = MaterialTheme.colorScheme.surface
private val Raised: Color @Composable get() = MaterialTheme.colorScheme.surfaceVariant
private val FloatingToolbarHeight = 68.dp

private fun Modifier.crimsonGlow(shape: Shape, elevation: androidx.compose.ui.unit.Dp = 10.dp): Modifier = brandGlow(shape, elevation)

@Composable
private fun NoRipple(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalRippleConfiguration provides null, content = content)
}

@Composable
private fun Modifier.noRippleClickable(onClick: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    return pressScale(interaction).clickable(interactionSource = interaction, indication = null, onClick = onClick)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Modifier.noRippleCombinedClickable(onClick: () -> Unit, onLongClick: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    return pressScale(interaction).combinedClickable(interactionSource = interaction, indication = null, onClick = onClick, onLongClick = {
        haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
        onLongClick()
    })
}

@OptIn(ExperimentalSharedTransitionApi::class)
private val LocalSharedTransitionScope = staticCompositionLocalOf<SharedTransitionScope?> { null }
// Values that change while pages open and close must be dynamic locals: a static one would
// recompose the whole app (every tab and card) on each change, which stalls the transition.
private val LocalSharedMediaId = compositionLocalOf<String?> { null }
private val LocalHiddenArtworkKeys = compositionLocalOf<Set<String>> { emptySet() }
private val LocalClosingArtworkKey = compositionLocalOf<String?> { null }
private val LocalRegisterArtworkSource = staticCompositionLocalOf<(String) -> Unit> { {} }
private val LocalRegisterArtworkBounds = staticCompositionLocalOf<(String, Rect?) -> Unit> { { _, _ -> } }
private val LocalRegisterArtworkLook = staticCompositionLocalOf<(String, ArtworkLook) -> Unit> { { _, _ -> } }
private val LocalDetailVisibilityScope = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

private enum class Tab(val label: String, val icon: Int) {
    HOME("Home", R.drawable.ic_home), DISCOVER("Scopri", R.drawable.ic_compass), GUIDE("Guida TV", R.drawable.ic_tv_guide), LIBRARY("Libreria", R.drawable.ic_library)
}

private enum class Kind(val type: String, val label: String) { MOVIE("movie", "Film"), TV("tv", "Serie TV") }

private enum class LibrarySection(val label: String, val home: HomeSection?) {
    PROGRESS("In corso", HomeSection.PROGRESS),
    SAVED("Da vedere", HomeSection.SAVED),
    WATCHED("Visti", HomeSection.WATCHED),
    FOLLOWING("Seguiti", null),
    SERVICES("Abbonamenti", null),
    SAGAS("Saghe", null),
    HIDDEN("Nascosti", null)
}

private enum class HomeSection(val title: String, val state: String) {
    PROGRESS("Continua a guardare", "progress"),
    SAVED("La mia lista", "saved"),
    WATCHED("Già visti", "watched")
}

private enum class LibrarySort(val label: String) {
    ORIGINAL("Ordine sezione"),
    TITLE("Titolo A–Z"),
    NEWEST("Più recenti"),
    OLDEST("Meno recenti"),
    RATING("Valutazione")
}

private data class AdvisorRequest(
    val type: String,
    val genre: TmdbApi.Genre?,
    val platform: TmdbApi.Platform?,
    val libraryOnly: Boolean
)
private data class DetailPage(val media: Models.Media, val artworkKey: String?, val routeId: String = UUID.randomUUID().toString())
private data class PersonSelection(val person: Models.Person, val sourceBounds: Rect?)
private data class SagaCollection(val id: Int, val name: String, val movies: List<Models.Media>)
private fun sagaArtworkKey(collection: SagaCollection) = "saga-${collection.id}::${collection.id}"

class MainActivity : ComponentActivity() {
    companion object { const val EXTRA_OPEN_MEDIA = "open-media" }
    private var guideRequest by mutableStateOf<Pair<String, Long>?>(null)
    private var mediaRequest by mutableStateOf<Pair<Models.Media, Long>?>(null)
    private fun readGuideIntent(intent: android.content.Intent, includeMedia: Boolean = true) {
        intent.getStringExtra("tv-guide-date")?.let { date ->
            if (runCatching { java.time.LocalDate.parse(date) }.isSuccess) guideRequest = date to System.nanoTime()
        }
        if (includeMedia) intent.getStringExtra(EXTRA_OPEN_MEDIA)?.let { raw ->
            runCatching { Models.Media.from(org.json.JSONObject(raw)) }.getOrNull()?.takeIf { it.id.isNotEmpty() }?.let { mediaRequest = it to System.nanoTime() }
            intent.removeExtra(EXTRA_OPEN_MEDIA)
        }
    }
    override fun onNewIntent(intent: android.content.Intent) { super.onNewIntent(intent); readGuideIntent(intent) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A recreated activity must not reopen the title from the notification that launched it.
        readGuideIntent(intent, includeMedia = savedInstanceState == null)
        ReleaseCheckWorker.refreshOnLaunch(this)
        enableEdgeToEdge()
        val store = LibraryStore(this)
        val api = TmdbApi(BuildConfig.TMDB_API_KEY)
        setContent {
            var showOnboarding by remember { mutableStateOf(!store.onboardingDone()) }
            var showTour by remember { mutableStateOf(false) }
            var backupVersion by remember { mutableIntStateOf(0) }
            val exportBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
                if (uri != null) contentResolver.openOutputStream(uri)?.use { it.write(store.exportJson().toByteArray(Charsets.UTF_8)) }
            }
            val importBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
                if (uri != null) {
                    val restored = runCatching { contentResolver.openInputStream(uri)?.bufferedReader()?.use { store.importJson(it.readText()) } ?: false }.getOrDefault(false)
                    if (restored) { showOnboarding = false; backupVersion++ }
                }
            }
            StreamWiseTheme {
                StreamWiseApp(
                    store, api,
                    guideRequest = guideRequest,
                    mediaRequest = mediaRequest,
                    backupVersion = backupVersion,
                    showOnboarding = showOnboarding,
                    showTour = showTour,
                    onOnboardingComplete = { store.setOnboardingDone(); showOnboarding = false; showTour = false },
                    onTourComplete = { showTour = false },
                    onReplayOnboarding = { store.resetOnboarding(); showOnboarding = true; showTour = false },
                    onExportBackup = { exportBackup.launch("streamwise-backup.json") },
                    onImportBackup = { importBackup.launch(arrayOf("application/json", "text/json", "text/plain")) }
                )
            }
        }
    }
}

@Composable
private fun StreamWiseTheme(content: @Composable () -> Unit) {
    val dark = true
    val scheme = if (dark) darkColorScheme(
        primary = Color(0xFFE5243A),
        onPrimary = Color.White,
        primaryContainer = Color(0xFF3B161B),
        onPrimaryContainer = Color(0xFFFFDAD2),
        secondary = SoftCrimson,
        onSecondary = Color(0xFF3A0E06),
        secondaryContainer = Color(0xFF331D20),
        onSecondaryContainer = Color(0xFFFFDAD2),
        tertiary = Sw.Amber,
        onTertiary = Color(0xFF3A2600),
        tertiaryContainer = Color(0xFF3A2C12),
        onTertiaryContainer = Color(0xFFFFE3B0),
        background = Sw.Background,
        onBackground = Sw.Ink,
        surface = Sw.Surface,
        onSurface = Sw.Ink,
        surfaceVariant = Sw.Raised,
        onSurfaceVariant = Sw.Muted,
        surfaceTint = Color.Transparent,
        surfaceDim = Sw.Background,
        surfaceBright = Color(0xFF2A2E39),
        surfaceContainerLowest = Color(0xFF07080C),
        surfaceContainerLow = Color(0xFF111319),
        surfaceContainer = Sw.Surface,
        surfaceContainerHigh = Color(0xFF1A1D26),
        surfaceContainerHighest = Sw.Raised,
        outline = Color(0xFF4B505E),
        outlineVariant = Sw.Outline,
        inversePrimary = Color(0xFFB3261E),
        error = Color(0xFFFF6B7D)
    ) else lightColorScheme(
        primary = Color(0xFFA81835),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFFFD9E0),
        onPrimaryContainer = Color(0xFF3E0010),
        secondary = Color(0xFF955260),
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFFFD9E0),
        onSecondaryContainer = Color(0xFF3A0715),
        tertiary = Color(0xFF8C5758),
        onTertiary = Color.White,
        tertiaryContainer = Color(0xFFFFDAD9),
        onTertiaryContainer = Color(0xFF351011),
        background = Color(0xFFFFF9FA),
        onBackground = Color(0xFF211A1C),
        surface = Color.White,
        onSurface = Color(0xFF211A1C),
        surfaceVariant = Color(0xFFF4E7EA),
        onSurfaceVariant = Color(0xFF59464B),
        surfaceTint = Color(0xFFA81835),
        outline = Color(0xFF8B7077),
        outlineVariant = Color(0xFFDEC1C7),
        inversePrimary = Color(0xFFFFB1BF),
        error = Color(0xFFBA1A1A)
    )
    val typography = Typography(
        displaySmall = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Black, letterSpacing = (-1.4).sp, lineHeight = 40.sp),
        headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Black, letterSpacing = (-0.9).sp),
        headlineMedium = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
        headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp),
        titleLarge = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp),
        titleMedium = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        labelLarge = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
    )
    val view = LocalView.current
    SideEffect {
        (view.context.findActivity() as? ComponentActivity)?.let { activity ->
            val transparent = android.graphics.Color.TRANSPARENT
            activity.enableEdgeToEdge(
                statusBarStyle = if (dark) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent, transparent),
                navigationBarStyle = if (dark) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent, transparent)
            )
        }
    }
    MaterialTheme(
        colorScheme = scheme,
        shapes = Shapes(RoundedCornerShape(18.dp), RoundedCornerShape(28.dp), RoundedCornerShape(36.dp)),
        typography = typography,
        content = content
    )
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
private fun StreamWiseApp(
    store: LibraryStore,
    initialApi: TmdbApi,
    guideRequest: Pair<String, Long>?,
    mediaRequest: Pair<Models.Media, Long>?,
    backupVersion: Int,
    showOnboarding: Boolean,
    showTour: Boolean,
    onOnboardingComplete: () -> Unit,
    onTourComplete: () -> Unit,
    onReplayOnboarding: () -> Unit,
    onExportBackup: () -> Unit,
    onImportBackup: () -> Unit
) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var discoverKind by remember { mutableStateOf(Kind.MOVIE) }
    var librarySection by remember { mutableStateOf(LibrarySection.PROGRESS) }
    var guideDate by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(java.time.LocalDate.now(TvGuideRepository.ROME).toString()) }
    var refresh by remember { mutableIntStateOf(0) }
    val libraryContext = LocalContext.current
    androidx.compose.runtime.DisposableEffect(store) {
        val prefs = libraryContext.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE)
        val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == "library") { store.reload(); refresh++ }
            else if (key == "subscriptions" || key?.startsWith("subscription-filter-") == true) refresh++
        }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        val follows = ReleaseFollows.prefs(libraryContext)
        val followListener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> refresh++ }
        follows.registerOnSharedPreferenceChangeListener(followListener)
        val people = PersonFollows.prefs(libraryContext)
        people.registerOnSharedPreferenceChangeListener(followListener)
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener); follows.unregisterOnSharedPreferenceChangeListener(followListener); people.unregisterOnSharedPreferenceChangeListener(followListener) }
    }
    var selected by remember { mutableStateOf<Models.Media?>(null) }
    var action by remember { mutableStateOf<Models.Media?>(null) }
    var search by remember { mutableStateOf(false) }
    var searchOrigin by remember { mutableStateOf<Rect?>(null) }
    var settings by remember { mutableStateOf(false) }
    var settingsOrigin by remember { mutableStateOf<Rect?>(null) }
    var aiOpen by remember { mutableStateOf(false) }
    var aiOrigin by remember { mutableStateOf<Rect?>(null) }
    var filters by remember { mutableStateOf(false) }
    var filtersOrigin by remember { mutableStateOf<Rect?>(null) }
    var selectedSaga by remember { mutableStateOf<SagaCollection?>(null) }
    var closingSaga by remember { mutableStateOf(false) }
    var followedPerson by remember { mutableStateOf<PersonSelection?>(null) }
    var catalogExpanded by remember { mutableStateOf(false) }
    var advisor by remember { mutableStateOf(false) }
    var advisorFromLibrary by remember { mutableStateOf(false) }
    var advisorRequest by remember { mutableStateOf<AdvisorRequest?>(null) }
    var advisorRerolling by remember { mutableStateOf(false) }
    var detailPages by remember { mutableStateOf<List<DetailPage>>(emptyList()) }
    var closingDetailId by remember { mutableStateOf<String?>(null) }
    var selectedArtworkKey by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(guideRequest) { guideRequest?.let {
        guideDate = it.first; tab = Tab.GUIDE
        selected = null; action = null; search = false; settings = false; filters = false
        selectedSaga = null; followedPerson = null; advisor = false; advisorRequest = null
        detailPages = emptyList(); closingDetailId = null; catalogExpanded = false
    } }
    // Opened from a followed-release notification: show that title's detail above the current tab.
    LaunchedEffect(mediaRequest) { mediaRequest?.let { (media, _) ->
        action = null; search = false; settings = false; filters = false
        selectedSaga = null; advisor = false; advisorRequest = null; catalogExpanded = false
        selectedArtworkKey = null; detailPages = listOf(DetailPage(media, null)); closingDetailId = null; selected = media
    } }
    val artworkBounds = remember { mutableStateMapOf<String, Rect>() }
    val artworkLooks = remember { mutableMapOf<String, ArtworkLook>() }
    // Remembered so the static locals below keep the same instance across recompositions.
    val registerArtworkSource = remember { { key: String -> selectedArtworkKey = key } }
    val registerArtworkBounds = remember { { key: String, bounds: Rect? -> if (bounds == null) artworkBounds.remove(key) else artworkBounds[key] = bounds; Unit } }
    val registerArtworkLook = remember { { key: String, look: ArtworkLook -> artworkLooks[key] = look } }
    val api = remember(initialApi) { initialApi }
    val scope = rememberCoroutineScope()
    val subscriptionData = rememberSubscriptionData(api, store, refresh)
    val activeSubscriptions = remember(refresh) { store.subscriptions().toSet() }
    LaunchedEffect(backupVersion) { if (backupVersion > 0) refresh++ }
    val openFromCatalog: (Models.Media) -> Unit = { media ->
        advisorRequest = null
        detailPages = listOf(DetailPage(media, selectedArtworkKey))
        closingDetailId = null
        selected = media
    }

    SharedTransitionLayout {
        CompositionLocalProvider(
            LocalSubscriptionData provides subscriptionData,
            LocalActiveSubscriptions provides remember(activeSubscriptions) { ActiveSubscriptions(activeSubscriptions) { store.setSubscriptions(it) } },
            LocalSharedTransitionScope provides this@SharedTransitionLayout,
            LocalSharedMediaId provides selected?.id,
            LocalHiddenArtworkKeys provides (detailPages.mapNotNull { it.artworkKey } + (selectedSaga?.takeIf { !closingSaga }?.let { listOf(sagaArtworkKey(it)) } ?: emptyList())).toSet(),
            LocalClosingArtworkKey provides detailPages.firstOrNull { it.routeId == closingDetailId }?.artworkKey,
            LocalRegisterArtworkSource provides registerArtworkSource,
            LocalRegisterArtworkBounds provides registerArtworkBounds,
            LocalRegisterArtworkLook provides registerArtworkLook
        ) {
            Box(Modifier.fillMaxSize()) {
                AuroraBackground()
                AnimatedContent(tab, label = "main", transitionSpec = {
                    val forward = targetState.ordinal > initialState.ordinal
                    (fadeIn(tween(280, delayMillis = 40)) + androidx.compose.animation.slideInHorizontally(tween(420, easing = Sw.Emphasized)) { if (forward) it / 6 else -it / 6 } + scaleIn(tween(420, easing = Sw.Emphasized), initialScale = .97f)) togetherWith
                        (fadeOut(tween(160)) + androidx.compose.animation.slideOutHorizontally(tween(320, easing = Sw.Emphasized)) { if (forward) -it / 10 else it / 10 })
                }) { target ->
                    when (target) {
                        Tab.HOME -> HomeScreen(
                            api, store, refresh,
                            onOpen = openFromCatalog,
                            onAction = { action = it },
                            onSearch = { bounds -> searchOrigin = bounds; search = true },
                            onSettings = { bounds -> settingsOrigin = bounds; settings = true },
                            onAdvisor = { fromLibrary -> advisorFromLibrary = fromLibrary; advisor = true },
                            onAskAi = { bounds -> aiOrigin = bounds; aiOpen = true },
                            onOpenLibrary = { section -> librarySection = section; tab = Tab.LIBRARY },
                            onDiscover = { tab = Tab.DISCOVER },
                            onOpenGuide = { tab = Tab.GUIDE },
                            onOpenPerson = { person, bounds -> followedPerson = PersonSelection(person, bounds) }
                        )
                        Tab.DISCOVER -> DiscoverScreen(
                            discoverKind, { discoverKind = it }, api, store, refresh,
                            chromeVisible = !catalogExpanded,
                            onOpen = openFromCatalog,
                            onAction = { action = it },
                            onSearch = { bounds -> searchOrigin = bounds; search = true },
                            onFilters = { bounds -> filtersOrigin = bounds; filters = true },
                            onChanged = { refresh++ },
                            onExpandedChange = { catalogExpanded = it }
                        )
                        Tab.GUIDE -> key(guideRequest) { TvGuideScreen(api, guideDate, { guideDate = it }, Modifier, backEnabled = detailPages.isEmpty(), onOpen = openFromCatalog, onExpandedChange = { catalogExpanded = it }) }
                        Tab.LIBRARY -> LibraryScreen(
                            librarySection, { librarySection = it }, api, store, refresh,
                            onOpen = openFromCatalog,
                            onAction = { action = it },
                            onOpenSaga = { selectedSaga = it; closingSaga = false; selectedArtworkKey = sagaArtworkKey(it) },
                            onOpenPerson = { person, bounds -> followedPerson = PersonSelection(person, bounds) },
                            onDiscover = { tab = Tab.DISCOVER }
                        )
                    }
                }
                // Keeps scrolled content from colliding with the status bar icons.
                Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Sw.Background.copy(alpha = .94f), Sw.Background.copy(alpha = .6f), Color.Transparent))).statusBarsPadding().padding(bottom = 14.dp))
                AnimatedVisibility(
                    visible = !catalogExpanded,
                    modifier = Modifier.align(Alignment.BottomCenter),
                    enter = fadeIn(tween(220)) + slideInVertically(tween(380, easing = Sw.Emphasized)) { it },
                    exit = fadeOut(tween(160)) + androidx.compose.animation.slideOutVertically(tween(260)) { it }
                ) {
                    FloatingNavBar(Tab.entries.map { NavItem(it.label, it.icon) }, tab.ordinal) { tab = Tab.entries[it]; catalogExpanded = false }
                }
            }

            if (search) ExpandingPage(searchOrigin, onClosed = { search = false }) { close ->
                SearchScreen(api, store, refresh, onDismiss = close, onOpen = openFromCatalog)
            }
            if (aiOpen) ExpandingPage(aiOrigin, onClosed = { aiOpen = false }, sourceCorner = 26.dp, sourceArt = { AiCardArt(Modifier.fillMaxSize()) }) { close ->
                AiScreen(api, store, onDismiss = close, onOpen = openFromCatalog)
            }
            if (settings) ExpandingPage(settingsOrigin, onClosed = { settings = false }) { close ->
                SettingsScreen(store, onDismiss = close, onChanged = { refresh++ }, onExportBackup = onExportBackup, onImportBackup = onImportBackup, onReplayOnboarding = onReplayOnboarding)
            }
            if (filters) ExpandingPage(filtersOrigin, onClosed = { filters = false }) { close ->
                FilterScreen(discoverKind.type, api, store, onDismiss = close, onOpen = openFromCatalog, onAction = { action = it })
            }
            if (advisor) AdvisorSheet(api, store, libraryOnly = advisorFromLibrary, onDismiss = { advisor = false }, onOpen = { media, request -> selectedArtworkKey = null; advisorRequest = request; detailPages = listOf(DetailPage(media, null)); closingDetailId = null; selected = media; advisor = false })
            selectedSaga?.let { saga ->
                ExpandingPage(null, onClosed = { selectedSaga = null }) { close ->
                    SagaDetailScreen(
                        collection = saga,
                        store = store,
                        refreshVersion = refresh,
                        backEnabled = detailPages.isEmpty(),
                        onDismiss = { closingSaga = true; close() },
                        onOpen = openFromCatalog
                    )
                }
            }
            followedPerson?.let { selection ->
                PersonCredits(selection.person, api, store, sourceBounds = selection.sourceBounds, dismiss = { followedPerson = null }, onOpen = openFromCatalog, keepOpenOnMediaOpen = true)
            }
            detailPages.forEach { page ->
                key(page.routeId) {
                    val closingThisPage = closingDetailId == page.routeId
                    val progress = remember(page.routeId) { Animatable(0f) }
                    LaunchedEffect(page.routeId) {
                        awaitTransformReady()
                        progress.animateTo(1f, tween(560, easing = Sw.Emphasized))
                    }
                    LaunchedEffect(closingThisPage) {
                        if (closingThisPage) {
                            progress.animateTo(0f, tween(480, easing = FastOutSlowInEasing))
                            val remaining = detailPages.filterNot { it.routeId == page.routeId }
                            detailPages = remaining
                            selectedArtworkKey = remaining.lastOrNull()?.artworkKey
                            closingDetailId = null
                        }
                    }
                    // The page grows out of exactly the image the tapped element was showing (poster or backdrop).
                    val look = remember(page.routeId, page.artworkKey) { page.artworkKey?.let(artworkLooks::get) }
                    val previewUrl = look?.url ?: page.media.poster.ifBlank { page.media.backdrop }
                    ContainerTransform(
                        progress = { progress.value },
                        source = { page.artworkKey?.let(artworkBounds::get) },
                        sourceCornerPx = { look?.cornerPx },
                        preview = { modifier -> RemoteImage(previewUrl, modifier, ContentScale.Crop) },
                        sourceArt = look?.overlay
                    ) {
                        run {
                            AnimatedContent(
                                targetState = page.media,
                                contentKey = { it.id },
                                transitionSpec = { fadeIn(tween(120)) togetherWith fadeOut(tween(100)) },
                                label = "detail-title-transition"
                            ) { media ->
                                DetailScreen(
                                    media, api, store,
                                    refreshVersion = refresh,
                                    artworkKey = page.artworkKey,
                                    sharedBoundsEnabled = false,
                                    backEnabled = page.routeId == detailPages.lastOrNull()?.routeId && closingDetailId == null,
                                    onClose = {
                                        if (closingDetailId == null && page.routeId == detailPages.lastOrNull()?.routeId) {
                                            closingDetailId = page.routeId
                                            selected = detailPages.dropLast(1).lastOrNull()?.media
                                            if (selected == null) advisorRequest = null
                                        }
                                    },
                                    onOpen = { next ->
                                        if (closingDetailId == null && page.routeId == detailPages.lastOrNull()?.routeId) {
                                            advisorRequest = null
                                            detailPages = detailPages + DetailPage(next, selectedArtworkKey)
                                            selected = next
                                        }
                                    },
                                    onAction = { if (page.routeId == detailPages.lastOrNull()?.routeId) action = it },
                                    onRefresh = { refresh++ },
                                    onReroll = if (page.routeId == detailPages.lastOrNull()?.routeId) advisorRequest?.let { request ->
                                        {
                                            if (!advisorRerolling) {
                                                advisorRerolling = true
                                                scope.launch {
                                                    chooseAdvisorTitle(api, store, request, selected?.id)?.let { next ->
                                                        selectedArtworkKey = null
                                                        detailPages = detailPages.map { if (it.routeId == page.routeId) it.copy(media = next, artworkKey = null) else it }
                                                        selected = next
                                                    }
                                                    advisorRerolling = false
                                                }
                                            }
                                        }
                                    } else null,
                                    rerolling = advisorRerolling
                                )
                            }
                        }
                    }
                }
            }
            action?.let { media -> ActionSheet(media, store, api, onDismiss = { action = null }, onChanged = { refresh++; action = null }) }
            if (showOnboarding) OnboardingScreen(onImportBackup = onImportBackup, onComplete = onOnboardingComplete)
            if (showTour && !showOnboarding) TourOverlay(onTabChange = { tab = it }, onComplete = onTourComplete)
        }
    }
}

@Composable
private fun ExpandingPage(
    sourceBounds: Rect?,
    onClosed: () -> Unit,
    sourceCorner: androidx.compose.ui.unit.Dp? = null,
    sourceArt: (@Composable () -> Unit)? = null,
    content: @Composable (close: () -> Unit) -> Unit
) {
    var closing by remember { mutableStateOf(false) }
    val progress = remember { Animatable(0f) }
    val close = { if (!closing) closing = true }
    LaunchedEffect(closing) {
        if (closing) {
            progress.animateTo(0f, tween(460, easing = FastOutSlowInEasing))
            onClosed()
        } else {
            awaitTransformReady()
            progress.animateTo(1f, tween(540, easing = Sw.Emphasized))
        }
    }
    val cornerPx = sourceCorner?.let { with(androidx.compose.ui.platform.LocalDensity.current) { it.toPx() } }
    ContainerTransform(
        progress = { progress.value },
        source = { sourceBounds },
        sourceCornerPx = { cornerPx },
        sourceArt = sourceArt,
        artFadeEnd = if (sourceArt != null) .3f else null
    ) { content(close) }
}

private val AiViolet = Color(0xFFA57BFF)

/** Look of the "Chiedi all'IA" card; also drawn by the page transition that grows out of it. */
@Composable
private fun AiCardArt(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(26.dp)
    Row(
        modifier.clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF26123F), Color(0xFF1A1426), Color(0xFF3A0F1E))))
            .border(1.dp, Brush.linearGradient(listOf(AiViolet.copy(alpha = .55f), Sw.Red.copy(alpha = .35f))), shape)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape).background(Brush.linearGradient(listOf(AiViolet, Sw.Red))), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_sparkles), null, tint = Color.White, modifier = Modifier.size(23.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Chiedi all'IA", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                Box(Modifier.padding(start = 8.dp).clip(CircleShape).background(AiViolet.copy(alpha = .22f)).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    Text("NUOVO", color = AiViolet, fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                }
            }
            Text("Dimmi cosa ti va: ti consiglio titoli su misura dei tuoi gusti", color = Color.White.copy(alpha = .7f), fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 2.dp))
        }
        Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Color.White.copy(alpha = .7f))
    }
}

@Composable
private fun AiAskCard(modifier: Modifier, onAsk: (Rect?) -> Unit) {
    var bounds by remember { mutableStateOf<Rect?>(null) }
    val interaction = remember { MutableInteractionSource() }
    AiCardArt(
        modifier.fillMaxWidth()
            .onGloballyPositioned { bounds = it.boundsInRoot() }
            .pressScale(interaction, .97f)
            .clickable(interaction, indication = null) { onAsk(bounds) }
    )
}

private fun resolveAiPick(api: TmdbApi, pick: AiPick): Models.Media? = runCatching {
    api.searchTitles(pick.title, pick.year).toList().firstOrNull { it.mediaType == pick.type }
        ?: api.searchTitles(pick.title, null).toList().firstOrNull { it.mediaType == pick.type }
}.getOrNull()

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AiScreen(api: TmdbApi, store: LibraryStore, onDismiss: () -> Unit, onOpen: (Models.Media) -> Unit) {
    val context = LocalContext.current
    var configured by remember { mutableStateOf(AiAdvisor.configured(context)) }
    var request by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
    var type by remember { mutableStateOf("all") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var results by remember { mutableStateOf<List<Pair<Models.Media, String>>>(emptyList()) }
    val suggested = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val entries = remember { store.all().toList() }
    val liked = remember(entries) { entries.filter { it.liked == true }.map { it.media.title }.take(30) }
    val disliked = remember(entries) { entries.filter { it.liked == false }.map { it.media.title }.take(15) }
    val watching = remember(entries) { entries.filter { it.state == "progress" }.map { it.media.title }.take(15) }
    val known = remember(entries) { entries.map { it.media.id }.toSet() }
    val ask: () -> Unit = {
        if (!loading) {
            focusManager.clearFocus(force = true)
            keyboard?.hide()
            loading = true
            error = null
            scope.launch {
                // Titles already proposed in this session are excluded, so "Altri consigli" brings new ones.
                val exclude = (entries.map { it.media.title } + suggested).takeLast(80)
                val picks = withContext(Dispatchers.IO) { runCatching { AiAdvisor.recommend(context, type, request.trim(), liked, disliked, watching, exclude) } }
                val resolved = withContext(Dispatchers.IO) {
                    coroutineScope { picks.getOrDefault(emptyList()).map { pick -> async { resolveAiPick(api, pick)?.let { it to pick.reason } } }.awaitAll() }
                }.filterNotNull().filter { (media, _) -> media.id !in known }.distinctBy { it.first.id }
                picks.getOrNull()?.let { list -> suggested.addAll(list.map { it.title }) }
                results = resolved
                error = when {
                    picks.isFailure -> (picks.exceptionOrNull() as? AiException)?.message ?: "Non riesco a contattare l'IA. Controlla la connessione e riprova."
                    resolved.isEmpty() -> "Nessun titolo adatto questa volta. Prova a riformulare la richiesta."
                    else -> null
                }
                loading = false
            }
        }
    }
    BackHandler(onBack = onDismiss)
    Surface(Modifier.fillMaxSize(), color = Night) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.align(Alignment.TopEnd).offset(x = 90.dp, y = (-90).dp).size(340.dp)
                .background(Brush.radialGradient(listOf(AiViolet.copy(alpha = .22f), Color.Transparent)), CircleShape))
            LazyColumn(
                Modifier.fillMaxSize().statusBarsPadding(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        GlassIconButton(R.drawable.ic_back, "Indietro") { onDismiss() }
                        Column(Modifier.padding(start = 14.dp)) {
                            Text("INTELLIGENZA ARTIFICIALE", color = AiViolet, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp)
                            Text("Chiedi all'IA", style = MaterialTheme.typography.headlineMedium, color = Ink)
                        }
                    }
                }
                item {
                    Text(
                        if (liked.isEmpty()) "Dimmi cosa ti va e ti propongo qualcosa. Più titoli valuti con “Mi piace”, più i consigli diventano tuoi."
                        else "Consigli basati sui ${liked.size} titoli che ti sono piaciuti e su ciò che mi chiedi.",
                        color = Muted, fontSize = 15.sp, lineHeight = 21.sp
                    )
                }
                if (!configured) {
                    item { AiSetupCard(onConfiguredChange = { configured = it }) }
                    return@LazyColumn
                }
                item {
                    Box(
                        Modifier.fillMaxWidth().heightIn(min = 104.dp).clip(RoundedCornerShape(24.dp))
                            .background(Sw.Surface)
                            .border(1.dp, Brush.linearGradient(listOf(AiViolet.copy(alpha = .5f), Sw.Red.copy(alpha = .3f))), RoundedCornerShape(24.dp))
                            .padding(16.dp)
                    ) {
                        androidx.compose.foundation.text.BasicTextField(
                            value = request,
                            onValueChange = { request = it.take(300) },
                            textStyle = androidx.compose.ui.text.TextStyle(color = Ink, fontSize = 16.sp, lineHeight = 22.sp),
                            cursorBrush = androidx.compose.ui.graphics.SolidColor(AiViolet),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                            keyboardActions = KeyboardActions(onSend = { ask() }),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                Box {
                                    if (request.isEmpty()) Text("Cosa ti va stasera? Ad esempio: qualcosa di leggero, che duri meno di due ore", color = Muted, fontSize = 16.sp, lineHeight = 22.sp)
                                    inner()
                                }
                            }
                        )
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("Qualcosa di leggero", "Un thriller che non mi aspetto", "Una serie breve", "Da vedere in coppia", "Un classico da recuperare").forEach { idea ->
                            val active = request == idea
                            Box(
                                Modifier.clip(CircleShape)
                                    .background(if (active) AiViolet.copy(alpha = .22f) else Sw.Raised)
                                    .border(1.dp, if (active) AiViolet else Color.White.copy(alpha = .06f), CircleShape)
                                    .noRippleClickable { request = idea }
                                    .padding(horizontal = 14.dp, vertical = 8.dp)
                            ) { Text(idea, color = if (active) Color.White else Ink.copy(alpha = .85f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                        }
                    }
                }
                item {
                    SegmentedPills(listOf("Tutto", "Film", "Serie TV"), listOf("all", "movie", "tv").indexOf(type), Modifier.fillMaxWidth(), height = 42.dp) {
                        type = listOf("all", "movie", "tv")[it]
                    }
                }
                item {
                    Button(
                        onClick = ask,
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth().height(56.dp)
                            .shadow(14.dp, CircleShape, ambientColor = AiViolet, spotColor = AiViolet)
                            .background(Brush.linearGradient(listOf(AiViolet, Sw.Red)), CircleShape),
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White, disabledContainerColor = Color.Transparent, disabledContentColor = Color.White)
                    ) {
                        AnimatedContent(loading, label = "ai-button") { busy ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                                else Icon(painterResource(R.drawable.ic_sparkles), null, Modifier.size(21.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(if (busy) "Sto pensando ai tuoi gusti…" else if (results.isEmpty()) "Consigliami" else "Altri consigli", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            }
                        }
                    }
                }
                error?.let { message -> item { Text(message, color = DislikeRed, fontSize = 14.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center) } }
                if (loading) items(3) {
                    Row(Modifier.fillMaxWidth().glass(RoundedCornerShape(22.dp)).padding(10.dp)) {
                        LoadingSkeleton(Modifier.size(84.dp, 124.dp).clip(RoundedCornerShape(14.dp)))
                        Column(Modifier.weight(1f).padding(start = 14.dp, top = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            LoadingSkeleton(Modifier.fillMaxWidth(.4f).height(10.dp).clip(CircleShape))
                            LoadingSkeleton(Modifier.fillMaxWidth(.8f).height(16.dp).clip(CircleShape))
                            LoadingSkeleton(Modifier.fillMaxWidth().height(12.dp).clip(CircleShape))
                            LoadingSkeleton(Modifier.fillMaxWidth(.7f).height(12.dp).clip(CircleShape))
                        }
                    }
                }
                else itemsIndexed(results, key = { _, item -> item.first.id }) { index, (media, reason) ->
                    AiResultCard(media, reason, Modifier.reveal(delayMillis = index * 70, distance = 24.dp)) { onOpen(media) }
                }
            }
        }
    }
}

@Composable
private fun AiResultCard(media: Models.Media, reason: String, modifier: Modifier, open: () -> Unit) {
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    Row(
        modifier.fillMaxWidth()
            .noRippleClickable { registerSource(sourceKey); open() }
            .glass(RoundedCornerShape(22.dp))
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SharedArtworkSource(media, sourceKey, Modifier.size(84.dp, 124.dp), RoundedCornerShape(14.dp))
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 4.dp)) {
            Text("${if (media.isSeries) "SERIE TV" else "FILM"} · ${media.year}", color = Sw.Accent, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
            Text(media.title, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            if (reason.isNotBlank()) Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Top) {
                Icon(painterResource(R.drawable.ic_sparkles), null, tint = AiViolet, modifier = Modifier.padding(top = 2.dp).size(14.dp))
                Text(reason.replaceFirstChar { it.uppercase() }, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

/** "Simili secondo l'IA" in a title's detail: asks Workers AI for related films and series on demand. */
@Composable
private fun AiSimilarSection(media: Models.Media, api: TmdbApi, store: LibraryStore, onOpen: (Models.Media) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var configured by remember { mutableStateOf(AiAdvisor.configured(context)) }
    var setupVisible by remember(media.id) { mutableStateOf(false) }
    var loading by remember(media.id) { mutableStateOf(false) }
    var error by remember(media.id) { mutableStateOf<String?>(null) }
    var results by remember(media.id) { mutableStateOf<List<Pair<Models.Media, String>>>(emptyList()) }
    val suggested = remember(media.id) { mutableStateListOf<String>() }
    lateinit var ask: () -> Unit
    ask = {
        if (!AiAdvisor.configured(context)) { configured = false; setupVisible = true }
        else if (!loading) scope.launch {
            loading = true
            error = null
            val entries = store.all().toList()
            val liked = entries.filter { it.liked == true }.map { it.media.title }.take(15)
            // Titles already proposed for this one are excluded, so "Altri simili" brings new ones.
            val exclude = (entries.filter { it.state == "watched" }.map { it.media.title } + suggested).takeLast(60)
            val year = media.year.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }.orEmpty()
            val picks = withContext(Dispatchers.IO) {
                runCatching { AiAdvisor.similar(context, media.originalTitle.ifBlank { media.title }, year, media.mediaType, media.genres.toList(), liked, exclude) }
            }
            val resolved = withContext(Dispatchers.IO) {
                coroutineScope { picks.getOrDefault(emptyList()).map { pick -> async { resolveAiPick(api, pick)?.let { it to pick.reason } } }.awaitAll() }
            }.filterNotNull().filter { (candidate, _) -> candidate.id != media.id && results.none { it.first.id == candidate.id } }.distinctBy { it.first.id }
            picks.getOrNull()?.let { list -> suggested.addAll(list.map { it.title }) }
            results = results + resolved
            error = when {
                picks.isFailure -> (picks.exceptionOrNull() as? AiException)?.message ?: "Non riesco a contattare l'IA. Controlla la connessione e riprova."
                resolved.isEmpty() -> "Nessun nuovo titolo simile trovato questa volta. Riprova."
                else -> null
            }
            loading = false
        }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).animateContentSize(tween(320, easing = Sw.Emphasized)), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Simili secondo l'IA", style = MaterialTheme.typography.titleLarge, color = Ink)
        Text("Film e serie che condividono atmosfera, temi e tono di “${media.title}”, con il motivo di ogni scelta.", color = Muted, fontSize = 14.sp, lineHeight = 20.sp)
        results.forEachIndexed { index, (item, reason) ->
            key(item.id) { AiResultCard(item, reason, Modifier.reveal(delayMillis = index % 8 * 70, distance = 24.dp)) { onOpen(item) } }
        }
        if (loading) repeat(2) {
            Row(Modifier.fillMaxWidth().glass(RoundedCornerShape(22.dp)).padding(10.dp)) {
                LoadingSkeleton(Modifier.size(84.dp, 124.dp).clip(RoundedCornerShape(14.dp)))
                Column(Modifier.weight(1f).padding(start = 14.dp, top = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    LoadingSkeleton(Modifier.fillMaxWidth(.4f).height(10.dp).clip(CircleShape))
                    LoadingSkeleton(Modifier.fillMaxWidth(.8f).height(16.dp).clip(CircleShape))
                    LoadingSkeleton(Modifier.fillMaxWidth().height(12.dp).clip(CircleShape))
                }
            }
        }
        error?.let { Text(it, color = DislikeRed, fontSize = 14.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
        if (setupVisible && !configured) AiSetupCard(onConfiguredChange = { ready -> configured = ready; if (ready) { setupVisible = false; ask() } })
        else Button(
            onClick = ask,
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(54.dp)
                .shadow(12.dp, CircleShape, ambientColor = AiViolet, spotColor = AiViolet)
                .background(Brush.linearGradient(listOf(AiViolet, Sw.Red)), CircleShape),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White, disabledContainerColor = Color.Transparent, disabledContentColor = Color.White)
        ) {
            if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
            else Icon(painterResource(R.drawable.ic_sparkles), null, Modifier.size(21.dp))
            Spacer(Modifier.width(10.dp))
            Text(if (loading) "Cerco titoli simili…" else if (results.isEmpty()) "Trova simili con l'IA" else "Altri simili", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}

private fun greeting(): String = when (java.time.LocalTime.now(TvGuideRepository.ROME).hour) {
    in 5..12 -> "Buongiorno"
    in 13..17 -> "Buon pomeriggio"
    else -> "Buonasera"
}

@Composable
private fun HomeScreen(
    api: TmdbApi,
    store: LibraryStore,
    refresh: Int,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onSearch: (Rect?) -> Unit,
    onSettings: (Rect?) -> Unit,
    onAdvisor: (Boolean) -> Unit,
    onAskAi: (Rect?) -> Unit,
    onOpenLibrary: (LibrarySection) -> Unit,
    onDiscover: () -> Unit,
    onOpenGuide: () -> Unit,
    onOpenPerson: (Models.Person, Rect?) -> Unit
) {
    val progress = remember(refresh) { continueWatchingOrder(store.entriesByState("progress").toList()) }
    val saved = remember(refresh) { store.entriesByState("saved").sortedByDescending { it.pinned }.map { it.media } }
    val watchedCount = remember(refresh) { store.byState("watched").size }
    val hidden = remember(refresh) { store.byState("hidden").map { it.id }.toSet() }
    val context = LocalContext.current
    val follows = remember(refresh) { ReleaseFollows.all(context) }
    val followedPeople = remember(refresh) { PersonFollows.people(context).distinctBy { it.id } }
    var trending by remember { mutableStateOf<List<Models.Media>?>(null) }
    LaunchedEffect(api) {
        trending = withContext(Dispatchers.IO) {
            coroutineScope {
                val movies = async { runCatching { api.trending("movie").toList() }.getOrDefault(emptyList()) }
                val series = async { runCatching { api.trending("tv").toList() }.getOrDefault(emptyList()) }
                val m = movies.await()
                val s = series.await()
                (0 until maxOf(m.size, s.size)).flatMap { listOfNotNull(m.getOrNull(it), s.getOrNull(it)) }
            }
        }
    }
    val holiday = remember { currentHoliday() }
    var holidayMedia by remember { mutableStateOf<List<Models.Media>>(emptyList()) }
    LaunchedEffect(holiday) {
        val season = holiday ?: return@LaunchedEffect
        holidayMedia = withContext(Dispatchers.IO) {
            coroutineScope {
                val movies = async { runCatching { api.holiday(season.id, "movie", 1).toList() }.getOrDefault(emptyList()) }
                val series = async { runCatching { api.holiday(season.id, "tv", 1).toList() }.getOrDefault(emptyList()) }
                val m = movies.await()
                val s = series.await()
                (0 until maxOf(m.size, s.size)).flatMap { listOfNotNull(m.getOrNull(it), s.getOrNull(it)) }
            }
        }
    }
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = statusTop + 14.dp, bottom = 132.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        item {
            Column(Modifier.padding(horizontal = 20.dp).reveal()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(greeting().uppercase(), color = Sw.Accent, fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                        Text("Cosa guardiamo?", style = MaterialTheme.typography.displaySmall, color = Ink, modifier = Modifier.padding(top = 4.dp))
                    }
                    GlassIconButton(R.drawable.ic_settings, "Impostazioni", onClick = onSettings)
                }
                SearchPill(Modifier.padding(top = 18.dp), onSearch)
            }
        }
        item { AdvisorCards(progress.isNotEmpty() || saved.isNotEmpty(), Modifier.reveal(90), onAdvisor) }
        item { AiAskCard(Modifier.padding(horizontal = 20.dp).reveal(120), onAskAi) }
        if (holiday != null && holidayMedia.any { it.id !in hidden }) item {
            HolidayRail(holiday, holidayMedia.filter { it.id !in hidden }, store, onOpen, onAction, onSeeAll = { onDiscover() }, onLoadMore = null, loadingMore = false)
        }
        if (progress.isNotEmpty()) item {
            Column(Modifier.reveal(160)) {
                SectionHeader("Continua a guardare", eyebrow = "Riprendi da dove eri", onAction = { onOpenLibrary(LibrarySection.PROGRESS) })
                LazyRow(Modifier.padding(top = 12.dp), contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(progress, key = { it.media.id }) { entry -> ContinueCard(entry, refresh, { onOpen(entry.media) }, { onAction(entry.media) }) }
                }
            }
        }
        if (progress.isEmpty() && saved.isEmpty() && watchedCount == 0) item { EmptyLibrary(onDiscover) }
        if (follows.isNotEmpty()) item {
            val today = java.time.LocalDate.now(TvGuideRepository.ROME)
            val labels = follows.associate { it.media.id to ReleaseFollows.shortLabel(it, today) }
            MediaRail("Uscite che segui", follows.map { it.media }, store, onOpen, onAction, contentVersion = refresh, footerFor = { labels[it.id] }, eyebrow = "Ti avviso io", onSeeAll = { onOpenLibrary(LibrarySection.FOLLOWING) })
        }
        item {
            val list = trending
            if (list == null) RailSkeleton("In tendenza")
            else MediaRail("In tendenza", list.filter { it.id !in hidden }.take(10), store, onOpen, onAction, ranked = true, contentVersion = refresh, eyebrow = "Film e serie · Top 10 della settimana")
        }
        if (saved.isNotEmpty()) item { MediaRail("La mia lista", saved, store, onOpen, onAction, contentVersion = refresh, eyebrow = "${saved.size} da vedere", onSeeAll = { onOpenLibrary(LibrarySection.SAVED) }) }
        item { GuideTeaser(onOpenGuide) }
        if (followedPeople.isNotEmpty()) item { PeopleRail(followedPeople, title = "Persone che segui", topPadding = 0.dp, onPersonClick = onOpenPerson) }
    }
}

@Composable
private fun SearchPill(modifier: Modifier, onSearch: (Rect?) -> Unit) {
    var bounds by remember { mutableStateOf<Rect?>(null) }
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier.fillMaxWidth().height(54.dp)
            .onGloballyPositioned { bounds = it.boundsInRoot() }
            .pressScale(interaction, .97f)
            .glass(RoundedCornerShape(27.dp))
            .clickable(interaction, indication = null) { onSearch(bounds) }
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(painterResource(R.drawable.ic_search), null, tint = Sw.Accent, modifier = Modifier.size(22.dp))
        Text("Film, serie, attori, registi…", color = Muted, fontSize = 15.sp, modifier = Modifier.padding(start = 12.dp).weight(1f))
    }
}

@Composable
private fun AdvisorCards(hasLibrary: Boolean, modifier: Modifier, onAdvisor: (Boolean) -> Unit) {
    Row(modifier.padding(horizontal = 20.dp).fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AdvisorCard("Sorprendimi", "Un titolo a caso dal catalogo, su misura", R.drawable.ic_sparkles, primary = true, Modifier.weight(1f)) { onAdvisor(false) }
        if (hasLibrary) AdvisorCard("Dalla mia lista", "Scelgo io tra i titoli che hai salvato", R.drawable.ic_library, primary = false, Modifier.weight(1f)) { onAdvisor(true) }
    }
}

@Composable
private fun AdvisorCard(title: String, subtitle: String, icon: Int, primary: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(26.dp)
    val transition = rememberInfiniteTransition(label = "advisor-icon")
    val wiggle by transition.animateFloat(-10f, 10f, infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "advisor-wiggle")
    Column(
        modifier.fillMaxHeight()
            .pressScale(interaction, .96f)
            .then(if (primary) Modifier.brandGlow(shape, 14.dp).clip(shape).lightSweep() else Modifier.glass(shape))
            .clickable(interaction, indication = null, onClick = onClick)
            .padding(18.dp)
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = if (primary) .22f else .08f)), contentAlignment = Alignment.Center) {
            Icon(painterResource(icon), null, tint = if (primary) Color.White else Sw.Accent,
                modifier = Modifier.size(22.dp).graphicsLayer { if (primary) rotationZ = wiggle })
        }
        Text(title, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, modifier = Modifier.padding(top = 14.dp))
        Text(subtitle, color = Color.White.copy(alpha = if (primary) .86f else .6f), fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
private fun ContinueCard(entry: Models.LibraryEntry, contentVersion: Int, open: () -> Unit, actions: () -> Unit) {
    val media = entry.media
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    val shape = RoundedCornerShape(22.dp)
    val label = remember(entry.nextSeason, entry.nextEpisode, entry.state, contentVersion) {
        if (media.isSeries) "Prossimo · S${entry.nextSeason} E${entry.nextEpisode}" else "Film · da finire"
    }
    Box(Modifier.width(284.dp).aspectRatio(16f / 9.5f).noRippleCombinedClickable(onClick = { registerSource(sourceKey); open() }, onLongClick = actions)) {
        SharedArtworkSource(media, sourceKey, Modifier.fillMaxSize(), shape, media.backdrop.ifBlank { media.poster })
        Box(Modifier.matchParentSize().clip(shape).background(Brush.verticalGradient(0f to Color.Transparent, .45f to Color.Black.copy(alpha = .15f), 1f to Color.Black.copy(alpha = .9f))))
        Box(Modifier.matchParentSize().border(1.dp, Color.White.copy(alpha = .08f), shape))
        if (entry.pinned) Box(Modifier.align(Alignment.TopEnd).padding(10.dp).size(30.dp).clip(CircleShape).background(Sw.Brand), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_push_pin), "Titolo fissato in alto", tint = Color.White, modifier = Modifier.size(16.dp))
        }
        Row(Modifier.align(Alignment.BottomStart).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).brandGlow(CircleShape, 8.dp), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_play), "Riprendi", tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.padding(start = 11.dp)) {
                Text(media.title, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(label, color = Color.White.copy(alpha = .78f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

@Composable
private fun RailSkeleton(title: String?) {
    Column {
        if (title != null) SectionHeader(title)
        else LoadingSkeleton(Modifier.padding(horizontal = 20.dp).width(160.dp).height(20.dp).clip(RoundedCornerShape(8.dp)))
        Row(Modifier.padding(top = 12.dp).padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(3) {
                Column(Modifier.width(136.dp)) {
                    LoadingSkeleton(Modifier.fillMaxWidth().aspectRatio(.68f).clip(RoundedCornerShape(18.dp)))
                    LoadingSkeleton(Modifier.padding(top = 10.dp).fillMaxWidth(.8f).height(12.dp).clip(RoundedCornerShape(6.dp)))
                }
            }
        }
    }
}

@Composable
private fun GuideTeaser(onOpen: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(26.dp)
    Row(
        Modifier.padding(horizontal = 20.dp).fillMaxWidth().reveal()
            .pressScale(interaction, .97f)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF1B2542), Color(0xFF141826))))
            .border(1.dp, Sw.Blue.copy(alpha = .35f), shape)
            .clickable(interaction, indication = null, onClick = onOpen)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(17.dp)).background(Sw.Blue.copy(alpha = .18f)), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_tv_guide), null, tint = Sw.Blue, modifier = Modifier.size(27.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PulsingDot(LikeGreen, size = 4.dp)
                Text("STASERA IN TV", color = LikeGreen, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, modifier = Modifier.padding(start = 4.dp))
            }
            Text("Film e serie in chiaro", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
            Text("Palinsesti, canali e promemoria", color = Muted, fontSize = 13.sp)
        }
        Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Muted)
    }
}

@Composable
private fun EmptyState(icon: Int, title: String, body: String, modifier: Modifier = Modifier, action: String? = null, onAction: (() -> Unit)? = null) {
    val transition = rememberInfiniteTransition(label = "empty-float")
    val float by transition.animateFloat(-5f, 5f, infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "empty-float-y")
    Column(modifier.fillMaxWidth().padding(horizontal = 36.dp, vertical = 36.dp).reveal(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.graphicsLayer { translationY = float.dp.toPx() }.size(84.dp).brandGlow(RoundedCornerShape(28.dp), 18.dp), contentAlignment = Alignment.Center) {
            Icon(painterResource(icon), null, tint = Color.White, modifier = Modifier.size(38.dp))
        }
        Text(title, style = MaterialTheme.typography.headlineSmall, color = Ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 24.dp))
        Text(body, color = Muted, fontSize = 15.sp, lineHeight = 21.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        if (action != null && onAction != null) Button(
            onAction,
            modifier = Modifier.padding(top = 22.dp).height(50.dp).crimsonGlow(CircleShape, 8.dp),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
            contentPadding = PaddingValues(horizontal = 26.dp)
        ) { Text(action, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun DiscoverScreen(
    kind: Kind,
    onKind: (Kind) -> Unit,
    api: TmdbApi,
    store: LibraryStore,
    refresh: Int,
    chromeVisible: Boolean,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onSearch: (Rect?) -> Unit,
    onFilters: (Rect?) -> Unit,
    onChanged: () -> Unit,
    onExpandedChange: (Boolean) -> Unit
) {
    val listStates = remember { Kind.entries.associateWith { androidx.compose.foundation.lazy.LazyListState() } }
    Box(Modifier.fillMaxSize()) {
        AnimatedContent(kind, label = "discover-kind", transitionSpec = {
            val forward = targetState.ordinal > initialState.ordinal
            (fadeIn(tween(260)) + androidx.compose.animation.slideInHorizontally(tween(420, easing = Sw.Emphasized)) { if (forward) it / 5 else -it / 5 }) togetherWith
                (fadeOut(tween(140)) + androidx.compose.animation.slideOutHorizontally(tween(320, easing = Sw.Emphasized)) { if (forward) -it / 8 else it / 8 })
        }) { target ->
            CatalogScreen(target, api, store, refresh, listStates.getValue(target), onOpen, onAction, onFilters, onChanged, onExpandedChange)
        }
        val state = listStates.getValue(kind)
        val scrolled by remember(kind) { derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 8 } }
        val solid by animateFloatAsState(if (scrolled) 1f else 0f, tween(280), label = "discover-header")
        AnimatedVisibility(chromeVisible, enter = fadeIn(tween(200)), exit = fadeOut(tween(120))) {
            Column(
                Modifier.fillMaxWidth()
                    .drawBehind {
                        drawRect(Sw.Background.copy(alpha = .95f * solid))
                    }
                    .statusBarsPadding()
                    .padding(bottom = 12.dp)
            ) {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Scopri", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black, letterSpacing = (-.9).sp, modifier = Modifier.weight(1f))
                    GlassIconButton(R.drawable.ic_search, "Cerca", onClick = onSearch)
                    Spacer(Modifier.width(10.dp))
                    GlassIconButton(R.drawable.ic_tune, "Piattaforma e genere", onClick = onFilters)
                }
                SegmentedPills(Kind.entries.map { it.label }, kind.ordinal, Modifier.padding(horizontal = 20.dp).padding(top = 12.dp).fillMaxWidth()) { onKind(Kind.entries[it]) }
            }
        }
    }
}

@Composable
private fun LibraryScreen(
    section: LibrarySection,
    onSection: (LibrarySection) -> Unit,
    api: TmdbApi,
    store: LibraryStore,
    refresh: Int,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onOpenSaga: (SagaCollection) -> Unit,
    onOpenPerson: (Models.Person, Rect?) -> Unit,
    onDiscover: () -> Unit
) {
    val context = LocalContext.current
    val counts = remember(refresh) {
        mapOf(
            LibrarySection.PROGRESS to store.byState("progress").size,
            LibrarySection.SAVED to store.byState("saved").size,
            LibrarySection.WATCHED to store.byState("watched").size,
            LibrarySection.HIDDEN to store.byState("hidden").size
        )
    }
    val follows = remember(refresh) { ReleaseFollows.all(context) }
    val people = remember(refresh) { PersonFollows.people(context).distinctBy { it.id } }
    val saved = remember(refresh) { store.entriesByState("saved").map { it.media } }
    var sagas by remember { mutableStateOf<List<SagaCollection>>(emptyList()) }
    LaunchedEffect(refresh) {
        val seeds = saved.filter { it.collectionId > 0 }.distinctBy { it.collectionId }
        sagas = withContext(Dispatchers.IO) {
            seeds.mapNotNull { seed -> runCatching { SagaCollection(seed.collectionId, seed.collectionName, (api.saga(seed) + saved.filter { it.collectionId == seed.collectionId }).distinctBy { it.id }.sortedBy { it.releaseDate }) }.getOrNull()?.takeIf { it.movies.isNotEmpty() } }
        }
    }
    val sections = LibrarySection.entries.filter {
        when (it) {
            LibrarySection.SAGAS -> sagas.isNotEmpty()
            LibrarySection.HIDDEN -> (counts[it] ?: 0) > 0
            else -> true
        }
    }
    val current = if (section in sections) section else LibrarySection.PROGRESS
    val total = (counts[LibrarySection.PROGRESS] ?: 0) + (counts[LibrarySection.SAVED] ?: 0) + (counts[LibrarySection.WATCHED] ?: 0)
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Column(Modifier.padding(horizontal = 20.dp).padding(top = 14.dp).reveal()) {
            Text("LA TUA COLLEZIONE", color = Sw.Accent, fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
            Text("Libreria", style = MaterialTheme.typography.displaySmall, color = Ink, modifier = Modifier.padding(top = 4.dp))
            AnimatedCount(total) { value ->
                Text("$value titoli · ${follows.size + people.size} seguiti", color = Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
        ChipTabs(
            sections.map { it.label to when (it) {
                LibrarySection.FOLLOWING -> follows.size + people.size
                LibrarySection.SAGAS -> sagas.size
                LibrarySection.SERVICES -> null
                else -> counts[it]
            } },
            sections.indexOf(current),
            Modifier.padding(top = 16.dp)
        ) { onSection(sections[it]) }
        AnimatedContent(
            current,
            modifier = Modifier.weight(1f).fillMaxWidth().padding(top = 12.dp),
            transitionSpec = { (fadeIn(tween(240)) + slideInVertically(tween(360, easing = Sw.Emphasized)) { it / 14 }) togetherWith fadeOut(tween(120)) },
            label = "library-section"
        ) { target ->
            when (target) {
                LibrarySection.PROGRESS, LibrarySection.SAVED, LibrarySection.WATCHED ->
                    LibrarySectionContent(target.home!!, store, refresh, onOpen, onAction, onDiscover)
                LibrarySection.FOLLOWING -> FollowingContent(follows, people, refresh, onOpen, onAction, onOpenPerson)
                LibrarySection.SERVICES -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 4.dp, bottom = 132.dp)) {
                    SubscriptionsPanel(store, refresh, onOpen)
                }
                LibrarySection.SAGAS -> LazyVerticalGrid(
                    GridCells.Fixed(2), Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 132.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)
                ) { gridItems(sagas, key = { it.id }) { SagaCollectionCard(it, onOpenSaga, Modifier.fillMaxWidth()) } }
                LibrarySection.HIDDEN -> {
                    val hidden = remember(refresh) { store.byState("hidden").toList() }
                    LazyVerticalGrid(
                        GridCells.Adaptive(104.dp), Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 132.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        item(span = { GridItemSpan(maxLineSpan) }) { Text("Tieni premuto un titolo per ripristinarlo nel catalogo.", color = Muted, fontSize = 13.sp) }
                        gridItems(hidden, key = { it.id }) { media -> SearchPosterCard(media, store.get(media), contentVersion = refresh, onLongPress = { onAction(media) }) { onOpen(media) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun FollowingContent(
    follows: List<ReleaseFollows.Follow>,
    people: List<Models.Person>,
    refresh: Int,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onOpenPerson: (Models.Person, Rect?) -> Unit
) {
    if (follows.isEmpty() && people.isEmpty()) {
        EmptyState(R.drawable.ic_notifications_none, "Non segui ancora nulla", "Tocca “Segui” nella scheda di un film, di una serie, di un attore o di un regista: ti avviserò quando esce qualcosa di nuovo.")
        return
    }
    val today = remember(refresh) { java.time.LocalDate.now(TvGuideRepository.ROME) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 4.dp, bottom = 132.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (people.isNotEmpty()) item { PeopleRail(people, title = "Persone", topPadding = 0.dp, onPersonClick = onOpenPerson) }
        if (follows.isNotEmpty()) item { SectionHeader("Titoli", eyebrow = "Uscite e nuovi episodi", modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)) }
        items(follows, key = { it.media.id }) { follow ->
            val media = follow.media
            Row(
                Modifier.padding(horizontal = 20.dp).fillMaxWidth().animateItem()
                    .noRippleCombinedClickable(onClick = { onOpen(media) }, onLongClick = { onAction(media) })
                    .glass(RoundedCornerShape(22.dp))
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                RemoteImage(media.poster.ifBlank { media.backdrop }, Modifier.size(62.dp, 90.dp).clip(RoundedCornerShape(14.dp)), ContentScale.Crop)
                Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                    Text(media.title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(if (media.isSeries) "Serie TV" else "Film", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_notifications), null, tint = FollowGold, modifier = Modifier.size(15.dp))
                        Text(ReleaseFollows.shortLabel(follow, today) ?: "", color = FollowGold, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 5.dp))
                    }
                }
                Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Muted)
            }
        }
    }
}

@Composable
private fun SagaCollectionsRail(collections: List<SagaCollection>, onOpen: (SagaCollection) -> Unit) {
    Column {
        Text("Le mie saghe", style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 10.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(collections, key = { it.id }) { collection -> SagaCollectionCard(collection, onOpen) }
        }
    }
}

@Composable
private fun SagaCollectionCard(collection: SagaCollection, onOpen: (SagaCollection) -> Unit, modifier: Modifier = Modifier.width(148.dp)) {
    val cover = collection.movies.firstOrNull()
    val sourceKey = remember(collection.id) { sagaArtworkKey(collection) }
    val registerSource = LocalRegisterArtworkSource.current
    NoRipple { Surface(onClick = { registerSource(sourceKey); onOpen(collection) }, modifier = modifier, shape = RoundedCornerShape(22.dp), color = Raised) {
        Box(Modifier.fillMaxWidth().aspectRatio(.68f)) {
            if (cover != null) SharedArtworkSource(cover, sourceKey, Modifier.fillMaxSize(), RoundedCornerShape(22.dp), cover.poster.ifBlank { cover.backdrop })
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .82f)))))
            Surface(Modifier.align(Alignment.TopEnd).padding(9.dp), color = DeepCrimson, shape = RoundedCornerShape(12.dp)) {
                Text("${collection.movies.size} film", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp))
            }
            Text(collection.name.ifBlank { "Saga" }, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp))
        }
    } }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SagaDetailScreen(
    collection: SagaCollection,
    store: LibraryStore,
    refreshVersion: Int,
    backEnabled: Boolean,
    onDismiss: () -> Unit,
    onOpen: (Models.Media) -> Unit
) {
    val visible = remember(collection.id) { MutableTransitionState(false).apply { targetState = true } }
    val close = {
        if (visible.targetState) {
            visible.targetState = false
            onDismiss()
        }
    }
    BackHandler(enabled = backEnabled && visible.targetState, onBack = close)
    AnimatedVisibility(visibleState = visible, enter = fadeIn(tween(90)), exit = fadeOut(tween(180))) {
        CompositionLocalProvider(LocalDetailVisibilityScope provides this@AnimatedVisibility) {
        Surface(Modifier.sharedSagaBounds(sagaArtworkKey(collection)).fillMaxSize(), color = Night) {
            val hero = collection.movies.firstOrNull()
            LazyVerticalGrid(columns = GridCells.Fixed(2), modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(18.dp), contentPadding = PaddingValues(bottom = 28.dp)) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().height(520.dp)) {
                        if (hero != null) RemoteImage(hero.poster.ifBlank { hero.backdrop }, Modifier.fillMaxSize(), ContentScale.Crop)
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .2f), Color.Transparent, Night.copy(alpha = .98f)))))
                        FilledTonalIconButton(close, Modifier.statusBarsPadding().padding(16.dp).align(Alignment.TopStart), colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color(0xCC14161E))) {
                            Icon(painterResource(R.drawable.ic_back), "Indietro", tint = Color.White)
                        }
                        Column(Modifier.align(Alignment.BottomStart).padding(20.dp)) {
                            Text("SAGA · ${collection.movies.size} FILM", color = CrimsonSoft, fontWeight = FontWeight.Black, fontSize = 11.sp, letterSpacing = 1.4.sp)
                            Text(collection.name.ifBlank { "Saga" }, color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 5.dp))
                        }
                    }
                }
                gridItems(collection.movies, key = { it.id }) { media ->
                    Column(Modifier.padding(horizontal = 10.dp)) {
                        val entry = remember(media.id, refreshVersion) { store.get(media) }
                        SearchPosterCard(media, entry, contentVersion = refreshVersion) { onOpen(media) }
                    }
                }
            }
        }
    }
}
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun Modifier.sharedSagaBounds(key: String): Modifier {
    val transitionScope = LocalSharedTransitionScope.current ?: return this
    val visibilityScope = LocalDetailVisibilityScope.current ?: return this
    return with(transitionScope) {
        sharedBounds(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibilityScope,
            enter = fadeIn(tween(180, delayMillis = 60)),
            exit = fadeOut(tween(durationMillis = 240, delayMillis = 80, easing = LinearEasing)),
            boundsTransform = { _, _ -> tween(320, easing = FastOutSlowInEasing) },
            resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds()
        )
    }
}

@Composable private fun EmptyLibrary(openMovies: () -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp).fillMaxWidth().reveal(120).glass(RoundedCornerShape(30.dp)).padding(24.dp)) {
        Box(Modifier.size(54.dp).brandGlow(RoundedCornerShape(18.dp), 10.dp), contentAlignment = Alignment.Center) { Icon(painterResource(R.drawable.ic_add), null, tint = Color.White, modifier = Modifier.size(28.dp)) }
        Text("Costruisci la tua lista", style = MaterialTheme.typography.headlineMedium, color = Ink, modifier = Modifier.padding(top = 20.dp))
        Text("Salva film e serie: StreamWise terrà il filo per te, episodio dopo episodio.", color = Muted, fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier.padding(top = 7.dp, bottom = 20.dp))
        Button(openMovies, shape = CircleShape, modifier = Modifier.height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Night)) { Icon(painterResource(R.drawable.ic_compass), null); Spacer(Modifier.width(8.dp)); Text("Esplora il catalogo", fontWeight = FontWeight.Bold) }
    }
}

private data class CatalogRail(val name: String, val genre: TmdbApi.Genre, val media: List<Models.Media>)
private data class CatalogData(val trending: List<Models.Media>, val featured: List<Models.Media>, val masterpieces: List<Models.Media>, val trueStories: List<Models.Media>, val apocalyptic: List<Models.Media>, val trueCrime: List<Models.Media>, val rails: List<CatalogRail>)
private const val NEW_RELEASES_RAIL = "Novità"
private const val MASTERPIECES_RAIL = "Capolavori da scoprire"
private const val TASTE_RAIL = "Consigliati per te"
private const val TRUE_STORIES_RAIL = "Storie vere"
private const val TRUE_CRIME_RAIL = "True crime"
private const val APOCALYPTIC_RAIL = "Apocalittici"
private const val HOLIDAY_RAIL = "Speciale festività"

/** Seasonal sections: Halloween for all of October, Christmas from mid November to Epiphany. */
private enum class Holiday(val id: String, val title: String, val eyebrow: String, val subtitle: String, val emoji: String, val accent: Color, val background: List<Color>) {
    HALLOWEEN("halloween", "Speciale Halloween", "BRIVIDI DI STAGIONE", "Streghe, zucche e notti da paura: film e serie a tema.", "🎃",
        Color(0xFFFF8A1E), listOf(Color(0xFF2B1608), Color(0xFF15111C), Color(0xFF1E0F1F))),
    CHRISTMAS("christmas", "Speciale Natale", "ATMOSFERA NATALIZIA", "Film e serie da guardare sotto l’albero.", "🎄",
        Color(0xFF3DDC84), listOf(Color(0xFF0F2A1C), Color(0xFF15131A), Color(0xFF2A0F14)))
}

private fun currentHoliday(today: java.time.LocalDate = java.time.LocalDate.now(TvGuideRepository.ROME)): Holiday? = when {
    today.monthValue == 10 -> Holiday.HALLOWEEN
    today.monthValue == 11 && today.dayOfMonth >= 15 -> Holiday.CHRISTMAS
    today.monthValue == 12 -> Holiday.CHRISTMAS
    today.monthValue == 1 && today.dayOfMonth <= 6 -> Holiday.CHRISTMAS
    else -> null
}

private fun continueWatchingOrder(entries: List<Models.LibraryEntry>): List<Models.LibraryEntry> =
    entries.sortedWith(
        compareByDescending<Models.LibraryEntry> { it.pinned }
            .thenByDescending { it.nextSeason }
            .thenByDescending { it.nextEpisode }
            .thenBy { it.media.title.lowercase(Locale.ITALY) }
    )

private fun matchingGenre(seed: Models.Media, targetType: String): Int? {
    val mapping = if (targetType == "tv") mapOf(28 to 10759, 35 to 35, 18 to 18, 53 to 80,
        80 to 80, 878 to 10765, 14 to 10765, 99 to 99, 16 to 16, 9648 to 9648)
    else mapOf(10759 to 28, 35 to 35, 18 to 18, 80 to 80, 10765 to 878,
        99 to 99, 16 to 16, 9648 to 9648, 10751 to 10751)
    return seed.genreIds.firstNotNullOfOrNull { mapping[it] }
}

private suspend fun tastePage(api: TmdbApi, type: String, seeds: List<Models.Media>, page: Int,
    excluded: Set<String>): List<Models.Media> = withContext(Dispatchers.IO) {
    seeds.take(3).flatMap { seed ->
        runCatching {
            if (seed.mediaType == type) api.recommendations(seed, page).ifEmpty {
                seed.genreIds.firstOrNull()?.let { api.discover(type, page, it, null, "popular").toList() } ?: emptyList()
            }
            else matchingGenre(seed, type)?.let { api.discover(type, page, it, null, "popular").toList() } ?: emptyList()
        }.getOrDefault(emptyList())
    }.filter { it.id !in excluded && it.poster.isNotBlank() }.distinctBy { it.id }.shuffled().take(18)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogScreen(kind: Kind, api: TmdbApi, store: LibraryStore, refresh: Int, listState: androidx.compose.foundation.lazy.LazyListState, onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit, onFilters: (Rect?) -> Unit, onChanged: () -> Unit, onExpandedChange: (Boolean) -> Unit) {
    val type = kind.type
    var data by remember(kind) { mutableStateOf<CatalogData?>(null) }
    var error by remember(kind) { mutableStateOf<String?>(null) }
    val railPages = remember(kind) { mutableStateMapOf<String, Int>() }
    var loadingRail by remember(kind) { mutableStateOf<String?>(null) }
    var expandedRailName by remember(kind) { mutableStateOf<String?>(null) }
    var expandedRailOrigin by remember(kind) { mutableStateOf<Rect?>(null) }
    var reloadVersion by remember(kind) { mutableIntStateOf(0) }
    val newReleases = rememberNewReleases(type, api, reloadVersion)
    DisposableEffect(kind) { onDispose { onExpandedChange(false) } }
    var refreshing by remember(kind) { mutableStateOf(false) }
    var masterpiecesPage by remember(kind) { mutableIntStateOf(2) }
    var masterpiecesRefreshing by remember(kind) { mutableStateOf(false) }
    var masterpiecesLoadingMore by remember(kind) { mutableStateOf(false) }
    var trueStoriesPage by remember(kind) { mutableIntStateOf(1) }
    var trueStoriesHasMore by remember(kind) { mutableStateOf(true) }
    var trueStoriesRefreshing by remember(kind) { mutableStateOf(false) }
    var trueStoriesLoadingMore by remember(kind) { mutableStateOf(false) }
    var apocalypticPage by remember(kind) { mutableIntStateOf(1) }
    var apocalypticHasMore by remember(kind) { mutableStateOf(true) }
    var apocalypticRefreshing by remember(kind) { mutableStateOf(false) }
    var apocalypticLoadingMore by remember(kind) { mutableStateOf(false) }
    var trueCrimePage by remember(kind) { mutableIntStateOf(1) }
    var trueCrimeHasMore by remember(kind) { mutableStateOf(true) }
    var trueCrimeRefreshing by remember(kind) { mutableStateOf(false) }
    var trueCrimeLoadingMore by remember(kind) { mutableStateOf(false) }
    var filtersButtonBounds by remember(kind) { mutableStateOf<Rect?>(null) }
    val holiday = remember { currentHoliday() }
    var holidayMedia by remember(kind) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var holidayPage by remember(kind) { mutableIntStateOf(1) }
    var holidayHasMore by remember(kind) { mutableStateOf(true) }
    var holidayLoadingMore by remember(kind) { mutableStateOf(false) }
    LaunchedEffect(kind, reloadVersion) {
        val season = holiday ?: return@LaunchedEffect
        val first = withContext(Dispatchers.IO) { runCatching { api.holiday(season.id, type, 1).toList() }.getOrDefault(emptyList()) }
        holidayMedia = first; holidayPage = 1; holidayHasMore = first.isNotEmpty()
    }
    val likedSeeds = remember(kind, refresh) { store.all().filter { it.liked == true && it.state != "hidden" }.map { it.media } }
    var tasteSeeds by remember(kind) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var tasteMedia by remember(kind) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var tastePageNumber by remember(kind) { mutableIntStateOf(1) }
    var tasteRefreshVersion by remember(kind) { mutableIntStateOf(0) }
    var tasteRefreshing by remember(kind) { mutableStateOf(false) }
    var tasteLoadingMore by remember(kind) { mutableStateOf(false) }
    var tasteHasMore by remember(kind) { mutableStateOf(true) }
    val pullToRefreshState = rememberPullToRefreshState()
    val scope = rememberCoroutineScope()
    fun expandRail(name: String, bounds: Rect?) {
        expandedRailOrigin = bounds
        expandedRailName = name
        onExpandedChange(true)
    }
    fun dismissExpandedRail() {
        expandedRailName = null
        onExpandedChange(false)
    }
    LaunchedEffect(kind, reloadVersion) {
        if (!api.configured()) { error = "Configura la chiave TMDB dalle impostazioni."; refreshing = false; return@LaunchedEffect }
        error = null
        if (reloadVersion > 0) railPages.clear()
        val firstMasterpiecesPage = (2..10).random()
        runCatching { withContext(Dispatchers.IO) { coroutineScope {
            val top = async { api.trending(type).toList() }
            val featured = async { runCatching { api.featured(type).toList() }.getOrDefault(emptyList()) }
            val masterpieces = async { api.masterpieces(type, firstMasterpiecesPage).toList() }
            val trueStories = async { runCatching { api.trueStories(type, 1).toList() }.getOrDefault(emptyList()) }
            val apocalyptic = async { runCatching { api.apocalyptic(type, 1).toList() }.getOrDefault(emptyList()) }
            val trueCrime = async { runCatching { api.trueCrime(type, 1).toList() }.getOrDefault(emptyList()) }
            val rails = TmdbApi.GENRES.filter { it.value(type) != 0 }.map { genre -> async { CatalogRail(genre.label, genre, if (genre.id == "erotic") api.eroticDiscover(type, 1) else api.discover(type, 1, genre.value(type), null, "popular").toList()) } }.awaitAll()
            CatalogData(top.await(), featured.await(), masterpieces.await(), trueStories.await(), apocalyptic.await(), trueCrime.await(), rails)
        } } }.onSuccess {
            data = it; masterpiecesPage = firstMasterpiecesPage; trueStoriesPage = 1; apocalypticPage = 1; trueCrimePage = 1
            trueStoriesHasMore = it.trueStories.isNotEmpty(); apocalypticHasMore = it.apocalyptic.isNotEmpty(); trueCrimeHasMore = it.trueCrime.isNotEmpty()
        }.onFailure { error = "Non riesco a caricare il catalogo." }
        refreshing = false
    }
    LaunchedEffect(kind, reloadVersion, tasteRefreshVersion, likedSeeds.isNotEmpty()) {
        if (likedSeeds.isEmpty() || !api.configured()) {
            tasteMedia = emptyList(); tasteSeeds = emptyList(); tasteRefreshing = false
            return@LaunchedEffect
        }
        tasteRefreshing = true
        val seeds = likedSeeds.shuffled().let { shuffled ->
            val sameType = shuffled.filter { it.mediaType == type }
            val otherType = shuffled.filter { it.mediaType != type && matchingGenre(it, type) != null }
            (sameType.take(2) + otherType.take(if (sameType.isEmpty()) 3 else 1)).ifEmpty { otherType.take(3) }
        }
        val excluded = store.all().map { it.media.id }.toSet()
        val first = tastePage(api, type, seeds, 1, excluded)
        tasteSeeds = seeds
        tasteMedia = first
        tastePageNumber = 1
        tasteHasMore = seeds.isNotEmpty()
        tasteRefreshing = false
    }
    fun refreshTaste() { if (!tasteRefreshing && !tasteLoadingMore) tasteRefreshVersion++ }
    fun loadMoreTaste() {
        if (tasteRefreshing || tasteLoadingMore || !tasteHasMore) return
        tasteLoadingMore = true
        scope.launch {
            val nextPage = tastePageNumber + 1
            val excluded = store.all().map { it.media.id }.toSet() + tasteMedia.map { it.id }
            val more = tastePage(api, type, tasteSeeds, nextPage, excluded)
            tasteMedia = (tasteMedia + more).distinctBy { it.id }
            tastePageNumber = nextPage
            tasteHasMore = more.isNotEmpty() && nextPage < 20
            tasteLoadingMore = false
        }
    }
    fun loadMoreHoliday() {
        val season = holiday ?: return
        if (holidayLoadingMore || !holidayHasMore) return
        holidayLoadingMore = true
        scope.launch {
            val nextPage = holidayPage + 1
            val more = withContext(Dispatchers.IO) { runCatching { api.holiday(season.id, type, nextPage).toList() }.getOrDefault(emptyList()) }
            holidayPage = nextPage
            if (more.isEmpty()) holidayHasMore = false else holidayMedia = (holidayMedia + more).distinctBy { it.id }
            holidayLoadingMore = false
        }
    }
    fun loadMoreRail(rail: CatalogRail) {
        if (loadingRail != null) return
        loadingRail = rail.name
        scope.launch {
            val nextPage = (railPages[rail.name] ?: 1) + 1
            val more = withContext(Dispatchers.IO) { runCatching { if (rail.genre.id == "erotic") api.eroticDiscover(type, nextPage) else api.discover(type, nextPage, rail.genre.value(type), null, "popular").toList() }.getOrDefault(emptyList()) }
            if (more.isNotEmpty()) {
                data = data?.copy(rails = data!!.rails.map { current -> if (current.name == rail.name) current.copy(media = (current.media + more).distinctBy { it.id }) else current })
                railPages[rail.name] = nextPage
            }
            loadingRail = null
        }
    }
    fun refreshMasterpieces() {
        if (masterpiecesRefreshing || masterpiecesLoadingMore) return
        masterpiecesRefreshing = true
        scope.launch {
            var nextPage = (2..10).random()
            if (nextPage == masterpiecesPage) nextPage = if (nextPage == 10) 2 else nextPage + 1
            val replacement = withContext(Dispatchers.IO) { runCatching { api.masterpieces(type, nextPage).toList() }.getOrDefault(emptyList()) }
            if (replacement.isNotEmpty()) {
                data = data?.copy(masterpieces = replacement)
                masterpiecesPage = nextPage
            }
            masterpiecesRefreshing = false
        }
    }
    fun loadMoreMasterpieces() {
        if (masterpiecesRefreshing || masterpiecesLoadingMore) return
        masterpiecesLoadingMore = true
        scope.launch {
            val nextPage = masterpiecesPage + 1
            val more = withContext(Dispatchers.IO) { runCatching { api.masterpieces(type, nextPage).toList() }.getOrDefault(emptyList()) }
            if (more.isNotEmpty()) {
                data = data?.copy(masterpieces = (data!!.masterpieces + more).distinctBy { it.id })
                masterpiecesPage = nextPage
            }
            masterpiecesLoadingMore = false
        }
    }
    fun refreshTrueStories() {
        if (trueStoriesRefreshing || trueStoriesLoadingMore) return
        trueStoriesRefreshing = true
        scope.launch {
            val replacement = withContext(Dispatchers.IO) { runCatching { api.trueStories(type, 1).toList() }.getOrDefault(emptyList()) }
            if (replacement.isNotEmpty()) {
                data = data?.copy(trueStories = replacement)
                trueStoriesPage = 1
                trueStoriesHasMore = true
            }
            trueStoriesRefreshing = false
        }
    }
    fun loadMoreTrueStories() {
        if (trueStoriesRefreshing || trueStoriesLoadingMore || !trueStoriesHasMore) return
        trueStoriesLoadingMore = true
        scope.launch {
            val nextPage = trueStoriesPage + 1
            val result = withContext(Dispatchers.IO) { runCatching { api.trueStories(type, nextPage).toList() } }
            result.onSuccess { more ->
                trueStoriesPage = nextPage
                if (more.isEmpty()) trueStoriesHasMore = false
                else data = data?.copy(trueStories = (data!!.trueStories + more).distinctBy { it.id })
            }
            trueStoriesLoadingMore = false
        }
    }
    fun refreshApocalyptic() {
        if (apocalypticRefreshing || apocalypticLoadingMore) return
        apocalypticRefreshing = true
        scope.launch {
            val replacement = withContext(Dispatchers.IO) { runCatching { api.apocalyptic(type, 1).toList() }.getOrDefault(emptyList()) }
            if (replacement.isNotEmpty()) {
                data = data?.copy(apocalyptic = replacement)
                apocalypticPage = 1
                apocalypticHasMore = true
            }
            apocalypticRefreshing = false
        }
    }
    fun loadMoreApocalyptic() {
        if (apocalypticRefreshing || apocalypticLoadingMore || !apocalypticHasMore) return
        apocalypticLoadingMore = true
        scope.launch {
            val nextPage = apocalypticPage + 1
            val result = withContext(Dispatchers.IO) { runCatching { api.apocalyptic(type, nextPage).toList() } }
            result.onSuccess { more ->
                apocalypticPage = nextPage
                if (more.isEmpty()) apocalypticHasMore = false
                else data = data?.copy(apocalyptic = (data!!.apocalyptic + more).distinctBy { it.id })
            }
            apocalypticLoadingMore = false
        }
    }
    fun refreshTrueCrime() {
        if (trueCrimeRefreshing || trueCrimeLoadingMore) return
        trueCrimeRefreshing = true
        scope.launch {
            val replacement = withContext(Dispatchers.IO) { runCatching { api.trueCrime(type, 1).toList() }.getOrDefault(emptyList()) }
            if (replacement.isNotEmpty()) {
                data = data?.copy(trueCrime = replacement)
                trueCrimePage = 1
                trueCrimeHasMore = true
            }
            trueCrimeRefreshing = false
        }
    }
    fun loadMoreTrueCrime() {
        if (trueCrimeRefreshing || trueCrimeLoadingMore || !trueCrimeHasMore) return
        trueCrimeLoadingMore = true
        scope.launch {
            val nextPage = trueCrimePage + 1
            val result = withContext(Dispatchers.IO) { runCatching { api.trueCrime(type, nextPage).toList() } }
            result.onSuccess { more ->
                trueCrimePage = nextPage
                if (more.isEmpty()) trueCrimeHasMore = false
                else data = data?.copy(trueCrime = (data!!.trueCrime + more).distinctBy { it.id })
            }
            trueCrimeLoadingMore = false
        }
    }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            if (!refreshing) {
                refreshing = true
                error = null
                reloadVersion++
            }
        },
        modifier = Modifier.fillMaxSize(),
        state = pullToRefreshState,
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pullToRefreshState,
                isRefreshing = refreshing,
                modifier = Modifier.align(Alignment.TopCenter).offset(y = 150.dp),
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    ) {
        when {
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(R.drawable.ic_refresh, "Catalogo non disponibile", error!!, action = "Riprova") { refreshing = true; error = null; reloadVersion++ }
            }
            data == null -> Column(Modifier.fillMaxSize()) {
                Spacer(Modifier.statusBarsPadding().height(136.dp))
                LoadingSkeleton(Modifier.padding(horizontal = 20.dp).fillMaxWidth().height(500.dp).clip(RoundedCornerShape(30.dp)))
                Spacer(Modifier.height(26.dp))
                RailSkeleton(null)
            }
            else -> {
                val hidden = store.byState("hidden").map { it.id }.toSet()
                val featured = (data!!.featured + data!!.trending)
                    .filter { it.id !in hidden && it.backdrop.isNotBlank() }
                    .distinctBy { it.id }
                    .take(8)
                LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 136.dp, bottom = 132.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
                    if (featured.isNotEmpty()) item {
                        FeaturedCarousel(featured, type, store, onOpen, onChanged)
                    }
                    item {
                        val interaction = remember { MutableInteractionSource() }
                        Row(
                            Modifier.padding(horizontal = 20.dp).fillMaxWidth().height(56.dp)
                                .onGloballyPositioned { filtersButtonBounds = it.boundsInRoot() }
                                .pressScale(interaction, .97f)
                                .glass(RoundedCornerShape(20.dp))
                                .clickable(interaction, indication = null) { onFilters(filtersButtonBounds) }
                                .padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(Modifier.size(34.dp).clip(CircleShape).background(Sw.Accent.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                                Icon(painterResource(R.drawable.ic_tune), null, tint = Sw.Accent, modifier = Modifier.size(19.dp))
                            }
                            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                                Text("Filtra per piattaforma e genere", color = Ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Text("Netflix, Prime Video, Disney+ e altri", color = Muted, fontSize = 12.sp)
                            }
                            Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Muted)
                        }
                    }
                    if (holiday != null && holidayMedia.any { it.id !in hidden }) item {
                        HolidayRail(holiday, holidayMedia.filter { it.id !in hidden }, store, onOpen, onAction,
                            onSeeAll = { expandRail(HOLIDAY_RAIL, it) }, onLoadMore = if (holidayHasMore) ::loadMoreHoliday else null, loadingMore = holidayLoadingMore)
                    }
                    item { NewReleasesSection(type, newReleases, store, refresh, onOpen, onAction) { bounds -> expandRail(NEW_RELEASES_RAIL, bounds) } }
                    item { MediaRail("Top 10 oggi", data!!.trending.filter { it.id !in hidden }, store, onOpen, onAction, ranked = true, onSeeAll = { expandRail("Top 10 oggi", it) }) }
                    if (likedSeeds.isNotEmpty() && tasteMedia.isNotEmpty()) item {
                        TasteRail(tasteMedia.filter { it.id !in hidden }, store, onOpen, onAction,
                            onSeeAll = { expandRail(TASTE_RAIL, it) }, onLoadMore = ::loadMoreTaste,
                            loadingMore = tasteLoadingMore, hasMore = tasteHasMore)
                    }
                    if (data!!.masterpieces.any { it.id !in hidden }) item {
                        DiscoveryRail(data!!.masterpieces.filter { it.id !in hidden }, store, onOpen, onAction,
                            onLoadMore = ::loadMoreMasterpieces, loadingMore = masterpiecesLoadingMore,
                            onSeeAll = { expandRail(MASTERPIECES_RAIL, it) })
                    }
                    if (data!!.trueStories.any { it.id !in hidden }) item {
                        MediaRail(TRUE_STORIES_RAIL, data!!.trueStories.filter { it.id !in hidden }, store, onOpen, onAction,
                            loadMore = if (trueStoriesHasMore) ::loadMoreTrueStories else null, loadingMore = trueStoriesLoadingMore,
                            onSeeAll = { expandRail(TRUE_STORIES_RAIL, it) })
                    }
                    if (data!!.apocalyptic.any { it.id !in hidden }) item {
                        MediaRail(APOCALYPTIC_RAIL, data!!.apocalyptic.filter { it.id !in hidden }, store, onOpen, onAction,
                            loadMore = if (apocalypticHasMore) ::loadMoreApocalyptic else null, loadingMore = apocalypticLoadingMore,
                            onSeeAll = { expandRail(APOCALYPTIC_RAIL, it) })
                    }
                    if (data!!.trueCrime.any { it.id !in hidden }) item {
                        MediaRail(TRUE_CRIME_RAIL, data!!.trueCrime.filter { it.id !in hidden }, store, onOpen, onAction,
                            loadMore = if (trueCrimeHasMore) ::loadMoreTrueCrime else null, loadingMore = trueCrimeLoadingMore,
                            onSeeAll = { expandRail(TRUE_CRIME_RAIL, it) })
                    }
                    data!!.rails.forEach { rail ->
                        item {
                            MediaRail(
                                rail.name,
                                rail.media.filter { it.id !in hidden },
                                store, onOpen, onAction,
                                loadMore = { loadMoreRail(rail) },
                                loadingMore = loadingRail == rail.name,
                                onSeeAll = { expandRail(rail.name, it) }
                            )
                        }
                    }
                }
            }
        }
    }
    expandedRailName?.let { name ->
        val catalog = data ?: return@let
        val rail = catalog.rails.firstOrNull { it.name == name }
        val hidden = store.byState("hidden").map { it.id }.toSet()
        val media = when (name) {
            NEW_RELEASES_RAIL -> newReleases.media
            HOLIDAY_RAIL -> holidayMedia
            MASTERPIECES_RAIL -> catalog.masterpieces
            TASTE_RAIL -> tasteMedia
            TRUE_STORIES_RAIL -> catalog.trueStories
            TRUE_CRIME_RAIL -> catalog.trueCrime
            APOCALYPTIC_RAIL -> catalog.apocalyptic
            "Top 10 oggi" -> catalog.trending
            else -> rail?.media ?: emptyList()
        }.filter { it.id !in hidden }
        ExpandingPage(
            expandedRailOrigin, onClosed = ::dismissExpandedRail, sourceCorner = 17.dp,
            sourceArt = { SeeAllChipArt(if (name == MASTERPIECES_RAIL || name == TASTE_RAIL || name == HOLIDAY_RAIL) "Tutti" else "Vedi tutto", Modifier.fillMaxSize()) }
        ) { close -> CatalogExpandedScreen(
            title = if (name == NEW_RELEASES_RAIL) "Novità · ${if (newReleases.upcoming) "In arrivo" else "Appena usciti"}" else if (name == HOLIDAY_RAIL) holiday?.title ?: name else name,
            media = media,
            store = store,
            loadingMore = when (name) { NEW_RELEASES_RAIL -> newReleases.loadingMore; HOLIDAY_RAIL -> holidayLoadingMore; MASTERPIECES_RAIL -> masterpiecesLoadingMore; TASTE_RAIL -> tasteLoadingMore; TRUE_STORIES_RAIL -> trueStoriesLoadingMore; TRUE_CRIME_RAIL -> trueCrimeLoadingMore; APOCALYPTIC_RAIL -> apocalypticLoadingMore; else -> rail != null && loadingRail == rail.name },
            refreshing = when (name) { NEW_RELEASES_RAIL -> newReleases.loading; MASTERPIECES_RAIL -> masterpiecesRefreshing; TASTE_RAIL -> tasteRefreshing; TRUE_STORIES_RAIL -> trueStoriesRefreshing; TRUE_CRIME_RAIL -> trueCrimeRefreshing; APOCALYPTIC_RAIL -> apocalypticRefreshing; else -> false },
            onDismiss = close,
            onOpen = onOpen,
            onAction = onAction,
            onLoadMore = when {
                name == NEW_RELEASES_RAIL && newReleases.hasMore -> newReleases.loadMore
                name == HOLIDAY_RAIL && holidayHasMore -> ::loadMoreHoliday
                name == MASTERPIECES_RAIL -> ::loadMoreMasterpieces
                name == TASTE_RAIL && tasteHasMore -> ::loadMoreTaste
                name == TRUE_STORIES_RAIL && trueStoriesHasMore -> ::loadMoreTrueStories
                name == TRUE_CRIME_RAIL && trueCrimeHasMore -> ::loadMoreTrueCrime
                name == APOCALYPTIC_RAIL && apocalypticHasMore -> ::loadMoreApocalyptic
                rail != null -> { { loadMoreRail(rail) } }
                else -> null
            },
            releaseDates = name == NEW_RELEASES_RAIL,
            paginationError = name == NEW_RELEASES_RAIL && newReleases.paginationError,
            onRefresh = when (name) { NEW_RELEASES_RAIL -> newReleases.retry; MASTERPIECES_RAIL -> ::refreshMasterpieces; TASTE_RAIL -> ::refreshTaste; TRUE_STORIES_RAIL -> ::refreshTrueStories; TRUE_CRIME_RAIL -> ::refreshTrueCrime; APOCALYPTIC_RAIL -> ::refreshApocalyptic; else -> null }
        ) }
    }
}

@Composable
private fun FeaturedCarousel(
    media: List<Models.Media>,
    type: String,
    store: LibraryStore,
    onOpen: (Models.Media) -> Unit,
    onChanged: () -> Unit
) {
    val initialPage = if (media.size == 1) 0 else (Int.MAX_VALUE / 2).let { it - it % media.size }
    val pagerState = rememberPagerState(initialPage = initialPage, pageCount = { if (media.size == 1) 1 else Int.MAX_VALUE })
    val detailOpen = LocalSharedMediaId.current != null
    val artworkUrls = media.flatMap { listOf(it.backdrop, it.poster) }.filter { it.isNotBlank() }.distinct()
    LaunchedEffect(artworkUrls) {
        artworkUrls.forEach { url ->
            launch(Dispatchers.IO) {
                if (imageCache.get(url) == null) {
                    runCatching { URL(url).openStream().use(BitmapFactory::decodeStream) }.getOrNull()?.let { imageCache.put(url, it) }
                }
            }
        }
    }
    LaunchedEffect(pagerState, media.map { it.id }, detailOpen) {
        if (!detailOpen && media.size > 1) {
            snapshotFlow { pagerState.settledPage }.collectLatest { page ->
                delay(6500)
                if (!pagerState.isScrollInProgress) pagerState.animateScrollToPage(page + 1, animationSpec = tween(900, easing = Sw.Emphasized))
            }
        }
    }
    Column {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxWidth().height(500.dp), contentPadding = PaddingValues(horizontal = 20.dp), pageSpacing = 12.dp, beyondViewportPageCount = 1) { page ->
            val item = media[page % media.size]
            val inList = store.state(item) == "saved" || store.state(item) == "progress" || store.state(item) == "watched"
            HeroFeature(item, type, inList, onOpen, pageOffset = { (pagerState.currentPage - page) + pagerState.currentPageOffsetFraction }) { shouldBeInList ->
                if (shouldBeInList) store.save(item) else store.remove(item)
                onChanged()
            }
        }
        if (media.size > 1) {
            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                media.indices.forEach { index ->
                    val active = pagerState.currentPage % media.size == index
                    val width by animateDpAsState(if (active) 24.dp else 6.dp, spring(dampingRatio = .7f, stiffness = 400f), label = "hero-indicator")
                    Box(
                        Modifier.padding(horizontal = 3.dp).height(6.dp).width(width).clip(CircleShape)
                            .then(if (active) Modifier.background(Sw.Brand) else Modifier.background(Muted.copy(alpha = .35f)))
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable private fun HeroFeature(media: Models.Media, type: String, inList: Boolean, onOpen: (Models.Media) -> Unit, pageOffset: () -> Float, onToggleList: (Boolean) -> Unit) {
    var saved by remember(media.id) { mutableStateOf(inList) }
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    val registerBounds = LocalRegisterArtworkBounds.current
    val hiddenArtworkKeys = LocalHiddenArtworkKeys.current
    val kenBurns = rememberInfiniteTransition(label = "ken-burns")
    val zoom = kenBurns.animateFloat(1f, 1.06f, infiniteRepeatable(tween(16000, easing = LinearEasing), RepeatMode.Reverse), label = "ken-burns-zoom")
    val registerLook = LocalRegisterArtworkLook.current
    val density = androidx.compose.ui.platform.LocalDensity.current
    val heroUrl = media.backdrop.ifBlank { media.poster }
    DisposableEffect(sourceKey) { onDispose { registerBounds(sourceKey, null) } }
    LaunchedEffect(inList) { saved = inList }
    Box(Modifier.fillMaxWidth().height(500.dp).graphicsLayer {
        val scale = 1f - .08f * kotlin.math.abs(pageOffset()).coerceIn(0f, 1f)
        scaleX = scale; scaleY = scale
    }.onGloballyPositioned {
        registerBounds(sourceKey, it.boundsInRoot())
        // The detail page grows out of the whole card (artwork, titles and buttons), so nothing pops in or out.
        registerLook(sourceKey, ArtworkLook(heroUrl, with(density) { 30.dp.toPx() }, overlay = {
            HeroCardArt(media, type, saved, zoom = { zoom.value }, pageOffset = { 0f }, onDetails = {}, onToggle = {})
        }))
    }) {
        AnimatedVisibility(
            visible = sourceKey !in hiddenArtworkKeys,
            enter = EnterTransition.None,
            exit = ExitTransition.None
        ) {
            Box(Modifier.fillMaxSize().shadow(18.dp, RoundedCornerShape(30.dp), spotColor = Color.Black).clip(RoundedCornerShape(30.dp)).clickable(remember { MutableInteractionSource() }, indication = null) { registerSource(sourceKey); onOpen(media) }) {
                HeroCardArt(
                    media, type, saved, zoom = { zoom.value }, pageOffset = pageOffset,
                    onDetails = { registerSource(sourceKey); onOpen(media) },
                    onToggle = { saved = !saved; onToggleList(saved) }
                )
            }
        }
    }
}

/** Visual content of a carousel card; also drawn by the page transition so the card morphs as a whole. */
@Composable
private fun HeroCardArt(media: Models.Media, type: String, saved: Boolean, zoom: () -> Float, pageOffset: () -> Float, onDetails: () -> Unit, onToggle: () -> Unit) {
    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(30.dp))) {
        RemoteImage(media.backdrop.ifBlank { media.poster }, Modifier.fillMaxSize().graphicsLayer {
            translationX = pageOffset() * size.width * .3f
            scaleX = zoom()
            scaleY = zoom()
        }, ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, .4f to Color.Transparent, .68f to Color.Black.copy(alpha = .55f), 1f to Color.Black.copy(alpha = .94f))))
        Box(Modifier.fillMaxSize().border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = .22f), Color.White.copy(alpha = .03f))), RoundedCornerShape(30.dp)))
        Column(
            Modifier.align(Alignment.BottomStart).padding(18.dp).graphicsLayer {
                val offset = pageOffset()
                translationX = offset * size.width * .35f
                alpha = (1f - kotlin.math.abs(offset) * 1.4f).coerceIn(0f, 1f)
            }
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clip(CircleShape).background(Sw.Brand).padding(horizontal = 10.dp, vertical = 4.dp)) {
                    Text("IN EVIDENZA", color = Color.White, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, fontSize = 10.sp)
                }
                Text(if (type == "tv") "Serie TV" else "Film", color = Color.White.copy(alpha = .75f), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(start = 10.dp))
            }
            Text(media.title, color = Color.White, style = MaterialTheme.typography.displaySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp))
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (media.rating > 0) MetaPill(rating(media.rating), icon = R.drawable.ic_star, tint = Sw.Amber, background = Color.White.copy(alpha = .12f))
                MetaPill(media.year, background = Color.White.copy(alpha = .12f))
                Text(media.genres.take(2).joinToString(" · "), color = Color.White.copy(alpha = .75f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(Modifier.padding(top = 18.dp).fillMaxWidth().height(54.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onDetails,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 10.dp),
                    shape = CircleShape,
                    modifier = Modifier.weight(1f).fillMaxHeight().crimsonGlow(CircleShape, 10.dp)
                ) {
                    Icon(painterResource(R.drawable.ic_play), null, Modifier.size(20.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Scopri di più", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onToggle,
                    modifier = Modifier.weight(1f).fillMaxHeight().glass(CircleShape, if (saved) .5f else .7f),
                    contentPadding = PaddingValues(horizontal = 10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = if (saved) LikeGreen else Color.White),
                    shape = CircleShape
                ) {
                    AnimatedContent(saved, label = "hero-list-action", transitionSpec = {
                        (fadeIn(tween(200)) + scaleIn(spring(dampingRatio = .5f, stiffness = 500f), initialScale = .6f)) togetherWith fadeOut(tween(100))
                    }) { isSaved ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(painterResource(if (isSaved) R.drawable.ic_check else R.drawable.ic_add), null, Modifier.size(20.dp))
                            Spacer(Modifier.width(7.dp))
                            Text(if (isSaved) "In lista" else "La mia lista", fontSize = 14.sp,
                                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SpotlightRail(
    eyebrow: String,
    title: String,
    subtitle: String,
    icon: @Composable () -> Unit,
    accent: Color,
    background: Brush,
    media: List<Models.Media>,
    store: LibraryStore,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onSeeAll: (Rect?) -> Unit,
    onLoadMore: (() -> Unit)?,
    loadingMore: Boolean
) {
    val shape = RoundedCornerShape(30.dp)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp).reveal()
            .clip(shape).background(background)
            .border(1.dp, Brush.verticalGradient(listOf(accent.copy(alpha = .55f), accent.copy(alpha = .08f))), shape)
            .padding(vertical = 18.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            icon()
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(eyebrow, color = accent, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.3.sp)
                Text(title, style = MaterialTheme.typography.titleLarge, color = Ink)
            }
            SectionHeader("", action = "Tutti", onAction = onSeeAll, modifier = Modifier.width(110.dp))
        }
        Text(subtitle, color = Muted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        LazyRow(Modifier.padding(top = 4.dp), contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(media, key = { it.id }) { item ->
                PosterCard(item, store.get(item), null, false, { onOpen(item) }, { onAction(item) })
            }
            if (onLoadMore != null) item { LoadMoreTile(onLoadMore, loadingMore, accent) }
        }
    }
}

@Composable
private fun HolidayRail(
    holiday: Holiday,
    media: List<Models.Media>,
    store: LibraryStore,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onSeeAll: (Rect?) -> Unit,
    onLoadMore: (() -> Unit)?,
    loadingMore: Boolean
) {
    val transition = rememberInfiniteTransition(label = "holiday-icon")
    val bob by transition.animateFloat(-4f, 4f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "holiday-bob")
    SpotlightRail(
        holiday.eyebrow, holiday.title, holiday.subtitle,
        icon = {
            Box(
                Modifier.size(44.dp).graphicsLayer { translationY = bob.dp.toPx(); rotationZ = bob * 1.5f }
                    .clip(CircleShape).background(holiday.accent.copy(alpha = .18f)).border(1.dp, holiday.accent.copy(alpha = .55f), CircleShape),
                contentAlignment = Alignment.Center
            ) { Text(holiday.emoji, fontSize = 22.sp) }
        },
        accent = holiday.accent,
        background = Brush.linearGradient(holiday.background),
        media = media, store = store, onOpen = onOpen, onAction = onAction, onSeeAll = onSeeAll,
        onLoadMore = onLoadMore, loadingMore = loadingMore
    )
}

@Composable
private fun DiscoveryRail(
    media: List<Models.Media>,
    store: LibraryStore,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onLoadMore: () -> Unit,
    loadingMore: Boolean,
    onSeeAll: (Rect?) -> Unit
) {
    SpotlightRail(
        "SCELTI PER SORPRENDERTI", MASTERPIECES_RAIL, "Titoli molto apprezzati, anche fuori dai soliti riflettori.",
        icon = {
            Box(Modifier.size(44.dp).brandGlow(CircleShape, 8.dp), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_sparkles), null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        },
        accent = Sw.Coral,
        background = Brush.linearGradient(listOf(Color(0xFF2A1216), Color(0xFF15131A), Color(0xFF1C1014))),
        media = media, store = store, onOpen = onOpen, onAction = onAction, onSeeAll = onSeeAll,
        onLoadMore = onLoadMore, loadingMore = loadingMore
    )
}

@Composable
private fun TasteRail(
    media: List<Models.Media>, store: LibraryStore,
    onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit,
    onSeeAll: (Rect?) -> Unit, onLoadMore: () -> Unit,
    loadingMore: Boolean, hasMore: Boolean
) {
    SpotlightRail(
        "IN BASE AI TUOI MI PIACE", TASTE_RAIL, "Storie affini ai titoli che hai apprezzato.",
        icon = {
            Box(Modifier.size(44.dp).clip(CircleShape).background(LikeGreen.copy(alpha = .16f)).border(1.dp, LikeGreen.copy(alpha = .5f), CircleShape), contentAlignment = Alignment.Center) {
                ReactionIcon(true, Modifier.size(22.dp))
            }
        },
        accent = LikeGreen,
        background = Brush.linearGradient(listOf(Color(0xFF10241D), Color(0xFF13161C), Color(0xFF0F1D19))),
        media = media, store = store, onOpen = onOpen, onAction = onAction, onSeeAll = onSeeAll,
        onLoadMore = if (hasMore) onLoadMore else null, loadingMore = loadingMore
    )
}

@Composable
private fun LoadMoreTile(onClick: () -> Unit, loading: Boolean, accent: Color = Sw.Accent) {
    val interaction = remember { MutableInteractionSource() }
    Column(
        Modifier.width(136.dp).aspectRatio(.68f)
            .pressScale(interaction)
            .glass(RoundedCornerShape(18.dp))
            .clickable(interaction, indication = null, enabled = !loading, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(28.dp), color = accent, strokeWidth = 3.dp)
        else {
            Box(Modifier.size(50.dp).brandGlow(CircleShape, 8.dp), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_add), null, tint = Color.White, modifier = Modifier.size(24.dp))
            }
            Text("Carica altri", color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun MediaRail(title: String, media: List<Models.Media>, store: LibraryStore, onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit, ranked: Boolean = false, progress: Boolean = false, contentVersion: Int = 0, loadMore: (() -> Unit)? = null, loadingMore: Boolean = false, onSeeAll: ((Rect?) -> Unit)? = null, spacious: Boolean = false, onLongPress: ((Models.Media) -> Unit)? = null, headerContent: (@Composable () -> Unit)? = null, releaseDates: Boolean = false, footerFor: ((Models.Media) -> String?)? = null, eyebrow: String? = null) {
    if (media.isEmpty() && headerContent == null) return
    Column(Modifier.reveal().padding(top = if (spacious) 18.dp else 0.dp, bottom = if (spacious) 6.dp else 0.dp)) {
        SectionHeader(title, eyebrow = eyebrow, onAction = onSeeAll)
        headerContent?.invoke()
        LazyRow(Modifier.padding(top = 12.dp), contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(if (ranked) 6.dp else 12.dp)) {
            itemsIndexed(media, key = { _, item -> item.id }) { index, item -> PosterCard(item, store.get(item), ranked.then(index + 1), progress, { onOpen(item) }, { onAction(item) }, contentVersion, onLongPress = onLongPress?.let { handler -> { handler(item) } }, releaseDates = releaseDates, footerOverride = footerFor?.invoke(item)) }
            if (loadMore != null) item { LoadMoreTile(loadMore, loadingMore) }
        }
    }
}
private fun Boolean.then(value: Int): Int? = if (this) value else null

@Composable
private fun rememberArtworkSourceKey(media: Models.Media): String =
    remember(media.id) { "${media.id}::${UUID.randomUUID()}" }

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SharedArtworkSource(media: Models.Media, sourceKey: String, modifier: Modifier, shape: RoundedCornerShape, url: String = media.poster.ifBlank { media.backdrop }) {
    val transitionScope = LocalSharedTransitionScope.current
    val hiddenArtworkKeys = LocalHiddenArtworkKeys.current
    val closingArtworkKey = LocalClosingArtworkKey.current
    val registerBounds = LocalRegisterArtworkBounds.current
    val registerLook = LocalRegisterArtworkLook.current
    val density = androidx.compose.ui.platform.LocalDensity.current
    DisposableEffect(sourceKey) { onDispose { registerBounds(sourceKey, null) } }
    Box(modifier.onGloballyPositioned {
        registerBounds(sourceKey, it.boundsInRoot())
        registerLook(sourceKey, ArtworkLook(url, shape.topStart.toPx(androidx.compose.ui.geometry.Size(it.size.width.toFloat(), it.size.height.toFloat()), density)))
    }) {
        // A detail page covers the artwork while it grows out of it, so hiding and revealing it must be
        // instant: any fade would show up as a flash when the page shrinks back into place.
        val saga = sourceKey.startsWith("saga-")
        AnimatedVisibility(
            visible = sourceKey !in hiddenArtworkKeys,
            enter = if (saga) fadeIn(tween(140)) else EnterTransition.None,
            exit = if (saga) fadeOut(tween(120)) else ExitTransition.None
        ) {
            val sharedModifier = if (transitionScope != null && sourceKey != closingArtworkKey && sourceKey.startsWith("saga-")) {
                with(transitionScope) {
                    Modifier.sharedBounds(
                        sharedContentState = rememberSharedContentState(sourceKey),
                        animatedVisibilityScope = this@AnimatedVisibility,
                        // Keep the poster hidden until the closing page is almost back at its source bounds.
                        enter = fadeIn(tween(durationMillis = 100, delayMillis = 220, easing = LinearEasing)),
                        exit = fadeOut(tween(100)),
                        boundsTransform = { _, _ -> tween(320, easing = FastOutSlowInEasing) },
                        resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds()
                    )
                }
            } else Modifier
            RemoteImage(url, sharedModifier.fillMaxSize().clip(shape), ContentScale.Crop)
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun Modifier.sharedDetailBounds(media: Models.Media, artworkKey: String?): Modifier {
    val transitionScope = LocalSharedTransitionScope.current ?: return this
    val visibilityScope = LocalDetailVisibilityScope.current ?: return this
    val key = artworkKey?.takeIf { it.startsWith("${media.id}::") } ?: return this
    return with(transitionScope) {
        sharedBounds(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibilityScope,
            enter = fadeIn(tween(180, delayMillis = 60)),
            exit = fadeOut(tween(durationMillis = 240, delayMillis = 80, easing = LinearEasing)),
            boundsTransform = { _, _ -> tween(320, easing = FastOutSlowInEasing) },
            resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds()
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable private fun PosterCard(media: Models.Media, entry: Models.LibraryEntry?, rank: Int?, progress: Boolean, open: () -> Unit, actions: () -> Unit, contentVersion: Int = 0, onLongPress: (() -> Unit)? = null, releaseDates: Boolean = false, footerOverride: String? = null) {
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    val posterWidth = 136.dp
    val density = androidx.compose.ui.platform.LocalDensity.current
    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
    // Every ranked card reserves the same slot, so posters stay evenly spaced. All numerals share one
    // size, chosen so the widest ("10") fits the slot entirely; each ends right where the poster begins.
    val rankInset = 82.dp
    val rankSlot = rankInset + 10.dp
    val (rankStyle, rankScale) = remember(rank, density) {
        val base = androidx.compose.ui.text.TextStyle(
            brush = Brush.verticalGradient(listOf(Color.White.copy(alpha = .92f), Sw.Accent.copy(alpha = .35f), Color.Transparent)),
            fontSize = 124.sp, fontWeight = FontWeight.Black, letterSpacing = if ((rank ?: 0) >= 10) (-14).sp else (-6).sp
        )
        val widest = measurer.measure("10", base.copy(letterSpacing = (-14).sp)).size.width
        val target = with(density) { rankSlot.toPx() }
        val scale = if (widest > target) target / widest else 1f
        base.copy(fontSize = base.fontSize * scale, letterSpacing = base.letterSpacing * scale) to scale
    }
    Column(Modifier.width(if (rank != null) posterWidth + rankInset else posterWidth).noRippleCombinedClickable(onClick = { registerSource(sourceKey); open() }, onLongClick = { (onLongPress ?: actions)() })) {
        Box(Modifier.fillMaxWidth()) {
            if (rank != null) Text(
                "$rank",
                style = rankStyle,
                maxLines = 1, softWrap = false,
                textAlign = androidx.compose.ui.text.style.TextAlign.End,
                modifier = Modifier.align(Alignment.BottomStart).width(rankSlot).offset(y = 14.dp * rankScale)
            )
            Box(Modifier.width(posterWidth).align(Alignment.BottomEnd)) {
                SharedArtworkSource(media, sourceKey, Modifier.fillMaxWidth().aspectRatio(.68f), RoundedCornerShape(18.dp))
                Box(Modifier.matchParentSize().border(1.dp, Color.White.copy(alpha = .07f), RoundedCornerShape(18.dp)))
                if (media.rating > 0) MetaPill(rating(media.rating), Modifier.align(Alignment.TopStart).padding(7.dp), icon = R.drawable.ic_star, tint = Sw.Amber)
                PosterStatusBadges(entry?.liked, entry?.pinned == true, entry?.state)
            }
        }
        Text(media.title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 9.dp, start = if (rank != null) rankInset else 2.dp))
        val footer = remember(entry?.nextSeason, entry?.nextEpisode, entry?.state, progress, contentVersion) {
            if (progress && entry != null) "S${entry.nextSeason} · E${entry.nextEpisode}" else "${media.year} · ${if (media.isSeries) "Serie TV" else "Film"}"
        }
        Text(footerOverride ?: if (releaseDates) releaseLabel(media) else footer, color = if (progress || footerOverride != null) CrimsonSoft else Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp, start = if (rank != null) rankInset else 2.dp))
    }
}

@Composable
private fun LoadingSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton-shimmer")
    val progress by transition.animateFloat(initialValue = -1f, targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "skeleton-highlight")
    val base = Raised
    val highlight = Muted.copy(alpha = .16f)
    Canvas(modifier.semantics { contentDescription = "Caricamento in corso" }) {
        drawRect(base)
        val center = size.width * progress
        drawRect(Brush.linearGradient(listOf(Color.Transparent, highlight, Color.Transparent),
            start = Offset(center - size.width * .55f, 0f), end = Offset(center + size.width * .55f, size.height)))
    }
}

@Composable private fun RemoteImage(url: String, modifier: Modifier, scale: ContentScale, fallbackIcon: Int? = null, backgroundColor: Color? = null, animatedPlaceholder: Boolean = false) {
    var bitmap by remember(url) { mutableStateOf(imageCache.get(url)) }
    var loading by remember(url) { mutableStateOf(url.isNotBlank() && bitmap == null) }
    LaunchedEffect(url) {
        if (url.isNotBlank() && bitmap == null) {
            val loaded = withContext(Dispatchers.IO) {
                runCatching {
                    val connection = URL(url).openConnection()
                    if (animatedPlaceholder) { connection.connectTimeout = 10_000; connection.readTimeout = 15_000 }
                    connection.getInputStream().use(BitmapFactory::decodeStream)
                }.getOrNull()
            }
            if (loaded != null) {
                imageCache.put(url, loaded)
                bitmap = loaded
            }
        }
        loading = false
    }
    Box(modifier.background(backgroundColor ?: Raised)) {
        Crossfade(bitmap, label = "image") { value -> if (value != null) androidx.compose.foundation.Image(value.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = scale) else if (animatedPlaceholder && loading) LoadingSkeleton(Modifier.fillMaxSize()) else Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Raised, Panel))), contentAlignment = Alignment.Center) { fallbackIcon?.let { Icon(painterResource(it), null, tint = CrimsonSoft, modifier = Modifier.size(34.dp)) } } }
    }
}

@Composable private fun LoadingPane() { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = CrimsonSoft, strokeWidth = 5.dp, modifier = Modifier.size(54.dp)) } }
@Composable private fun ErrorPane(message: String) { Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) { Text(message, color = Muted, fontSize = 17.sp) } }

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun DetailScreen(
    initial: Models.Media,
    api: TmdbApi,
    store: LibraryStore,
    refreshVersion: Int,
    artworkKey: String?,
    sharedBoundsEnabled: Boolean,
    backEnabled: Boolean,
    onClose: () -> Unit,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onRefresh: () -> Unit,
    onReroll: (() -> Unit)?,
    rerolling: Boolean
) {
    var media by remember(initial.id) { mutableStateOf(initial) }
    var related by remember(initial.id) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var relatedPage by remember(initial.id) { mutableIntStateOf(1) }
    var relatedHasMore by remember(initial.id) { mutableStateOf(false) }
    var relatedLoadingMore by remember(initial.id) { mutableStateOf(false) }
    var saga by remember(initial.id) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var imageGallery by remember(initial.id) { mutableStateOf<List<String>>(emptyList()) }
    var episodes by remember { mutableStateOf(false) }
    var episodesOrigin by remember(initial.id) { mutableStateOf<Rect?>(null) }
    var genrePage by remember(initial.id) { mutableStateOf<Pair<Int, String>?>(null) }
    var genreOrigin by remember(initial.id) { mutableStateOf<Rect?>(null) }
    var hideConfirm by remember { mutableStateOf(false) }
    var selectedPerson by remember(initial.id) { mutableStateOf<PersonSelection?>(null) }
    var listVersion by remember { mutableIntStateOf(0) }
    var showReaction by remember(initial.id) { mutableStateOf(false) }
    var quickEpisodeLoading by remember(initial.id) { mutableStateOf(false) }
    var pendingEpisodeReaction by remember(initial.id) { mutableStateOf<((Boolean) -> Unit)?>(null) }
    var posterFullscreen by remember(initial.id) { mutableStateOf(false) }
    var posterZoom by remember(initial.id) { mutableFloatStateOf(1f) }
    var posterPan by remember(initial.id) { mutableStateOf(Offset.Zero) }
    var closing by remember(initial.id) { mutableStateOf(false) }
    var detailReloadVersion by remember(initial.id) { mutableIntStateOf(0) }
    var refreshingDetails by remember(initial.id) { mutableStateOf(false) }
    val context = LocalContext.current
    val listState = rememberLazyListState()
    val detailScope = rememberCoroutineScope()
    val posterTransitionKey = remember(initial.id) { "${initial.id}::detail-poster-fullscreen" }
    val transitionScope = LocalSharedTransitionScope.current
    val closePoster = {
        posterZoom = 1f
        posterPan = Offset.Zero
        posterFullscreen = false
    }
    val closeDetail = {
        if (!closing) {
            closing = true
            onClose()
        }
    }
    val inList = remember(media.id, listVersion, refreshVersion) { store.state(media) == "saved" || store.state(media) == "progress" || store.state(media) == "watched" }
    val watched = remember(media.id, listVersion, refreshVersion) { store.state(media) == "watched" }
    val reaction = remember(media.id, listVersion, refreshVersion) { store.get(media)?.liked }
    val libraryEntry = remember(media.id, listVersion, refreshVersion) { store.get(media) }
    var pinned by remember(initial.id) { mutableStateOf(store.get(initial)?.pinned == true) }
    LaunchedEffect(media.id, listVersion, refreshVersion) {
        pinned = store.get(media)?.pinned == true
    }
    LaunchedEffect(initial.id, detailReloadVersion) {
        val manualReload = detailReloadVersion > 0
        if (manualReload) refreshingDetails = true
        val detailed = withContext(Dispatchers.IO) { runCatching { api.details(initial) }.getOrNull() }
        if (detailed != null) {
            detailed.backdrops = withContext(Dispatchers.IO) { runCatching { api.backdrops(detailed) }.getOrDefault(emptyList()) }
            media = detailed
            imageGallery = detailed.backdrops.toList()
            store.mergeDetails(detailed)
            if (store.state(detailed) == "watched") {
                val reopened = withContext(Dispatchers.IO) { runCatching { store.reopenForNewEpisodes(detailed, api.seasons(detailed, false)) }.getOrDefault(false) }
                if (reopened) onRefresh()
            }
            saga = withContext(Dispatchers.IO) { runCatching { api.saga(detailed).toList() }.getOrDefault(emptyList()) }
            val firstRelatedPage = withContext(Dispatchers.IO) { runCatching { api.related(detailed, 1).toList() }.getOrDefault(emptyList()) }
            relatedPage = 1
            relatedHasMore = firstRelatedPage.size >= 20
            related = firstRelatedPage.filterNot { candidate -> candidate.id == detailed.id || saga.any { it.id == candidate.id } }
        } else if (manualReload) {
            Toast.makeText(context, "Aggiornamento dei dati non riuscito", Toast.LENGTH_SHORT).show()
        }
        if (manualReload) refreshingDetails = false
    }
    val loadMoreRelated: () -> Unit = {
        if (!relatedLoadingMore && relatedHasMore) {
            relatedLoadingMore = true
            detailScope.launch {
                val nextPage = relatedPage + 1
                val next = withContext(Dispatchers.IO) { runCatching { api.related(media, nextPage).toList() }.getOrDefault(emptyList()) }
                related = (related + next.filterNot { candidate -> candidate.id == media.id || saga.any { it.id == candidate.id } }).distinctBy { it.id }
                relatedPage = nextPage
                relatedHasMore = next.size >= 20
                relatedLoadingMore = false
            }
        }
    }
    BackHandler(enabled = posterFullscreen, onBack = closePoster)
    BackHandler(enabled = backEnabled && !posterFullscreen, onBack = closeDetail)
    Surface(Modifier.then(if (sharedBoundsEnabled) Modifier.sharedDetailBounds(initial, artworkKey) else Modifier).fillMaxSize(), color = Night) {
        Box(Modifier.fillMaxSize()) {
        CompositionLocalProvider(LocalOverscrollFactory provides null) {
            LazyColumn(
                state = listState,
                userScrollEnabled = !closing,
                contentPadding = PaddingValues(bottom = 44.dp)
            ) {
                item {
                    val backdropUrl = media.backdrop.ifBlank { initial.backdrop }.ifBlank { initial.poster }
                    Box(Modifier.fillMaxWidth().height(520.dp)) {
                        // Parallax: the backdrop drifts at half speed but stays clipped to its own area,
                        // otherwise it slides behind the (transparent) content below the hero.
                        Box(Modifier.fillMaxWidth().height(420.dp).clipToBounds()) {
                            RemoteImage(backdropUrl, Modifier.fillMaxSize().graphicsLayer {
                                val offset = if (listState.firstVisibleItemIndex == 0) listState.firstVisibleItemScrollOffset.toFloat() else 0f
                                translationY = offset * .5f
                                val zoom = 1f + offset / 4000f
                                scaleX = zoom; scaleY = zoom
                            }, ContentScale.Crop, animatedPlaceholder = true)
                        }
                        Box(Modifier.fillMaxWidth().height(422.dp).background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .55f), .3f to Color.Transparent, .68f to Night.copy(alpha = .55f), 1f to Night)))
                        Row(Modifier.align(Alignment.BottomStart).padding(horizontal = 20.dp), verticalAlignment = Alignment.Bottom) {
                            Box(Modifier.width(134.dp).aspectRatio(.68f).shadow(26.dp, RoundedCornerShape(20.dp), ambientColor = Sw.Red, spotColor = Sw.Red)) {
                                androidx.compose.animation.AnimatedVisibility(
                                    visible = !posterFullscreen,
                                    enter = fadeIn(tween(220)),
                                    exit = fadeOut(tween(140)),
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    val posterModifier = if (transitionScope != null) with(transitionScope) {
                                        Modifier.sharedBounds(
                                            sharedContentState = rememberSharedContentState(posterTransitionKey),
                                            animatedVisibilityScope = this@AnimatedVisibility,
                                            boundsTransform = { _, _ -> tween(360, easing = FastOutSlowInEasing) },
                                            resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds()
                                        )
                                    } else Modifier
                                    Box(posterModifier.fillMaxSize().clip(RoundedCornerShape(20.dp)).border(1.dp, Color.White.copy(alpha = .14f), RoundedCornerShape(20.dp)).clickable {
                                        posterZoom = 1f
                                        posterPan = Offset.Zero
                                        posterFullscreen = true
                                    }) {
                                        RemoteImage(initial.poster.ifBlank { initial.backdrop }, Modifier.fillMaxSize(), ContentScale.Crop, animatedPlaceholder = true)
                                        if (reaction != null) ReactionBadge(reaction, Modifier.align(Alignment.TopEnd).padding(8.dp).scale(.85f))
                                    }
                                }
                            }
                            Column(Modifier.padding(start = 16.dp, bottom = 4.dp).weight(1f)) {
                                Text(if (media.isSeries) "SERIE TV" else "FILM", color = Sw.Accent, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                                Text(media.title, style = MaterialTheme.typography.headlineMedium, color = Ink, maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                                if (media.tagline.isNotBlank()) Text(media.tagline, color = Muted, fontSize = 13.sp, lineHeight = 17.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                            }
                        }
                    }
                }
                item {
                    Column(Modifier.padding(horizontal = 20.dp).reveal(distance = 20.dp)) {
                        Row(Modifier.padding(top = 18.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (media.rating > 0) MetaPill(rating(media.rating), icon = R.drawable.ic_star, tint = Sw.Amber, background = Sw.Amber.copy(alpha = .14f))
                            MetaPill(media.year, background = Sw.Raised)
                            durationLabel(media)?.let { MetaPill(it, background = Sw.Raised) }
                            media.genres.take(3).forEachIndexed { index, genre ->
                                // Names and ids come from the same TMDB list, so the first entries line up.
                                val genreId = media.genreIds.getOrNull(index)
                                var bounds by remember(media.id, index) { mutableStateOf<Rect?>(null) }
                                GenrePill(genre, clickable = genreId != null, modifier = Modifier
                                    .onGloballyPositioned { bounds = it.boundsInRoot() }
                                    .then(if (genreId != null) Modifier.noRippleClickable { genreOrigin = bounds; genrePage = genreId to genre } else Modifier))
                            }
                        }
                        Row(Modifier.padding(top = 18.dp).height(56.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button({ if (inList) store.remove(media) else store.save(media); listVersion++; onRefresh() },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                                contentPadding = PaddingValues(horizontal = 10.dp),
                                shape = RoundedCornerShape(18.dp),
                                modifier = Modifier.weight(1f).fillMaxHeight().crimsonGlow(RoundedCornerShape(18.dp))) {
                                AnimatedContent(inList, modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center, label = "list-action") { saved ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                                        Icon(painterResource(if (saved) R.drawable.ic_check else R.drawable.ic_add), null, Modifier.size(20.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(if (saved) "Nella mia lista" else "Aggiungi alla lista", maxLines = 1,
                                            softWrap = false, overflow = TextOverflow.Ellipsis, fontSize = 13.sp)
                                    }
                                }
                            }
                            if (media.isSeries) Button(
                                onClick = { episodes = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                                contentPadding = PaddingValues(horizontal = 10.dp),
                                shape = RoundedCornerShape(18.dp),
                                modifier = Modifier.weight(1f).fillMaxHeight()
                                    .onGloballyPositioned { episodesOrigin = it.boundsInRoot() }
                                    .crimsonGlow(RoundedCornerShape(18.dp))
                            ) { Icon(painterResource(R.drawable.ic_tv), null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text("Episodi", maxLines = 1, softWrap = false, fontSize = 13.sp) }
                            else FilledTonalButton(
                                onClick = {
                                    if (watched) {
                                        store.markMovieUnwatched(media)
                                        listVersion++
                                        onRefresh()
                                    } else showReaction = true
                                },
                                contentPadding = PaddingValues(horizontal = 10.dp),
                                shape = RoundedCornerShape(18.dp),
                                modifier = Modifier.weight(1f).fillMaxHeight().then(if (watched) Modifier.crimsonGlow(RoundedCornerShape(18.dp), 6.dp) else Modifier),
                                colors = ButtonDefaults.filledTonalButtonColors(
                                    containerColor = if (watched) Color.Transparent else Raised,
                                    contentColor = if (watched) Color.White else Ink
                                )
                            ) { Icon(painterResource(R.drawable.ic_check), null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(if (watched) "Già visto" else "Segna come visto", maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis, fontSize = 13.sp) }
                        }
                        if (media.isSeries && libraryEntry?.state == "progress") {
                            FilledTonalButton(
                                onClick = {
                                    if (!quickEpisodeLoading) {
                                        quickEpisodeLoading = true
                                        val seasonNumber = libraryEntry.nextSeason
                                        val episodeNumber = libraryEntry.nextEpisode
                                        detailScope.launch {
                                            val seasons = withContext(Dispatchers.IO) {
                                                runCatching { api.seasons(media, true) }.getOrDefault(emptyList())
                                            }
                                            val episodesList = LibraryStore.flatten(seasons)
                                            val next = episodesList.firstOrNull { it.season == seasonNumber && it.number == episodeNumber }
                                            if (next != null && next == episodesList.lastOrNull()) {
                                                pendingEpisodeReaction = { liked ->
                                                    store.markEpisode(media, next, seasons, liked)
                                                    listVersion++
                                                    onRefresh()
                                                }
                                            } else if (next != null) {
                                                store.markEpisode(media, next, seasons, null)
                                                listVersion++
                                                onRefresh()
                                            }
                                            quickEpisodeLoading = false
                                        }
                                    }
                                },
                                enabled = !quickEpisodeLoading,
                                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(54.dp),
                                shape = RoundedCornerShape(18.dp),
                                colors = ButtonDefaults.filledTonalButtonColors(
                                    containerColor = LikeGreen.copy(alpha = .15f), contentColor = LikeGreen,
                                    disabledContainerColor = Raised, disabledContentColor = Muted
                                ),
                                border = androidx.compose.foundation.BorderStroke(1.dp, LikeGreen.copy(alpha = .48f))
                            ) {
                                if (quickEpisodeLoading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = LikeGreen)
                                else Icon(painterResource(R.drawable.ic_check), null, Modifier.size(21.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(if (quickEpisodeLoading) "Aggiornamento…" else "Segna S${libraryEntry.nextSeason} · E${libraryEntry.nextEpisode} come visto",
                                    maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                            }
                        }
                        if (onReroll != null) {
                            Button(
                                onClick = onReroll,
                                enabled = !rerolling,
                                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(54.dp)
                                    .then(if (!rerolling) Modifier.crimsonGlow(RoundedCornerShape(18.dp), 8.dp) else Modifier),
                                shape = RoundedCornerShape(18.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Transparent,
                                    contentColor = Color.White,
                                    disabledContainerColor = Raised,
                                    disabledContentColor = Muted
                                )
                            ) {
                                if (rerolling) CircularProgressIndicator(Modifier.size(21.dp), strokeWidth = 2.dp, color = CrimsonSoft)
                                else Icon(painterResource(R.drawable.ic_sparkles), null, Modifier.size(22.dp))
                                Spacer(Modifier.width(9.dp))
                                Text(if (rerolling) "Sto scegliendo…" else "Sorprendimi ancora", fontWeight = FontWeight.Bold)
                            }
                        }
                        if (watched) {
                            Surface(onClick = { showReaction = true }, color = (if (reaction == true) LikeGreen else if (reaction == false) DislikeRed else CrimsonSoft).copy(alpha = .13f),
                                shape = RoundedCornerShape(16.dp), modifier = Modifier.padding(top = 12.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, (if (reaction == true) LikeGreen else if (reaction == false) DislikeRed else CrimsonSoft).copy(alpha = .48f))) {
                                Row(Modifier.padding(horizontal = 13.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (reaction != null) ReactionIcon(reaction, Modifier.size(20.dp))
                                    else Icon(painterResource(R.drawable.ic_thumb_up), null, tint = CrimsonSoft, modifier = Modifier.size(20.dp))
                                    Text(if (reaction == true) "Ti è piaciuto · Cambia voto" else if (reaction == false) "Non ti è piaciuto · Cambia voto" else "Valuta questo titolo",
                                        color = if (reaction == true) LikeGreen else if (reaction == false) DislikeRed else CrimsonSoft,
                                        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 9.dp))
                                }
                            }
                        }
                        FollowReleaseCard(media, api, refreshVersion, onRefresh)
                        var overviewExpanded by remember(media.id) { mutableStateOf(false) }
                        Text("Trama", style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.padding(top = 26.dp))
                        Text(
                            media.overview, color = Muted, fontSize = 16.sp, lineHeight = 24.sp,
                            maxLines = if (overviewExpanded) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 8.dp).animateContentSize(tween(320, easing = Sw.Emphasized)).noRippleClickable { overviewExpanded = !overviewExpanded }
                        )
                        if (media.overview.length > 220) Text(if (overviewExpanded) "Mostra meno" else "Leggi tutto", color = Sw.Accent, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                            modifier = Modifier.padding(top = 6.dp).noRippleClickable { overviewExpanded = !overviewExpanded })
                    }
                }
                if (imageGallery.isNotEmpty()) item { MediaImageCarousel(imageGallery) }
                if (media.directors.isNotEmpty()) item { PeopleRail(media.directors.toList(), title = "Regia") { person, bounds -> selectedPerson = PersonSelection(person, bounds) } }
                if (media.cast.isNotEmpty()) item { PeopleRail(media.cast.toList()) { person, bounds -> selectedPerson = PersonSelection(person, bounds) } }
                item { ProviderGroups(media) }
                if (saga.isNotEmpty()) item { MediaRail("Della stessa saga", saga, store, onOpen, onAction, contentVersion = refreshVersion, spacious = true) }
                if (related.isNotEmpty()) item { MediaRail("Potrebbe piacerti", related, store, onOpen, onAction, contentVersion = refreshVersion, loadMore = if (relatedHasMore) loadMoreRelated else null, loadingMore = relatedLoadingMore, spacious = true) }
                item(key = "ai-similar") { AiSimilarSection(media, api, store, onOpen) }
            }
        }
        val density = androidx.compose.ui.platform.LocalDensity.current
        val barSolid by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > with(density) { 330.dp.toPx() } } }
        val barAlpha by animateFloatAsState(if (barSolid) 1f else 0f, tween(240), label = "detail-bar")
        Row(
            Modifier.fillMaxWidth()
                .drawBehind { drawRect(Sw.Background.copy(alpha = .96f * barAlpha)) }
                .statusBarsPadding().padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GlassIconButton(R.drawable.ic_back, "Indietro") { closeDetail() }
            Text(media.title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp).graphicsLayer { alpha = barAlpha; translationY = (1f - barAlpha) * 12.dp.toPx() })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(44.dp).glass(CircleShape).clip(CircleShape).clickable(enabled = !refreshingDetails) { detailReloadVersion++ }, contentAlignment = Alignment.Center) {
                    if (refreshingDetails) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    else Icon(painterResource(R.drawable.ic_refresh), "Aggiorna i dati", tint = Color.White, modifier = Modifier.size(21.dp))
                }
                if (inList) GlassIconButton(R.drawable.ic_push_pin, if (pinned) "Rimuovi dai fissati" else "Fissa in cima alla home", highlighted = pinned) {
                    store.togglePinned(media)
                    pinned = store.get(media)?.pinned == true
                    listVersion++
                    onRefresh()
                }
                GlassIconButton(R.drawable.ic_visibility_off, "Nascondi") { hideConfirm = true }
            }
        }
        AnimatedVisibility(
            visible = posterFullscreen,
            enter = fadeIn(tween(180)),
            exit = fadeOut(tween(180)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                val posterModifier = if (transitionScope != null) with(transitionScope) {
                    Modifier.sharedBounds(
                        sharedContentState = rememberSharedContentState(posterTransitionKey),
                        animatedVisibilityScope = this@AnimatedVisibility,
                        boundsTransform = { _, _ -> tween(360, easing = FastOutSlowInEasing) },
                        resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds()
                    )
                } else Modifier
                Box(
                    posterModifier.align(Alignment.Center).fillMaxWidth().heightIn(max = 760.dp)
                        .aspectRatio(.68f).graphicsLayer {
                            scaleX = posterZoom
                            scaleY = posterZoom
                            translationX = posterPan.x
                            translationY = posterPan.y
                        }
                        .pointerInput(Unit) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val nextZoom = (posterZoom * zoom).coerceIn(1f, 5f)
                                posterZoom = nextZoom
                                posterPan = if (nextZoom == 1f) Offset.Zero else posterPan + pan
                            }
                        }
                ) {
                    val fullPoster = initial.poster.ifBlank { initial.backdrop }
                        .replace("/w342/", "/original/").replace("/w780/", "/original/")
                    RemoteImage(fullPoster, Modifier.fillMaxSize(), ContentScale.Fit)
                }
                FilledTonalIconButton(
                    onClick = closePoster,
                    modifier = Modifier.statusBarsPadding().padding(16.dp).align(Alignment.TopStart),
                    colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color(0xCC14161E))
                ) { Icon(painterResource(R.drawable.ic_close), "Chiudi locandina") }
                if (posterZoom > 1f) {
                    FilledTonalButton(
                        onClick = { posterZoom = 1f; posterPan = Offset.Zero },
                        modifier = Modifier.navigationBarsPadding().padding(18.dp).align(Alignment.BottomCenter),
                        colors = ButtonDefaults.filledTonalButtonColors(containerColor = Color(0xCC14161E))
                    ) { Text("Ripristina zoom") }
                }
            }
        }
        }
    }
    selectedPerson?.let { selection ->
        PersonCredits(selection.person, api, store, sourceBounds = selection.sourceBounds, dismiss = { selectedPerson = null }, onOpen = onOpen, keepOpenOnMediaOpen = true)
    }
    genrePage?.let { (genreId, genreName) ->
        ExpandingPage(genreOrigin, onClosed = { genrePage = null }, sourceCorner = 14.dp, sourceArt = { GenrePill(genreName, clickable = true, modifier = Modifier.fillMaxSize()) }) { close ->
            GenreScreen(media.mediaType, genreId, genreName, api, store, onDismiss = close, onOpen = onOpen, onAction = onAction)
        }
    }
    // The episodes page grows out of the button itself, drawn as it looks, not from an empty dark shape.
    if (episodes) ExpandingPage(episodesOrigin, onClosed = { episodes = false }, sourceCorner = 18.dp, sourceArt = {
        Row(Modifier.fillMaxSize().background(Sw.Brand, RoundedCornerShape(18.dp)), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.ic_tv), null, Modifier.size(20.dp), tint = Color.White)
            Spacer(Modifier.width(6.dp))
            Text("Episodi", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, softWrap = false)
        }
    }) { close ->
        EpisodesScreen(media, api, store, onDismiss = close, onChanged = { listVersion++; onRefresh() })
    }
    if (showReaction) ReactionDialog(media.title, onChoice = { liked ->
        if (watched) store.setLiked(media, liked) else store.watched(media, liked)
        listVersion++
        onRefresh()
        showReaction = false
    }, onDismiss = { showReaction = false }, alreadyWatched = watched)
    if (pendingEpisodeReaction != null) ReactionDialog(media.title,
        onChoice = { liked -> pendingEpisodeReaction?.invoke(liked); pendingEpisodeReaction = null },
        onDismiss = { pendingEpisodeReaction = null })
    if (hideConfirm) AlertDialog(
        onDismissRequest = { hideConfirm = false },
        title = { Text("Nascondere questo titolo?") },
        text = { Text("Il film o la serie verrà nascosto dal catalogo e dalle proposte." ) },
        confirmButton = { TextButton({ store.hide(media); hideConfirm = false; onRefresh(); closeDetail() }) { Text("Nascondi") } },
        dismissButton = { TextButton({ hideConfirm = false }) { Text("Annulla") } }
    )
}

/** Genre tag in the detail header; tappable ones show a chevron and open that genre's titles. */
@Composable
private fun GenrePill(genre: String, clickable: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(CircleShape)
            .background(Sw.Raised)
            .border(1.dp, if (clickable) Sw.Accent.copy(alpha = .3f) else Color.Transparent, CircleShape)
            .padding(start = 9.dp, end = if (clickable) 5.dp else 9.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Text(genre, color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        if (clickable) Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Sw.Accent, modifier = Modifier.padding(start = 1.dp).size(13.dp))
    }
}

@Composable
private fun GenreScreen(type: String, genreId: Int, genreName: String, api: TmdbApi, store: LibraryStore, onDismiss: () -> Unit, onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit) {
    var results by remember(type, genreId) { mutableStateOf<List<Models.Media>?>(null) }
    var page by remember(type, genreId) { mutableIntStateOf(1) }
    var hasMore by remember(type, genreId) { mutableStateOf(true) }
    var loadingMore by remember(type, genreId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val gridState = rememberLazyGridState()
    LaunchedEffect(type, genreId) {
        val first = withContext(Dispatchers.IO) { runCatching { api.discover(type, 1, genreId, null, "popular").toList() }.getOrDefault(emptyList()) }
        results = first
        hasMore = first.isNotEmpty()
    }
    val loadMore: () -> Unit = {
        if (!loadingMore && hasMore) {
            loadingMore = true
            scope.launch {
                val next = page + 1
                val more = withContext(Dispatchers.IO) { runCatching { api.discover(type, next, genreId, null, "popular").toList() }.getOrDefault(emptyList()) }
                page = next
                if (more.isEmpty()) hasMore = false else results = (results.orEmpty() + more).distinctBy { it.id }
                loadingMore = false
            }
        }
    }
    val atEnd by remember { derivedStateOf { gridState.layoutInfo.let { it.totalItemsCount > 0 && (it.visibleItemsInfo.lastOrNull()?.index ?: -1) >= it.totalItemsCount - 4 } } }
    LaunchedEffect(atEnd) { if (atEnd) loadMore() }
    BackHandler(onBack = onDismiss)
    Surface(Modifier.fillMaxSize(), color = Night) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassIconButton(R.drawable.ic_back, "Indietro") { onDismiss() }
                Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                    Text(if (type == "tv") "SERIE TV · PIÙ POPOLARI" else "FILM · PIÙ POPOLARI", color = Sw.Accent, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp)
                    Text(genreName, style = MaterialTheme.typography.headlineMedium, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            val list = results
            if (list == null) Column(Modifier.padding(top = 24.dp)) { RailSkeleton(null) }
            else if (list.isEmpty()) EmptyState(R.drawable.ic_search, "Nessun titolo trovato", "Non ci sono titoli disponibili per questo genere al momento.")
            else LazyVerticalGrid(
                columns = GridCells.Adaptive(104.dp), state = gridState, modifier = Modifier.weight(1f).fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 32.dp)
            ) {
                gridItemsIndexed(list, key = { _, media -> media.id }) { index, media ->
                    Box(Modifier.reveal(delayMillis = (index % 12) * 40, distance = 24.dp)) {
                        SearchPosterCard(media, store.get(media), onLongPress = { onAction(media) }) { onOpen(media) }
                    }
                }
                if (loadingMore) item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(26.dp), color = Sw.Accent, strokeWidth = 2.5.dp) }
                }
            }
        }
    }
}

@Composable private fun FlowChips(values: List<String>) { Row(Modifier.padding(top = 14.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) { values.forEach { SuggestionChip({}, { Text(it) }, shape = RoundedCornerShape(14.dp)) } } }

@OptIn(ExperimentalFoundationApi::class)
@Composable private fun MediaImageCarousel(images: List<String>) {
    if (images.isEmpty()) return
    val pager = rememberPagerState(pageCount = { images.size })
    Column(Modifier.fillMaxWidth().padding(top = 26.dp)) {
        Text("Immagini", style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
        HorizontalPager(state = pager, contentPadding = PaddingValues(horizontal = 20.dp), pageSpacing = 10.dp) { page ->
            RemoteImage(images[page], Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(20.dp)), ContentScale.Crop)
        }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text("${pager.currentPage + 1} / ${images.size}", color = Muted, fontSize = 12.sp)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable private fun PeopleRail(people: List<Models.Person>, title: String = "Cast", topPadding: androidx.compose.ui.unit.Dp = 26.dp, onPersonClick: (Models.Person, Rect?) -> Unit) {
    var fullCastVisible by remember { mutableStateOf(false) }
    Column(Modifier.padding(top = topPadding)) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton({ fullCastVisible = true }) { Text("Tutti (${people.size})") }
        }
        LazyRow(modifier = Modifier.height(120.dp), contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(people, key = { it.id }) { person ->
                var bounds by remember(person.id) { mutableStateOf<Rect?>(null) }
                Column(
                    Modifier.width(84.dp).height(120.dp)
                        .noRippleCombinedClickable(onClick = { onPersonClick(person, bounds) }, onLongClick = {}),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // The person page grows out of this circle, not the whole photo-and-name block.
                    RemoteImage(person.profile, Modifier.size(76.dp).onGloballyPositioned { bounds = it.boundsInRoot() }.clip(CircleShape).border(2.dp, Brush.linearGradient(listOf(Sw.Red, Sw.Coral)), CircleShape), ContentScale.Crop, fallbackIcon = R.drawable.ic_person)
                    Text(person.name, color = Ink, fontSize = 12.sp, lineHeight = 15.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp).height(38.dp))
                }
            }
        }
    }
    if (fullCastVisible) Dialog(onDismissRequest = { fullCastVisible = false }) {
        Surface(Modifier.fillMaxWidth().fillMaxHeight(.86f), color = Night, shape = RoundedCornerShape(26.dp)) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(when (title) { "Regia" -> "Registi"; "Cast" -> "Cast completo"; else -> title }, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    IconButton({ fullCastVisible = false }) { Icon(painterResource(R.drawable.ic_close), "Chiudi elenco") }
                }
                LazyVerticalGrid(columns = GridCells.Fixed(3), modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 12.dp)) {
                    gridItems(people, key = { it.id }) { person ->
                        Column(Modifier.fillMaxWidth().clickable { fullCastVisible = false; onPersonClick(person, null) }, horizontalAlignment = Alignment.CenterHorizontally) {
                            RemoteImage(person.profile, Modifier.size(72.dp).clip(CircleShape), ContentScale.Crop)
                            Text(person.name, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                            if (person.character.isNotBlank()) Text(person.character, color = Muted, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun ProviderGroups(media: Models.Media) {
    val uriHandler = LocalUriHandler.current
    val streaming = media.flatrate.toList().distinctBy { it.id }.map { it to "Incluso" }
    val paid = (media.rent.toList().map { it to "Noleggio" } + media.buy.toList().map { it to "Acquisto" })
        .groupBy { it.first.id }
        .values
        .map { entries -> entries.first().first to entries.map { it.second }.distinct().joinToString(" / ") }
    Column(Modifier.padding(horizontal = 20.dp).padding(top = 30.dp, bottom = 22.dp)) {
        Text("Dove guardarlo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black,
            modifier = Modifier.padding(bottom = 12.dp))
        if (streaming.isNotEmpty()) {
            ProviderGridCard("Streaming incluso", "Disponibile con l’abbonamento", streaming,
                included = true) { provider ->
                providerServiceUrl(provider)?.let { url -> runCatching { uriHandler.openUri(url) } }
            }
        }
        if (paid.isNotEmpty()) {
            ProviderGridCard("Noleggio e acquisto", "Disponibile per il noleggio o l’acquisto", paid,
                included = false) { provider ->
                providerServiceUrl(provider)?.let { url -> runCatching { uriHandler.openUri(url) } }
            }
        }
        if (streaming.isEmpty() && paid.isEmpty()) {
            Surface(color = Panel, shape = RoundedCornerShape(17.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF302D34)), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = CrimsonSoft.copy(alpha = .14f), shape = CircleShape, modifier = Modifier.size(42.dp)) {
                        Icon(painterResource(R.drawable.ic_visibility_off), null, tint = CrimsonSoft, modifier = Modifier.padding(10.dp))
                    }
                    Column(Modifier.padding(start = 12.dp)) {
                        Text("Nessuna disponibilità rilevata in Italia", color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("I risultati possono variare in base alla posizione.", color = Muted, fontSize = 11.sp,
                            modifier = Modifier.padding(top = 3.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ProviderGridCard(
    title: String,
    subtitle: String,
    providers: List<Pair<Models.Provider, String>>,
    included: Boolean,
    onProviderClick: (Models.Provider) -> Unit
) {
    val accent = Sw.Accent
    val secondary = Color(0xFF9C9BAA)
    val icon = if (included) R.drawable.ic_broadcast else R.drawable.ic_cart
    Surface(
        color = Color.Transparent,
        shape = RoundedCornerShape(25.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp,
            if (included) Color(0xFF4A2A22) else Color(0xFF292C34)),
        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
    ) {
        Column(Modifier.background(Brush.linearGradient(
            if (included) listOf(Color(0xFF261611), Color(0xFF0A0B10), Color(0xFF15100E))
            else listOf(Color(0xFF12141B), Color(0xFF090B10))
        )).padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(bottom = 13.dp)) {
                Box(Modifier.size(38.dp).background(
                    Brush.radialGradient(listOf(Color(0xFF5A2418), Color(0xFF2A1510))), CircleShape
                ).border(1.dp, Color(0xFF5A2A1E), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(painterResource(icon), null, tint = accent, modifier = Modifier.size(23.dp))
                }
                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                    Text(title, color = Color(0xFFF4F3F7), fontWeight = FontWeight.Bold,
                        fontSize = 17.sp, lineHeight = 21.sp)
                    Text(subtitle, color = secondary, fontSize = 12.sp, lineHeight = 16.sp,
                        modifier = Modifier.padding(top = 3.dp))
                }
            }
            BoxWithConstraints(Modifier.fillMaxWidth()) {
            // Keep three columns as in the reference, but allow room for larger accessibility text.
            val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
            val columns = if (maxWidth < 270.dp || fontScale > 1.2f) 2 else 3
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            providers.chunked(columns).forEach { rowProviders ->
                Row(
                    Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    rowProviders.forEach { (provider, label) ->
                        Surface(
                            color = Color(0xFF0F1117),
                            shape = RoundedCornerShape(17.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30313B)),
                            modifier = Modifier.weight(1f).fillMaxHeight().then(
                                if (providerServiceUrl(provider) != null) Modifier.noRippleClickable { onProviderClick(provider) }
                                else Modifier
                            )
                        ) {
                            Column(
                                Modifier.padding(horizontal = 6.dp, vertical = 11.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Top
                            ) {
                                RemoteImage(provider.logo, Modifier.size(46.dp).clip(RoundedCornerShape(13.dp)), ContentScale.Fit)
                                Text(
                                    provider.name,
                                    color = Color(0xFFF4F3F7),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    lineHeight = 15.sp,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    minLines = 2,
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                                )
                                Spacer(Modifier.weight(1f))
                                Surface(
                                    color = if (included) Color(0xFF40201A) else Color.Transparent,
                                    shape = RoundedCornerShape(50),
                                    border = androidx.compose.foundation.BorderStroke(1.dp,
                                        if (included) Color(0xFF7A3A2A) else Color(0xFF494854)),
                                    modifier = Modifier.padding(top = 8.dp).fillMaxWidth()
                                ) {
                                    Row(Modifier.padding(horizontal = 5.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center) {
                                        Icon(painterResource(if (included) R.drawable.ic_check else R.drawable.ic_cart),
                                            null, tint = if (included) accent else secondary, modifier = Modifier.size(13.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text(label, color = if (included) accent else secondary,
                                            fontSize = 9.sp, lineHeight = 12.sp,
                                            fontWeight = if (included) FontWeight.SemiBold else FontWeight.Normal,
                                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                            modifier = Modifier.weight(1f, fill = false))
                                    }
                                }
                            }
                        }
                    }
                    repeat(columns - rowProviders.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            }
            }
        }
    }
}

private fun providerServiceUrl(provider: Models.Provider): String? {
    val name = provider.name.lowercase(Locale.ROOT)
    return when {
        provider.id == 8 || "netflix" in name -> "https://www.netflix.com/"
        provider.id == 9 || provider.id == 10 || provider.id == 119 || "prime video" in name || "amazon" in name ->
            "https://www.primevideo.com/"
        provider.id == 2 || provider.id == 350 || "apple tv" in name -> "https://tv.apple.com/it/"
        provider.id == 3 || "google play" in name -> "https://play.google.com/store/movies"
        provider.id == 35 || "rakuten" in name -> "https://www.rakuten.tv/it"
        provider.id == 40 || "chili" in name -> "https://www.chili.com/it"
        provider.id == 337 || "disney" in name -> "https://www.disneyplus.com/it-it"
        provider.id == 531 || "paramount" in name -> "https://www.paramountplus.com/it/"
        provider.id == 1899 || name == "max" || "hbo max" in name -> "https://play.max.com/"
        "timvision" in name -> "https://www.timvision.it/"
        "sky" in name -> "https://www.sky.it/sky-go"
        name == "now" || "now tv" in name -> "https://www.nowtv.it/"
        "raiplay" in name || "rai play" in name -> "https://www.raiplay.it/"
        "mediaset" in name || "infinity" in name -> "https://mediasetinfinity.mediaset.it/"
        "discovery" in name -> "https://www.discoveryplus.com/it/"
        "crunchyroll" in name -> "https://www.crunchyroll.com/it/"
        "mubi" in name -> "https://mubi.com/it/"
        "dazn" in name -> "https://www.dazn.com/it-IT/home"
        "pluto" in name -> "https://pluto.tv/it/"
        "plex" in name -> "https://watch.plex.tv/it/"
        "youtube" in name -> "https://www.youtube.com/"
        else -> null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ActionSheet(media: Models.Media, store: LibraryStore, api: TmdbApi, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope(); val entry = store.get(media); val state = entry?.state ?: ""; var confirmHide by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val followed = remember(media.id) { ReleaseFollows.isFollowed(context, media.id) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // Let the sheet slide away before the caller removes it.
    val dismiss: () -> Unit = { scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() } }
    val changed: () -> Unit = { scope.launch { sheetState.hide() }.invokeOnCompletion { onChanged() } }
    val toggleFollow = rememberFollowToggle { changed() }
    var pendingReactionAction by remember(media.id) { mutableStateOf<((Boolean) -> Unit)?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Sw.Surface,
        shape = RoundedCornerShape(topStart = 36.dp, topEnd = 36.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(color = Color(0xFF77717A)) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp).padding(bottom = 26.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                RemoteImage(media.poster.ifBlank { media.backdrop }, Modifier.size(104.dp, 150.dp).clip(RoundedCornerShape(20.dp)), ContentScale.Crop)
                Column(Modifier.padding(start = 16.dp, top = 14.dp).weight(1f)) {
                    Text(if (media.isSeries) "SERIE TV" else "FILM", color = CrimsonSoft, fontSize = 11.sp,
                        fontWeight = FontWeight.Black, letterSpacing = 1.7.sp)
                    Text(media.title, style = MaterialTheme.typography.headlineMedium, color = Ink, maxLines = 2,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                    Text(listOfNotNull(media.year, media.genres.take(2).joinToString(", ").takeIf { it.isNotBlank() }).joinToString("  •  "),
                        color = Muted, fontSize = 14.sp, maxLines = 2, modifier = Modifier.padding(top = 9.dp))
                }
                FilledTonalIconButton(dismiss, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Raised)) {
                    Icon(painterResource(R.drawable.ic_close), "Chiudi")
                }
            }
            Spacer(Modifier.height(24.dp))
            if (state == "hidden") ActionButton("Ripristina nel catalogo", "Mostra nuovamente questo titolo", R.drawable.ic_check, LikeGreen) { store.restore(media); changed() }
            else {
                if (state == "saved" || state == "progress" || state == "watched") {
                    ActionButton(
                        if (entry?.pinned == true) "Rimuovi dai fissati" else "Fissa in cima alla home",
                        if (entry?.pinned == true) "Il titolo non resterà più in cima alla lista" else "Il titolo comparirà in cima alle sezioni della home e della libreria",
                        R.drawable.ic_push_pin, CrimsonSoft
                    ) { store.togglePinned(media); changed() }
                }
                if (media.isSeries) {
                    if (state == "watched") {
                        ActionButton("Cambia voto", "Aggiorna il tuo giudizio sulla serie", R.drawable.ic_thumb_up, LikeGreen) { pendingReactionAction = { liked -> store.setLiked(media, liked); changed() } }
                        ActionButton("Ricomincia dal primo episodio", "Azzera il progresso della serie", R.drawable.ic_play, Color(0xFF62C8D7)) { store.restart(media); changed() }
                    }
                    else {
                        ActionButton(if (state == "progress") "Rimuovi dalla mia lista" else "Aggiungi alla mia lista",
                            if (state == "progress") "Il titolo verrà rimosso dalla tua lista" else "Salvalo per guardarlo più tardi",
                            if (state == "progress") R.drawable.ic_check else R.drawable.ic_add, CrimsonSoft) { if (state == "progress") store.remove(media) else store.save(media); changed() }
                        entry?.let { current ->
                            ActionButton("Segna S${current.nextSeason} · E${current.nextEpisode} come visto", "Aggiorna il tuo progresso",
                                R.drawable.ic_check, LikeGreen) {
                                scope.launch {
                                    val seasons = withContext(Dispatchers.IO) { runCatching { api.seasons(media, true) }.getOrDefault(emptyList()) }
                                    val next = seasons.flatMap { it.episodes }.firstOrNull { it.season == current.nextSeason && it.number == current.nextEpisode }
                                    if (next != null) {
                                        if (next == LibraryStore.flatten(seasons).lastOrNull())
                                            pendingReactionAction = { liked -> store.markEpisode(media, next, seasons, liked); changed() }
                                        else { store.markEpisode(media, next, seasons, null); changed() }
                                    }
                                }
                            }
                        }
                        ActionButton("Segna tutta la serie come vista", "Tutti gli episodi verranno segnati come visti",
                            R.drawable.ic_tv, Color(0xFFE273C6)) {
                            pendingReactionAction = { liked ->
                                scope.launch {
                                    val seasons = withContext(Dispatchers.IO) { runCatching { api.seasons(media, true) }.getOrDefault(emptyList()) }
                                    store.completeSeries(media, seasons, liked)
                                    changed()
                                }
                            }
                        }
                    }
                } else {
                    if (state != "watched") ActionButton(if (state == "saved") "Rimuovi dalla mia lista" else "Aggiungi alla mia lista",
                        if (state == "saved") "Il film verrà rimosso dalla tua lista" else "Salvalo per guardarlo più tardi",
                        if (state == "saved") R.drawable.ic_check else R.drawable.ic_add, CrimsonSoft) { if (state == "saved") store.remove(media) else store.save(media); changed() }
                    ActionButton(if (state == "watched") "Rimetti nella mia lista" else "Segna come visto",
                        if (state == "watched") "Il film tornerà tra i titoli da vedere" else "Completa il film e lascia il tuo voto",
                        R.drawable.ic_check, LikeGreen) {
                        if (state == "watched") { store.markMovieUnwatched(media); changed() }
                        else pendingReactionAction = { liked -> store.watched(media, liked); changed() }
                    }
                    if (state == "watched") ActionButton("Cambia voto", "Aggiorna il tuo giudizio sul film", R.drawable.ic_thumb_up, LikeGreen) { pendingReactionAction = { liked -> store.setLiked(media, liked); changed() } }
                }
                ActionButton(if (followed) "Non seguire più" else "Segui le uscite",
                    if (followed) "Non riceverai più notifiche per questo titolo" else if (media.isSeries) "Ricevi una notifica a ogni nuovo episodio" else "Ricevi una notifica all’uscita e all’arrivo in streaming",
                    if (followed) R.drawable.ic_notifications else R.drawable.ic_notifications_none, FollowGold) { toggleFollow(media, null) }
                ActionButton("Non mi interessa", "Suggeriremo meno contenuti simili", R.drawable.ic_visibility_off,
                    MaterialTheme.colorScheme.error, destructive = true) { confirmHide = true }
            }
        }
    }
    if (confirmHide) AlertDialog(
        onDismissRequest = { confirmHide = false },
        title = { Text("Non ti interessa?") },
        text = { Text("Questo titolo verrà nascosto dal catalogo e dalle proposte.") },
        confirmButton = { TextButton({ store.hide(media); confirmHide = false; changed() }) { Text("Nascondi") } },
        dismissButton = { TextButton({ confirmHide = false }) { Text("Annulla") } }
    )
    if (pendingReactionAction != null) ReactionDialog(media.title,
        onChoice = { liked -> pendingReactionAction?.invoke(liked); pendingReactionAction = null },
        onDismiss = { pendingReactionAction = null }, alreadyWatched = state == "watched")
}

@Composable
private fun ActionButton(label: String, subtitle: String, icon: Int, accent: Color,
    destructive: Boolean = false, action: () -> Unit) {
    Surface(onClick = action,
        color = if (destructive) Color(0xFF621322) else Sw.Raised,
        shape = RoundedCornerShape(22.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp,
            if (destructive) Color(0xFF9B2D43) else Sw.Outline),
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 15.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = accent.copy(alpha = .15f), shape = CircleShape, modifier = Modifier.size(48.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(painterResource(icon), null, tint = if (destructive) Color(0xFFFFB5C2) else accent, modifier = Modifier.size(25.dp))
                }
            }
            Column(Modifier.padding(start = 13.dp).weight(1f)) {
                Text(label, color = if (destructive) Color.White else Ink, fontWeight = FontWeight.Bold,
                    fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(subtitle, color = if (destructive) Color(0xFFE9BAC3) else Muted, fontSize = 13.sp,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            }
            Icon(painterResource(R.drawable.ic_chevron_right), null,
                tint = if (destructive) Color(0xFFE9BAC3) else Muted, modifier = Modifier.size(23.dp))
        }
    }
}

@Composable
private fun ReactionIcon(liked: Boolean, modifier: Modifier = Modifier) {
    Icon(painterResource(R.drawable.ic_thumb_up), if (liked) "Mi piace" else "Non mi piace",
        tint = if (liked) LikeGreen else DislikeRed,
        modifier = modifier.graphicsLayer { rotationZ = if (liked) 0f else 180f })
}

@Composable
private fun ReactionBadge(liked: Boolean, modifier: Modifier = Modifier) {
    Surface(color = Color(0xEE15191B), shape = CircleShape,
        border = androidx.compose.foundation.BorderStroke(1.dp, (if (liked) LikeGreen else DislikeRed).copy(alpha = .65f)),
        modifier = modifier.size(36.dp)) {
        Box(contentAlignment = Alignment.Center) { ReactionIcon(liked, Modifier.size(19.dp)) }
    }
}

@Composable
private fun BoxScope.PosterStatusBadges(liked: Boolean?, pinned: Boolean, state: String?) {
    if (liked != null) ReactionBadge(liked, Modifier.align(Alignment.TopEnd).padding(8.dp))
    if (pinned) Surface(color = DeepCrimson, shape = CircleShape,
        modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).size(34.dp)) {
        Icon(painterResource(R.drawable.ic_push_pin), "Titolo fissato in alto", tint = Color.White, modifier = Modifier.padding(8.dp))
    }
    if (state == "saved" || state == "progress" || state == "watched") {
        Surface(color = Color(0xE61A1B21), shape = CircleShape,
            modifier = Modifier.align(if (liked == null) Alignment.TopEnd else Alignment.BottomEnd).padding(8.dp).size(34.dp)) {
            Icon(painterResource(if (state == "watched") R.drawable.ic_check else R.drawable.ic_play), null,
                tint = CrimsonSoft, modifier = Modifier.padding(8.dp))
        }
    }
}

@Composable
private fun ReactionDialog(title: String, onChoice: (Boolean) -> Unit, onDismiss: () -> Unit,
    alreadyWatched: Boolean = false) {
    var selected by remember(title) { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(selected) {
        val value = selected ?: return@LaunchedEffect
        delay(340)
        onChoice(value)
    }
    Dialog(onDismissRequest = { if (selected == null) onDismiss() }) {
        Surface(color = Panel, shape = RoundedCornerShape(30.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Sw.Outline)) {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(58.dp).crimsonGlow(CircleShape, 10.dp), contentAlignment = Alignment.Center) {
                    Icon(painterResource(R.drawable.ic_check), null, tint = Color.White, modifier = Modifier.size(29.dp))
                }
                Text("Ti è piaciuto?", style = MaterialTheme.typography.headlineMedium, color = Ink,
                    modifier = Modifier.padding(top = 18.dp))
                Text(if (alreadyWatched) "Aggiorna il tuo voto per “$title”." else "Scegli per completare “$title” e rendere i consigli più tuoi.", color = Muted,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center, lineHeight = 21.sp,
                    modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf(true, false).forEach { liked ->
                        val active = selected == liked
                        val accent = if (liked) LikeGreen else DislikeRed
                        val interactionSource = remember { MutableInteractionSource() }
                        val scale by animateFloatAsState(if (active) 1.08f else 1f,
                            spring(dampingRatio = Spring.DampingRatioMediumBouncy), label = "reaction-choice")
                        Surface(
                            color = accent.copy(alpha = if (active) .28f else .12f),
                            shape = RoundedCornerShape(22.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = if (active) 1f else .55f)),
                            modifier = Modifier.weight(1f).height(105.dp).scale(scale)
                                .clip(RoundedCornerShape(22.dp))
                                .clickable(interactionSource = interactionSource, indication = null) {
                                    if (selected == null) selected = liked
                                }) {
                            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center) {
                                ReactionIcon(liked, Modifier.size(35.dp))
                                Text(if (liked) "Mi piace" else "Non mi piace", color = accent,
                                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                            }
                        }
                    }
                }
                TextButton(onDismiss, enabled = selected == null, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Non adesso", color = Muted)
                }
            }
        }
    }
}

@Composable
private fun SearchScreen(api: TmdbApi, store: LibraryStore, refresh: Int, onDismiss: () -> Unit, onOpen: (Models.Media) -> Unit) {
    var query by remember { mutableStateOf("") }
    var searchMode by remember { mutableStateOf("titles") }
    var searchJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    var mediaType by remember { mutableStateOf("all") }
    var results by remember { mutableStateOf<List<Models.Media>>(emptyList()) }
    var people by remember { mutableStateOf<List<Models.Person>>(emptyList()) }
    var selectedPerson by remember { mutableStateOf<PersonSelection?>(null) }
    var loading by remember { mutableStateOf(false) }
    var closingSearch by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val closeSearch = {
        if (!closingSearch) {
            closingSearch = true
            focusManager.clearFocus(force = true)
            keyboard?.hide()
            scope.launch { delay(120); onDismiss() }
        }
    }
    BackHandler(enabled = true, onBack = closeSearch)
    Surface(Modifier.fillMaxSize(), color = Night) {
        val focusRequester = remember { FocusRequester() }
        LaunchedEffect(Unit) {
            delay(380)
            if (!closingSearch) {
                focusRequester.requestFocus()
                delay(100)
                if (!closingSearch) keyboard?.show()
            }
        }
        val submitSearch = {
            focusManager.clearFocus(force = true)
            keyboard?.hide()
            if (query.isNotBlank() && !loading) {
                val mode = searchMode
                val searchQuery = query.trim()
                searchJob = scope.launch {
                    loading = true
                    if (mode != "titles") {
                        people = withContext(Dispatchers.IO) {
                            runCatching { api.searchPeople(searchQuery, mode == "directors").toList() }.getOrDefault(emptyList())
                        }
                    } else {
                        val yearMatch = Regex("(?:^|\\s)(\\d{4})$").find(searchQuery)
                        val year = yearMatch?.groupValues?.get(1)?.toIntOrNull()
                        val title = yearMatch?.let { searchQuery.removeRange(it.range).trim() } ?: searchQuery
                        results = withContext(Dispatchers.IO) {
                            runCatching { api.searchTitles(title, year).toList() }.getOrDefault(emptyList())
                        }
                    }
                    loading = false
                }
            }
        }
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp)) {
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    GlassIconButton(R.drawable.ic_back, "Indietro") { closeSearch() }
                    Text("Cerca", style = MaterialTheme.typography.headlineLarge, color = Ink, modifier = Modifier.padding(start = 14.dp))
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 18.dp).height(58.dp).glass(RoundedCornerShape(29.dp), .9f).padding(start = 18.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(painterResource(R.drawable.ic_search), null, tint = Sw.Accent, modifier = Modifier.size(22.dp))
                    androidx.compose.foundation.text.BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Medium),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(Sw.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { submitSearch() }),
                        modifier = Modifier.weight(1f).padding(horizontal = 12.dp).focusRequester(focusRequester),
                        decorationBox = { inner -> Box { if (query.isEmpty()) Text(when (searchMode) { "actors" -> "Nome dell’attore o attrice"; "directors" -> "Nome del regista"; else -> "Titolo · anno facoltativo" }, color = Muted, fontSize = 17.sp); inner() } }
                    )
                    AnimatedContent(loading to query.isNotEmpty(), label = "search-trailing") { (busy, filled) ->
                        when {
                            busy -> Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(20.dp), color = Sw.Accent, strokeWidth = 2.dp) }
                            filled -> IconButton({ query = ""; results = emptyList(); people = emptyList() }, Modifier.size(40.dp)) { Icon(painterResource(R.drawable.ic_close), "Cancella", tint = Muted) }
                            else -> Spacer(Modifier.size(40.dp))
                        }
                    }
                }
                SegmentedPills(listOf("Titoli", "Attori", "Registi"), listOf("titles", "actors", "directors").indexOf(searchMode), Modifier.fillMaxWidth().padding(top = 14.dp)) { index ->
                    searchJob?.cancel(); loading = false; people = emptyList(); results = emptyList(); searchMode = listOf("titles", "actors", "directors")[index]
                }
                AnimatedVisibility(searchMode == "titles") {
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("all" to "Tutti", "movie" to "Film", "tv" to "Serie TV").forEach { (id, label) ->
                            val active = mediaType == id
                            Box(
                                Modifier.clip(CircleShape).background(if (active) Sw.Accent.copy(alpha = .18f) else Sw.Raised)
                                    .border(1.dp, if (active) Sw.Accent else Color.Transparent, CircleShape)
                                    .noRippleClickable { mediaType = id }.padding(horizontal = 14.dp, vertical = 7.dp)
                            ) { Text(label, color = if (active) Sw.Accent else Muted, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                        }
                    }
                }
                LaunchedEffect(query, searchMode) {
                    if (query.trim().length >= 3) {
                        delay(550)
                        searchJob?.cancel()
                        val mode = searchMode
                        val searchQuery = query.trim()
                        searchJob = scope.launch {
                            loading = true
                            if (mode != "titles") people = withContext(Dispatchers.IO) { runCatching { api.searchPeople(searchQuery, mode == "directors").toList() }.getOrDefault(emptyList()) }
                            else {
                                val yearMatch = Regex("(?:^|\\s)(\\d{4})$").find(searchQuery)
                                val year = yearMatch?.groupValues?.get(1)?.toIntOrNull()
                                val title = yearMatch?.let { searchQuery.removeRange(it.range).trim() } ?: searchQuery
                                results = withContext(Dispatchers.IO) { runCatching { api.searchTitles(title, year).toList() }.getOrDefault(emptyList()) }
                            }
                            loading = false
                        }
                    }
                }
                if (query.isBlank() && results.isEmpty() && people.isEmpty()) EmptyState(
                    R.drawable.ic_search,
                    when (searchMode) { "actors" -> "Cerca un attore"; "directors" -> "Cerca un regista"; else -> "Cosa ti va di vedere?" },
                    if (searchMode == "titles") "Scrivi un titolo: i risultati arrivano mentre digiti. Aggiungi l’anno per essere più preciso, ad esempio “Dune 2021”." else "Apri la filmografia completa e segui la persona per sapere quando esce un suo nuovo titolo.",
                    Modifier.padding(top = 12.dp)
                )
                if (searchMode != "titles") {
                    LazyColumn(
                        Modifier.fillMaxSize().padding(top = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(9.dp),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        items(people, key = { it.id }) { person -> PersonResult(person) { selected, bounds -> selectedPerson = PersonSelection(selected, bounds) } }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(104.dp),
                        modifier = Modifier.fillMaxSize().padding(top = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(bottom = 28.dp)
                    ) {
                        gridItems(results.filter { mediaType == "all" || it.mediaType == mediaType }, key = { it.id }) { media -> SearchPosterCard(media, store.get(media)) { onOpen(media) } }
                    }
                }
            }
    }
    selectedPerson?.let { selection ->
        PersonCredits(selection.person, api, store, sourceBounds = selection.sourceBounds, dismiss = { selectedPerson = null }, onOpen = onOpen, keepOpenOnMediaOpen = true)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SearchPosterCard(media: Models.Media, entry: Models.LibraryEntry?, contentVersion: Int = 0, onLongPress: (() -> Unit)? = null, releaseDates: Boolean = false, open: () -> Unit) {
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    val pinned = remember(entry?.pinned, contentVersion) { entry?.pinned == true }
    val clickModifier = if (onLongPress == null) Modifier.noRippleClickable { registerSource(sourceKey); open() }
    else Modifier.noRippleCombinedClickable(onClick = { registerSource(sourceKey); open() }, onLongClick = onLongPress)
    Column(Modifier.fillMaxWidth()) {
        Box(clickModifier.fillMaxWidth()) {
            SharedArtworkSource(media, sourceKey, Modifier.fillMaxWidth().aspectRatio(.68f), RoundedCornerShape(18.dp))
            Box(Modifier.matchParentSize().border(1.dp, Color.White.copy(alpha = .07f), RoundedCornerShape(18.dp)))
            if (media.rating > 0) MetaPill(rating(media.rating), Modifier.align(Alignment.TopStart).padding(7.dp), icon = R.drawable.ic_star, tint = Sw.Amber)
            PosterStatusBadges(entry?.liked, pinned, entry?.state)
        }
        Text(media.title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp, start = 2.dp, end = 2.dp))
        Text(if (releaseDates) releaseLabel(media) else "${media.year} · ${if (media.isSeries) "Serie TV" else "Film"}", color = Muted, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(top = 2.dp, start = 2.dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LibrarySectionContent(
    section: HomeSection,
    store: LibraryStore,
    refresh: Int,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onDiscover: () -> Unit
) {
    val subscriptionData = LocalSubscriptionData.current
    val activeSubscriptions = LocalActiveSubscriptions.current.active
    val (subscriptionFilter, changeSubscriptionFilter) = rememberSubscriptionFilter(store, section.state, refresh)
    val filterSubscriptions = section == HomeSection.SAVED || section == HomeSection.PROGRESS
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("all") }
    var sort by remember(section) { mutableStateOf(LibrarySort.entries.firstOrNull { it.name == store.librarySort(section.state) } ?: LibrarySort.TITLE) }
    var gridView by remember(section) { mutableStateOf(store.libraryGridView(section.state)) }
    var sortMenuOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val gridState = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val openMedia: (Models.Media) -> Unit = { media ->
        focusManager.clearFocus(force = true)
        keyboard?.hide()
        scope.launch {
            delay(80)
            onOpen(media)
        }
    }
    val entries = remember(section, refresh) { store.entriesByState(section.state).toList() }
    val visible = remember(entries, query, type, sort, subscriptionFilter, subscriptionData.availability, activeSubscriptions) {
        val filtered = entries.filter { entry ->
            entry.media.title.contains(query.trim(), ignoreCase = true) &&
                (type == "all" || entry.media.mediaType == type) &&
                (!filterSubscriptions || subscriptionFilter.includes(entry.media, subscriptionData, activeSubscriptions))
        }
        val sorted = when (sort) {
            LibrarySort.ORIGINAL -> filtered
            LibrarySort.TITLE -> filtered.sortedBy { it.media.title.lowercase(Locale.ITALY) }
            LibrarySort.NEWEST -> filtered.sortedWith(compareByDescending<Models.LibraryEntry> { it.media.releaseDate }.thenBy { it.media.title.lowercase(Locale.ITALY) })
            LibrarySort.OLDEST -> filtered.sortedWith(compareBy<Models.LibraryEntry> { it.media.releaseDate.ifBlank { "9999-99-99" } }.thenBy { it.media.title.lowercase(Locale.ITALY) })
            LibrarySort.RATING -> filtered.sortedWith(compareByDescending<Models.LibraryEntry> { it.media.rating }.thenBy { it.media.title.lowercase(Locale.ITALY) })
        }
        if (section == HomeSection.PROGRESS) continueWatchingOrder(sorted) else sorted.sortedByDescending { it.pinned }
    }
    if (entries.isEmpty()) {
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 120.dp)) {
            when (section) {
                HomeSection.PROGRESS -> EmptyState(R.drawable.ic_play, "Nessuna serie in corso", "Quando inizi una serie e segni un episodio come visto, la ritrovi qui pronta a ripartire.", action = "Trova qualcosa da guardare", onAction = onDiscover)
                HomeSection.SAVED -> EmptyState(R.drawable.ic_add, "La tua lista è vuota", "Salva film e serie che vuoi vedere: li ritrovi qui, filtrabili per abbonamento.", action = "Esplora il catalogo", onAction = onDiscover)
                HomeSection.WATCHED -> EmptyState(R.drawable.ic_check, "Ancora nessun titolo visto", "Segna film e serie come visti e lascia un voto: i consigli diventeranno più tuoi.")
            }
        }
        return
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).height(48.dp).glass(CircleShape).padding(start = 16.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(painterResource(R.drawable.ic_search), null, tint = Muted, modifier = Modifier.size(19.dp))
                androidx.compose.foundation.text.BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = Ink, fontSize = 15.sp),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Sw.Accent),
                    modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                    decorationBox = { inner -> Box { if (query.isEmpty()) Text("Cerca in ${section.title.lowercase(Locale.ITALY)}", color = Muted, fontSize = 15.sp); inner() } }
                )
                AnimatedVisibility(query.isNotEmpty(), enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
                    IconButton({ query = "" }, Modifier.size(36.dp)) { Icon(painterResource(R.drawable.ic_close), "Cancella ricerca", tint = Muted, modifier = Modifier.size(18.dp)) }
                }
            }
            Spacer(Modifier.width(8.dp))
            Box {
                GlassIconButton(R.drawable.ic_tune, "Ordina", size = 48.dp) { sortMenuOpen = true }
                DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }, shape = RoundedCornerShape(18.dp)) {
                    Text("ORDINA PER", color = Sw.Accent, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    LibrarySort.entries.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option.label) },
                            onClick = {
                                sort = option
                                store.setLibrarySort(section.state, option.name)
                                sortMenuOpen = false
                                scope.launch { listState.scrollToItem(0); gridState.scrollToItem(0) }
                            },
                            trailingIcon = { if (sort == option) Icon(painterResource(R.drawable.ic_check), "Selezionato", tint = Sw.Accent) }
                        )
                    }
                }
            }
            Spacer(Modifier.width(8.dp))
            GlassIconButton(if (gridView) R.drawable.ic_list else R.drawable.ic_grid, if (gridView) "Visualizzazione elenco" else "Visualizzazione griglia", size = 48.dp) {
                gridView = !gridView
                store.setLibraryGridView(section.state, gridView)
            }
        }
        if (section == HomeSection.WATCHED) {
            SegmentedPills(listOf("Tutto", "Film", "Serie"), listOf("all", "movie", "tv").indexOf(type), Modifier.fillMaxWidth().padding(top = 12.dp), height = 40.dp) {
                type = listOf("all", "movie", "tv")[it]
            }
        }
        if (filterSubscriptions) SubscriptionFilterBar(subscriptionFilter, changeSubscriptionFilter, Modifier.padding(top = 10.dp))
        AnimatedContent(gridView, Modifier.weight(1f), transitionSpec = { fadeIn(tween(220)) + scaleIn(tween(260), initialScale = .96f) togetherWith fadeOut(tween(120)) }, label = "library-view") { grid ->
            if (visible.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Nessun titolo corrisponde ai filtri.", color = Muted, fontSize = 16.sp)
                }
            } else if (grid) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(104.dp),
                    state = gridState,
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(top = 14.dp, bottom = 132.dp)
                ) {
                    gridItems(visible, key = { it.media.id }) { entry ->
                        SearchPosterCard(entry.media, entry, contentVersion = refresh, onLongPress = { onAction(entry.media) }) { openMedia(entry.media) }
                    }
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(top = 14.dp, bottom = 132.dp)
                ) {
                    items(visible, key = { it.media.id }) { entry ->
                        ExpandedLibraryRow(entry, { openMedia(entry.media) }, { onAction(entry.media) }, refresh, Modifier.animateItem())
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ExpandedLibraryRow(entry: Models.LibraryEntry, open: () -> Unit, actions: () -> Unit, contentVersion: Int = 0, modifier: Modifier = Modifier) {
    val media = entry.media
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    Box(
        modifier.fillMaxWidth().noRippleCombinedClickable(onClick = { registerSource(sourceKey); open() }, onLongClick = actions).glass(RoundedCornerShape(22.dp))
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(76.dp, 110.dp)) {
                SharedArtworkSource(media, sourceKey, Modifier.fillMaxSize(), RoundedCornerShape(15.dp))
                entry.liked?.let { ReactionBadge(it, Modifier.align(Alignment.TopEnd).padding(3.dp).scale(.78f)) }
                if (entry.pinned) Surface(color = DeepCrimson, shape = CircleShape,
                    modifier = Modifier.align(Alignment.BottomStart).padding(3.dp).size(28.dp)) {
                    Icon(painterResource(R.drawable.ic_push_pin), "Titolo fissato in alto", tint = Color.White, modifier = Modifier.padding(7.dp))
                }
            }
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text(media.title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${media.year}  ·  ★ ${rating(media.rating)}", color = CrimsonSoft, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
                val statusText = remember(entry.state, entry.nextSeason, entry.nextEpisode, contentVersion) {
                    when {
                        entry.state == "progress" && media.isSeries -> "Prossimo: S${entry.nextSeason} · E${entry.nextEpisode}"
                        media.isSeries -> "Serie TV"
                        else -> "Film"
                    }
                }
                Text(
                    statusText,
                    color = Muted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 5.dp)
                )
            }
            Surface(color = Color(0xE61A1B21), shape = CircleShape, modifier = Modifier.size(38.dp)) {
                Icon(painterResource(if (entry.state == "watched") R.drawable.ic_check else R.drawable.ic_play), null, tint = CrimsonSoft, modifier = Modifier.padding(9.dp))
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun CatalogExpandedScreen(
    title: String,
    media: List<Models.Media>,
    store: LibraryStore,
    loadingMore: Boolean,
    refreshing: Boolean,
    onDismiss: () -> Unit,
    onOpen: (Models.Media) -> Unit,
    onAction: (Models.Media) -> Unit,
    onLoadMore: (() -> Unit)?,
    onRefresh: (() -> Unit)?,
    releaseDates: Boolean = false,
    paginationError: Boolean = false
) {
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(LibrarySort.ORIGINAL) }
    var gridView by remember { mutableStateOf(false) }
    var viewMenuOpen by remember { mutableStateOf(false) }
    val pullToRefreshState = rememberPullToRefreshState()
    val listState = rememberLazyListState()
    val gridState = rememberLazyGridState()
    val visible = remember(media, query, sort) {
        val filtered = media.filter { it.title.contains(query.trim(), ignoreCase = true) }
        when (sort) {
            LibrarySort.ORIGINAL -> filtered
            LibrarySort.TITLE -> filtered.sortedBy { it.title.lowercase(Locale.ITALY) }
            LibrarySort.NEWEST -> filtered.sortedWith(compareByDescending<Models.Media> { it.releaseDate }.thenBy { it.title.lowercase(Locale.ITALY) })
            LibrarySort.OLDEST -> filtered.sortedWith(compareBy<Models.Media> { it.releaseDate.ifBlank { "9999-99-99" } }.thenBy { it.title.lowercase(Locale.ITALY) })
            LibrarySort.RATING -> filtered.sortedWith(compareByDescending<Models.Media> { it.rating }.thenBy { it.title.lowercase(Locale.ITALY) })
        }
    }

    val atEnd by remember(gridView) { derivedStateOf {
        if (gridView) gridState.layoutInfo.let { it.totalItemsCount > 0 && (it.visibleItemsInfo.lastOrNull()?.index ?: -1) >= it.totalItemsCount - 2 }
        else listState.layoutInfo.let { it.totalItemsCount > 0 && (it.visibleItemsInfo.lastOrNull()?.index ?: -1) >= it.totalItemsCount - 2 }
    } }
    LaunchedEffect(atEnd, media.size, loadingMore, refreshing, paginationError, onLoadMore != null, query) {
        if (releaseDates && atEnd && !loadingMore && !refreshing && !paginationError && query.isBlank()) onLoadMore?.invoke()
    }

    BackHandler(enabled = true, onBack = onDismiss)
    Surface(Modifier.fillMaxSize(), color = Night) {
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { onRefresh?.invoke() },
                state = pullToRefreshState,
                indicator = {
                    if (onRefresh != null) PullToRefreshDefaults.Indicator(
                        state = pullToRefreshState,
                        isRefreshing = refreshing,
                        modifier = Modifier.align(Alignment.TopCenter).offset(y = 92.dp),
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            ) {
                Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp)) {
                Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalIconButton(onDismiss, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Icon(painterResource(R.drawable.ic_back), "Indietro", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                    Column(Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(title, style = MaterialTheme.typography.headlineMedium, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${visible.size} ${if (visible.size == 1) "titolo" else "titoli"}", color = CrimsonSoft, fontWeight = FontWeight.Bold)
                    }
                    Box {
                        IconButton({ viewMenuOpen = true }) { Icon(painterResource(R.drawable.ic_more_vert), "Opzioni di visualizzazione") }
                        DropdownMenu(expanded = viewMenuOpen, onDismissRequest = { viewMenuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Visualizzazione elenco") },
                                onClick = { gridView = false; viewMenuOpen = false },
                                leadingIcon = { Icon(painterResource(R.drawable.ic_list), null) },
                                trailingIcon = { if (!gridView) Icon(painterResource(R.drawable.ic_check), "Selezionata") }
                            )
                            DropdownMenuItem(
                                text = { Text("Visualizzazione griglia") },
                                onClick = { gridView = true; viewMenuOpen = false },
                                leadingIcon = { Icon(painterResource(R.drawable.ic_grid), null) },
                                trailingIcon = { if (gridView) Icon(painterResource(R.drawable.ic_check), "Selezionata") }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    placeholder = { Text("Cerca nella sezione") },
                    leadingIcon = { Icon(painterResource(R.drawable.ic_search), null) },
                    trailingIcon = { if (query.isNotEmpty()) IconButton({ query = "" }) { Icon(painterResource(R.drawable.ic_close), "Cancella ricerca") } },
                    singleLine = true,
                    shape = RoundedCornerShape(22.dp)
                )
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    LibrarySort.entries.forEach { option -> FilterChip(sort == option, { sort = option }, { Text(option.label) }) }
                }
                if (visible.isEmpty()) {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text("Nessun titolo corrisponde alla ricerca.", color = Muted, fontSize = 16.sp)
                    }
                } else if (gridView) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        state = gridState,
                        modifier = Modifier.weight(1f).fillMaxWidth().padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(bottom = 12.dp)
                    ) {
                        gridItems(visible, key = { it.id }) { item -> SearchPosterCard(item, store.get(item), releaseDates = releaseDates) { onOpen(item) } }
                        if (onLoadMore != null) item(span = { GridItemSpan(maxLineSpan) }) {
                            CatalogLoadMoreButton(onLoadMore, loadingMore, paginationError)
                        }
                    }
                } else {
                    LazyColumn(
                        Modifier.weight(1f).fillMaxWidth().padding(top = 12.dp),
                        state = listState,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 12.dp)
                    ) {
                        items(visible, key = { it.id }) { item -> CatalogExpandedRow(item, store.get(item), { onOpen(item) }, { onAction(item) }, releaseDates) }
                        if (onLoadMore != null) item { CatalogLoadMoreButton(onLoadMore, loadingMore, paginationError) }
                    }
                }
                }
            }
    }
}

@Composable
private fun CatalogLoadMoreButton(onLoadMore: () -> Unit, loading: Boolean, error: Boolean = false) {
    OutlinedButton(
        onClick = onLoadMore,
        enabled = !loading,
        modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 6.dp),
        shape = RoundedCornerShape(18.dp)
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Crimson)
        else Text(if (error) "Caricamento non riuscito · Riprova" else "Carica altri")
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CatalogExpandedRow(media: Models.Media, entry: Models.LibraryEntry?, open: () -> Unit, actions: () -> Unit, releaseDates: Boolean = false) {
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    Surface(color = Panel, shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth().noRippleCombinedClickable(onClick = { registerSource(sourceKey); open() }, onLongClick = actions)) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(76.dp, 110.dp)) {
                SharedArtworkSource(media, sourceKey, Modifier.fillMaxSize(), RoundedCornerShape(15.dp))
                entry?.liked?.let { ReactionBadge(it, Modifier.align(Alignment.TopEnd).padding(3.dp).scale(.78f)) }
            }
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text(media.title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(if (releaseDates) releaseLabel(media) else "${media.year}  ·  ★ ${rating(media.rating)}", color = CrimsonSoft, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
                Text(if (media.isSeries) "Serie TV" else "Film", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
            }
            if (entry?.state == "saved" || entry?.state == "progress" || entry?.state == "watched") {
                Surface(color = Color(0xE61A1B21), shape = CircleShape, modifier = Modifier.size(38.dp)) {
                    Icon(painterResource(if (entry.state == "watched") R.drawable.ic_check else R.drawable.ic_play), null, tint = CrimsonSoft, modifier = Modifier.padding(9.dp))
                }
            }
        }
    }
}

@Composable
private fun PersonResult(person: Models.Person, onPersonClick: (Models.Person, Rect?) -> Unit) {
    var bounds by remember(person.id) { mutableStateOf<Rect?>(null) }
    Row(
        Modifier.fillMaxWidth().height(88.dp)
            .noRippleClickable { onPersonClick(person, bounds) }.glass(RoundedCornerShape(24.dp)).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RemoteImage(person.profile, Modifier.size(64.dp).onGloballyPositioned { bounds = it.boundsInRoot() }.clip(CircleShape).border(2.dp, Brush.linearGradient(listOf(Sw.Red, Sw.Coral)), CircleShape), ContentScale.Crop, fallbackIcon = R.drawable.ic_person)
        Column(Modifier.padding(horizontal = 15.dp).weight(1f)) {
            Text(person.name, color = Ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (person.director) "Regia · filmografia" else "Filmografia completa", color = Muted, fontSize = 12.sp)
        }
        Box(Modifier.size(38.dp).brandGlow(CircleShape, 6.dp), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
    }
}
@Composable
private fun MediaResult(media: Models.Media, open: () -> Unit) {
    val sourceKey = rememberArtworkSourceKey(media)
    val registerSource = LocalRegisterArtworkSource.current
    NoRipple { Surface(onClick = { registerSource(sourceKey); open() }, color = Panel, shape = RoundedCornerShape(20.dp)) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            SharedArtworkSource(media, sourceKey, Modifier.size(64.dp, 92.dp), RoundedCornerShape(14.dp), media.poster)
            Column(Modifier.padding(start = 14.dp)) {
                Text(media.title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("${media.year} · ★ ${rating(media.rating)}", color = CrimsonSoft, modifier = Modifier.padding(top = 4.dp))
            }
        }
    } }
}

@Composable
private fun PersonCredits(
    person: Models.Person,
    api: TmdbApi,
    store: LibraryStore,
    sourceBounds: Rect?,
    dismiss: () -> Unit,
    onOpen: (Models.Media) -> Unit,
    keepOpenOnMediaOpen: Boolean = false
) {
    var credits by remember { mutableStateOf<List<Models.Media>?>(null) }
    var creditType by remember { mutableStateOf("all") }
    var closing by remember(person.id) { mutableStateOf(false) }
    var pageBounds by remember(person.id) { mutableStateOf<Rect?>(null) }
    val progress = remember(person.id) { Animatable(0f) }
    val close = { if (!closing) closing = true }
    val context = LocalContext.current
    var followed by remember(person.id, person.director) { mutableStateOf(PersonFollows.isFollowed(context, person)) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) Toast.makeText(context, "Senza notifiche non potrò avvisarti dei nuovi titoli", Toast.LENGTH_LONG).show()
    }
    val toggleFollow = {
        if (followed) PersonFollows.unfollow(context, person)
        else {
            PersonFollows.follow(context, person)
            Toast.makeText(context, "Ti avviserò dei nuovi titoli di ${person.name}", Toast.LENGTH_SHORT).show()
            if (android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        followed = PersonFollows.isFollowed(context, person)
    }
    LaunchedEffect(person.id, person.director) {
        val hideShows = store.hideShowCredits()
        credits = withContext(Dispatchers.IO) { runCatching { api.personCredits(person.id, person.director, hideShows).toList() }.getOrDefault(emptyList()) }
    }
    LaunchedEffect(closing) {
        if (!closing) awaitTransformReady()
        progress.animateTo(if (closing) 0f else 1f, if (closing) tween(460, easing = FastOutSlowInEasing) else tween(540, easing = Sw.Emphasized))
        if (closing) dismiss()
    }
    BackHandler(enabled = !closing, onBack = close)
    ContainerTransform(
        progress = { progress.value },
        source = { sourceBounds },
        // Sources are the circular photos, so the page starts as that circle.
        sourceCornerPx = { sourceBounds?.let { minOf(it.width, it.height) / 2f } },
        preview = { modifier ->
            Box(modifier) {
                RemoteImage(person.profile, Modifier.fillMaxSize(), ContentScale.Crop, fallbackIcon = R.drawable.ic_person)
                // The photo's gradient ring, visible only while the page is still (almost) the circle.
                Box(Modifier.matchParentSize().graphicsLayer { alpha = (1f - progress.value * 6f).coerceIn(0f, 1f) }
                    .border(2.dp, Brush.linearGradient(listOf(Sw.Red, Sw.Coral)), CircleShape))
            }
        }
    ) { Surface(Modifier.fillMaxSize(), color = Night) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp)) {
                Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalIconButton(close, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Icon(painterResource(R.drawable.ic_back), "Indietro", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                    Column(Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(person.name, style = MaterialTheme.typography.headlineMedium, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (person.director) "Film e serie diretti" else "Film e serie", color = CrimsonSoft, fontWeight = FontWeight.Bold)
                    }
                    val followAccent by animateColorAsState(if (followed) FollowGold else CrimsonSoft, label = "person-follow-accent")
                    FilledTonalButton(
                        toggleFollow,
                        colors = ButtonDefaults.filledTonalButtonColors(containerColor = followAccent.copy(alpha = .16f), contentColor = followAccent),
                        contentPadding = PaddingValues(horizontal = 12.dp)
                    ) {
                        Icon(painterResource(if (followed) R.drawable.ic_notifications else R.drawable.ic_notifications_none), null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (followed) "Seguito" else "Segui", fontWeight = FontWeight.Bold)
                    }
                }
                val loadedCredits = credits
                if (loadedCredits == null) {
                    LoadingPane()
                } else {
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                        listOf("all" to "Tutto", "movie" to "Film", "tv" to "Serie TV").forEachIndexed { index, option ->
                            SegmentedButton(creditType == option.first, { creditType = option.first }, SegmentedButtonDefaults.itemShape(index, 3)) { Text(option.second) }
                        }
                    }
                    val visibleCredits = loadedCredits.filter { creditType == "all" || it.mediaType == creditType }
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.weight(1f).padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(bottom = 28.dp)
                    ) {
                        gridItems(visibleCredits, key = { it.id }) { media ->
                            SearchPosterCard(media, store.get(media)) {
                                if (!keepOpenOnMediaOpen) dismiss()
                                onOpen(media)
                            }
                        }
                    }
                }
            }
    } }
}

@Composable
private fun OnboardingScreen(onImportBackup: () -> Unit, onComplete: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    val pages = remember {
        listOf(
            "" to "Tutti i tuoi film e serie TV,\nin un’unica app.",
            "Tutti i tuoi servizi,\nin un unico posto" to "Cerca film e serie TV tra le principali piattaforme di streaming, noleggio, acquisto e cinema.",
            "Scopri dove guardare" to "Trova subito dove un titolo è disponibile: streaming, noleggio, acquisto o al cinema.",
            "Segui ciò che guardi" to "Salva i film, continua le serie dal prossimo episodio e ritrova tutto ciò che hai già visto.",
            "Ricevi nuovi consigli" to "Scopri nuovi titoli simili a quelli che hai guardato e valutato positivamente.",
            "La tua esperienza,\nsenza complicazioni" to "Un modo semplice e veloce per esplorare, organizzare e non perdere mai un titolo.",
            "Resta sempre aggiornato" to "Ritrova nuove uscite e stagioni in arrivo quando esplori il catalogo.",
            "" to "Un mondo di storie.\nSempre con te."
        )
    }
    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        BackHandler { if (page > 0) page-- }
        Surface(Modifier.fillMaxSize(), color = Sw.Background) {
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1A1414), Sw.Background, Color(0xFF16110F))))) {
                Box(Modifier.align(Alignment.BottomStart).offset(x = (-90).dp, y = 95.dp).size(300.dp)
                    .background(Brush.radialGradient(listOf(Color(0x55FF3B4E), Color.Transparent)), CircleShape))
                Column(
                    Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()
                        .padding(horizontal = 24.dp).padding(top = 10.dp, bottom = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(Modifier.fillMaxWidth().height(38.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                        if (page < pages.lastIndex) TextButton(onComplete, contentPadding = PaddingValues(horizontal = 4.dp)) {
                            Text("Salta", color = Color(0xFFD2C8CE), fontSize = 14.sp)
                        }
                    }
                    AnimatedContent(page, modifier = Modifier.fillMaxWidth().weight(1f),
                        transitionSpec = { fadeIn(tween(260)) togetherWith fadeOut(tween(180)) }, label = "onboarding-artwork") { index ->
                        OnboardingArtwork(index, Modifier.fillMaxSize())
                    }
                    if (page == 0 || page == pages.lastIndex) OnboardingWordmark()
                    else Text(pages[page].first, color = Color(0xFFF6F2F4), fontSize = 25.sp, lineHeight = 30.sp,
                        fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    Text(pages[page].second, color = if (page == 0 || page == pages.lastIndex) Color(0xFFE5DDE2) else Color(0xFFBAB3BB),
                        fontSize = 15.sp, lineHeight = 21.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(top = 10.dp).heightIn(min = 44.dp))
                    if (page < pages.lastIndex) {
                        Row(Modifier.padding(top = 20.dp, bottom = 22.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            pages.indices.forEach { index ->
                                Box(Modifier.size(if (index == page) 9.dp else 7.dp)
                                    .background(if (index == page) Sw.Accent else Color(0xFF625C64), CircleShape))
                            }
                        }
                    } else Spacer(Modifier.height(22.dp))
                    if (page == 0 || page == pages.lastIndex) {
                        Button(
                            onClick = { if (page == 0) page++ else onComplete() },
                            modifier = Modifier.fillMaxWidth().height(56.dp).crimsonGlow(RoundedCornerShape(28.dp), 12.dp),
                            shape = RoundedCornerShape(28.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
                        ) {
                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                Text(if (page == 0) "Inizia" else "Inizia ora", fontWeight = FontWeight.SemiBold)
                                Icon(painterResource(R.drawable.ic_arrow_forward), null,
                                    modifier = Modifier.align(Alignment.CenterEnd).size(22.dp))
                            }
                        }
                        if (page == pages.lastIndex) TextButton(onImportBackup, modifier = Modifier.padding(top = 4.dp)) {
                            Text("Hai un backup? Ripristinalo", color = Color(0xFFBEB6BE), fontSize = 13.sp)
                        }
                    } else {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            TextButton({ page-- }, contentPadding = PaddingValues(horizontal = 0.dp)) {
                                Text("‹  Indietro", color = Color(0xFFD0C8CF), fontSize = 14.sp)
                            }
                            Spacer(Modifier.weight(1f))
                            Button({ page++ }, modifier = Modifier.width(140.dp).height(54.dp).crimsonGlow(RoundedCornerShape(27.dp), 10.dp),
                                shape = RoundedCornerShape(27.dp), colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)) {
                                Text("Avanti", fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.width(12.dp))
                                Icon(painterResource(R.drawable.ic_arrow_forward), null, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OnboardingWordmark() {
    Text(buildAnnotatedString {
        withStyle(SpanStyle(color = Color(0xFFF9F5F7))) { append("STREAM") }
        withStyle(SpanStyle(color = Sw.Coral)) { append("WISE") }
    }, fontSize = 29.sp, fontWeight = FontWeight.Black, letterSpacing = 1.1.sp)
}

@Composable
private fun OnboardingPoster(image: Int, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.shadow(14.dp, RoundedCornerShape(15.dp)), color = Color(0xFF211D22),
        shape = RoundedCornerShape(15.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Sw.Outline)) {
        androidx.compose.foundation.Image(painterResource(image), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}

@Composable
private fun OnboardingArtwork(page: Int, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier, contentAlignment = Alignment.Center) {
        val posterHeight = minOf(maxHeight * .7f, 290.dp)
        val posterWidth = posterHeight * .67f
        val compactScale = minOf(1f, maxWidth.value / 360f, maxHeight.value / 330f)
        when (page) {
            0 -> {
                OnboardingPoster(R.drawable.onboarding_portrait,
                    Modifier.width(posterWidth * .78f).height(posterHeight * .8f).offset(x = (-posterWidth * .72f), y = 7.dp)
                        .graphicsLayer { rotationZ = -10f; alpha = .68f })
                OnboardingPoster(R.drawable.onboarding_blue_planet,
                    Modifier.width(posterWidth * .78f).height(posterHeight * .8f).offset(x = posterWidth * .72f, y = 9.dp)
                        .graphicsLayer { rotationZ = 10f; alpha = .72f })
                OnboardingPoster(R.drawable.onboarding_red_planet,
                    Modifier.width(posterWidth).height(posterHeight).graphicsLayer { rotationZ = 2f })
                Box(Modifier.align(Alignment.Center).offset(y = posterHeight * .52f).width(posterWidth * .75f).height(16.dp)
                    .background(Brush.radialGradient(listOf(Color(0xAAE5243A), Color.Transparent))))
            }
            1 -> {
                OnboardingServiceTile(R.drawable.onboarding_service_netflix, "Netflix", Modifier.align(Alignment.Center).offset(x = (-58 * compactScale).dp, y = (-75 * compactScale).dp).graphicsLayer { rotationZ = -9f; scaleX = compactScale; scaleY = compactScale })
                OnboardingServiceTile(R.drawable.onboarding_service_prime, "Prime Video", Modifier.align(Alignment.Center).offset(x = (-102 * compactScale).dp, y = (12 * compactScale).dp).graphicsLayer { rotationZ = 7f; scaleX = compactScale; scaleY = compactScale })
                OnboardingServiceTile(R.drawable.onboarding_service_disney, "Disney+", Modifier.align(Alignment.Center).offset(x = (83 * compactScale).dp, y = (-5 * compactScale).dp).graphicsLayer { rotationZ = -7f; scaleX = compactScale; scaleY = compactScale })
                OnboardingServiceTile(R.drawable.onboarding_service_apple, "Apple TV", Modifier.align(Alignment.Center).offset(x = (4 * compactScale).dp, y = (35 * compactScale).dp).graphicsLayer { rotationZ = 7f; scaleX = compactScale; scaleY = compactScale })
                OnboardingServiceTile(R.drawable.onboarding_service_max, "HBO Max", Modifier.align(Alignment.Center).offset(x = (104 * compactScale).dp, y = (92 * compactScale).dp).graphicsLayer { rotationZ = -8f; scaleX = compactScale; scaleY = compactScale })
                OnboardingServiceTile(R.drawable.onboarding_service_paramount, "Paramount+", Modifier.align(Alignment.Center).offset(x = (-42 * compactScale).dp, y = (123 * compactScale).dp).graphicsLayer { rotationZ = 5f; scaleX = compactScale; scaleY = compactScale })
            }
            2 -> {
                OnboardingPoster(R.drawable.onboarding_portrait,
                    Modifier.width(posterWidth * .9f).height(posterHeight).offset(x = (-maxWidth * .19f), y = 2.dp))
                Column(Modifier.align(Alignment.Center).offset(x = maxWidth * .27f).width(maxWidth * .38f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OnboardingAvailability("Disponibile su", listOf(R.drawable.onboarding_service_netflix, R.drawable.onboarding_service_disney))
                    OnboardingAvailability("Noleggio da", listOf(R.drawable.onboarding_service_prime))
                    OnboardingAvailability("Acquisto da", listOf(R.drawable.onboarding_service_apple, R.drawable.onboarding_service_paramount))
                    OnboardingAvailability("Al cinema", cinema = true)
                }
            }
            3 -> Column(Modifier.width(minOf(maxWidth * .88f, 330.dp)).heightIn(max = maxHeight).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OnboardingTrackingRow(R.drawable.ic_add, "La mia lista", "Film salvati", Sw.Accent)
                OnboardingTrackingRow(R.drawable.ic_play, "Continua a guardare", "Prossimo episodio", Color(0xFF72D3B0))
                OnboardingTrackingRow(R.drawable.ic_check, "Già visti", "Film e serie", Color(0xFF76D5C3))
                OnboardingTrackingRow(R.drawable.ic_thumb_up, "Le tue valutazioni", "Mi piace o non mi piace", Sw.Accent)
            }
            4 -> {
                OnboardingPoster(R.drawable.onboarding_portrait,
                    Modifier.width(posterWidth * .65f).height(posterHeight * .74f).offset(x = (-posterWidth * .85f), y = (-posterHeight * .12f))
                        .graphicsLayer { rotationZ = -8f; alpha = .82f })
                OnboardingPoster(R.drawable.onboarding_blue_planet,
                    Modifier.width(posterWidth * .84f).height(posterHeight * .95f).offset(x = (-posterWidth * .18f), y = 0.dp)
                        .graphicsLayer { rotationZ = -4f })
                OnboardingPoster(R.drawable.onboarding_red_planet,
                    Modifier.width(posterWidth * .66f).height(posterHeight * .77f).offset(x = posterWidth * .65f, y = posterHeight * .16f)
                        .graphicsLayer { rotationZ = 7f })
                Surface(color = Color(0xF31D2029), shape = RoundedCornerShape(18.dp),
                    modifier = Modifier.align(Alignment.Center).offset(y = posterHeight * .34f).shadow(12.dp, RoundedCornerShape(18.dp)),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Sw.Accent.copy(alpha = .5f))) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_sparkles), null, tint = Sw.Accent, modifier = Modifier.size(22.dp))
                        Text("Consigliati per te", color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
            5 -> {
                Box(Modifier.size(minOf(236.dp, maxHeight * .72f)).border(1.dp, Sw.Accent.copy(alpha = .5f), CircleShape))
                OnboardingOrbitIcon(R.drawable.ic_tv, Modifier.align(Alignment.Center).offset(x = (-105 * compactScale).dp, y = (-64 * compactScale).dp))
                OnboardingOrbitIcon(R.drawable.ic_movie, Modifier.align(Alignment.Center).offset(x = (88 * compactScale).dp, y = (-105 * compactScale).dp))
                OnboardingOrbitIcon(R.drawable.ic_sparkles, Modifier.align(Alignment.Center).offset(x = (-82 * compactScale).dp, y = (100 * compactScale).dp))
                OnboardingOrbitIcon(R.drawable.ic_check, Modifier.align(Alignment.Center).offset(x = (112 * compactScale).dp, y = (65 * compactScale).dp))
                Surface(color = Color.Transparent, shape = RoundedCornerShape(30.dp),
                    modifier = Modifier.size(126.dp).crimsonGlow(RoundedCornerShape(30.dp), 16.dp)) {
                    Icon(painterResource(R.drawable.ic_search), null, tint = Color.White, modifier = Modifier.padding(34.dp))
                }
            }
            6 -> {
                androidx.compose.foundation.Image(
                    painterResource(R.drawable.onboarding_phone_notification),
                    contentDescription = "Anteprima delle notifiche di StreamWise",
                    modifier = Modifier.width(minOf(maxWidth * .83f, 290.dp)).height(minOf(maxHeight * .96f, 410.dp)),
                    contentScale = ContentScale.Fit
                )
            }
            else -> {
                Box(Modifier.size(240.dp).background(Brush.radialGradient(listOf(Color(0x66FF3B4E), Color.Transparent)), CircleShape))
                androidx.compose.foundation.Image(
                    painterResource(R.drawable.onboarding_app_logo),
                    contentDescription = "Logo StreamWise",
                    modifier = Modifier.size(minOf(maxWidth * .72f, maxHeight * .72f, 240.dp)),
                    contentScale = ContentScale.Fit
                )
            }
        }
    }
}

@Composable
private fun OnboardingServiceTile(logo: Int, service: String, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.size(102.dp, 80.dp).shadow(10.dp, RoundedCornerShape(14.dp)),
        color = Color(0xFF242329), shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF484148))) {
        Box(contentAlignment = Alignment.Center) {
            androidx.compose.foundation.Image(painterResource(logo), service, Modifier.size(59.dp), contentScale = ContentScale.Fit)
        }
    }
}

@Composable
private fun OnboardingAvailability(label: String, logos: List<Int> = emptyList(), cinema: Boolean = false) {
    Surface(color = Color(0xEE242126), shape = RoundedCornerShape(15.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF494048))) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 10.dp)) {
            Text(label, color = Color(0xFFB9ADB6), fontSize = 9.sp, maxLines = 1)
            Row(Modifier.padding(top = 6.dp).height(29.dp), horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically) {
                if (cinema) Icon(painterResource(R.drawable.ic_movie), "Cinema", tint = Sw.Coral, modifier = Modifier.size(26.dp))
                else logos.forEach { logo ->
                    androidx.compose.foundation.Image(painterResource(logo), null, Modifier.size(29.dp), contentScale = ContentScale.Fit)
                }
            }
        }
    }
}

@Composable
private fun OnboardingTrackingRow(icon: Int, label: String, detail: String, accent: Color) {
    Surface(color = Color(0xFF242126), shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF494048)), modifier = Modifier.fillMaxWidth().height(66.dp)) {
        Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = accent.copy(alpha = .14f), shape = CircleShape, modifier = Modifier.size(39.dp)) {
                Icon(painterResource(icon), null, tint = accent, modifier = Modifier.padding(10.dp))
            }
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(label, color = Color(0xFFF6F1F4), fontSize = 14.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(detail, color = Color(0xFFB7AFB8), fontSize = 11.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun OnboardingOrbitIcon(icon: Int, modifier: Modifier = Modifier) {
    Surface(color = Sw.Raised, shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Sw.Accent.copy(alpha = .5f)), modifier = modifier.size(54.dp)) {
        Icon(painterResource(icon), null, tint = Color(0xFFF5D8E3), modifier = Modifier.padding(14.dp))
    }
}

@Composable
private fun TourOverlay(onTabChange: (Tab) -> Unit, onComplete: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    val tour = listOf(
        Triple(Tab.HOME, "La Home", "Riprendi le serie da dove eri, guarda cosa è di tendenza e lasciati sorprendere con un consiglio su misura."),
        Triple(Tab.DISCOVER, "Scopri", "Passa da Film a Serie TV con un tocco, sfoglia i titoli in evidenza e filtra per piattaforma e genere."),
        Triple(Tab.GUIDE, "La Guida TV", "Scegli un giorno e scopri film e serie sul digitale terrestre. Filtra per canale o consulta i programmi in onda adesso."),
        Triple(Tab.LIBRARY, "La tua Libreria", "Serie in corso, titoli da vedere, già visti, uscite che segui e il confronto degli abbonamenti, tutto in un posto."),
        Triple(Tab.HOME, "Cerca e personalizza", "Dalla Home trovi la ricerca e le Impostazioni. Da lì puoi esportare un backup JSON o ripristinarlo su un nuovo telefono.")
    )
    LaunchedEffect(step) { onTabChange(tour[step].first) }
    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .62f))) {
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(20.dp).padding(bottom = 24.dp)) {
                Surface(color = Panel, shape = RoundedCornerShape(30.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Column(Modifier.padding(22.dp)) {
                        val (_, title, body) = tour[step]
                        Text("TOUR GUIDATO  ${step + 1}/${tour.size}", color = CrimsonSoft, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp)
                        Text(title, style = MaterialTheme.typography.headlineMedium, color = Ink, modifier = Modifier.padding(top = 8.dp))
                        Text(body, color = Muted, fontSize = 16.sp, lineHeight = 23.sp, modifier = Modifier.padding(top = 8.dp))
                        Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (step > 0) OutlinedButton({ step-- }, Modifier.weight(1f), shape = RoundedCornerShape(16.dp)) { Text("Indietro") }
                            if (step < tour.lastIndex) Button({ step++ }, Modifier.weight(1f).crimsonGlow(RoundedCornerShape(16.dp)), shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)) { Text("Avanti") }
                            else Button(onComplete, Modifier.weight(1f).crimsonGlow(RoundedCornerShape(16.dp)), shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)) { Text("Ho capito") }
                        }
                    }
                }
                TextButton(onComplete, Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp)) { Text("Salta tour") }
            }
        }
    }
}

@Composable
private fun ChangelogEntry(version: String, title: String, body: String) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.Transparent, shape = RoundedCornerShape(10.dp), modifier = Modifier.crimsonGlow(RoundedCornerShape(10.dp), 4.dp)) {
                Text("v$version", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
            }
            Text(title, color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp))
        }
        Text(body, color = Muted, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 7.dp))
    }
}

private const val CLOUDFLARE_SIGN_UP = "https://dash.cloudflare.com/sign-up"
private const val CLOUDFLARE_WORKERS_AI = "https://dash.cloudflare.com/?to=/:account/ai/workers-ai"
private const val CLOUDFLARE_API_TOKENS = "https://dash.cloudflare.com/profile/api-tokens"

/** Guide and form to connect the user's own Cloudflare Workers AI account (used in Settings and in "Chiedi all'IA"). */
@Composable
private fun AiSetupCard(modifier: Modifier = Modifier, onConfiguredChange: (Boolean) -> Unit = {}) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var configured by remember { mutableStateOf(AiAdvisor.configured(context)) }
    var accountId by remember { mutableStateOf(AiAdvisor.accountId(context)) }
    var token by remember { mutableStateOf(AiAdvisor.apiToken(context)) }
    var showToken by remember { mutableStateOf(false) }
    var showGuide by remember { mutableStateOf(!configured) }
    var checking by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    val steps = listOf(
        Triple("Crea un account gratuito su Cloudflare, oppure accedi se ce l'hai già.", "Apri Cloudflare", CLOUDFLARE_SIGN_UP),
        Triple("Apri Workers AI (menu AI › Workers AI) e tocca “Use REST API”.", "Apri Workers AI", CLOUDFLARE_WORKERS_AI),
        Triple("Copia l'Account ID (32 caratteri) e incollalo qui sotto.", null, null),
        Triple("Tocca “Create a Workers AI API Token”, poi “Create API Token” e copia il token: Cloudflare lo mostra una sola volta. In alternativa: Profilo › API Tokens › Create Token › modello “Workers AI”.", "Apri API Tokens", CLOUDFLARE_API_TOKENS),
        Triple("Incolla il token qui sotto e tocca “Verifica e salva”.", null, null)
    )
    Surface(modifier.fillMaxWidth(), color = Panel, shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, if (configured) AiViolet.copy(alpha = .5f) else MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.ic_sparkles), null, tint = AiViolet, modifier = Modifier.size(22.dp))
                Text("Intelligenza artificiale", style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.weight(1f).padding(start = 10.dp))
                Surface(color = if (configured) AiViolet.copy(alpha = .2f) else Raised, shape = CircleShape) {
                    Text(if (configured) "Attiva" else "Da configurare", color = if (configured) Color.White else Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                }
            }
            Text(
                "“Chiedi all'IA” usa Workers AI di Cloudflare con il tuo account personale. Il piano gratuito include una quota giornaliera di richieste, più che sufficiente per l'uso quotidiano, senza carta di credito.",
                color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 8.dp)
            )
            Text(
                if (showGuide) "Nascondi la guida" else "Come ottenere Account ID e token",
                color = AiViolet, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                modifier = Modifier.padding(top = 10.dp).clip(CircleShape).clickable { showGuide = !showGuide }.padding(vertical = 6.dp)
            )
            AnimatedVisibility(showGuide) {
                Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    steps.forEachIndexed { index, (text, label, url) ->
                        Row {
                            Box(Modifier.size(24.dp).background(AiViolet.copy(alpha = .2f), CircleShape), contentAlignment = Alignment.Center) {
                                Text("${index + 1}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                Text(text, color = Ink, fontSize = 14.sp, lineHeight = 19.sp)
                                if (label != null && url != null) Text(
                                    "$label ›", color = AiViolet, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(top = 4.dp).clip(CircleShape).clickable { runCatching { uriHandler.openUri(url) } }.padding(vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
            OutlinedTextField(
                value = accountId,
                onValueChange = { accountId = it.trim(); message = null },
                label = { Text("Account ID") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp)
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it.trim(); message = null },
                label = { Text("Token API Workers AI") },
                singleLine = true,
                visualTransformation = if (showToken) androidx.compose.ui.text.input.VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = androidx.compose.ui.text.input.KeyboardType.Password, imeAction = ImeAction.Done),
                trailingIcon = { TextButton({ showToken = !showToken }) { Text(if (showToken) "Nascondi" else "Mostra", fontSize = 12.sp) } },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            )
            message?.let { (text, ok) -> Text(text, color = if (ok) AiViolet else DislikeRed, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 10.dp)) }
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (configured) OutlinedButton(
                    onClick = {
                        AiAdvisor.clear(context)
                        accountId = ""; token = ""; configured = false; showGuide = true
                        message = "Credenziali rimosse da questo telefono." to true
                        onConfiguredChange(false)
                    },
                    modifier = Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(18.dp)
                ) { Text("Rimuovi") }
                Button(
                    onClick = {
                        if (!checking) scope.launch {
                            checking = true
                            message = null
                            val result = withContext(Dispatchers.IO) { runCatching { AiAdvisor.verify(accountId, token) } }
                            if (result.isSuccess) {
                                AiAdvisor.save(context, accountId, token)
                                configured = true; showGuide = false
                                message = "Fatto! L'IA è collegata al tuo account Cloudflare." to true
                                onConfiguredChange(true)
                            } else {
                                message = ((result.exceptionOrNull() as? AiException)?.message ?: "Verifica non riuscita. Riprova.") to false
                            }
                            checking = false
                        }
                    },
                    enabled = accountId.isNotBlank() && token.isNotBlank() && !checking,
                    modifier = Modifier.weight(1f).height(50.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AiViolet, contentColor = Color.White)
                ) {
                    if (checking) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    else Text("Verifica e salva", fontWeight = FontWeight.Bold)
                }
            }
            Text(
                "Account ID e token restano solo su questo telefono, vengono inviati unicamente a Cloudflare e non finiscono nei backup JSON.",
                color = Muted, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 12.dp)
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SettingsScreen(
    store: LibraryStore,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
    onExportBackup: () -> Unit,
    onImportBackup: () -> Unit,
    onReplayOnboarding: () -> Unit
) {
    var selected by remember { mutableStateOf(store.preferredGenres().toSet()) }
    BackHandler(enabled = true, onBack = onDismiss)
        Surface(Modifier.fillMaxSize(), color = Night) {
            LazyColumn(
                Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
                contentPadding = PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FilledTonalIconButton(
                            onDismiss,
                            colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                        ) {
                            Icon(painterResource(R.drawable.ic_back), "Chiudi", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                        Column(Modifier.padding(start = 14.dp)) {
                            Text("Impostazioni", style = MaterialTheme.typography.headlineLarge, color = Ink)
                            Text("Rendi StreamWise più tua", color = Muted)
                        }
                    }
                }
                item {
                    Surface(
                        color = Raised,
                        shape = RoundedCornerShape(30.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(Modifier.padding(22.dp)) {
                            Surface(color = Color.Transparent, shape = RoundedCornerShape(18.dp), modifier = Modifier.size(52.dp).crimsonGlow(RoundedCornerShape(18.dp), 7.dp)) {
                                Icon(painterResource(R.drawable.ic_sparkles), null, tint = Color.White, modifier = Modifier.padding(14.dp))
                            }
                            Text("I tuoi generi", style = MaterialTheme.typography.headlineMedium, color = Ink, modifier = Modifier.padding(top = 18.dp))
                            Text("Scegli cosa ami: i cataloghi daranno più spazio ai tuoi gusti.", color = Muted, lineHeight = 21.sp, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        TmdbApi.GENRES.forEach { genre ->
                            val checked = genre.id in selected
                            FilterChip(
                                selected = checked,
                                modifier = if (checked) Modifier.crimsonGlow(RoundedCornerShape(8.dp), 5.dp) else Modifier,
                                onClick = {
                                    store.toggleGenre(genre.id)
                                    selected = store.preferredGenres().toSet()
                                    onChanged()
                                },
                                label = { Text(genre.label) },
                                leadingIcon = if (checked) {{ Icon(painterResource(R.drawable.ic_check), null, Modifier.size(18.dp)) }} else null,
                                colors = FilterChipDefaults.filterChipColors(
                                    containerColor = Raised,
                                    labelColor = Muted,
                                    selectedContainerColor = Color.Transparent,
                                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                    selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = checked,
                                    borderColor = MaterialTheme.colorScheme.outlineVariant,
                                    selectedBorderColor = Crimson
                                )
                            )
                        }
                    }
                }
                item { AiSetupCard() }
                item {
                    var hideShows by remember { mutableStateOf(store.hideShowCredits()) }
                    Surface(color = Panel, shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                        Row(Modifier.fillMaxWidth().clickable { hideShows = !hideShows; store.setHideShowCredits(hideShows) }.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                                Text("Filmografie senza talk show", style = MaterialTheme.typography.titleLarge, color = Ink)
                                Text("Nasconde late show, talk show, reality, telegiornali e apparizioni come sé stessi nelle pagine di attori e registi.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
                            }
                            Switch(hideShows, { hideShows = it; store.setHideShowCredits(it) }, colors = SwitchDefaults.colors(checkedTrackColor = Crimson))
                        }
                    }
                }
                item {
                    Surface(color = Panel, shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                        Column(Modifier.padding(18.dp)) {
                            Text("Backup dati", style = MaterialTheme.typography.titleLarge, color = Ink)
                            Text("Salva la libreria e i progressi per trasferirli su un altro telefono.", color = Muted, modifier = Modifier.padding(top = 4.dp, bottom = 14.dp))
                            Row(Modifier.fillMaxWidth().height(52.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(
                                    onClick = onImportBackup,
                                    modifier = Modifier.weight(1f).fillMaxHeight().crimsonGlow(RoundedCornerShape(18.dp), 7.dp),
                                    shape = RoundedCornerShape(18.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
                                ) {
                                    Icon(painterResource(R.drawable.ic_download), null, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Ripristina JSON", fontSize = 12.sp, maxLines = 1)
                                }
                                Button(
                                    onClick = onExportBackup,
                                    modifier = Modifier.weight(1f).fillMaxHeight().crimsonGlow(RoundedCornerShape(18.dp), 7.dp),
                                    shape = RoundedCornerShape(18.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
                                ) {
                                    Icon(painterResource(R.drawable.ic_upload), null, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Esporta JSON", fontSize = 12.sp, maxLines = 1)
                                }
                            }
                        }
                    }
                }
                item {
                    OutlinedButton(onClick = { onDismiss(); onReplayOnboarding() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(18.dp)) {
                        Icon(painterResource(R.drawable.ic_sparkles), null); Spacer(Modifier.width(8.dp)); Text("Rivedi l’onboarding")
                    }
                }
                item {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Row(Modifier.fillMaxWidth().padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("StreamWise", color = Ink, fontWeight = FontWeight.Bold)
                            Text("Catalogo pronto all’uso", color = CrimsonSoft, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp))
                        }
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) {
                            Text("v${BuildConfig.VERSION_NAME}", color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                        }
                    }
                }
                item { it.dueffe.updates.AppUpdateCard("streamwise", it.dueffe.streamwise.BuildConfig.UPDATE_REPOSITORY) }
            }
        }
}

private fun genreEmoji(id: String): String = when (id) {
    "action" -> "💥"; "comedy" -> "😂"; "drama" -> "🎭"; "thriller" -> "🔪"
    "sci-fi" -> "🪐"; "horror" -> "👻"; "documentary" -> "🎥"; else -> "💋"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilterScreen(type: String, api: TmdbApi, store: LibraryStore, onDismiss: () -> Unit, onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit) {
    var kind by remember { mutableStateOf(type) }
    val platforms = remember { mutableStateListOf<String>() }
    val genres = remember { mutableStateListOf<String>() }
    var results by remember { mutableStateOf<List<Models.Media>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var loading by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var showingResults by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val availableGenres = remember { TmdbApi.GENRES.toList() }
    suspend fun fetch(nextPage: Int): List<Models.Media> = withContext(Dispatchers.IO) {
        runCatching {
            val providerIds = TmdbApi.PLATFORMS.filter { it.id in platforms }.map { it.providerId }
            val genreIds = availableGenres.filter { it.id in genres && it.id != "erotic" && it.value(kind) > 0 }.map { it.value(kind) }
            val erotic = "erotic" in genres
            val horrorSeries = kind == "tv" && "horror" in genres
            val regular = if ((!erotic && !horrorSeries) || genreIds.isNotEmpty()) api.discoverFiltered(kind, nextPage, genreIds, providerIds, false) else emptyList()
            val eroticTitles = if (erotic) api.discoverFiltered(kind, nextPage, emptyList(), providerIds, true) else emptyList()
            val horrorTitles = if (horrorSeries) api.horrorSeries(nextPage, providerIds) else emptyList()
            (regular + eroticTitles + horrorTitles).distinctBy { it.id }
        }.getOrDefault(emptyList())
    }
    val search: () -> Unit = {
        if (!loading) scope.launch {
            loading = true
            page = 1
            results = fetch(1)
            showingResults = true
            loading = false
        }
    }
    val loadMore: () -> Unit = {
        if (!loadingMore) scope.launch {
            loadingMore = true
            val nextPage = page + 1
            val more = fetch(nextPage)
            if (more.isNotEmpty()) { results = (results + more).distinctBy { it.id }; page = nextPage }
            loadingMore = false
        }
    }
    val selectionLabels = TmdbApi.PLATFORMS.filter { it.id in platforms }.map { it.label } + availableGenres.filter { it.id in genres }.map { "${genreEmoji(it.id)} ${it.label}" }
    BackHandler(enabled = true) { if (showingResults) showingResults = false else onDismiss() }
    Surface(Modifier.fillMaxSize(), color = Night) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.align(Alignment.TopEnd).offset(x = 90.dp, y = (-80).dp).size(320.dp)
                .background(Brush.radialGradient(listOf(Sw.Red.copy(alpha = .22f), Color.Transparent)), CircleShape))
            Box(Modifier.align(Alignment.CenterStart).offset(x = (-120).dp).size(280.dp)
                .background(Brush.radialGradient(listOf(Sw.Coral.copy(alpha = .1f), Color.Transparent)), CircleShape))
            AnimatedContent(
                showingResults,
                transitionSpec = {
                    if (targetState) (fadeIn(tween(280, 60)) + androidx.compose.animation.slideInHorizontally(tween(420, easing = Sw.Emphasized)) { it / 4 }) togetherWith
                        (fadeOut(tween(160)) + androidx.compose.animation.slideOutHorizontally(tween(360, easing = Sw.Emphasized)) { -it / 6 })
                    else (fadeIn(tween(280, 60)) + androidx.compose.animation.slideInHorizontally(tween(420, easing = Sw.Emphasized)) { -it / 4 }) togetherWith
                        (fadeOut(tween(160)) + androidx.compose.animation.slideOutHorizontally(tween(360, easing = Sw.Emphasized)) { it / 6 })
                },
                label = "explore-step"
            ) { resultsVisible ->
                if (!resultsVisible) Column(Modifier.fillMaxSize()) {
                    LazyColumn(
                        Modifier.weight(1f).fillMaxWidth(),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                GlassIconButton(R.drawable.ic_back, "Indietro") { onDismiss() }
                                Spacer(Modifier.weight(1f))
                                AnimatedVisibility(platforms.isNotEmpty() || genres.isNotEmpty(), enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
                                    Text("Azzera", color = Sw.Accent, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).noRippleClickable { platforms.clear(); genres.clear() }.padding(horizontal = 14.dp, vertical = 10.dp))
                                }
                            }
                        }
                        item {
                            Column(Modifier.reveal()) {
                                Text("ESPLORA", color = Sw.Accent, fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                                Text("Cosa ti va\ndi vedere?", style = MaterialTheme.typography.displaySmall, color = Ink, modifier = Modifier.padding(top = 4.dp))
                                Text("Scegli piattaforme e generi: ti mostro solo i titoli che fanno per te.", color = Muted, fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier.padding(top = 8.dp))
                            }
                        }
                        item {
                            SegmentedPills(listOf("Film", "Serie TV"), if (kind == "tv") 1 else 0, Modifier.fillMaxWidth().reveal(60)) { kind = if (it == 1) "tv" else "movie" }
                        }
                        item { ExploreSectionLabel("Piattaforme", if (platforms.isEmpty()) "Tutte" else "${platforms.size} scelte", Modifier.reveal(100)) }
                        item {
                            Column(Modifier.reveal(140), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                TmdbApi.PLATFORMS.chunked(3).forEach { row ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        row.forEach { platform ->
                                            PlatformTile(platform, platform.id in platforms, Modifier.weight(1f)) {
                                                if (platform.id in platforms) platforms.remove(platform.id) else platforms.add(platform.id)
                                            }
                                        }
                                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                                    }
                                }
                            }
                        }
                        item { ExploreSectionLabel("Generi", if (genres.isEmpty()) "Tutti" else "${genres.size} scelti", Modifier.padding(top = 6.dp).reveal(180)) }
                        item {
                            FlowRow(Modifier.fillMaxWidth().reveal(220), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                availableGenres.forEach { genre ->
                                    GenreChip(genreEmoji(genre.id), genre.label, genre.id in genres) {
                                        if (genre.id in genres) genres.remove(genre.id) else genres.add(genre.id)
                                    }
                                }
                            }
                        }
                    }
                    Column(
                        Modifier.fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Night.copy(alpha = .96f), Night)))
                            .navigationBarsPadding()
                            .padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 14.dp)
                    ) {
                        AnimatedContent(selectionLabels.size, label = "explore-summary") { _ ->
                            Text(
                                if (selectionLabels.isEmpty()) "Nessun filtro: ti mostro i titoli più popolari" else selectionLabels.joinToString(" · "),
                                color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                        Button(
                            onClick = search,
                            enabled = !loading,
                            modifier = Modifier.fillMaxWidth().height(60.dp).crimsonGlow(CircleShape, 14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White, disabledContainerColor = Color.Transparent, disabledContentColor = Color.White),
                            shape = CircleShape
                        ) {
                            AnimatedContent(loading, label = "explore-button") { busy ->
                                if (busy) CircularProgressIndicator(Modifier.size(24.dp), color = Color.White, strokeWidth = 2.5.dp)
                                else Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(painterResource(R.drawable.ic_sparkles), null, modifier = Modifier.size(22.dp))
                                    Spacer(Modifier.width(10.dp))
                                    Text(if (kind == "tv") "Mostra le serie" else "Mostra i film", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                } else Column(Modifier.fillMaxSize().statusBarsPadding()) {
                    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        GlassIconButton(R.drawable.ic_back, "Modifica filtri") { showingResults = false }
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text("Risultati", style = MaterialTheme.typography.headlineMedium, color = Ink)
                            AnimatedCount(results.size) { Text("$it ${if (kind == "tv") "serie" else "film"} trovati", color = Muted, fontSize = 13.sp) }
                        }
                        GlassIconButton(R.drawable.ic_tune, "Modifica filtri") { showingResults = false }
                    }
                    if (selectionLabels.isNotEmpty()) LazyRow(Modifier.padding(top = 14.dp), contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(selectionLabels) { label -> MetaPill(label, background = Sw.Raised) }
                    }
                    if (results.isEmpty()) EmptyState(R.drawable.ic_search, "Nessun titolo trovato", "Prova a togliere qualche piattaforma o genere.", action = "Modifica filtri") { showingResults = false }
                    else LazyVerticalGrid(
                        columns = GridCells.Adaptive(104.dp), modifier = Modifier.weight(1f).fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 32.dp)
                    ) {
                        gridItemsIndexed(results, key = { _, media -> media.id }) { index, media ->
                            Box(Modifier.reveal(delayMillis = (index % 12) * 40, distance = 24.dp)) {
                                SearchPosterCard(media, store.get(media), onLongPress = { onAction(media) }) { onOpen(media) }
                            }
                        }
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            val interaction = remember { MutableInteractionSource() }
                            Row(
                                Modifier.padding(top = 6.dp).fillMaxWidth().height(54.dp).pressScale(interaction, .97f).glass(CircleShape)
                                    .clickable(interaction, indication = null, enabled = !loadingMore, onClick = loadMore),
                                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (loadingMore) CircularProgressIndicator(Modifier.size(22.dp), color = Sw.Accent, strokeWidth = 2.dp)
                                else {
                                    Icon(painterResource(R.drawable.ic_add), null, tint = Sw.Accent, modifier = Modifier.size(20.dp))
                                    Text("Mostra altri titoli", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ExploreSectionLabel(title: String, detail: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
        Text(title, color = Ink, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
        AnimatedContent(detail, label = "explore-count", transitionSpec = {
            (slideInVertically { it } + fadeIn()) togetherWith (androidx.compose.animation.slideOutVertically { -it } + fadeOut())
        }) { Text(it, color = Sw.Accent, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
    }
}

@Composable
private fun PlatformTile(platform: TmdbApi.Platform, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    val fill by animateFloatAsState(if (selected) 1f else 0f, tween(260), label = "platform-fill")
    val logoScale by animateFloatAsState(if (selected) 1.08f else 1f, spring(dampingRatio = .4f, stiffness = 500f), label = "platform-logo")
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier.aspectRatio(.9f)
            .pressScale(interaction, .92f)
            .clip(shape)
            .background(Sw.Surface)
            .drawBehind { drawRect(Brush.linearGradient(listOf(Sw.Red.copy(alpha = .28f), Sw.Coral.copy(alpha = .12f))), alpha = fill) }
            .border(1.5.dp, if (selected) Sw.Brand else androidx.compose.ui.graphics.SolidColor(Color.White.copy(alpha = .08f)), shape)
            .clickable(interaction, indication = null) { haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove); onClick() }
    ) {
        Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            androidx.compose.foundation.Image(
                painterResource(advisorPlatformLogo(platform.id)), platform.label,
                Modifier.size(54.dp).graphicsLayer { scaleX = logoScale; scaleY = logoScale; alpha = .75f + .25f * fill }.clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Fit
            )
            Text(platform.label, color = if (selected) Color.White else Muted, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp))
        }
        androidx.compose.animation.AnimatedVisibility(
            selected, Modifier.align(Alignment.TopEnd).padding(8.dp),
            enter = scaleIn(spring(dampingRatio = .45f, stiffness = 600f)) + fadeIn(), exit = scaleOut(tween(140)) + fadeOut(tween(140))
        ) {
            Box(Modifier.size(24.dp).brandGlow(CircleShape, 6.dp), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_check), null, tint = Color.White, modifier = Modifier.size(15.dp))
            }
        }
    }
}

@Composable
private fun GenreChip(emoji: String, label: String, selected: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    val fill by animateFloatAsState(if (selected) 1f else 0f, tween(260), label = "genre-fill")
    Row(
        Modifier.height(50.dp)
            .pressScale(interaction, .92f)
            .clip(CircleShape)
            .background(Sw.Surface)
            .drawBehind { drawRect(Sw.Brand, alpha = fill) }
            .border(1.dp, Color.White.copy(alpha = .08f * (1f - fill)), CircleShape)
            .clickable(interaction, indication = null) { haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove); onClick() }
            .padding(start = 7.dp, end = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = .1f + .12f * fill)), contentAlignment = Alignment.Center) {
            Text(emoji, fontSize = 18.sp)
        }
        Text(label, color = if (selected) Color.White else Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 9.dp))
    }
}

private fun advisorPlatformLogo(id: String): Int = when (id) {
    "netflix" -> R.drawable.onboarding_service_netflix
    "prime-video" -> R.drawable.onboarding_service_prime
    "apple-tv-plus" -> R.drawable.onboarding_service_apple
    "disney-plus" -> R.drawable.onboarding_service_disney
    "paramount-plus" -> R.drawable.onboarding_service_paramount
    else -> R.drawable.onboarding_service_max
}

@Composable
private fun AdvisorTypeChoice(label: String, icon: Int, selected: Boolean,
    modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Surface(
        onClick = onClick,
        modifier = modifier.height(58.dp).then(if (selected) Modifier.crimsonGlow(shape, 7.dp) else Modifier),
        color = if (selected) Color.Transparent else Sw.Raised,
        shape = shape,
        border = if (selected) null else androidx.compose.foundation.BorderStroke(1.dp, Sw.Outline)
    ) {
        Row(Modifier.fillMaxSize().padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center) {
            Icon(painterResource(icon), null, tint = if (selected) Color.White else Muted, modifier = Modifier.size(21.dp))
            Text(label, color = if (selected) Color.White else Muted, fontWeight = FontWeight.Bold,
                maxLines = 1, modifier = Modifier.padding(start = 7.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun AdvisorSheet(api: TmdbApi, store: LibraryStore, libraryOnly: Boolean, onDismiss: () -> Unit, onOpen: (Models.Media, AdvisorRequest) -> Unit) {
    var type by remember { mutableStateOf("all") }
    var genre by remember { mutableStateOf<TmdbApi.Genre?>(null) }
    var platform by remember { mutableStateOf<TmdbApi.Platform?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Sw.Surface,
        shape = RoundedCornerShape(topStart = 34.dp, topEnd = 34.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(color = Color(0xFF77717A)) }
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(bottom = 24.dp)
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.Transparent, shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.size(64.dp).crimsonGlow(RoundedCornerShape(20.dp), 10.dp)) {
                    Icon(painterResource(R.drawable.ic_sparkles), null, tint = Color.White, modifier = Modifier.padding(17.dp))
                }
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text("Scegli per me", style = MaterialTheme.typography.headlineLarge, color = Ink)
                    Text(if (libraryOnly) "Una proposta casuale dalla tua lista." else "Una proposta casuale dal catalogo, su misura per te.",
                        color = Muted, fontSize = 14.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 3.dp))
                }
                FilledTonalIconButton({ scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() } }, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Raised)) {
                    Icon(painterResource(R.drawable.ic_close), "Chiudi")
                }
            }

            Row(Modifier.padding(top = 26.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.ic_movie), null, tint = Muted, modifier = Modifier.size(22.dp))
                Text("Tipo di contenuto", color = Muted, fontWeight = FontWeight.Bold,
                    fontSize = 17.sp, modifier = Modifier.padding(start = 10.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                AdvisorTypeChoice("Tutto", R.drawable.ic_grid, type == "all", Modifier.weight(1f)) { type = "all" }
                AdvisorTypeChoice("Film", R.drawable.ic_movie, type == "movie", Modifier.weight(1f)) { type = "movie" }
                AdvisorTypeChoice("Serie", R.drawable.ic_tv, type == "tv", Modifier.weight(1f)) { type = "tv" }
            }

            Row(Modifier.fillMaxWidth().padding(top = 25.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("◇", color = Muted, fontSize = 25.sp)
                Text("Generi", color = Muted, fontWeight = FontWeight.Bold, fontSize = 17.sp,
                    modifier = Modifier.padding(start = 8.dp).weight(1f))
                Text("Facoltativo", color = CrimsonSoft, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            FlowRow(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TmdbApi.GENRES.forEach { item ->
                    val selected = genre?.id == item.id
                    FilterChip(
                        selected = selected,
                        onClick = { genre = if (selected) null else item },
                        label = { Text(item.label) },
                        colors = FilterChipDefaults.filterChipColors(
                            containerColor = Sw.Raised, labelColor = Muted,
                            selectedContainerColor = Color(0xFF4A1C22), selectedLabelColor = Color.White
                        ),
                        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected,
                            borderColor = Sw.Outline, selectedBorderColor = CrimsonSoft),
                        shape = RoundedCornerShape(18.dp)
                    )
                }
            }

            Row(Modifier.fillMaxWidth().padding(top = 25.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.ic_tv), null, tint = Muted, modifier = Modifier.size(22.dp))
                Text("Piattaforme", color = Muted, fontWeight = FontWeight.Bold, fontSize = 17.sp,
                    modifier = Modifier.padding(start = 10.dp).weight(1f))
                Text("Facoltativo", color = CrimsonSoft, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            LazyRow(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(TmdbApi.PLATFORMS, key = { it.id }) { item ->
                    val selected = platform?.id == item.id
                    val shape = RoundedCornerShape(18.dp)
                    Surface(
                        onClick = { platform = if (selected) null else item },
                        color = if (selected) Color.Transparent else Sw.Raised,
                        shape = shape,
                        border = if (selected) null else androidx.compose.foundation.BorderStroke(1.dp, Sw.Outline),
                        modifier = Modifier.size(68.dp).then(if (selected) Modifier.crimsonGlow(shape, 7.dp) else Modifier)
                    ) {
                        androidx.compose.foundation.Image(
                            painterResource(advisorPlatformLogo(item.id)), item.label,
                            Modifier.padding(13.dp), contentScale = ContentScale.Fit
                        )
                    }
                }
            }

            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error, fontSize = 13.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
            Button({
                scope.launch {
                    loading = true
                    error = null
                    val request = AdvisorRequest(type, genre, platform, libraryOnly)
                    val choice = chooseAdvisorTitle(api, store, request)
                    loading = false
                    if (choice != null) scope.launch { sheetState.hide() }.invokeOnCompletion { onOpen(choice, request) }
                    else error = "Nessun titolo trovato con queste preferenze."
                }
            }, Modifier.fillMaxWidth().padding(top = 22.dp).height(62.dp)
                .then(if (!loading) Modifier.crimsonGlow(RoundedCornerShape(31.dp), 13.dp) else Modifier),
                shape = RoundedCornerShape(31.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White,
                    disabledContainerColor = Raised, disabledContentColor = Muted), enabled = !loading) {
                if (loading) CircularProgressIndicator(Modifier.size(23.dp), color = Color.White, strokeWidth = 2.dp)
                else Icon(painterResource(R.drawable.ic_sparkles), null, Modifier.size(25.dp))
                Spacer(Modifier.width(10.dp))
                Text(if (loading) "Sto scegliendo…" else "Sorprendimi", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

private suspend fun chooseAdvisorTitle(
    api: TmdbApi,
    store: LibraryStore,
    request: AdvisorRequest,
    excludedId: String? = null
): Models.Media? {
    val choices = if (request.libraryOnly) {
        store.all()
            .filter { it.state == "saved" || it.state == "progress" }
            .map { it.media }
            .filter { media ->
                (request.type == "all" || media.mediaType == request.type) &&
                    (request.genre == null || request.genre.value(media.mediaType) <= 0 || request.genre.value(media.mediaType) in media.genreIds) &&
                    (request.platform == null || (media.flatrate + media.rent + media.buy).any { it.id == request.platform.providerId })
            }
    } else {
        val actualType = if (request.type == "all") {
            listOf("movie", "tv").filter { request.genre == null || request.genre.value(it) != 0 }.randomOrNull() ?: "movie"
        } else request.type
        withContext(Dispatchers.IO) {
            runCatching {
                api.discover(
                    actualType,
                    (1..35).random(),
                    request.genre?.value(actualType),
                    request.platform?.providerId,
                    "popular"
                ).toList()
            }.getOrDefault(emptyList())
        }.filter { store.get(it) == null }
    }
    return choices.filter { it.id != excludedId }.randomOrNull()
}

@Composable
private fun EpisodesScreen(
    media: Models.Media,
    api: TmdbApi,
    store: LibraryStore,
    onDismiss: () -> Unit,
    onChanged: () -> Unit
) {
    var seasons by remember { mutableStateOf<List<Models.Season>?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var selectedSeasonNumber by remember(media.id) { mutableIntStateOf(0) }
    var seasonMenuExpanded by remember { mutableStateOf(false) }
    var pendingSeasonConfirmation by remember(media.id) { mutableStateOf<Models.Season?>(null) }
    var pendingCompletion by remember(media.id) { mutableStateOf<((Boolean) -> Unit)?>(null) }
    var selectedEpisode by remember(media.id) { mutableStateOf<Models.Episode?>(null) }
    val episodeListState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(media.id, tick) {
        seasons = withContext(Dispatchers.IO) {
            runCatching { api.seasons(media, true).toList() }.getOrDefault(emptyList())
        }
        if (selectedSeasonNumber == 0) {
            selectedSeasonNumber = store.get(media)?.nextSeason
                ?.takeIf { number -> seasons.orEmpty().any { it.number == number } }
                ?: seasons.orEmpty().firstOrNull()?.number.orEmptySeasonNumber()
        }
    }
    BackHandler(onBack = onDismiss)
    Surface(Modifier.fillMaxSize(), color = Night) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                val loadedSeasons = seasons
                if (loadedSeasons == null) {
                    LoadingPane()
                } else if (loadedSeasons.isEmpty()) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onDismiss) { Icon(painterResource(R.drawable.ic_back), null) }
                        Text(media.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Nessun episodio disponibile", color = Muted)
                    }
                } else {
                    val selectedSeason = loadedSeasons.firstOrNull { it.number == selectedSeasonNumber } ?: loadedSeasons.first()
                    val entry = store.get(media)
                    val watchedCount = selectedSeason.episodes.count { store.episodeWatched(entry, it, loadedSeasons) }
                    val seasonComplete = selectedSeason.episodes.isNotEmpty() && watchedCount == selectedSeason.episodes.size
                    val nextEpisode = LibraryStore.flatten(loadedSeasons).firstOrNull { !store.episodeWatched(entry, it, loadedSeasons) }

                    Row(
                        Modifier.fillMaxWidth().padding(start = 10.dp, end = 16.dp, top = 8.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onDismiss) { Icon(painterResource(R.drawable.ic_back), "Indietro") }
                        Column(Modifier.padding(start = 4.dp).weight(1f)) {
                            Text(media.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("Stagioni e puntate", color = Muted, fontSize = 14.sp)
                        }
                        Box {
                            Surface(
                                onClick = { seasonMenuExpanded = true },
                                color = Panel,
                                shape = RoundedCornerShape(24.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Sw.Outline)
                            ) {
                                Row(Modifier.padding(horizontal = 17.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text("Stagione ${selectedSeason.number}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Icon(painterResource(R.drawable.ic_chevron_right), null,
                                        Modifier.padding(start = 8.dp).size(16.dp).graphicsLayer { rotationZ = 90f }, tint = Muted)
                                }
                            }
                            DropdownMenu(expanded = seasonMenuExpanded, onDismissRequest = { seasonMenuExpanded = false }) {
                                loadedSeasons.forEach { season ->
                                    DropdownMenuItem(
                                        text = { Text(season.name) },
                                        trailingIcon = if (season.number == selectedSeason.number) {{ Icon(painterResource(R.drawable.ic_check), null, Modifier.size(18.dp), tint = CrimsonSoft) }} else null,
                                        onClick = {
                                            selectedSeasonNumber = season.number
                                            seasonMenuExpanded = false
                                            scope.launch { episodeListState.scrollToItem(0) }
                                        }
                                    )
                                }
                            }
                        }
                    }

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(9.dp),
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(loadedSeasons, key = { it.number }) { season ->
                            val selected = season.number == selectedSeason.number
                            Surface(
                                onClick = {
                                    selectedSeasonNumber = season.number
                                    scope.launch { episodeListState.scrollToItem(0) }
                                },
                                color = if (selected) Color.Transparent else Panel,
                                shape = RoundedCornerShape(24.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) CrimsonSoft else Sw.Outline),
                                modifier = if (selected) Modifier.crimsonGlow(RoundedCornerShape(24.dp), 6.dp) else Modifier
                            ) {
                                Text(season.name, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                                    color = if (selected) Color.White else Muted,
                                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 12.dp))
                            }
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 15.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        LinearProgressIndicator(
                            progress = { if (selectedSeason.episodes.isEmpty()) 0f else watchedCount.toFloat() / selectedSeason.episodes.size },
                            modifier = Modifier.weight(1f).height(7.dp).clip(CircleShape),
                            color = CrimsonSoft,
                            trackColor = Raised
                        )
                        Text("$watchedCount di ${selectedSeason.episodes.size} visti", color = Muted, fontSize = 12.sp,
                            modifier = Modifier.padding(start = 14.dp))
                        FilledTonalIconButton(
                            onClick = {
                                if (seasonComplete) {
                                    store.unwatchSeason(media, selectedSeason, loadedSeasons)
                                    tick++
                                    onChanged()
                                } else {
                                    pendingSeasonConfirmation = selectedSeason
                                }
                            },
                            modifier = Modifier.padding(start = 8.dp).size(40.dp)
                                .then(if (seasonComplete) Modifier.crimsonGlow(CircleShape, 6.dp) else Modifier),
                            colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = if (seasonComplete) Color.Transparent else Raised)
                        ) { Icon(painterResource(R.drawable.ic_check), "Segna stagione come vista", Modifier.size(18.dp), tint = if (seasonComplete) Color.White else Muted) }
                    }

                    LazyColumn(
                        state = episodeListState,
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 14.dp)
                    ) {
                            items(selectedSeason.episodes, key = { "${it.season}-${it.number}" }) { episode ->
                                val watched = store.episodeWatched(store.get(media), episode, loadedSeasons)
                                val episodeColor by animateColorAsState(
                                    if (watched) DeepCrimson.copy(alpha = .31f) else Panel,
                                    animationSpec = tween(340, easing = FastOutSlowInEasing),
                                    label = "episode-background"
                                )
                                val episodeBorder by animateColorAsState(
                                    if (watched) Crimson.copy(alpha = .55f) else Sw.Outline,
                                    animationSpec = tween(340, easing = FastOutSlowInEasing),
                                    label = "episode-border"
                                )
                                Surface(
                                    color = episodeColor,
                                    shape = RoundedCornerShape(15.dp),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, episodeBorder)
                                ) {
                                    Row(Modifier.fillMaxWidth().padding(6.dp).clickable { selectedEpisode = episode }, verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.width(132.dp).height(72.dp).clip(RoundedCornerShape(11.dp))) {
                                            RemoteImage(episode.still.ifBlank { media.backdrop }, Modifier.fillMaxSize(), scale = ContentScale.Crop)
                                            Box(Modifier.align(Alignment.BottomStart).padding(6.dp).size(30.dp)
                                                .background(Color.Black.copy(alpha = .72f), RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
                                                Text(episode.number.toString(), color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp)
                                            }
                                        }
                                        Column(Modifier.padding(horizontal = 12.dp).weight(1f)) {
                                            Text(episode.name, color = Ink, fontWeight = FontWeight.Bold,
                                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                                            if (episode.runtime > 0) Text("${episode.runtime} min", color = Muted,
                                                fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
                                        }
                                        FilledTonalIconButton(onClick = {
                                            if (watched) store.unwatchEpisode(media, episode, loadedSeasons)
                                            else if (episode == LibraryStore.flatten(loadedSeasons).lastOrNull()) {
                                                pendingCompletion = { liked ->
                                                    store.markEpisode(media, episode, loadedSeasons, liked)
                                                    tick++
                                                    onChanged()
                                                }
                                            } else store.markEpisode(media, episode, loadedSeasons, null)
                                            if (pendingCompletion == null) { tick++; onChanged() }
                                        }, modifier = Modifier.padding(end = 4.dp).size(40.dp),
                                            colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = if (watched) Color.Transparent else Raised)) {
                                            AnimatedContent(
                                                targetState = watched,
                                                transitionSpec = {
                                                    (fadeIn(tween(190)) + scaleIn(tween(280, easing = FastOutSlowInEasing), initialScale = .45f)) togetherWith
                                                        (fadeOut(tween(110)) + scaleOut(tween(150), targetScale = .7f))
                                                },
                                                label = "episode-watched-icon"
                                            ) { isWatched ->
                                                Icon(
                                                    painterResource(if (isWatched) R.drawable.ic_check else R.drawable.ic_visibility),
                                                    if (isWatched) "Episodio visto" else "Segna episodio come visto",
                                                    tint = if (isWatched) Color.White else Muted,
                                                    modifier = Modifier.size(if (isWatched) 25.dp else 18.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                    }

                    if (nextEpisode != null) {
                        Button(
                            onClick = {
                                selectedSeasonNumber = nextEpisode.season
                                scope.launch {
                                    delay(80)
                                    val season = loadedSeasons.firstOrNull { it.number == nextEpisode.season }
                                    val index = season?.episodes?.indexOfFirst { it.number == nextEpisode.number } ?: 0
                                    episodeListState.animateScrollToItem(index.coerceAtLeast(0))
                                }
                            },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp).height(58.dp)
                                .crimsonGlow(RoundedCornerShape(29.dp), 10.dp),
                            shape = RoundedCornerShape(29.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
                        ) {
                            Icon(painterResource(R.drawable.ic_play), null, Modifier.size(20.dp))
                            Spacer(Modifier.width(11.dp))
                            Text("Riprendi S${nextEpisode.season} · E${nextEpisode.number}", fontWeight = FontWeight.Black)
                    }
                }
    }
    selectedEpisode?.let { episode -> EpisodeOverviewDialog(media, episode) { selectedEpisode = null } }
            }
    }
    pendingSeasonConfirmation?.let { season ->
        AlertDialog(
            onDismissRequest = { pendingSeasonConfirmation = null },
            title = { Text("Segnare la stagione come vista?") },
            text = { Text("Tutti gli episodi di ${season.name} verranno segnati come visti.") },
            confirmButton = {
                TextButton(onClick = {
                    val loadedSeasons = seasons.orEmpty()
                    val lastEpisode = LibraryStore.flatten(loadedSeasons).lastOrNull()
                    pendingSeasonConfirmation = null
                    if (season.episodes.lastOrNull() == lastEpisode) {
                        pendingCompletion = { liked ->
                            store.completeSeason(media, season, loadedSeasons, liked)
                            tick++
                            onChanged()
                        }
                    } else {
                        store.completeSeason(media, season, loadedSeasons, null)
                        tick++
                        onChanged()
                    }
                }) { Text("Segna come vista") }
            },
            dismissButton = { TextButton({ pendingSeasonConfirmation = null }) { Text("Annulla") } }
        )
    }
    if (pendingCompletion != null) ReactionDialog(media.title,
        onChoice = { liked -> pendingCompletion?.invoke(liked); pendingCompletion = null },
        onDismiss = { pendingCompletion = null })
}

@Composable private fun EpisodeOverviewDialog(media: Models.Media, episode: Models.Episode, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(Modifier.fillMaxWidth(), color = Night, shape = RoundedCornerShape(24.dp)) {
            Column {
                RemoteImage(episode.still.ifBlank { media.backdrop }, Modifier.fillMaxWidth().aspectRatio(16f / 9f), ContentScale.Crop)
                Column(Modifier.padding(20.dp)) {
                    Text("STAGIONE ${episode.season} · EPISODIO ${episode.number}", color = CrimsonSoft, fontWeight = FontWeight.Black, fontSize = 11.sp, letterSpacing = 1.2.sp)
                    Text(episode.name, color = Ink, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 5.dp))
                    if (episode.runtime > 0) Text("${episode.runtime} min", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
                    Text(episode.overview.ifBlank { "La trama di questo episodio non è disponibile." }, color = Muted, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 14.dp))
                    TextButton(onDismiss, Modifier.align(Alignment.End).padding(top = 8.dp)) { Text("Chiudi") }
                }
            }
        }
    }
}

private fun Int?.orEmptySeasonNumber(): Int = this ?: 0

private fun rating(value: Double) = if (value > 0) String.format(Locale.ITALY, "%.1f", value) else "n.d."

private fun durationLabel(media: Models.Media): String? {
    val minutes = if (media.isSeries) media.episodeRuntime else media.runtime
    if (minutes <= 0) return null
    val duration = if (minutes >= 60) {
        val hours = minutes / 60
        val remainder = minutes % 60
        if (remainder == 0) "$hours h" else "$hours h $remainder min"
    } else "$minutes min"
    return if (media.isSeries) "$duration a episodio" else duration
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TvGuideScreen(api: TmdbApi, dateString: String, onDate: (String) -> Unit, modifier: Modifier, backEnabled: Boolean, onOpen: (Models.Media) -> Unit, onExpandedChange: (Boolean) -> Unit) {
    val context = LocalContext.current.applicationContext
    DisposableEffect(Unit) { onDispose { onExpandedChange(false) } }
    val date = java.time.LocalDate.parse(dateString)
    var now by remember { mutableStateOf(java.time.Instant.now()) }
    val today = now.atZone(TvGuideRepository.ROME).toLocalDate()
    var guide by remember { mutableStateOf<TvGuideRepository.Guide?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var type by remember { mutableStateOf("all") }
    var channel by remember { mutableStateOf<String?>(null) }
    var liveOnly by remember { mutableStateOf(false) }
    var channelMenu by remember { mutableStateOf(false) }
    var calendar by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<TvGuideRepository.Programme?>(null) }
    var origin by remember { mutableStateOf<Rect?>(null) }
    LaunchedEffect(Unit) { while (true) { now = java.time.Instant.now(); delay(1_000) } }
    LaunchedEffect(reload) {
        loading = true; failed = false
        withContext(Dispatchers.IO) { runCatching { TvGuideRepository.load(context, reload > 0) } }
            .onSuccess { guide = it }.onFailure { failed = true }
        loading = false
    }
    LaunchedEffect(dateString) { liveOnly = false }
    val dayProgrammes = remember(guide, date) { guide?.forDate(date)?.toList() ?: emptyList() }
    val channels = remember(dayProgrammes) { dayProgrammes.map { it.channel }.distinct().sortedBy { TvGuideRepository.channelNumber(it) } }
    val visible = dayProgrammes.filter { it.end.isAfter(now) && (type == "all" || it.type == type) && (channel == null || it.channel == channel) && (!liveOnly || it.onAir(now)) }
    val dateFormat = remember { java.time.format.DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN) }
    val days = remember(guide, date, today) { ((guide?.dates?.toList() ?: (-1..6).map { today.plusDays(it.toLong()) }) + date).distinct().sorted() }
    val dayStrip = rememberLazyListState()
    LaunchedEffect(days, date) { days.indexOf(date).takeIf { it >= 0 }?.let { dayStrip.animateScrollToItem((it - 1).coerceAtLeast(0)) } }
    Column(modifier.fillMaxSize().statusBarsPadding().padding(bottom = 96.dp)) {
        Column(Modifier.fillMaxWidth().padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.padding(horizontal = 20.dp).reveal(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PulsingDot(LikeGreen, size = 4.dp)
                        Text("IN CHIARO · DIGITALE TERRESTRE", color = LikeGreen, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp, modifier = Modifier.padding(start = 4.dp))
                    }
                    Text("Guida TV", style = MaterialTheme.typography.displaySmall, color = Ink)
                }
                GlassIconButton(R.drawable.ic_calendar, "Scegli il giorno") { calendar = true }
                Spacer(Modifier.width(10.dp))
                Box(Modifier.size(44.dp).glass(CircleShape).clip(CircleShape).clickable(enabled = !loading) { reload++ }, contentAlignment = Alignment.Center) {
                    if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Sw.Accent, strokeWidth = 2.dp)
                    else Icon(painterResource(R.drawable.ic_refresh), "Aggiorna guida", tint = Ink, modifier = Modifier.size(21.dp))
                }
            }
            LazyRow(state = dayStrip, contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(days, key = { it.toString() }) { day ->
                    val active = day == date
                    val fill by animateFloatAsState(if (active) 1f else 0f, tween(260), label = "guide-day")
                    val interaction = remember { MutableInteractionSource() }
                    Column(
                        Modifier.width(62.dp).height(70.dp)
                            .pressScale(interaction, .9f)
                            .clip(RoundedCornerShape(20.dp))
                            .background(Sw.Raised)
                            .drawBehind { drawRect(Sw.Brand, alpha = fill) }
                            .clickable(interaction, indication = null) { onDate(day.toString()) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            when (day) { today -> "OGGI"; today.plusDays(1) -> "DOMANI"; today.minusDays(1) -> "IERI"; else -> day.format(java.time.format.DateTimeFormatter.ofPattern("EEE", Locale.ITALIAN)).uppercase(Locale.ITALIAN).take(3) },
                            color = if (active) Color.White.copy(alpha = .9f) else Muted, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp
                        )
                        Text("${day.dayOfMonth}", color = if (active) Color.White else Ink, fontSize = 22.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SegmentedPills(listOf("Tutti", "Film", "Serie"), listOf("all", "movie", "tv").indexOf(type), Modifier.weight(1f), height = 42.dp) { type = listOf("all", "movie", "tv")[it] }
                if (date == today) {
                    val interaction = remember { MutableInteractionSource() }
                    Row(
                        Modifier.height(42.dp).pressScale(interaction, .92f).clip(CircleShape)
                            .background(if (liveOnly) LikeGreen.copy(alpha = .22f) else Sw.Raised)
                            .border(1.dp, if (liveOnly) LikeGreen else Color.White.copy(alpha = .08f), CircleShape)
                            .clickable(interaction, indication = null) { liveOnly = !liveOnly }
                            .padding(start = 8.dp, end = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PulsingDot(LikeGreen, size = 4.dp)
                        Text("Live", color = if (liveOnly) LikeGreen else Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 3.dp))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                val interaction = remember { MutableInteractionSource() }
                Row(
                    Modifier.weight(1f).height(40.dp).pressScale(interaction, .96f).glass(CircleShape)
                        .clickable(interaction, indication = null) { channelMenu = true }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(painterResource(R.drawable.ic_tv), null, tint = Sw.Accent, modifier = Modifier.size(18.dp))
                    Text(channel?.let { "${TvGuideRepository.channelNumber(it)} · $it" } ?: "Tutti i canali", color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp).weight(1f))
                    Icon(painterResource(R.drawable.ic_chevron_right), null, tint = Muted, modifier = Modifier.size(18.dp).graphicsLayer { rotationZ = 90f })
                }
                AnimatedCount(visible.size) { Text("$it titoli", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp)) }
            }
        }
        Spacer(Modifier.height(10.dp))
        AnimatedContent(targetState = Triple(dateString, type, "${channel.orEmpty()}-$liveOnly"),
            transitionSpec = { fadeIn(tween(220)) + slideInVertically { it / 18 } togetherWith fadeOut(tween(140)) }, label = "guide-day", modifier = Modifier.weight(1f)) { selection ->
            val chosenDate = java.time.LocalDate.parse(selection.first)
            val selectedFilter = selection.third.substringBeforeLast("-").ifEmpty { null }
            val selectedLive = selection.third.substringAfterLast("-") == "true"
            val rows = guide?.remainingForDate(chosenDate, now)?.filter { (selection.second == "all" || it.type == selection.second) && (selectedFilter == null || it.channel == selectedFilter) && (!selectedLive || it.onAir(now)) } ?: emptyList()
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 36.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (failed || guide?.cached == true) item {
                    Surface(color = Raised, shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
                        Text(if (guide == null) "La guida non è disponibile. Controlla la connessione e riprova." else "Stai consultando la guida salvata. Gli orari potrebbero essere cambiati.", color = Muted)
                        TextButton({ reload++ }, enabled = !loading) { Text("Riprova") }
                    } }
                }
                guide?.let { data -> item {
                    val shortDate = java.time.format.DateTimeFormatter.ofPattern("d MMM", Locale.ITALIAN)
                    Text("Palinsesti disponibili: ${data.dates.first().format(shortDate)} – ${data.dates.last().format(shortDate)}", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 4.dp))
                } }
                if (!loading && guide != null && rows.isEmpty()) item {
                    Surface(color = Panel, shape = RoundedCornerShape(26.dp)) { Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(painterResource(R.drawable.ic_tv_guide), null, tint = CrimsonSoft, modifier = Modifier.size(38.dp))
                        Text(if (chosenDate !in guide!!.dates) "Palinsesto non disponibile per questo giorno" else if (chosenDate.isBefore(today)) "Le trasmissioni di questo giorno sono terminate" else if (selectedLive) "Nessun titolo in onda adesso" else "Nessun titolo con questi filtri", color = Ink, fontWeight = FontWeight.Bold)
                        Text(if (chosenDate !in guide!!.dates) "La guida pubblica copre solo i giorni indicati sopra. Scegli un’altra data dal calendario." else "Prova un altro canale o passa a Tutti.", color = Muted)
                        TextButton({ if (chosenDate !in guide!!.dates) calendar = true else { type = "all"; channel = null; liveOnly = false } }) { Text(if (chosenDate !in guide!!.dates) "Scegli giorno" else "Mostra tutti") }
                    } }
                }
                items(rows, key = { it.key() }) { programme ->
                    TvGuideProgrammeCard(programme, chosenDate, now, Modifier.animateItem()) { bounds -> origin = bounds; onExpandedChange(true); selected = programme }
                }
                if (guide != null) item { Text("Guida EPGShare01 · principali canali nazionali\nOrari italiani · la programmazione può variare", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 12.dp)) }
            }
        }
    }
    if (channelMenu) Dialog(onDismissRequest = { channelMenu = false }) {
        Surface(color = Panel, shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Scegli canale", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton({ channelMenu = false }) { Text("Chiudi") }
                }
                LazyColumn(Modifier.heightIn(max = 480.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    item { FilterChip(selected = channel == null, onClick = { channel = null; channelMenu = false }, label = { Text("Tutti i canali") }, modifier = Modifier.fillMaxWidth()) }
                    items(channels, key = { it }) { name ->
                        Surface(onClick = { channel = name; channelMenu = false }, color = if (channel == name) Crimson.copy(alpha = .22f) else Raised, shape = RoundedCornerShape(16.dp)) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(TvGuideRepository.channelNumber(name).toString(), color = CrimsonSoft, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                                RemoteImage(guide?.logos?.get(name).orEmpty(), Modifier.size(56.dp, 36.dp).clip(RoundedCornerShape(8.dp)), ContentScale.Fit, R.drawable.ic_tv, backgroundColor = if (name.startsWith("Rai ")) Color.White else Raised)
                                Text(name, color = Ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(start = 12.dp))
                                RadioButton(selected = channel == name, onClick = null)
                            }
                        }
                    }
                }
            }
        }
    }
    if (calendar) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { calendar = false }, confirmButton = {
            TextButton({ picker.selectedDateMillis?.let { onDate(java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()) }; calendar = false }, enabled = picker.selectedDateMillis != null) { Text("Scegli") }
        }, dismissButton = { TextButton({ calendar = false }) { Text("Annulla") } }) { DatePicker(state = picker, title = { Text("Scegli il giorno", Modifier.padding(start = 24.dp, top = 16.dp)) }) }
    }
    selected?.let { programme -> ExpandingPage(origin, onClosed = { selected = null; onExpandedChange(false) }) { close ->
        BackHandler(enabled = backEnabled) { close() }
        TvGuideProgrammePage(programme, api, close, onOpen = onOpen)
    } }
}

@Composable
private fun TvGuideProgrammeCard(programme: TvGuideRepository.Programme, date: java.time.LocalDate, now: java.time.Instant, modifier: Modifier, onOpen: (Rect?) -> Unit) {
    var bounds by remember(programme.key()) { mutableStateOf<Rect?>(null) }
    val live = programme.onAir(now)
    val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm")
    val start = programme.start.atZone(TvGuideRepository.ROME)
    val end = programme.end.atZone(TvGuideRepository.ROME)
    val shape = RoundedCornerShape(24.dp)
    Row(
        modifier.fillMaxWidth()
            .onGloballyPositioned { bounds = it.boundsInRoot() }
            .noRippleClickable { onOpen(bounds) }
            .then(if (live) Modifier.clip(shape).background(Brush.linearGradient(listOf(Color(0xFF12291F), Sw.Surface))).border(1.dp, LikeGreen.copy(alpha = .5f), shape) else Modifier.glass(shape))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.width(52.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(start.format(time), color = if (live) LikeGreen else Ink, fontWeight = FontWeight.Black, fontSize = 17.sp)
            Box(Modifier.padding(vertical = 4.dp).width(2.dp).height(18.dp).clip(CircleShape).background(if (live) LikeGreen.copy(alpha = .5f) else Sw.Outline))
            Text(end.format(time), color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.padding(start = 10.dp).size(76.dp, 104.dp).clip(RoundedCornerShape(16.dp)).background(Raised), contentAlignment = Alignment.Center) {
            if (programme.image.isNotBlank()) RemoteImage(programme.image, Modifier.fillMaxSize(), ContentScale.Crop, fallbackIcon = if (programme.type == "movie") R.drawable.ic_movie else R.drawable.ic_tv)
            else Icon(painterResource(if (programme.type == "movie") R.drawable.ic_movie else R.drawable.ic_tv), null, tint = CrimsonSoft, modifier = Modifier.size(32.dp))
        }
        Column(Modifier.weight(1f).padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(programme.channel, color = Sw.Accent, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (live) {
                    PulsingDot(LikeGreen, Modifier.padding(start = 6.dp), size = 4.dp)
                    Text("IN ONDA", color = LikeGreen, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp, modifier = Modifier.padding(start = 2.dp))
                }
            }
            Text(programme.title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                (if (programme.type == "movie") "Film" else "Serie TV${if (programme.episode.isNotBlank()) " · ${programme.episode}" else ""}") +
                    if (start.toLocalDate() < date) " · iniziato ieri" else if (end.toLocalDate() > date) " · fino a domani" else "",
                color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            if (live) {
                val total = java.time.Duration.between(programme.start, programme.end).seconds.toFloat().coerceAtLeast(1f)
                val progress = (java.time.Duration.between(programme.start, now).seconds / total).coerceIn(0f, 1f)
                val animated by animateFloatAsState(progress, tween(500), label = "guide-live-progress")
                Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(4.dp).clip(CircleShape).background(Raised)) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(animated).clip(CircleShape).background(Brush.horizontalGradient(listOf(LikeGreen.copy(alpha = .6f), LikeGreen))))
                }
            }
        }
    }
}

@Composable
private fun TvGuideProgrammePage(programme: TvGuideRepository.Programme, api: TmdbApi, onDismiss: () -> Unit, onOpen: (Models.Media) -> Unit) {
    var recognized by remember(programme.key()) { mutableStateOf<Models.Media?>(null) }
    var recognizing by remember(programme.key()) { mutableStateOf(true) }
    LaunchedEffect(programme.key()) {
        recognized = withContext(Dispatchers.IO) { runCatching {
            TvGuideRepository.recognize(programme, api.searchTitles(programme.searchTitle(), null))?.let { match -> runCatching { api.details(match) }.getOrDefault(match) }
        }.getOrNull() }
        recognizing = false
    }
    val image = recognized?.backdrop?.ifBlank { recognized?.poster.orEmpty() }?.ifBlank { programme.image } ?: programme.image
    val registerSource = LocalRegisterArtworkSource.current
    // The hero image is the source the detail page grows out of (and shrinks back into).
    val heroKey = recognized?.let { rememberArtworkSourceKey(it) }
    val openDetail: () -> Unit = { recognized?.let { media -> heroKey?.let(registerSource); onOpen(media) } }
    val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm", Locale.ITALIAN)
    val day = java.time.format.DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)
    val start = programme.start.atZone(TvGuideRepository.ROME)
    val end = programme.end.atZone(TvGuideRepository.ROME)
    LazyColumn(Modifier.fillMaxSize().background(Night).statusBarsPadding(), contentPadding = PaddingValues(20.dp, 8.dp, 20.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GlassIconButton(R.drawable.ic_back, "Indietro") { onDismiss() }
                Column(Modifier.padding(start = 14.dp)) {
                    Text(programme.channel, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                    Text("Canale ${TvGuideRepository.channelNumber(programme.channel)} · Guida TV", color = Muted, fontSize = 12.sp)
                }
            }
        }
        item {
            val heroShape = RoundedCornerShape(26.dp)
            val heroModifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
            Box(Modifier.reveal(distance = 16.dp)) {
                if (recognizing && image.isBlank()) LoadingSkeleton(heroModifier.clip(heroShape))
                else if (recognized != null && heroKey != null) SharedArtworkSource(recognized!!, heroKey, heroModifier.noRippleClickable(openDetail), heroShape, image)
                else RemoteImage(image, heroModifier.clip(heroShape), ContentScale.Crop, fallbackIcon = if (programme.type == "movie") R.drawable.ic_movie else R.drawable.ic_tv, animatedPlaceholder = true)
                if (programme.onAir(java.time.Instant.now())) Row(
                    Modifier.align(Alignment.TopStart).padding(12.dp).clip(CircleShape).background(Color.Black.copy(alpha = .6f)).padding(start = 4.dp, end = 10.dp, top = 3.dp, bottom = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    PulsingDot(LikeGreen, size = 4.dp)
                    Text("IN ONDA", color = LikeGreen, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                }
            }
        }
        item {
            Column(Modifier.reveal(60, 16.dp)) {
                Text(if (programme.type == "movie") "FILM" else "SERIE TV", color = Sw.Accent, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                Text(recognized?.title ?: programme.title, style = MaterialTheme.typography.headlineMedium, color = Ink, modifier = Modifier.padding(top = 4.dp))
                if (recognizing) LoadingSkeleton(Modifier.padding(top = 10.dp).width(140.dp).height(22.dp).clip(CircleShape))
                else Row(Modifier.padding(top = 10.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    MetaPill("${start.format(time)} – ${end.format(time)}", tint = Sw.Accent, background = Sw.Accent.copy(alpha = .14f))
                    MetaPill(start.format(day).replaceFirstChar { it.uppercase() }, background = Sw.Raised)
                    recognized?.let { media ->
                        MetaPill(media.year, background = Sw.Raised)
                        if (media.rating > 0) MetaPill(rating(media.rating), icon = R.drawable.ic_star, tint = Sw.Amber, background = Sw.Amber.copy(alpha = .14f))
                    }
                }
            }
        }
        if (recognized != null) item {
            Button(
                onClick = openDetail,
                modifier = Modifier.fillMaxWidth().height(54.dp).crimsonGlow(CircleShape, 10.dp),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
            ) {
                Icon(painterResource(if (recognized!!.isSeries) R.drawable.ic_tv else R.drawable.ic_movie), null, Modifier.size(20.dp))
                Spacer(Modifier.width(9.dp))
                Text("Apri la scheda ${if (recognized!!.isSeries) "della serie" else "del film"}", fontWeight = FontWeight.Bold)
            }
        }
        item { TvProgrammeReminder(programme) }
        if (programme.episode.isNotBlank()) item { Text(programme.episode, color = Muted) }
        if (programme.subtitle.isNotBlank()) item { Text(programme.subtitle, color = Ink, fontWeight = FontWeight.Bold) }
        item {
            if (recognizing && programme.description.isBlank()) Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(1f, .95f, .7f).forEach { width -> LoadingSkeleton(Modifier.fillMaxWidth(width).height(16.dp).clip(RoundedCornerShape(6.dp))) }
            } else Column {
                Text("Trama", style = MaterialTheme.typography.titleLarge, color = Ink)
                Text(programme.description.ifBlank { recognized?.overview ?: "Trama non disponibile nella guida." }, color = Muted, fontSize = 16.sp, lineHeight = 24.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun TvProgrammeReminder(programme: TvGuideRepository.Programme) {
    val context = LocalContext.current
    var saved by remember(programme.key()) { mutableIntStateOf(TvReminderReceiver.minutes(context, programme.key())) }
    var dialog by remember { mutableStateOf(false) }
    var minutes by remember { mutableStateOf(if (saved > 0) saved.toString() else "15") }
    var message by remember { mutableStateOf<String?>(null) }
    var clock by remember { mutableStateOf(java.time.Instant.now()) }
    LaunchedEffect(programme.key()) { while (true) { clock = java.time.Instant.now(); saved = TvReminderReceiver.minutes(context, programme.key()); delay(15_000) } }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        message = if (granted) "Notifiche abilitate. Ora puoi attivare il promemoria." else "Per ricevere il promemoria abilita le notifiche nelle impostazioni."
    }
    val settings = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { message = null }
    Surface(color = Raised, shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Promemoria", color = Ink, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            AnimatedContent(saved, label = "reminder-status") { value -> Text(if (value > 0) "Ti avviserò $value minuti prima dell’inizio" else if (clock.isBefore(programme.start)) "Scegli quanto prima ricevere una notifica" else "La trasmissione è già iniziata", color = Muted) }
            Row {
                if (clock.isBefore(programme.start)) Button({ dialog = true; message = null }) { Text(if (saved > 0) "Modifica" else "Avvisami") }
                if (saved > 0) TextButton({ TvReminderReceiver.cancel(context, programme.key()); saved = -1 }) { Text("Rimuovi") }
            }
        }
    }
    if (dialog) AlertDialog(onDismissRequest = { dialog = false }, title = { Text("Quando ti avviso?") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Prima di ${programme.title}")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(5, 10, 15, 30, 60).forEach { value -> FilterChip(selected = minutes == value.toString(), onClick = { minutes = value.toString(); message = null }, label = { Text("$value min") }) }
            }
            OutlinedTextField(value = minutes, onValueChange = { minutes = it.filter(Char::isDigit).take(4); message = null }, label = { Text("Minuti prima (1–1440)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            message?.let {
                Text(it, color = CrimsonSoft)
                if (!TvReminderReceiver.notificationsAllowed(context)) TextButton({
                    settings.launch(android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName))
                }) { Text("Impostazioni notifiche") }
            }
        }
    }, confirmButton = { TextButton({
        val value = minutes.toIntOrNull()
        when {
            value == null || value !in 1..1440 -> message = "Inserisci un numero da 1 a 1440."
            TvReminderReceiver.trigger(programme, value) <= System.currentTimeMillis() -> message = "Questo orario è già passato. Scegli un anticipo più breve."
            android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED -> permission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            !TvReminderReceiver.notificationsAllowed(context) -> {
                message = "Abilita le notifiche di Guida TV, poi premi Attiva."
                settings.launch(android.content.Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, "tv-programmes"))
            }
            !TvReminderReceiver.exactAllowed(context) -> {
                message = "Abilita sveglie e promemoria per rispettare l’orario scelto, poi premi Attiva."
                settings.launch(android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, android.net.Uri.parse("package:${context.packageName}")))
            }
            else -> runCatching { TvReminderReceiver.save(context, programme, value) }.onSuccess { saved = value; dialog = false }.onFailure { message = it.message ?: "Impossibile attivare il promemoria." }
        }
    }) { Text("Attiva") } }, dismissButton = { TextButton({ dialog = false }) { Text("Annulla") } })
}

private data class SubscriptionData(
    val availability: Map<String, SubscriptionRepository.Availability> = emptyMap(),
    val directory: List<Models.Provider> = emptyList(),
    val updating: Boolean = false,
    val completed: Int = 0,
    val total: Int = 0,
    val reload: () -> Unit = {}
) {
    val services get() = SubscriptionRepository.services(directory, availability.values)
    val uncertain get() = availability.values.count { !it.verified || it.failed }
}
private data class ActiveSubscriptions(val active: Set<Int> = emptySet(), val update: (Set<Int>) -> Unit = {})
private val LocalSubscriptionData = compositionLocalOf { SubscriptionData() }
private val LocalActiveSubscriptions = compositionLocalOf { ActiveSubscriptions() }

@Composable
private fun rememberSubscriptionData(api: TmdbApi, store: LibraryStore, refresh: Int): SubscriptionData {
    val context = LocalContext.current.applicationContext
    val media = remember(refresh) { store.all().filter { it.state == "saved" || it.state == "progress" }.map { it.media }.distinctBy { it.id } }
    val signature = media.map { it.id }.sorted().joinToString("|")
    var availability by remember { mutableStateOf(media.associate { it.id to SubscriptionRepository.cached(context, it) }) }
    var directory by remember { mutableStateOf(SubscriptionRepository.savedServices(context).toList()) }
    var updating by remember { mutableStateOf(false) }
    var completed by remember { mutableIntStateOf(0) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(reload) {
        withContext(Dispatchers.IO) { runCatching { api.subscriptionDirectory().also { SubscriptionRepository.saveServices(context, it) } }.getOrNull() }?.let { directory = SubscriptionRepository.savedServices(context).toList() }
    }
    val lastReload = remember { intArrayOf(0) }
    LaunchedEffect(signature, reload) {
        val force = reload > lastReload[0]
        lastReload[0] = reload
        availability = media.associate { it.id to SubscriptionRepository.cached(context, it) }
        val pending = media.filter { force || availability[it.id]?.fresh() != true }
        completed = media.size - pending.size; updating = pending.isNotEmpty()
        val permits = kotlinx.coroutines.sync.Semaphore(4)
        coroutineScope {
            pending.map { item -> async {
                val result = permits.withPermit { withContext(Dispatchers.IO) { SubscriptionRepository.load(context, api, item, force) } }
                availability = availability + (item.id to result); directory = SubscriptionRepository.savedServices(context).toList(); completed++
            } }.awaitAll()
        }
        updating = false
    }
    return SubscriptionData(availability, directory, updating, completed, media.size) { reload++ }
}

private data class SubscriptionFilter(val activeOnly: Boolean = false, val services: Set<Int> = emptySet()) {
    fun includes(media: Models.Media, data: SubscriptionData, active: Set<Int>): Boolean =
        if (!activeOnly && services.isEmpty()) true else SubscriptionRepository.included(data.availability[media.id], if (activeOnly) active else services)
    fun json() = org.json.JSONObject().put("active", activeOnly).put("services", org.json.JSONArray(services)).toString()
    companion object {
        fun from(raw: String): SubscriptionFilter = runCatching {
            val json = org.json.JSONObject(raw)
            val services = json.optJSONArray("services")
            SubscriptionFilter(json.optBoolean("active"), (0 until (services?.length() ?: 0)).map { SubscriptionRepository.serviceId(services!!.optInt(it)) }.filter { it > 0 }.toSet())
        }.getOrDefault(SubscriptionFilter())
    }
}

@Composable
private fun rememberSubscriptionFilter(store: LibraryStore, section: String, refresh: Int): Pair<SubscriptionFilter, (SubscriptionFilter) -> Unit> {
    var filter by remember(section, refresh) { mutableStateOf(SubscriptionFilter.from(store.subscriptionFilter(section))) }
    return filter to { chosen -> filter = chosen; store.setSubscriptionFilter(section, chosen.json()) }
}

@Composable
private fun SubscriptionLogo(provider: Models.Provider, modifier: Modifier = Modifier.size(38.dp)) {
    val platform = TmdbApi.PLATFORMS.firstOrNull { it.providerId == SubscriptionRepository.serviceId(provider.id) }
    if (provider.logo.isNotBlank()) RemoteImage(provider.logo, modifier.clip(RoundedCornerShape(10.dp)), ContentScale.Fit)
    else if (platform != null) Icon(painterResource(advisorPlatformLogo(platform.id)), null, modifier, tint = Color.Unspecified)
    else Surface(modifier, color = Raised, shape = RoundedCornerShape(10.dp)) {
        Box(contentAlignment = Alignment.Center) { Text(provider.name.take(2).uppercase(Locale.ITALIAN), color = CrimsonSoft, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun ProviderSelectionDialog(title: String, selected: Set<Int>, onDismiss: () -> Unit, fullScreen: Boolean = false, onConfirm: (Set<Int>) -> Unit) {
    val data = LocalSubscriptionData.current
    var chosen by remember { mutableStateOf(selected) }
    var query by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = !fullScreen, decorFitsSystemWindows = !fullScreen)) {
        Surface(modifier = if (fullScreen) Modifier.fillMaxSize() else Modifier, color = Panel, shape = RoundedCornerShape(if (fullScreen) 0.dp else 28.dp)) {
            Column((if (fullScreen) Modifier.fillMaxSize().safeDrawingPadding().imePadding() else Modifier.fillMaxWidth()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(title, color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text("Puoi scegliere più servizi", color = Muted)
                OutlinedTextField(query, { query = it }, placeholder = { Text("Cerca servizio") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp))
                LazyColumn(if (fullScreen) Modifier.weight(1f) else Modifier.heightIn(max = 350.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(data.services.filter { it.name.contains(query, true) }, key = { it.id }) { provider ->
                        val id = SubscriptionRepository.serviceId(provider.id)
                        Surface(onClick = { chosen = if (id in chosen) chosen - id else chosen + id }, color = if (id in chosen) Crimson.copy(alpha = .18f) else Raised, shape = RoundedCornerShape(16.dp)) {
                            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                SubscriptionLogo(provider)
                                Text(provider.name, color = Ink, modifier = Modifier.weight(1f).padding(start = 12.dp), fontWeight = FontWeight.SemiBold)
                                Checkbox(id in chosen, onCheckedChange = null)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (chosen.isNotEmpty()) TextButton({ chosen = emptySet() }) { Text("Nessuno") }
                    Spacer(Modifier.weight(1f))
                    TextButton(onDismiss) { Text("Annulla") }
                    Button({ onConfirm(chosen) }) { Text("Salva") }
                }
            }
        }
    }
}

@Composable
private fun SubscriptionFilterBar(filter: SubscriptionFilter, onChange: (SubscriptionFilter) -> Unit, modifier: Modifier = Modifier) {
    val subscriptions = LocalActiveSubscriptions.current
    val data = LocalSubscriptionData.current
    var dialog by remember { mutableStateOf(false) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            FilterChip(!filter.activeOnly && filter.services.isEmpty(), { onChange(SubscriptionFilter()) }, { Text("Tutti") })
            FilterChip(filter.activeOnly, { onChange(SubscriptionFilter(activeOnly = true)) }, { Text("I miei abbonamenti") })
            FilterChip(filter.services.isNotEmpty(), { dialog = true }, { Text(if (filter.services.isEmpty()) "Scegli servizi" else "${filter.services.size} servizi") })
        }
        if (filter.activeOnly && subscriptions.active.isEmpty()) Text("Nessun abbonamento attivo. Impostali nella Home.", color = Muted, fontSize = 12.sp)
        if ((filter.activeOnly || filter.services.isNotEmpty()) && (data.updating || data.uncertain > 0)) Text(if (data.updating) "Verifica disponibilità ${data.completed}/${data.total}…" else "Disponibilità incompleta: alcuni titoli non sono stati verificati.", color = Muted, fontSize = 12.sp)
    }
    if (dialog) ProviderSelectionDialog("Filtra per servizi", filter.services, { dialog = false }) { chosen -> onChange(SubscriptionFilter(services = chosen)); dialog = false }
}

@Composable
private fun SubscriptionsPanel(store: LibraryStore, refresh: Int, onOpen: (Models.Media) -> Unit) {
    val data = LocalSubscriptionData.current
    val subscriptions = LocalActiveSubscriptions.current
    val entries = remember(refresh) { store.all().filter { it.state == "saved" || it.state == "progress" }.toList() }
    val ranks = remember(entries, data.availability, data.directory, subscriptions.active) { SubscriptionRepository.rank(entries, data.availability, data.services, subscriptions.active) }
    var editing by remember { mutableStateOf(false) }
    var ranking by remember { mutableStateOf(false) }
    var selectedRank by remember { mutableStateOf<SubscriptionRepository.Rank?>(null) }
    Surface(Modifier.padding(horizontal = 20.dp).fillMaxWidth().animateContentSize(), color = Panel, shape = RoundedCornerShape(28.dp), border = androidx.compose.foundation.BorderStroke(1.dp, CrimsonSoft.copy(alpha = .25f))) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("I tuoi abbonamenti", color = Ink, fontSize = 21.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold)
                }
                TextButton({ editing = true }) { Text(if (subscriptions.active.isEmpty()) "Imposta" else "Modifica") }
            }
            if (subscriptions.active.isEmpty()) Text("Scegli i servizi a cui sei abbonato. Puoi modificarli quando vuoi.", color = Muted)
            else LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(data.services.filter { SubscriptionRepository.serviceId(it.id) in subscriptions.active }, key = { it.id }) { provider ->
                    Surface(color = Raised, shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) { SubscriptionLogo(provider, Modifier.size(24.dp)); Text(provider.name, color = Ink, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp)) } }
                }
            }
            HorizontalDivider(color = Muted.copy(alpha = .15f))
            Text("Quale servizio ti conviene?", color = Ink, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text("Più titoli inclusi dalla tua lista e da Continua a guardare. Ogni film o serie conta una volta.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
            when {
                entries.isEmpty() -> Text("Aggiungi titoli alla tua lista per ottenere una classifica personale.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
                ranks.all { it.total() == 0 } && !data.updating && data.uncertain == 0 -> Text("Nessun servizio include i tuoi titoli al momento.", color = Muted)
                else -> {
                    ranks.filter { it.total() > 0 }.take(2).forEach { rank ->
                        SubscriptionRankRow(rank, ranks.count { it.total() > rank.total() } + 1, rank.provider.id in subscriptions.active, subscriptions.active.isNotEmpty()) { selectedRank = rank }
                    }
                    if (data.updating) LinearProgressIndicator(progress = { if (data.total == 0) 0f else data.completed.toFloat() / data.total }, modifier = Modifier.fillMaxWidth())
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (data.updating) "Verifica titoli ${data.completed}/${data.total}" else if (data.uncertain > 0) "${data.uncertain} titoli da verificare" else "${entries.size} titoli confrontati", color = Muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        TextButton({ ranking = true }) { Text("Classifica") }
                        IconButton(data.reload, enabled = !data.updating, modifier = Modifier.size(40.dp)) { Icon(painterResource(R.drawable.ic_refresh), "Aggiorna disponibilità", tint = CrimsonSoft) }
                    }
                    Text("Ordine per numero di titoli, senza confrontare i prezzi. ${if (data.updating || data.uncertain > 0) "Classifica provvisoria. " else ""}Disponibilità in Italia · JustWatch", color = Muted, fontSize = 10.sp, lineHeight = 14.sp)
                }
            }
        }
    }
    if (editing) ProviderSelectionDialog("I tuoi abbonamenti", subscriptions.active, { editing = false }, fullScreen = true) { chosen -> subscriptions.update(chosen); editing = false }
    if (ranking) Dialog(onDismissRequest = { ranking = false }) {
        Surface(color = Panel, shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("La tua classifica", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text("Dal maggior numero di titoli inclusi al minore. Solo abbonamenti, senza noleggi o acquisti.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
                if (data.updating || data.uncertain > 0) Text("Dati in aggiornamento o incompleti: la classifica può cambiare.", color = CrimsonSoft, fontSize = 12.sp)
                LazyColumn(Modifier.heightIn(max = 430.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ranks, key = { it.provider.id }) { rank -> SubscriptionRankRow(rank, ranks.count { it.total() > rank.total() } + 1, rank.provider.id in subscriptions.active, subscriptions.active.isNotEmpty()) { selectedRank = rank } }
                }
                TextButton({ ranking = false }, Modifier.align(Alignment.End)) { Text("Chiudi") }
            }
        }
    }
    selectedRank?.let { rank ->
        val titles = entries.filter { SubscriptionRepository.included(data.availability[it.media.id], setOf(SubscriptionRepository.serviceId(rank.provider.id))) }.distinctBy { it.media.id }
        Dialog(onDismissRequest = { selectedRank = null }) {
            Surface(color = Panel, shape = RoundedCornerShape(28.dp)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Su ${rank.provider.name}", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    LazyColumn(Modifier.heightIn(max = 430.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(titles, key = { it.media.id }) { entry ->
                            Surface(onClick = { selectedRank = null; ranking = false; onOpen(entry.media) }, color = Raised, shape = RoundedCornerShape(18.dp)) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    RemoteImage(entry.media.poster, Modifier.size(42.dp, 60.dp).clip(RoundedCornerShape(8.dp)), ContentScale.Crop)
                                    Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(entry.media.title, color = Ink, fontWeight = FontWeight.Bold); Text(if (entry.state == "saved") "La mia lista" else "Continua a guardare", color = Muted, fontSize = 12.sp) }
                                }
                            }
                        }
                        if (titles.isEmpty()) item { Text("Nessun titolo incluso nelle tue liste.", color = Muted) }
                    }
                    TextButton({ selectedRank = null }, Modifier.align(Alignment.End)) { Text("Chiudi") }
                }
            }
        }
    }
}

@Composable
private fun SubscriptionRankRow(rank: SubscriptionRepository.Rank, place: Int, active: Boolean, compareActive: Boolean, onClick: () -> Unit) {
    Surface(onClick = onClick, color = Raised, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().animateContentSize()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("$place", color = CrimsonSoft, fontWeight = FontWeight.Black, modifier = Modifier.width(24.dp))
            SubscriptionLogo(rank.provider, Modifier.size(32.dp))
            Column(Modifier.weight(1f).padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(rank.provider.name, color = Ink, fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold)
                Text("${rank.saved} in lista · ${rank.progress} in corso", color = Muted, fontSize = 11.sp, lineHeight = 15.sp)
                if (active) Text("Attivo", color = LikeGreen, fontSize = 10.sp, lineHeight = 14.sp)
                else if (compareActive) Text("${rank.additional} ${if (rank.additional == 1) "titolo" else "titoli"} in più per te", color = CrimsonSoft, fontSize = 10.sp, lineHeight = 14.sp)
            }
            Text("${rank.total()}", color = Ink, fontWeight = FontWeight.Black, fontSize = 22.sp)
        }
    }
}

private fun releaseLabel(media: Models.Media): String = runCatching {
    val date = java.time.LocalDate.parse(media.releaseDate)
    val formatted = date.format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ITALIAN))
    "Uscita: $formatted"
}.getOrDefault("Data da confermare")

private data class NewReleasesState(
    val media: List<Models.Media>, val upcoming: Boolean, val loading: Boolean, val loadingMore: Boolean,
    val error: Boolean, val paginationError: Boolean, val hasMore: Boolean, val onUpcoming: (Boolean) -> Unit, val loadMore: () -> Unit, val retry: () -> Unit
)

@Composable
private fun rememberNewReleases(type: String, api: TmdbApi, catalogReload: Int): NewReleasesState {
    var upcoming by remember(type) { mutableStateOf(false) }
    var media by remember(type) { mutableStateOf<List<Models.Media>>(emptyList()) }
    var loading by remember(type) { mutableStateOf(true) }
    var loadingMore by remember(type) { mutableStateOf(false) }
    var error by remember(type) { mutableStateOf(false) }
    var paginationError by remember(type) { mutableStateOf(false) }
    var page by remember(type) { mutableIntStateOf(1) }
    var hasMore by remember(type) { mutableStateOf(true) }
    var reload by remember(type) { mutableIntStateOf(0) }
    var paginationJob by remember(type) { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(type, upcoming, catalogReload, reload) {
        paginationJob?.cancel()
        media = emptyList(); page = 1; hasMore = true; loading = true; loadingMore = false; error = false; paginationError = false
        val result = withContext(Dispatchers.IO) { runCatching { api.newReleasesPage(type, 1, upcoming) } }
        result.onSuccess { media = it.media.toList(); hasMore = it.hasMore; page = it.nextPage }.onFailure { error = true }
        loading = false
    }
    val loadMore: () -> Unit = {
        if (!loading && !loadingMore && hasMore) {
            val next = page; val mode = upcoming; val generation = reload; val catalogGeneration = catalogReload
            val existing = media.map { it.id }.toSet()
            loadingMore = true; paginationError = false
            paginationJob = scope.launch {
                val result = withContext(Dispatchers.IO) { runCatching { api.newReleasesPage(type, next, mode, existing) } }
                if (mode == upcoming && generation == reload && catalogGeneration == catalogReload) {
                    result.onSuccess { page = it.nextPage; media = (media + it.media).distinctBy { item -> item.id }; hasMore = it.hasMore }.onFailure { paginationError = true }
                    loadingMore = false
                }
            }
        }
    }
    return NewReleasesState(media, upcoming, loading, loadingMore, error, paginationError, hasMore, { upcoming = it }, loadMore, { reload++ })
}

@Composable
private fun NewReleasesSection(type: String, state: NewReleasesState, store: LibraryStore, refresh: Int, onOpen: (Models.Media) -> Unit, onAction: (Models.Media) -> Unit, onSeeAll: (Rect?) -> Unit) {
    val hidden = remember(refresh) { store.byState("hidden").map { it.id }.toSet() }
    val visible = state.media.filter { it.id !in hidden }
    MediaRail("Novità", visible, store, onOpen, onAction, contentVersion = refresh,
        releaseDates = true, onSeeAll = if (visible.isNotEmpty()) onSeeAll else null,
        loadMore = if (state.hasMore && !state.loading && visible.isNotEmpty()) state.loadMore else null, loadingMore = state.loadingMore,
        headerContent = {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text(if (type == "movie") "Uscite italiane · cinema e digitale" else "Serie in Italia · date di prima TV", color = Muted, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(!state.upcoming, { state.onUpcoming(false) }, { Text("Appena usciti") })
                    FilterChip(state.upcoming, { state.onUpcoming(true) }, { Text("In arrivo") })
                }
                if (state.paginationError) TextButton(state.loadMore) { Text("Caricamento non riuscito · Riprova") }
                if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 12.dp), color = Crimson)
                else if (state.error) TextButton(state.retry) { Text("Caricamento non riuscito · Riprova") }
                else if (visible.isEmpty()) {
                    Text(if (state.upcoming) "Nessuna uscita confermata per l’Italia nei dati disponibili." else "Nessuna novità disponibile in Italia in questa selezione.", color = Muted)
                    if (state.hasMore) TextButton(state.loadMore, enabled = !state.loadingMore) { Text(if (state.loadingMore) "Caricamento…" else "Cerca altre uscite") }
                }
            }
        })
}

/** Follows or unfollows a title, asking for the notification permission the first time it is needed. */
@Composable
private fun rememberFollowToggle(onChanged: () -> Unit): (Models.Media, TmdbApi.ReleaseInfo?) -> Unit {
    val context = LocalContext.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) Toast.makeText(context, "Senza notifiche non potrò avvisarti delle uscite", Toast.LENGTH_LONG).show()
        onChanged()
    }
    return { media, info ->
        if (ReleaseFollows.isFollowed(context, media.id)) ReleaseFollows.unfollow(context, media.id)
        else {
            ReleaseFollows.follow(context, media, info)
            if (android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                permission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        onChanged()
    }
}

@Composable
private fun FollowReleaseCard(media: Models.Media, api: TmdbApi, refreshVersion: Int, onChanged: () -> Unit) {
    val context = LocalContext.current
    var info by remember(media.id) { mutableStateOf<TmdbApi.ReleaseInfo?>(null) }
    var loaded by remember(media.id) { mutableStateOf(false) }
    var followed by remember(media.id) { mutableStateOf(ReleaseFollows.isFollowed(context, media.id)) }
    var notificationsOn by remember { mutableStateOf(ReleaseCheckWorker.notificationsAllowed(context)) }
    LaunchedEffect(media.id) {
        info = withContext(Dispatchers.IO) { runCatching { api.releaseInfo(media) }.getOrNull() }
        loaded = true
    }
    LaunchedEffect(media.id, refreshVersion) {
        followed = ReleaseFollows.isFollowed(context, media.id)
        notificationsOn = ReleaseCheckWorker.notificationsAllowed(context)
    }
    val notificationSettings = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        notificationsOn = ReleaseCheckWorker.notificationsAllowed(context)
    }
    val toggle = rememberFollowToggle {
        followed = ReleaseFollows.isFollowed(context, media.id)
        notificationsOn = ReleaseCheckWorker.notificationsAllowed(context)
        onChanged()
    }
    val current = info
    val today = remember { java.time.LocalDate.now(TvGuideRepository.ROME) }
    // Fresh data describes the title; the stored follow is the fallback while offline.
    val state = remember(current, followed, refreshVersion) {
        current?.let { fresh -> ReleaseFollows.Follow().also { it.media = media; ReleaseFollows.initialize(it, fresh, today) } }
            ?: ReleaseFollows.get(context, media.id)?.takeIf { it.initialized }
    }
    val visible = followed || (current != null && ReleaseFollows.worthFollowing(media, current))
    AnimatedVisibility(visible && (loaded || followed), enter = fadeIn(tween(220)) + androidx.compose.animation.expandVertically(), exit = fadeOut(tween(160)) + androidx.compose.animation.shrinkVertically()) {
        val accent by animateColorAsState(if (followed) FollowGold else CrimsonSoft, label = "follow-accent")
        Surface(
            color = if (followed) FollowGold.copy(alpha = .10f) else Raised,
            shape = RoundedCornerShape(22.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, if (followed) FollowGold.copy(alpha = .45f) else MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp)
        ) {
            Column(Modifier.padding(horizontal = 15.dp, vertical = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = accent.copy(alpha = .16f), shape = CircleShape, modifier = Modifier.size(46.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(painterResource(if (followed) R.drawable.ic_notifications else R.drawable.ic_notifications_none), null, tint = accent, modifier = Modifier.size(24.dp))
                        }
                    }
                    Column(Modifier.weight(1f).padding(start = 12.dp, end = 8.dp)) {
                        Text(if (followed) "Stai seguendo" else if (media.isSeries) "Segui la serie" else "Segui l’uscita", color = Ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(state?.let { ReleaseFollows.describe(it, today) } ?: "Dati di uscita non disponibili",
                            color = if (followed) FollowGold else Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 2.dp))
                    }
                    if (followed) OutlinedButton(
                        onClick = { toggle(media, current) }, shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, FollowGold.copy(alpha = .6f)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = FollowGold)
                    ) { Icon(painterResource(R.drawable.ic_check), null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text("Seguito", fontSize = 13.sp) }
                    else Button(
                        onClick = { toggle(media, current) }, shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                        modifier = Modifier.crimsonGlow(RoundedCornerShape(16.dp), 5.dp)
                    ) { Icon(painterResource(R.drawable.ic_add), null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text("Segui", fontSize = 13.sp) }
                }
                Text(
                    if (media.isSeries) "Ti avviso con una notifica il giorno di uscita di ogni nuovo episodio e quando viene annunciata una nuova stagione."
                    else "Ti avviso con una notifica il giorno dell’uscita in Italia e quando arriva in streaming in abbonamento.",
                    color = Muted, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 10.dp)
                )
                if (followed && !notificationsOn) Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Le notifiche sono disattivate.", color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    TextButton({
                        notificationSettings.launch(android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName))
                    }) { Text("Attiva") }
                }
            }
        }
    }
}
