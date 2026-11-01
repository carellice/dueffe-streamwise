# StreamWise · port to PWA

Checklist of the conversion from the Android app (Kotlin + Jetpack Compose, `app/src/main/java/it/dueffe/streamwise`).
Status: `todo`, `done` (ported from the native code), `verified` (checked running in a 375×812 browser).
Native line numbers refer to `MainActivity.kt` at release 2.0.138.

## Screens and routes

| Screen | Reached from | Native | Web | Status |
|---|---|---|---|---|
| Home | tab | `HomeScreen` 1278 | `screens/Home.tsx` | verified |
| Scopri (catalog Film / Serie TV) | tab | `DiscoverScreen` 1514, `CatalogScreen` 1852 | `screens/Discover.tsx`, `lib/catalog.ts` | verified |
| "Vedi tutto" expanded rail | rail header chip | `CatalogExpandedScreen` 4022 | `CatalogExpandedPage` | done |
| Guida TV | tab, TV reminder notification | `TvGuideScreen` 5638 | `screens/Guide.tsx` | verified |
| Programme page + reminder | guide card | `TvGuideProgrammePage` 5861, `TvProgrammeReminder` 5947 | `ProgrammePage` | done |
| Libreria (In corso, Da vedere, Visti, Seguiti, Abbonamenti, Saghe, Nascosti) | tab, Home "Vedi tutto" | `LibraryScreen` 1562, `LibrarySectionContent` 3837 | `screens/Library.tsx` | verified (empty states) |
| Saga page | Saghe card | `SagaDetailScreen` 1724 | `SagaPage` | done |
| Detail | any poster, notification | `DetailScreen` 2712 | `screens/Detail.tsx` | verified |
| Poster full screen with pinch zoom | detail poster | inside `DetailScreen` | `PosterViewer` | done |
| Genre page | detail genre pill | `GenreScreen` 3152 | `GenrePage` | done |
| Episodes | detail "Episodi" | `EpisodesScreen` 5340 | `screens/Episodes.tsx` | done |
| Search (titles, actors, directors) | Home pill, Scopri | `SearchScreen` 3664 | `screens/Search.tsx` | done |
| Person filmography + follow | cast, search, followed people | `PersonCredits` 4227 | `screens/Person.tsx` | done |
| Explore filters + results | Scopri | `FilterScreen` 4901 | `screens/Filters.tsx` | done |
| Chiedi all'IA | Home card | `AiScreen` 1021 | `screens/Ai.tsx` | done |
| Ritrova un titolo | Home card | `FindTitleScreen` 756 | `screens/Ai.tsx` | done |
| Simili secondo l'IA | bottom of detail | `AiSimilarSection` 1200 | `screens/Ai.tsx` | done |
| Settings | Home gear | `SettingsScreen` 4751, `AiSetupCard` 4632 | `screens/Settings.tsx` | done |
| Action sheet (long press) | any poster | `ActionSheet` 3445 | `screens/Advisor.tsx` | done |
| Advisor "Scegli per me" | Home cards | `AdvisorSheet` 5183, `chooseAdvisorTitle` 5305 | `screens/Advisor.tsx` | done |
| Reaction dialog "Ti è piaciuto?" | watched / last episode | `ReactionDialog` 3610 | `screens/Detail.tsx` | done |
| Onboarding (8 pages) | first start, Settings | `OnboardingScreen` 4331 | `screens/Onboarding.tsx` | verified |
| Tour | — | `TourOverlay` 4581 | `screens/Onboarding.tsx` | done (the native app never starts it either) |
| Login / register | PWA only | — | `screens/Login.tsx` | verified |
| Account (password, logout, delete) | PWA only | — | `screens/Settings.tsx` | done |

## Navigation chrome and transitions

| Element | Spec | Native | Web | Status |
|---|---|---|---|---|
| Tab change | in: fade 280 (delay 40) + slide 1/6 + scale .97 (420 Emphasized); out: fade 160 + slide 1/10 (320) | `StreamWiseApp` 479 | `App.tsx` | done |
| Floating nav pill | weight spring .7/420, fill tween 280, icon spring .35/500, label expand 260 / fade 220 delay 80 | `FloatingNavBar` DesignSystem 265 | `components/ui.tsx` | verified |
| Container transform (every page) | open 540 Emphasized (detail 560), close 460 FastOutSlowIn (detail 480); content alpha (p-.28)/.5, scale .93→1, y 40→0, scrim .7 | `ContainerTransform` DesignSystem 380 | `components/Transform.tsx` | done |
| Card / chip sources | art fades by p/.3 | `ExpandingPage` 649 | `App.tsx` `sourceFor` | done |
| Back gesture | BackHandler per page / sheet / wizard step | — | `lib/nav.ts` (history-backed layers) | verified |
| Discover header | solid background after scroll, 280 | `DiscoverScreen` 1539 | `Discover.tsx` | done |
| Detail top bar | solid after 330 dp, title fades/lifts 240 | `DetailScreen` 3023 | `Detail.tsx` | done |

## Theme (dark only, the native `dark = true`)

