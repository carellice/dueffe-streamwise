package it.dueffe.streamwise

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/** A real TMDB title the AI picked, why, and which of the user's subscriptions include it. */
internal data class AiResult(val media: Models.Media, val reason: String, val providers: List<Models.Provider>)

/** A programme on free TV tonight, with its TMDB entry when recognized. */
internal data class AiTvResult(val programme: TvGuideRepository.Programme, val media: Models.Media?, val reason: String)

/** What every AI feature answers: a short reply, the titles, and optionally a question with quick answers. */
internal data class AiAnswer(
    val intro: String,
    val results: List<AiResult>,
    val tv: List<AiTvResult> = emptyList(),
    val question: String = "",
    val options: List<String> = emptyList()
)

/** "Ti piacerà?": how well a title fits the user's taste. */
internal data class AiVerdict(val score: Int, val verdict: String, val pros: List<String>, val cons: List<String>)

/** A Workers AI failure with a message ready to show to the user. */
internal class AiException(message: String) : Exception(message)

/**
 * StreamWise's AI on Cloudflare Workers AI with the user's own account (port of PWA/server/src/ai.ts): the
 * Account ID and API token are entered in Settings, kept only on this device and sent only to api.cloudflare.com.
 *
 * The model never invents what it suggests: TMDB builds a pool of real candidates (on the user's subscriptions
 * when possible) and the model only picks from that numbered list and explains why. The only titles it names
 * freely, the "seeds" of a request and "Ritrova un titolo", are matched against TMDB before they reach the user.
 * Every public call blocks: run it off the main thread.
 */
internal object AiAdvisor {
    private const val MODEL = "@cf/openai/gpt-oss-120b"
    private const val PREFS = "streamwise-ai"
    private const val ACCOUNT_ID = "account-id"
    private const val API_TOKEN = "api-token"
    private const val HUB = "hub"
    private const val TAVILY_KEY = "tavily-key"
    private const val NOT_CONFIGURED = "Configura l'IA nelle Impostazioni con il tuo account Cloudflare."
    private const val SYSTEM = "Sei il consulente di cinema e serie TV di StreamWise: competente, diretto, mai banale. Scrivi in italiano naturale. Rispondi sempre e solo con un oggetto JSON valido, senza testo prima o dopo."
    private const val NO_PLOT = "Trama non disponibile."

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun accountId(context: Context): String = prefs(context).getString(ACCOUNT_ID, "").orEmpty()
    fun apiToken(context: Context): String = prefs(context).getString(API_TOKEN, "").orEmpty()
    fun configured(context: Context): Boolean = accountId(context).isNotBlank() && apiToken(context).isNotBlank()

    fun save(context: Context, accountId: String, apiToken: String) {
        prefs(context).edit().putString(ACCOUNT_ID, accountId.trim()).putString(API_TOKEN, apiToken.trim()).apply()
    }

    /** Removes the credentials; the hub style stays. */
    fun clear(context: Context) {
        prefs(context).edit().remove(ACCOUNT_ID).remove(API_TOKEN).apply()
    }

    /** The optional Tavily key for the web search behind "Ritrova un titolo"; blank removes it. */
    fun tavilyKey(context: Context): String = prefs(context).getString(TAVILY_KEY, "").orEmpty()
    fun saveTavilyKey(context: Context, key: String) { prefs(context).edit().putString(TAVILY_KEY, key.trim()).apply() }

    /** Which hub "Assistente IA" opens: "chat" or "tabs". */
    fun hubStyle(context: Context): String = if (prefs(context).getString(HUB, "chat") == "tabs") "tabs" else "chat"
    fun setHubStyle(context: Context, style: String) { prefs(context).edit().putString(HUB, style).apply() }

    // --- the model ------------------------------------------------------------------------------

    private fun clean(value: Any?, max: Int): String = (value?.toString() ?: "").replace(Regex("\\s+"), " ").trim().take(max)
    private fun capital(value: String) = value.replaceFirstChar { it.uppercase() }

    /** The first JSON object in the model's answer. */
    internal fun jsonOf(text: String): JSONObject? {
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        if (start < 0 || end <= start) return null
        return runCatching { JSONObject(text.substring(start, end + 1)) }.getOrNull()
    }

    /** The text of a chat completion, whatever shape Workers AI answered with. */
    private fun contentOf(body: JSONObject?): String {
        if (body == null) return ""
        val result = body.optJSONObject("result")
        for (holder in listOfNotNull(body, result)) {
            holder.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content")?.takeIf { it.isNotEmpty() }?.let { return it }
            when (val response = holder.opt("response")) { is String -> return response; is JSONObject -> return response.toString() }
        }
        return ""
    }

