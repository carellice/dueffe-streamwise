# StreamWise: Android → PWA porting inventory

Native source: `app/src/main/java/it/dueffe/streamwise/` (Kotlin + Jetpack Compose, dark theme only).
Status: `done` = ported from the native code, `verified` = checked in the browser at 375×812 against
a local server, `n/a` = not portable (see README).

## 1. Screens and routes

| Native (MainActivity.kt) | Reached by | Web | Status |
|---|---|---|---|
| `StreamWiseApp` tabs Home/Scopri/Guida TV/Libreria | floating nav | `App.tsx` | verified |
| `HomeScreen` | tab | `screens/Home.tsx` | verified |
| `DiscoverScreen` + `CatalogScreen` (carousel, Novità, Top 10, taste, spotlight and genre rails, pull to refresh) | tab | `screens/Discover.tsx` | verified (carousel, rails) |
| `CatalogExpandedScreen` ("Vedi tutto") | ExpandingPage from the chip | `screens/Library.tsx` | done |
| `LibraryScreen` (In corso, Da vedere, Visti, Seguiti, Abbonamenti, Saghe, Nascosti) | tab | `screens/Library.tsx` | verified (sections, list) |
| `SagaDetailScreen` | saga card | `screens/Library.tsx` | done |
| `DetailScreen` (stack of pages, parallax, poster viewer with pinch zoom) | container transform from the artwork | `screens/Detail.tsx`, `App.tsx` `DetailLayer` | verified |
| `GenreScreen` | genre pill | `screens/Detail.tsx` | done |
| `EpisodesScreen` + `EpisodeOverviewDialog` | "Episodi" button | `screens/Episodes.tsx` | done |
| `PersonCredits` | round photo | `screens/Person.tsx` | done |
| `SearchScreen` (titoli, attori, registi, anno nel testo) | search pill | `screens/Search.tsx` | verified |
| `AiScreen`, `FindTitleScreen`, `AiSimilarSection`, `AiSetupCard` | AI cards, detail | `screens/Ai.tsx` | done (needs Cloudflare credentials) |
| `FilterScreen` ("Esplora") | tune button | `screens/Filters.tsx` | done |
| `AdvisorSheet`, `ActionSheet` (long press) | cards, long press | `screens/Sheets.tsx` | done |
| `TvGuideScreen`, `TvGuideProgrammePage`, `TvProgrammeReminder` | tab | `screens/Guide.tsx` | verified (list, filters) |
| `SettingsScreen` | gear | `screens/Settings.tsx` (+ account, notifications, updates) | done |
| `OnboardingScreen` | first use of an account | `screens/Onboarding.tsx` | verified |
| `TourOverlay` | never shown by the native app (`showTour` is never set) | — | n/a |
| Login / registration | web only | `screens/Login.tsx` | verified |

## 2. Navigation and motion

| Native | Web | Status |
|---|---|---|
| `ContainerTransform` / `ExpandingPage` (540 ms emphasized in, 460 ms FastOutSlowIn out; details 560/480) | `components/Transform.tsx` (clip-path inset with radius) | verified |
| Tab `AnimatedContent` (fade 280+40, slide 1/6, scale .97, emphasized 420) | `App.tsx` | done |
| `FloatingNavBar` (weight spring .7/420, icon spring .35/500, label expand 260) | `components/ui.tsx` | verified |
| `SegmentedPills` (thumb spring .72/MediumLow), `ChipTabs`, `pressScale` (.45/650) | `components/ui.tsx` | verified |
| `reveal()` (560 ms Decelerate, 36 dp) | `Reveal` | done |
| `AuroraBackground` (16 s reverse), `lightSweep` (3.8 s), `PulsingDot` (1.3 s), Ken Burns (16 s) | `components/ui.tsx`, `cards.tsx` | done |
| `BackHandler` | `lib/back.ts` (one history entry per enabled handler) | verified |
| ModalBottomSheet, Dialog, AlertDialog, DropdownMenu, Toast | `components/overlay.tsx`, `Library.tsx` | done |

## 3. Theme and type

`Sw` tokens and `darkColorScheme` → CSS variables in `styles.css`. Font: Roboto (the platform
"sans"), woff2 with Latin and Latin Extended subsets. M3 type scale with StreamWiseTheme's overrides
(`.t-*`); default text style bodyLarge (16/24, 0.5 letter spacing), as in Compose. Icons: the
app's own vector drawables converted to SVG (`lib/icons.gen.ts`).

## 4. Data

| Native store (SharedPreferences) | Server table | Status |
|---|---|---|
| `streamwise-native` → `library` (LinkedHashMap order kept with `position`) | `library` | done |
| `streamwise-native` → genres, subscriptions, filters, sort, grid, hide-show-credits, onboarding-done | `meta.prefs` (per account) | done |
| `followed-releases` (ReleaseFollows) | `follows` | done |
| `followed-people` (PersonFollows) | `people` | done |
| `tv-reminders` (TvReminderReceiver) | `reminders` | done |
| `streamwise-subscriptions` (availability snapshots, `_services`) | `availability`, `meta.services` | done |
| `streamwise-ai` (Cloudflare account + token) | `meta.ai_account/ai_token`, never sent to the browser | done |
| `theme-mode` | not used by the native app (dark only) | n/a |

Backup: `GET/POST /api/backup`, the same `streamwise-backup` JSON (library, genres,
subscriptions, follows, followedPeople) as `LibraryStore.exportJson/importJson`.

## 5. Business logic (shared/, used by browser and server)

`Models.java` → `shared/model.ts`; `TmdbApi.java` → `shared/tmdb.ts` (request client injected:
browser via `/api/tmdb/*` proxy, server direct); `LibraryStore` → `shared/library.ts`;
`ReleaseFollows`/`PersonFollows` → `shared/follows.ts`; `SubscriptionRepository` →
`shared/subscriptions.ts`; `TvGuideRepository` → `shared/guide.ts` + `server/src/guide.ts`;
`AiAdvisor.kt` → `server/src/ai.ts`. Dates are Europe/Rome ISO strings like `java.time`.

## 6. Background work and notifications

| Native | PWA | Status |
|---|---|---|
| `ReleaseCheckWorker` every 2 h, quiet 23–8, check on launch after 30 min, after follow | `server/src/push.ts` hourly (same quiet hours), `POST /api/check` on open, after follow/import | done |
| Notification texts, one per title and kind (`tag`) | Web Push, same title/text, poster as icon, tap opens the detail | done |
| `TvReminderReceiver` exact alarms | server every 30 s, Web Push "Canale · alle HH:mm", tap opens the guide on that day | done |
| `EpisodesWidget` home screen widget | not available on the web | n/a |
| `AppUpdateCard` (APK updates) | service worker update + nightly server update | done |

## 7. Not portable

Home screen widget; notification sub-text ("Serie che segui"); exact alarms when the server is
off; haptics on iPhone. See the README table.