| Token | Value | Native | Status |
|---|---|---|---|
| Background / Surface / Raised / Outline | #0A0B10 / #14161E / #1D2029 / #2C303C | `Sw` | done |
| Ink / Muted | #F7F5F3 / #A4A8B5 | `Sw` | done |
| Red / Coral / Accent / Amber / Blue | #D7142B / #FF4B45 / #FF5964 / #FFC24D / #4C8DFF | `Sw` | done |
| primary / primaryContainer / onPrimaryContainer | #E5243A / #3B161B / #FFDAD2 | `StreamWiseTheme` | done |
| Like / Dislike / AI violet | #3DDC97 / #FF5C7A / #A57BFF | top of MainActivity | done |
| Brand gradient, glass, brand glow, aurora | linear Red→Coral; slate .78 + white .16→.03 hairline | DesignSystem | done |

## Typography

Roboto (Compose default) as variable WOFF2. Material 3 type scale with the app's overrides
(displaySmall Black −1.4 / 40, headlineMedium ExtraBold −0.5, titleLarge ExtraBold −0.3...) in
`styles.css` `.t-*`. Plain `Text` inherits bodyLarge: 16 px, line height 24, letter spacing 0.5 (body default). Status: done.

## Motion

| Animation | Spec | Status |
|---|---|---|
| pressScale | spring .45 / 650 | done |
| reveal | 560 Decelerate, 36 dp lift, per-item delays | done |
| Aurora | 16 s linear reverse | done |
| Light sweep on "Sorprendimi" | 3.8 s linear | done |
| Featured carousel | auto-advance 6.5 s, 900 Emphasized, Ken Burns 1→1.06 16 s, scale 1−.08·offset, text parallax .35 | done |
| Segmented thumb | spring .72 / 400 | done |
| Pulsing dot | 1300 linear | done |
| Count up | 900 Decelerate | done |
| Reaction choice | scale 1.08 spring .5, choice after 340 ms | done |
| Episode check | in 190/280 from .45, out 110/150 to .7 | done |

## Data model (server SQLite per account, same JSON as SharedPreferences)

| Table | Content | Native |
|---|---|---|
| `library` | one row per `LibraryEntry` JSON, ordered like the LinkedHashMap | `LibraryStore` "library" |
| `follows` | `ReleaseFollows.Follow` JSON | "followed-releases" |
| `people` | `PersonFollows.Follow` JSON | "followed-people" |
| `tv_reminders` | reminder JSON + trigger | "tv-reminders" |
| `meta` | genres, subscriptions, hide-show-credits, AI credentials, revision | "streamwise-native", "streamwise-ai" |
| `push_subs` | Web Push subscriptions of the account | — |

## Business logic (shared/)

| Logic | Native | shared/ | Status |
|---|---|---|---|
| Models, JSON keys and defaults | `Models.java` | `model.ts` | done |
| TMDB client (discover, new releases, search with fuzzy queries, credits, release info...) | `TmdbApi.java` | `tmdb.ts` | done |
| Library actions (episodes, seasons, reopen on new episodes) | `LibraryStore.java` | `library.ts` | done |
| Followed titles and people, notice texts | `ReleaseFollows.java`, `PersonFollows.java` | `follows.ts` | done, checked against TMDB |
| Europe/Rome dates and Italian formats | java.time | `dates.ts` | done |
| Subscriptions ranking | `SubscriptionRepository.java` | `web/src/lib/subscriptions.ts` | done |
| EPG parsing and classification | `TvGuideRepository.java` | `server/src/guide.ts` | verified |
| AI prompts and parsing | `AiAdvisor.kt` | `server/src/ai.ts` | done (needs a Cloudflare account to run) |

## Background work and notifications

| Job | Schedule, texts | Server | Status |
|---|---|---|---|
| ReleaseCheckWorker | every 2 h, silent 23–8 Rome; on app open at most every 30 min; on follow | `push.ts` `checkReleases` | done (push delivery not tested) |
| TV reminders (exact alarms) | checked every 30 s, "Canale · alle HH:mm", tap opens the guide on that day | `push.ts` `sendDueReminders` | done |
| Notification tap | `/?media=<id>`, `/?route=guide&date=` | `App.tsx` deep links | done |

## Settings

| Preference | Scope |
|---|---|
| Preferred genres, subscriptions, filmographies without talk shows | account (server) |
| Library sort, grid view, subscription filter per section, onboarding done, notifications on this device | device + account (localStorage) |

## Integrations and secrets

| Service | Where the secret lives |
|---|---|
| TMDB | `TMDB_API_KEY` env on the server (asked by the installer) |
| Cloudflare Workers AI | per-account `meta`, never returned to the browser |
| EPGShare01 | public, fetched by the server |

## Backup format

`{ format: "streamwise-backup", version: 1, exportedAt, library[], genres[], subscriptions[], follows[], followedPeople[] }`,
same keys as `LibraryStore.exportJson`; old per-month subscriptions are converted like the native import.

## Not portable

| Native feature | Alternative |
|---|---|
| Home screen widget "Prossimi episodi" | not available on the web |
| APK self-update card | server nightly update + service worker update in Settings |
| Notification channels and exact-alarm permission | one browser notification permission per device |
| Native date picker | Material 3 style calendar dialog |