    private fun chat(accountId: String, apiToken: String, system: String, user: String, maxTokens: Int, effort: String = "low", temperature: Double = 0.6): JSONObject {
        if (!Regex("[0-9a-fA-F]{32}").matches(accountId)) throw AiException("L'Account ID non è valido: sono 32 caratteri tra numeri e lettere a-f.")
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", system))
            .put(JSONObject().put("role", "user").put("content", user))
        // max_tokens also covers the reasoning; if an option is refused, the plain request is retried once.
        var (code, text) = post(accountId, apiToken, JSONObject().put("model", MODEL).put("messages", messages).put("max_tokens", maxTokens).put("temperature", temperature).put("reasoning_effort", effort))
        if (code == 400) post(accountId, apiToken, JSONObject().put("model", MODEL).put("messages", messages).put("max_tokens", maxTokens)).let { code = it.first; text = it.second }
        if (code !in 200..299) throw AiException(when (code) {
            401, 403 -> "Il token non è valido o non ha il permesso Workers AI. Ricrealo con il modello “Workers AI”."
            404 -> "Account non trovato. Controlla l'Account ID."
            429 -> "Hai esaurito la quota gratuita di oggi di Workers AI. Riprova domani."
            400 -> "Cloudflare ha rifiutato la richiesta. Controlla l'Account ID."
            else -> "Cloudflare non risponde (errore $code). Riprova tra poco."
        })
        return jsonOf(contentOf(runCatching { JSONObject(text) }.getOrNull())) ?: throw AiException("L'IA ha risposto in modo incomprensibile. Riprova.")
    }

