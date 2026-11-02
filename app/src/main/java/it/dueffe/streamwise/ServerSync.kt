package it.dueffe.streamwise

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder

/**
 * "Server mode": the library, followed releases and people, TV reminders and preferences live on the
 * user's StreamWise server (the PWA on CasaOS) with the same account as the web app. The phone keeps
 * its SharedPreferences as a copy, so every screen works unchanged and offline in read-only mode:
 * each local write is sent to the server right away, and the copy is replaced by the server's data
 * on every refresh. A write the server refuses (or cannot receive) is undone by the next refresh.
 */
internal object ServerSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    private val client = ServerClient()
    private var serverStore: ServerStore? = null

    /** Library as last seen on the server (id → entry JSON), to send only what changed. */
    private var synced: Map<String, String> = emptyMap()

    private val _errors = MutableSharedFlow<String>(extraBufferCapacity = 4)
    /** Messages for a Toast: writes the server did not accept. */
    val errors: SharedFlow<String> = _errors.asSharedFlow()

    private val _status = MutableStateFlow<Pair<Long, String?>>(0L to null)
    /** Last successful refresh time and the last error, for the settings card. */
    val status: StateFlow<Pair<Long, String?>> = _status.asStateFlow()

    fun store(context: Context): ServerStore =
        serverStore ?: synchronized(this) { serverStore ?: ServerStore(context.applicationContext).also { serverStore = it } }

    fun config(context: Context): ServerConfig? = store(context).config.value
    fun active(context: Context): Boolean = config(context) != null

    // --- reading ---------------------------------------------------------------------------------

    /** Replaces the phone's copy with the server's data when it changed. Returns false on failure. */
    suspend fun pull(context: Context, force: Boolean = false): Boolean = mutex.withLock { pullLocked(context, force) }

    private suspend fun pullLocked(context: Context, force: Boolean): Boolean {
        val config = config(context) ?: return false
        val store = store(context)
        return try {
            val state = client.state(config, if (force) -1 else store.revision)
            if (!state.optBoolean("unchanged")) {
                apply(context, state)
                store.revision = state.optLong("revision", -1)
            }
            _status.value = System.currentTimeMillis() to null
            true
        } catch (e: Exception) {
            _status.value = _status.value.first to (e.message ?: "Server non raggiungibile")
            false
        }
    }

    /** Called every 30 seconds while the app is visible: one tiny request when nothing changed. */
    fun refresh(context: Context) {
        if (active(context)) scope.launch { pull(context) }
    }

    private fun apply(context: Context, state: JSONObject) {
        val app = context.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE)
        val prefs = state.optJSONObject("prefs") ?: JSONObject()
        val library = state.optJSONArray("library") ?: JSONArray()
        val editor = app.edit()
            .putString("library", library.toString())
            .putString("genres", (prefs.optJSONArray("genres") ?: JSONArray()).toString())
            .putString("subscriptions", (prefs.optJSONArray("subscriptions") ?: JSONArray()).toString())
            .putBoolean("hide-show-credits", prefs.optBoolean("hide-show-credits", prefs.optBoolean("hideShowCredits", true)))
            .putBoolean("onboarding-done", prefs.optBoolean("onboardingDone", app.getBoolean("onboarding-done", false)))
        prefs.optJSONObject("subscriptionFilters")?.let { filters -> filters.keys().forEach { editor.putString("subscription-filter-$it", filters.optString(it, "{}")) } }
        prefs.optJSONObject("librarySort")?.let { sorts -> sorts.keys().forEach { editor.putString("library-sort-$it", sorts.optString(it, "TITLE")) } }
        prefs.optJSONObject("libraryGrid")?.let { grids -> grids.keys().forEach { editor.putBoolean("library-grid-$it", grids.optBoolean(it)) } }
        editor.commit()
        synced = libraryMap(library)

        val follows = ReleaseFollows.prefs(context).edit().clear()
        state.optJSONArray("follows")?.let { list ->
            for (i in 0 until list.length()) list.optJSONObject(i)?.let { o ->
                val f = ReleaseFollows.Follow.from(o)
                if (f.media.id.isNotEmpty()) follows.putString(f.media.id, f.json().toString())
            }
        }
        follows.commit()

        val people = PersonFollows.prefs(context).edit().clear()
        state.optJSONArray("people")?.let { list ->
            for (i in 0 until list.length()) list.optJSONObject(i)?.let { o ->
                val f = PersonFollows.Follow.from(o)
                if (f.person.id > 0) people.putString(f.key(), f.json().toString())
            }
        }
        people.commit()

        // TV reminders set on the web ring on this phone too (exact alarms), and the other way round.
        val reminders = state.optJSONArray("reminders") ?: JSONArray()
        val remote = (0 until reminders.length()).mapNotNull { reminders.optJSONObject(it) }.associateBy { it.optString("key") }
        val local = TvReminderReceiver.prefs(context)
        for (key in local.all.keys.toList()) if (key !in remote) TvReminderReceiver.cancelLocally(context, key)
        for ((key, o) in remote) if (!local.contains(key) && o.optLong("start") > System.currentTimeMillis()) {
            val record = JSONObject().put("title", o.optString("title")).put("channel", o.optString("channel"))
                .put("start", o.optLong("start")).put("end", o.optLong("end")).put("minutes", o.optInt("minutes")).put("trigger", o.optLong("trigger"))
            if (TvReminderReceiver.exactAllowed(context)) TvReminderReceiver.schedule(context, key, record)
            local.edit().putString(key, record.toString()).commit()
        }
        context.getSharedPreferences("server-notices", Context.MODE_PRIVATE).edit()
            .putString("list", (state.optJSONArray("notices") ?: JSONArray()).toString()).commit()
        ReleaseCheckWorker.schedule(context)
    }

    private fun libraryMap(library: JSONArray): Map<String, String> =
        (0 until library.length()).mapNotNull { library.optJSONObject(it) }.associate { Models.LibraryEntry.from(it).let { e -> e.media.id to e.json().toString() } }

    // --- writing ---------------------------------------------------------------------------------

    /** One server call, then a refresh; on failure the message is shown and the server's data comes back. */
    private fun write(context: Context, call: suspend (ServerConfig) -> Unit) {
        val config = config(context) ?: return
        scope.launch {
            mutex.withLock {
                try {
                    call(config)
                } catch (e: Exception) {
                    _errors.tryEmit(e.message ?: "Salvataggio sul server non riuscito")
                    _status.value = _status.value.first to e.message
                }
                pullLocked(context, force = false)
            }
        }
    }

    /** LibraryStore.persist(): sends the entries that changed or disappeared since the last sync. */
    fun libraryChanged(context: Context, entries: Collection<Models.LibraryEntry>) {
        if (!active(context)) return
        val current = entries.associate { it.media.id to it.json().toString() }
        val changed = current.filter { (id, json) -> synced[id] != json }
        val removed = synced.keys - current.keys
        if (changed.isEmpty() && removed.isEmpty()) return
        synced = current
        write(context) { config ->
            for ((_, json) in changed) client.post(config, "/api/library", JSONObject(json))
            for (id in removed) client.delete(config, "/api/library?id=" + enc(id))
        }
    }

    /** Genres, subscriptions, filters, sorting, grid views, filmography filter, onboarding. */
    fun prefsChanged(context: Context) {
        if (!active(context)) return
        val app = context.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE)
        val filters = JSONObject()
        val sorts = JSONObject()
        val grids = JSONObject()
        for ((key, value) in app.all) when {
            key.startsWith("subscription-filter-") -> filters.put(key.removePrefix("subscription-filter-"), value.toString())
            key.startsWith("library-sort-") -> sorts.put(key.removePrefix("library-sort-"), value.toString())
            key.startsWith("library-grid-") -> grids.put(key.removePrefix("library-grid-"), value == true)
        }
        val body = JSONObject()
            .put("genres", runCatching { JSONArray(app.getString("genres", "[]")) }.getOrDefault(JSONArray()))
            .put("subscriptions", runCatching { JSONArray(app.getString("subscriptions", "[]")) }.getOrDefault(JSONArray()))
            .put("subscriptionFilters", filters).put("librarySort", sorts).put("libraryGrid", grids)
            .put("hideShowCredits", app.getBoolean("hide-show-credits", true))
            .put("onboardingDone", app.getBoolean("onboarding-done", false))
        write(context) { config -> client.post(config, "/api/prefs", body) }
    }

    fun followSaved(context: Context, follow: JSONObject) = write(context) { client.post(it, "/api/follows", follow) }
    fun followRemoved(context: Context, id: String) = write(context) { client.delete(it, "/api/follows?id=" + enc(id)) }
    fun personSaved(context: Context, follow: JSONObject) = write(context) { client.post(it, "/api/people", follow) }
    fun personRemoved(context: Context, key: String) = write(context) { client.delete(it, "/api/people?key=" + enc(key)) }

    fun reminderSaved(context: Context, key: String, record: JSONObject) = write(context) { config ->
        client.post(config, "/api/reminders", JSONObject(record.toString()).put("key", key))
    }
    fun reminderRemoved(context: Context, key: String) = write(context) { client.delete(it, "/api/reminders?key=" + enc(key)) }

    /** Restoring a JSON backup in server mode replaces the account's data on the server. */
    suspend fun importBackup(context: Context, json: String): Boolean {
        val config = config(context) ?: return false
        return mutex.withLock {
            try {
                client.importBackup(config, json)
                pullLocked(context, force = true)
            } catch (e: Exception) {
                _errors.tryEmit(e.message ?: "Ripristino non riuscito")
                false
            }
        }
    }

    // --- notifications ---------------------------------------------------------------------------

    /** Shows on this phone the notifications the server sent for new episodes, releases and credits. */
    fun showNotices(context: Context) {
        val store = store(context)
        val shown = store.shownReminders.toMutableSet()
        val first = shown.isEmpty()
        val notices = context.getSharedPreferences("server-notices", Context.MODE_PRIVATE).getString("list", "[]")
        val list = runCatching { JSONArray(notices) }.getOrDefault(JSONArray())
        for (i in 0 until list.length()) {
            val n = list.optJSONObject(i) ?: continue
            val id = n.optString("id")
            if (id.isEmpty() || !shown.add(id)) continue
            // Connecting the phone never replays the past week of notices.
            if (first) continue
            ReleaseCheckWorker.notifyFromServer(context, n)
        }
        store.shownReminders = shown.toList().takeLast(200).toSet()
    }

    /** The worker's job in server mode: refresh the copy, then show what the server announced. */
    suspend fun backgroundCheck(context: Context) {
        if (pull(context, force = true)) showNotices(context)
    }

    /** For ReleaseCheckWorker (a plain Worker, already on a background thread). */
    fun backgroundCheckBlocking(context: Context) {
        runCatching { kotlinx.coroutines.runBlocking { backgroundCheck(context) } }
    }

    // --- connecting ------------------------------------------------------------------------------

    /** What each side holds, for the "Quali dati vuoi usare?" question. */
    data class Counts(val titles: Int, val follows: Int)

    fun phoneCounts(context: Context): Counts {
        val library = runCatching { JSONArray(context.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE).getString("library", "[]")) }.getOrDefault(JSONArray())
        return Counts(library.length(), ReleaseFollows.prefs(context).all.size + PersonFollows.prefs(context).all.size)
    }

    /** Logs in (or creates the account) without switching anything yet; returns the server's counts. */
    suspend fun login(url: String, username: String, password: String, register: Boolean): Pair<ServerConfig, Counts> {
        val base = ServerClient.normalizeUrl(url)
        val token = client.login(base, username.trim(), password, register)
        val config = ServerConfig(base, username.trim(), token)
        val state = client.state(config, -1)
        val counts = Counts(state.optJSONArray("library")?.length() ?: 0, (state.optJSONArray("follows")?.length() ?: 0) + (state.optJSONArray("people")?.length() ?: 0))
        return config to counts
    }

    private fun snapshotFile(context: Context) = File(context.filesDir, "dati-prima-del-server.json")

    /**
     * Switches server mode on. The phone's data is saved to a file first, so turning server mode off
     * can bring it back. [usePhoneData] uploads the phone's library to the account (replacing it).
     */
    suspend fun connect(context: Context, store: LibraryStore, config: ServerConfig, usePhoneData: Boolean) {
        snapshotFile(context).writeText(store.exportJson())
        val serverStore = store(context)
        serverStore.save(config.url, config.username, config.token)
        try {
            if (usePhoneData) {
                client.importBackup(config, store.exportJson())
                prefsChanged(context)
            }
            if (!pull(context, force = true)) throw ServerException(_status.value.second ?: "Server non raggiungibile")
            serverStore.shownReminders = emptySet()
        } catch (e: Exception) {
            // Never leave the app half in server mode.
            serverStore.clear()
            synced = emptyMap()
            throw e
        }
    }

    /** Switches server mode off; [restorePrevious] brings back the data the phone had before. */
    suspend fun disconnect(context: Context, store: LibraryStore, restorePrevious: Boolean) {
        config(context)?.let { client.logout(it) }
        store(context).clear()
        synced = emptyMap()
        val snapshot = snapshotFile(context)
        if (restorePrevious && snapshot.exists()) store.importJson(snapshot.readText())
        snapshot.delete()
        ReleaseCheckWorker.schedule(context)
    }

    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
}