    private fun post(accountId: String, apiToken: String, body: JSONObject): Pair<Int, String> {
        val url = URL("https://api.cloudflare.com/client/v4/accounts/${URLEncoder.encode(accountId, "UTF-8")}/ai/v1/chat/completions")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 80_000
            connection.doOutput = true
            connection.setRequestProperty("content-type", "application/json; charset=utf-8")
            connection.setRequestProperty("authorization", "Bearer $apiToken")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            return code to text
        } catch (error: java.io.IOException) {
            throw AiException("Non riesco a contattare l'IA. Controlla la connessione e riprova.")
        } finally {
            connection.disconnect()
        }
    }

    private fun ask(context: Context, user: String, maxTokens: Int, effort: String = "low", temperature: Double = 0.6, system: String = SYSTEM): JSONObject {
        if (!configured(context)) throw AiException(NOT_CONFIGURED)
        return chat(accountId(context), apiToken(context), system, user, maxTokens, effort, temperature)
    }

    /** Checks that the credentials can run the model; throws [AiException] otherwise. */
    fun verify(accountId: String, apiToken: String) {
        chat(accountId.trim(), apiToken.trim(), SYSTEM, "Rispondi con {\"ok\":true}", 200)
    }

    // --- what we know about the user ------------------------------------------------------------

    private fun label(m: Models.Media) = m.title + if (m.year.isNotEmpty() && m.year != "S.D.") " (${m.year})" else ""

    /** Active subscriptions, with the alternate ids TMDB uses for the same service (Netflix with ads, Prime with ads). */
    private fun subscriptionIds(store: LibraryStore): List<Int> =
        store.subscriptions().flatMap { when (it) { 8 -> listOf(8, 1796); 119 -> listOf(119, 2100); else -> listOf(it) } }.distinct()

    private fun counted(values: List<String>, limit: Int): List<String> =
        values.filter { it.isNotEmpty() }.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.take(limit).map { it.key }

    private fun decadeOf(year: String): String {
        val y = year.toIntOrNull()?.takeIf { year.length == 4 } ?: return ""
        val d = y / 10 * 10
        return if (d >= 2000) "anni $d" else "anni '${d.toString().takeLast(2)}"
    }

    /** A compact taste profile from the library, written for the model. */
    internal fun profileText(entries: List<Models.LibraryEntry>, subscriptionNames: List<String>): String {
        val liked = entries.filter { it.liked == true }.map { it.media }
        val disliked = entries.filter { it.liked == false }.map { it.media }
        val watching = entries.filter { it.state == "progress" }.map { it.media }
        val saved = entries.filter { it.state == "saved" }.map { it.media }
        return listOf(
            if (liked.isNotEmpty()) "Titoli che le sono piaciuti: ${liked.takeLast(25).joinToString("; ") { label(it) }}."
            else "Non ha ancora valutato titoli: non conosci i suoi gusti, basati sulla richiesta e sulla qualità.",
            if (liked.isNotEmpty()) "Generi preferiti: ${counted(liked.flatMap { it.genres }, 5).joinToString(", ").ifEmpty { "vari" }}. Epoche preferite: ${counted(liked.map { decadeOf(it.year) }, 3).joinToString(", ").ifEmpty { "varie" }}." else "",
            if (disliked.isNotEmpty()) "Titoli che NON le sono piaciuti: ${disliked.takeLast(12).joinToString("; ") { label(it) }}." else "",
            if (watching.isNotEmpty()) "Sta guardando: ${watching.takeLast(10).joinToString("; ") { label(it) }}." else "",
            if (saved.isNotEmpty()) "Vuole vedere: ${saved.takeLast(10).joinToString("; ") { label(it) }}." else "",
            if (subscriptionNames.isNotEmpty()) "Abbonamenti: ${subscriptionNames.joinToString(", ")}." else ""
        ).filter { it.isNotEmpty() }.joinToString("\n")
    }

    private fun profile(context: Context, store: LibraryStore): String {
        val active = store.subscriptions().toSet()
        return profileText(store.all().toList(), SubscriptionRepository.savedServices(context).filter { it.id in active }.map { it.name })
    }

    private fun knownIds(store: LibraryStore) = store.all().map { it.media.id }.toSet()
    private fun likedMedia(store: LibraryStore) = store.all().filter { it.liked == true }.map { it.media }

    // --- candidates from TMDB -------------------------------------------------------------------

    // Unbounded: tasks may wait on nested tasks, and every one of them is short network I/O.
    private val pool = Executors.newCachedThreadPool()

    /** Runs [work] on every item in parallel, keeping the order. */
    private fun <T, R> parallel(items: List<T>, work: (T) -> R): List<R> =
        items.map { item -> pool.submit(Callable { work(item) }) }.map { it.get() }

    private fun safe(work: () -> List<Models.Media>): List<Models.Media> = runCatching(work).getOrDefault(emptyList())

    /** Interleaves the lists, drops duplicates, known titles and media without a poster. */
    private fun mix(lists: List<List<Models.Media>>, exclude: Set<String>, limit: Int): List<Models.Media> {
        val out = mutableListOf<Models.Media>()
        val seen = HashSet<String>()
        var i = 0
        while (out.size < limit && lists.any { i < it.size }) {
            for (list in lists) {
                val m = list.getOrNull(i) ?: continue
                if (m.id in seen || m.id in exclude || m.poster.isEmpty() || m.tmdbId <= 0) continue
                seen.add(m.id)
                out.add(m)
                if (out.size >= limit) break
            }
            i++
        }
        return out
    }

    private fun normalized(value: String) = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD).lowercase().filter { it.isLetterOrDigit() }

    /** Matches a title the model named to its TMDB entry, scoring both titles, the year and how complete it is. */
    private fun resolveTitle(api: TmdbApi, title: String, year: Int?, type: String?): Models.Media? = runCatching {
        val wanted = normalized(title)
        fun score(m: Models.Media): Int {
            val titles = listOf(m.title, m.originalTitle).map(::normalized).filter { it.isNotEmpty() }
            val titleScore = when {
                titles.any { it == wanted } -> 0
                titles.any { it.startsWith(wanted) || wanted.startsWith(it) } -> 1
                titles.any { it.contains(wanted) || wanted.contains(it) } -> 2
                else -> 4
            }
            val gap = m.year.toIntOrNull()?.let { y -> year?.let { kotlin.math.abs(it - y) } }
            val yearScore = when { year == null -> 1; gap == null -> 3; gap == 0 -> 0; gap == 1 -> 1; else -> 4 }
            return titleScore * 3 + yearScore * 2 + (if (m.poster.isEmpty()) 3 else 0) + (if (m.overview == NO_PLOT) 1 else 0)
        }
        api.searchTitles(title, null).filter { type == null || it.mediaType == type }
            .minWithOrNull(compareBy<Models.Media>({ score(it) }, { -it.rating }))
            ?.takeIf { score(it) <= 9 }
    }.getOrNull()

    private data class Seed(val title: String, val year: Int?, val type: String?)

    private fun seedsOf(array: JSONArray?): List<Seed> = (0 until (array?.length() ?: 0)).mapNotNull { i ->
        val o = array!!.optJSONObject(i) ?: return@mapNotNull null
        Seed(clean(o.opt("title"), 120), o.optInt("year").takeIf { it > 1800 }, o.optString("type").takeIf { it == "movie" || it == "tv" })
            .takeIf { it.title.isNotEmpty() }
    }

    private fun resolveSeeds(api: TmdbApi, seeds: List<Seed>) = parallel(seeds.take(10)) { resolveTitle(api, it.title, it.year, it.type) }.filterNotNull()

    private fun recommendationsOf(api: TmdbApi, media: List<Models.Media>) = parallel(media) { m -> safe { api.recommendations(m, 1) } }

    // --- asking the model to choose -------------------------------------------------------------

    private val GENRE_IDS = linkedMapOf(
        "Azione" to (28 to 10759), "Avventura" to (12 to 10759), "Animazione" to (16 to 16), "Commedia" to (35 to 35),
        "Crime" to (80 to 80), "Documentario" to (99 to 99), "Dramma" to (18 to 18), "Famiglia" to (10751 to 10751),
        "Fantasy" to (14 to 10765), "Fantascienza" to (878 to 10765), "Guerra" to (10752 to 10768), "Horror" to (27 to 9648),
        "Mistero" to (9648 to 9648), "Musica" to (10402 to 0), "Romance" to (10749 to 18), "Storia" to (36 to 10768),
        "Thriller" to (53 to 80), "Western" to (37 to 37)
    )

    private fun poolText(items: List<Models.Media>) = items.mapIndexed { i, m ->
        val kind = if (m.mediaType == "tv") "serie" else "film"
        val original = if (m.originalTitle.isNotEmpty() && normalized(m.originalTitle) != normalized(m.title)) " / ${m.originalTitle}" else ""
        val plot = if (m.overview == NO_PLOT) "" else " — ${clean(m.overview, 170)}"
        "${i + 1}. ${m.title}$original ($kind, ${m.year}; ${m.genres.joinToString(", ").ifEmpty { "genere n.d." }}; voto ${String.format(java.util.Locale.ROOT, "%.1f", m.rating)})$plot"
    }.joinToString("\n")

    /** Asks the model to pick from a numbered pool. Picks outside the list are dropped. */
    private fun choose(context: Context, store: LibraryStore, items: List<Models.Media>, task: String, count: Int, temperature: Double = 0.6): Pair<String, List<Pair<Models.Media, String>>> {
        if (items.isEmpty()) return "" to emptyList()
        val prompt = listOf(
            profile(context, store), "", task, "",
            "Candidati (scegli solo da questa lista, usando il numero):",
            poolText(items), "",
            "Scegli i ${minOf(count, items.size)} candidati migliori, dal più adatto. Varia generi e toni quando la richiesta lo permette.",
            "Per ognuno scrivi \"reason\": una frase concreta in italiano (90-150 caratteri) sul perché fa per lei: cita un titolo che le è piaciuto o la sua richiesta, mai frasi generiche sul genere.",
            "Scrivi anche \"intro\": una frase breve e calda che introduce la selezione, come farebbe un amico esperto.",
            "Formato: {\"intro\":\"...\",\"items\":[{\"n\":3,\"reason\":\"...\"}]}"
        ).joinToString("\n")
        val data = ask(context, prompt, 2200, "low", temperature)
        val picks = mutableListOf<Pair<Models.Media, String>>()
        val used = HashSet<Int>()
        val array = data.optJSONArray("items") ?: JSONArray()
        for (i in 0 until array.length()) {
            val o = array.optJSONObject(i) ?: continue
            val n = o.optInt("n", o.optInt("id"))
            if (n !in 1..items.size || !used.add(n)) continue
            picks.add(items[n - 1] to capital(clean(o.opt("reason"), 220)))
            if (picks.size >= count) break
        }
        return clean(data.opt("intro"), 240) to picks
    }

    /** Adds the user's subscriptions that include each title (all flatrate services if none is set). */
    private fun withProviders(api: TmdbApi, store: LibraryStore, picks: List<Pair<Models.Media, String>>): List<AiResult> {
        val active = subscriptionIds(store).toSet()
        return parallel(picks) { (media, reason) ->
            val all = runCatching { api.subscriptionAvailability(media) }.getOrDefault(emptyList())
            AiResult(media, reason, if (active.isEmpty()) all else all.filter { it.id in active })
        }
    }

    // --- request understanding ------------------------------------------------------------------

    private class Plan(val types: List<String>, val filters: List<Map<String, String>>, val seeds: List<Seed>, val intro: String)

    /** Turns a free-text request into TMDB filters plus a few titles the model thinks fit (checked on TMDB later). */
    private fun plan(context: Context, store: LibraryStore, request: String, history: List<String>, type: String): Plan {
        val forced = type.takeIf { it == "movie" || it == "tv" }
        val now = LocalDate.now(TvGuideRepository.ROME).year
        val prompt = listOf(
            profile(context, store), "",
            if (history.isNotEmpty()) "Richieste precedenti in questa conversazione, dalla più vecchia: ${history.joinToString("; ") { "\"${clean(it, 200)}\"" }}." else "",
            "Richiesta attuale: \"${clean(request, 400).ifEmpty { "consigliami qualcosa che mi piacerà" }}\".",
            if (forced != null) "Vuole solo ${if (forced == "movie") "film" else "serie TV"}." else "",
            "",
            "Traduci la richiesta (combinata con quelle precedenti, se è un affinamento) in filtri per un catalogo:",
            "- \"type\": \"movie\", \"tv\" o \"all\".",
            "- \"genres\": generi da questa lista, solo se la richiesta li implica: ${GENRE_IDS.keys.joinToString(", ")}.",
            "- \"yearFrom\", \"yearTo\": anni come numeri o null (oggi è il $now; \"recente\" vuol dire dal ${now - 3}).",
            "- \"maxMinutes\": durata massima di un film in minuti o null.",
            "- \"language\": lingua originale ISO 639-1 (es. \"ko\", \"it\", \"ja\") solo se richiesta, altrimenti null.",
            "- \"seeds\": da 6 a 10 titoli reali e noti che rispondono esattamente alla richiesta, con titolo originale, anno e tipo. Evita quelli che conosce già.",
            "- \"intro\": una frase breve e naturale che dice cosa hai capito della richiesta.",
            "Formato: {\"type\":\"all\",\"genres\":[],\"yearFrom\":null,\"yearTo\":null,\"maxMinutes\":null,\"language\":null,\"seeds\":[{\"title\":\"...\",\"year\":2020,\"type\":\"movie\"}],\"intro\":\"...\"}"
        ).filter { it.isNotEmpty() }.joinToString("\n")
        val data = ask(context, prompt, 1800, "low", 0.5)
        val types = forced?.let { listOf(it) } ?: data.optString("type").takeIf { it == "movie" || it == "tv" }?.let { listOf(it) } ?: listOf("movie", "tv")
        val genreArray = data.optJSONArray("genres") ?: JSONArray()
        val genres = (0 until genreArray.length()).map { genreArray.optString(it) }.filter { it in GENRE_IDS }
        val yearFrom = data.optInt("yearFrom").takeIf { it > 1900 }
        val yearTo = data.optInt("yearTo").takeIf { it > 1900 }
        val maxMinutes = data.optInt("maxMinutes").takeIf { it > 30 }
        val language = data.optString("language").takeIf { Regex("[a-z]{2}").matches(it) }
        val filters = types.map { t ->
            val out = LinkedHashMap<String, String>()
            val ids = genres.map { if (t == "tv") GENRE_IDS.getValue(it).second else GENRE_IDS.getValue(it).first }.filter { it > 0 }.distinct()
            if (ids.isNotEmpty()) out["with_genres"] = ids.joinToString("|")
            val dateKey = if (t == "tv") "first_air_date" else "primary_release_date"
            yearFrom?.let { out["$dateKey.gte"] = "$it-01-01" }
            yearTo?.let { out["$dateKey.lte"] = "$it-12-31" }
            if (maxMinutes != null && t == "movie") out["with_runtime.lte"] = maxMinutes.toString()
            language?.let { out["with_original_language"] = it }
            out
        }
        return Plan(types, filters, seedsOf(data.optJSONArray("seeds")), clean(data.opt("intro"), 240))
    }

    private fun onSubscriptions(store: LibraryStore): Map<String, String> {
        val subs = subscriptionIds(store)
        return if (subs.isEmpty()) emptyMap() else mapOf("with_watch_providers" to subs.joinToString("|"), "with_watch_monetization_types" to "flatrate")
    }

    /** Real candidates for a plan: the model's seeds, then the catalog on the user's subscriptions. */
    private fun planPool(api: TmdbApi, store: LibraryStore, p: Plan, exclude: Set<String>, limit: Int): List<Models.Media> {
        fun catalog(extra: Map<String, String>): List<List<Models.Media>> = parallel(p.types.indices.flatMap { i ->
            listOf<Pair<String, Map<String, String>>>(
                p.types[i] to p.filters[i] + extra + mapOf("sort_by" to "popularity.desc", "vote_count.gte" to "80"),
                p.types[i] to p.filters[i] + extra + mapOf("sort_by" to "vote_average.desc", "vote_count.gte" to "400")
            )
        }) { (type, q) -> safe { api.discoverQuery(type, q) } }
        val onSubs = onSubscriptions(store)
        val seeds = pool.submit(Callable { resolveSeeds(api, p.seeds) })
        val lists = catalog(onSubs)
        var candidates = mix(listOf(seeds.get()) + lists, exclude, limit)
        if (candidates.size < 12 && onSubs.isNotEmpty()) candidates = mix(listOf(candidates) + catalog(emptyMap()), exclude, limit)
        return candidates
    }

    // --- features -------------------------------------------------------------------------------

    /** "Chiedi all'IA": understands the request, gathers real candidates, lets the model pick and explain. */
    fun recommend(context: Context, api: TmdbApi, store: LibraryStore, request: String, history: List<String>, type: String, exclude: List<String>): AiAnswer {
        val p = plan(context, store, request, history, type)
        val candidates = planPool(api, store, p, knownIds(store) + exclude, 40)
        val asked = (history + request).filter { it.isNotBlank() }.joinToString(", poi ") { "\"${clean(it, 200)}\"" }
        val (intro, picks) = choose(context, store, candidates, "Richiesta: ${asked.ifEmpty { "consigliami qualcosa che mi piacerà" }}.", 6, 0.7)
        return AiAnswer(intro.ifEmpty { p.intro }, withProviders(api, store, picks))
    }

    /** "Cerca a parole": the request becomes catalog filters; no ranking, so it is fast and literal. */
    fun search(context: Context, api: TmdbApi, store: LibraryStore, query: String, type: String, exclude: List<String>): AiAnswer {
        val p = plan(context, store, query, emptyList(), type)
        return AiAnswer(p.intro, planPool(api, store, p, exclude.toSet(), 24).map { AiResult(it, "", emptyList()) })
    }

    /** "Simili secondo l'IA": TMDB's recommendations and similar titles, ranked by what they share with [media]. */
    fun similar(context: Context, api: TmdbApi, store: LibraryStore, media: Models.Media, exclude: List<String>): AiAnswer {
        if (!configured(context)) throw AiException(NOT_CONFIGURED)
        val watched = store.all().filter { it.state == "watched" }.map { it.media.id }
        val (first, second, alike) = parallel(listOf<() -> List<Models.Media>>(
            { api.recommendations(media, 1) }, { api.recommendations(media, 2) }, { api.similar(media) }
        )) { safe(it) }
        val saga = if (media.collectionId > 0) safe { api.saga(media) }.map { it.id } else emptyList()
        val candidates = mix(listOf(first, alike, second), (watched + exclude + saga + media.id).toSet(), 36)
        val source = "\"${media.title}\" (${if (media.mediaType == "tv") "serie" else "film"}, ${media.year}; ${media.genres.joinToString(", ")}) — ${clean(media.overview, 300)}"
        val (intro, picks) = choose(context, store, candidates, "Cerca titoli simili a $source per atmosfera, temi, tono e stile, non solo per genere. Nella reason spiega cosa hanno in comune con \"${media.title}\".", 8, 0.5)
        return AiAnswer(intro, withProviders(api, store, picks))
    }

    private val verdicts = object : LinkedHashMap<String, Pair<Long, AiVerdict>>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Long, AiVerdict>>?) = size > 200
    }

    /** "Ti piacerà?": how well [m] fits the user's taste, with honest pros and cons. Cached for a day. */
    fun why(context: Context, store: LibraryStore, m: Models.Media): AiVerdict {
        val key = "${m.id}|${store.all().count { it.liked != null }}"
        synchronized(verdicts) { verdicts[key]?.takeIf { System.currentTimeMillis() - it.first < 86_400_000 }?.let { return it.second } }
        val prompt = listOf(
            profile(context, store), "",
            "Titolo da valutare: \"${m.title}\"${if (m.originalTitle.isNotEmpty() && m.originalTitle != m.title) " (${m.originalTitle})" else ""}, ${if (m.mediaType == "tv") "serie TV" else "film"} del ${m.year}; generi ${m.genres.joinToString(", ").ifEmpty { "n.d." }}; voto TMDB ${String.format(java.util.Locale.ROOT, "%.1f", m.rating)}.",
            "Trama: ${clean(m.overview, 600)}", "",
            "Valuta con onestà quanto le piacerà, in base ai suoi gusti. Se non conosci i suoi gusti, valuta la qualità e a chi è adatto.",
            "- \"score\": da 0 a 100.",
            "- \"verdict\": una frase in italiano (massimo 150 caratteri) con il tuo giudizio, citando un titolo che le è piaciuto se pertinente.",
            "- \"pros\": da 1 a 3 punti brevi (massimo 60 caratteri) per cui le piacerà.",
            "- \"cons\": da 0 a 2 punti brevi (massimo 60 caratteri) che potrebbero non convincerla. Niente spoiler.",
            "Formato: {\"score\":80,\"verdict\":\"...\",\"pros\":[\"...\"],\"cons\":[\"...\"]}"
        ).joinToString("\n")
        val data = ask(context, prompt, 1400, "low", 0.4)
        fun points(name: String, max: Int): List<String> {
            val a = data.optJSONArray(name) ?: return emptyList()
            return (0 until a.length()).map { capital(clean(a.opt(it), 80)) }.filter { it.isNotEmpty() }.take(max)
        }
        val value = AiVerdict(data.optDouble("score", 0.0).toInt().coerceIn(0, 100), capital(clean(data.opt("verdict"), 200)), points("pros", 3), points("cons", 2))
        synchronized(verdicts) { verdicts[key] = System.currentTimeMillis() to value }
        return value
    }

    /** "Stasera in TV": the evening's films and series on free TV that fit the user's taste. */
    fun tonight(context: Context, api: TmdbApi, store: LibraryStore): AiAnswer {
        if (!configured(context)) throw AiException(NOT_CONFIGURED)
        val guide = TvGuideRepository.load(context, false)
        val now = Instant.now()
        val today = LocalDate.now(TvGuideRepository.ROME)
        val hour = ZonedDateTime.now(TvGuideRepository.ROME).hour
        val from = if (hour >= 20 || hour < 3) now.minusSeconds(1800) else today.atTime(20, 0).atZone(TvGuideRepository.ROME).toInstant()
        val midnight = today.plusDays(1).atStartOfDay(TvGuideRepository.ROME).toInstant()
        val until = maxOf(from.plusSeconds(4 * 3600), midnight)
        val programmes = guide.programmes
            .filter { !it.start.isBefore(from) && it.start.isBefore(until) && it.end.isAfter(now) && (it.type == "movie" || it.type == "tv") && it.end.epochSecond - it.start.epochSecond >= 40 * 60 }
            .sortedBy { it.start }
            .take(90)
        if (programmes.isEmpty()) return AiAnswer("Stasera la guida TV non ha film o serie da proporti.", emptyList())
        val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm").withZone(TvGuideRepository.ROME)
        val lines = programmes.mapIndexed { i, p ->
            "${i + 1}. ${time.format(p.start)} ${p.channel} — ${p.searchTitle()} (${if (p.type == "tv") "serie" else "film"})${if (p.description.isNotEmpty()) ": ${clean(p.description, 110)}" else ""}"
        }.joinToString("\n")
        val prompt = listOf(
            profile(context, store), "",
            "Ecco i film e le serie in onda stasera sulla TV in chiaro:", lines, "",
            "Scegli da 3 a 5 programmi che le piaceranno di più, solo da questa lista e usando il numero. Preferisci titoli di qualità rispetto a repliche qualunque.",
            "Per ognuno scrivi \"reason\" (90-150 caratteri, in italiano) sul perché fa per lei. Aggiungi \"intro\", una frase breve sulla serata.",
            "Formato: {\"intro\":\"...\",\"items\":[{\"n\":4,\"reason\":\"...\"}]}"
        ).joinToString("\n")
        val data = ask(context, prompt, 1800, "low", 0.5)
        val chosen = mutableListOf<Pair<TvGuideRepository.Programme, String>>()
        val items = data.optJSONArray("items") ?: JSONArray()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val n = o.optInt("n")
            if (n in 1..programmes.size && chosen.none { it.first === programmes[n - 1] }) chosen.add(programmes[n - 1] to capital(clean(o.opt("reason"), 220)))
        }
        val tv = parallel(chosen.take(5)) { (programme, reason) ->
            AiTvResult(programme, runCatching { TvGuideRepository.recognize(programme, api.searchTitles(programme.searchTitle(), null)) }.getOrNull(), reason)
        }
        return AiAnswer(clean(data.opt("intro"), 240), emptyList(), tv)
    }

    /** "Serata in due": titles for the user and someone else, from what both of them like. */
    fun duo(context: Context, api: TmdbApi, store: LibraryStore, titles: List<String>, request: String, type: String, exclude: List<String>): AiAnswer {
        if (!configured(context)) throw AiException(NOT_CONFIGURED)
        val other = parallel(titles.take(6)) { resolveTitle(api, it, null, null) }.filterNotNull()
        if (other.isEmpty()) throw AiException("Non ho riconosciuto i titoli della seconda persona. Scrivine almeno uno, separandoli con una virgola.")
        val mine = likedMedia(store).shuffled().take(3)
        val only = type.takeIf { it == "movie" || it == "tv" }
        val lists = recommendationsOf(api, other + mine).map { list -> list.filter { only == null || it.mediaType == only } }
        val candidates = mix(lists, knownIds(store) + exclude + other.map { it.id }, 40)
        val task = listOfNotNull(
            "Serata in due: all'altra persona piacciono ${other.joinToString("; ") { label(it) }}.",
            request.takeIf { it.isNotBlank() }?.let { "Richiesta per la serata: \"${clean(it, 300)}\"." },
            "Scegli titoli che possano piacere a entrambi; nella reason spiega perché funziona per tutti e due."
        ).joinToString(" ")
        val (intro, picks) = choose(context, store, candidates, task, 6, 0.6)
        return AiAnswer(intro, withProviders(api, store, picks))
    }

    /** "Sorprendimi": a few bold picks off the beaten track, still on the user's subscriptions. */
    fun surprise(context: Context, api: TmdbApi, store: LibraryStore, type: String, exclude: List<String>): AiAnswer {
        if (!configured(context)) throw AiException(NOT_CONFIGURED)
        val types = type.takeIf { it == "movie" || it == "tv" }?.let { listOf(it) } ?: listOf("movie", "tv")
        val onSubs = onSubscriptions(store)
        fun page() = (1..5).random().toString()
        val queries: List<Pair<String, Map<String, String>>> = types.map { it to onSubs + mapOf("sort_by" to "vote_average.desc", "vote_count.gte" to "300", "page" to page()) } +
            types.map { it to onSubs + mapOf("sort_by" to "popularity.desc", "vote_average.gte" to "7", "vote_count.gte" to "150", "page" to page()) }
        val lists = parallel(queries) { (t, q) -> safe { api.discoverQuery(t, q) } } +
            recommendationsOf(api, likedMedia(store).shuffled().take(3)).map { list -> list.filter { it.mediaType in types } }
        val candidates = mix(lists, knownIds(store) + exclude, 40)
        val (intro, picks) = choose(context, store, candidates, "Sorprendimi: scegli titoli che non si aspetterebbe ma che le piaceranno, poco scontati. Nella reason spiega perché vale la pena rischiare.", 3, 0.9)
        return AiAnswer(intro, withProviders(api, store, picks))
    }

    /** "Scegli per me": the model picks one title from the advisor's candidates. */
    fun pick(context: Context, store: LibraryStore, candidates: List<Models.Media>): Models.Media? =
        choose(context, store, candidates.take(30), "Deve scegliere cosa guardare adesso: scegline uno solo, quello che le piacerà di più.", 1, 0.7).second.firstOrNull()?.first

    /**
     * A silent web search on the clues with the user's Tavily key, so "Ritrova un titolo" relies on real pages
     * instead of the model's memory alone. Without a key, or if Tavily fails, it is just empty.
     */
    private fun webClues(context: Context, clues: List<Pair<String, String>>): String {
        val key = tavilyKey(context).ifBlank { return "" }
        val query = clean("film o serie TV: ${clues.joinToString(" ") { it.second }}", 380)
        return runCatching {
            val connection = URL("https://api.tavily.com/search").openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"
                connection.connectTimeout = 10_000
                connection.readTimeout = 15_000
                connection.doOutput = true
                connection.setRequestProperty("content-type", "application/json")
                connection.setRequestProperty("authorization", "Bearer $key")
                connection.outputStream.use { it.write(JSONObject().put("query", query).put("search_depth", "basic").put("max_results", 6).toString().toByteArray(Charsets.UTF_8)) }
                if (connection.responseCode !in 200..299) return ""
                val results = JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).optJSONArray("results") ?: JSONArray()
                (0 until results.length()).mapNotNull { results.optJSONObject(it) }
                    .joinToString("\n") { "- ${clean(it.opt("title"), 120)}: ${clean(it.opt("content"), 350)}" }
            } finally {
                connection.disconnect()
            }
        }.getOrDefault("")
    }

    /** "Ritrova un titolo": guesses a title from vague clues, checked on TMDB, with a follow-up question. */
    fun identify(context: Context, api: TmdbApi, clues: List<Pair<String, String>>, exclude: List<String>): AiAnswer {
        val web = webClues(context, clues)
        val prompt = listOf(
            "Una persona cerca un film o una serie TV di cui non ricorda il nome. Ecco cosa ricorda:",
            clues.joinToString("\n") { (q, a) -> "- ${clean(q, 160)}: ${clean(a, 400)}" },
            if (exclude.isNotEmpty()) "Ha già escluso questi titoli, non riproporli: ${exclude.takeLast(40).joinToString("; ")}." else "",
            if (web.isNotEmpty()) "Risultati di una ricerca web sugli indizi (usali per essere preciso, ma solo se corrispondono davvero agli indizi):\n$web" else "",
            "",
            "Ragiona sugli indizi (i ricordi possono essere imprecisi) e individua da 1 a 6 titoli reali, dal più probabile.",
            "Per ognuno: titolo originale, anno, tipo (movie o tv) e \"reason\", una frase in italiano (massimo 150 caratteri) su quali indizi corrispondono.",
            "Aggiungi \"question\": una domanda semplice in italiano che distingue meglio tra i candidati, con \"options\": da 2 a 4 risposte brevi possibili.",
            "Aggiungi \"intro\": una frase breve, per esempio quanto sei sicuro.",
            "Formato: {\"intro\":\"...\",\"items\":[{\"title\":\"...\",\"year\":2020,\"type\":\"movie\",\"reason\":\"...\"}],\"question\":\"...\",\"options\":[\"...\",\"...\"]}"
        ).filter { it.isNotEmpty() }.joinToString("\n")
        val data = ask(context, prompt, 2600, "medium", 0.3, "Sei un esperto di cinema e serie TV bravissimo a riconoscere titoli da descrizioni vaghe. Rispondi sempre e solo con un oggetto JSON valido.")
        val items = data.optJSONArray("items") ?: JSONArray()
        val guesses = (0 until minOf(6, items.length())).mapNotNull { items.optJSONObject(it) }
        val results = parallel(guesses) { o ->
            resolveTitle(api, clean(o.opt("title"), 120), o.optInt("year").takeIf { it > 1800 }, o.optString("type").takeIf { it == "movie" || it == "tv" })
                ?.let { AiResult(it, capital(clean(o.opt("reason"), 220)), emptyList()) }
        }.filterNotNull().distinctBy { it.media.id }
        val options = data.optJSONArray("options") ?: JSONArray()
        return AiAnswer(
            clean(data.opt("intro"), 240), results,
            question = clean(data.opt("question"), 160),
            options = (0 until options.length()).map { clean(options.opt(it), 60) }.filter { it.isNotEmpty() }.take(4)
        )
    }
}
