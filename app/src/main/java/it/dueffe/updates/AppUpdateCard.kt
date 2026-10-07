package it.dueffe.updates

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

internal data class AppRelease(val code: Long, val name: String, val url: String, val sha256: String, val size: Long)

/** Public release metadata is advisory; the downloaded APK's identity and signature are verified too. */
internal object AppUpdates {
    private const val MAX_APK_BYTES = 250L * 1024 * 1024

    private fun connection(url: String): HttpURLConnection {
        require(URL(url).protocol == "https")
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("User-Agent", "Dueffe-App-Updater")
            setRequestProperty("Accept", "application/vnd.github+json")
        }
    }

    private fun json(url: String): String {
        val connection = connection(url)
        try {
            check(connection.responseCode == 200) { "Servizio aggiornamenti non disponibile (${connection.responseCode})" }
            return connection.inputStream.bufferedReader().use { reader ->
                val text = StringBuilder()
                val buffer = CharArray(8192)
                while (true) {
                    val count = reader.read(buffer)
                    if (count < 0) break
                    check(text.length + count <= 2_000_000) { "Risposta aggiornamenti troppo grande" }
                    text.append(buffer, 0, count)
                }
                text.toString()
            }
        } finally { connection.disconnect() }
    }

    @Suppress("DEPRECATION")
    fun installedCode(context: Context): Long = context.packageManager.getPackageInfo(context.packageName, 0).let {
        if (Build.VERSION.SDK_INT >= 28) it.longVersionCode else it.versionCode.toLong()
    }

    suspend fun latest(context: Context, repository: String, prefix: String, force: Boolean = false): AppRelease? = withContext(Dispatchers.IO) {
        require(repository.matches(Regex("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")))
        val cache = context.getSharedPreferences("app-update-checks", Context.MODE_PRIVATE)
        val cacheKey = "$repository/$prefix/${installedCode(context)}"
        val age = System.currentTimeMillis() - cache.getLong("checkedAt", 0)
        if (!force && cache.getString("key", null) == cacheKey && age in 0..(15 * 60 * 1000L)) {
            val cached = cache.getString("release", null)
            if (cached == null) return@withContext null
            val value = JSONObject(cached)
            return@withContext AppRelease(value.getLong("code"), value.getString("name"), value.getString("url"), value.getString("sha256"), value.getLong("size"))
        }
        fun cacheResult(result: AppRelease?) {
            val value = result?.let {
                JSONObject().put("code", it.code).put("name", it.name).put("url", it.url).put("sha256", it.sha256).put("size", it.size).toString()
            }
            cache.edit().putString("key", cacheKey).putLong("checkedAt", System.currentTimeMillis()).putString("release", value).apply()
        }
        var best: AppRelease? = null
        for (page in 1..20) {
            currentCoroutineContext().ensureActive()
            val releases = JSONArray(json("https://api.github.com/repos/$repository/releases?per_page=100&page=$page"))
            for (index in 0 until releases.length()) {
                currentCoroutineContext().ensureActive()
                val release = releases.getJSONObject(index)
                if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue
                val tag = release.getString("tag_name")
                if (!tag.matches(Regex("${Regex.escape(prefix)}-v[0-9]+\\.[0-9]+\\.[0-9]+"))) continue
                val assets = release.getJSONArray("assets")
                val metadata = (0 until assets.length()).map { assets.getJSONObject(it) }
                    .firstOrNull { it.optString("name") == "latest.json" } ?: continue
                val data = JSONObject(json(assetUrl(metadata, repository, tag)))
                val candidate = parseRelease(context.packageName, repository, prefix, release, data)
                if (candidate.code > installedCode(context) && candidate.code > (best?.code ?: 0L)) best = candidate
            }
            if (releases.length() < 100) { cacheResult(best); return@withContext best }
        }
        error("Troppe release: impossibile completare il controllo")
    }

    internal fun parseRelease(packageName: String, repository: String, prefix: String, release: JSONObject, data: JSONObject): AppRelease {
        val tag = release.getString("tag_name")
        check(!release.optBoolean("draft") && !release.optBoolean("prerelease")) { "Release non stabile" }
        check(data.getString("packageName") == packageName) { "Metadati di un'altra app" }
        val name = data.getString("versionName")
        check(name.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")) && tag == "$prefix-v$name") { "Versione release non valida" }
        val hash = data.getString("sha256")
        check(hash.matches(Regex("[a-fA-F0-9]{64}"))) { "Checksum non valido" }
        val assets = release.getJSONArray("assets")
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }
            .firstOrNull { it.optString("name") == data.getString("apk") } ?: error("APK della release non disponibile")
        check(apk.getString("name").endsWith(".apk")) { "File APK non valido" }
        val size = apk.getLong("size")
        check(size in 1..MAX_APK_BYTES) { "Dimensione APK non valida" }
        val code = data.getLong("versionCode")
        check(code > 0) { "Codice versione non valido" }
        return AppRelease(code, name, assetUrl(apk, repository, tag), hash, size)
    }

    private fun assetUrl(asset: JSONObject, repository: String, tag: String): String {
        val url = asset.getString("browser_download_url")
        check(url.startsWith("https://github.com/$repository/releases/download/$tag/")) { "Origine download non valida" }
        return url
    }

    suspend fun download(context: Context, release: AppRelease, progress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "app-updates").apply { mkdirs() }
        val target = File(directory, "update-${release.code}.apk")
        // Keep only the current APK; no broad storage access is needed.
        directory.listFiles()?.filter {
            it != target && (it.extension == "apk" || System.currentTimeMillis() - it.lastModified() > 24 * 60 * 60 * 1000L)
        }?.forEach { it.delete() }
        if (target.exists()) {
            try { verify(context, target, release); return@withContext target }
            catch (_: Exception) { target.delete() }
        }
        val partial = File.createTempFile("update-${release.code}-", ".part", directory)
        val connection = connection(release.url)
        try {
            check(connection.responseCode == 200) { "Download non disponibile (${connection.responseCode})" }
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var downloaded = 0L
                    var lastProgress = -1
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        downloaded += count
                        check(downloaded <= release.size && downloaded <= MAX_APK_BYTES) { "Dimensione download non valida" }
                        output.write(buffer, 0, count)
                        val percent = (downloaded * 100 / release.size).toInt()
                        if (percent != lastProgress) { lastProgress = percent; withContext(Dispatchers.Main) { progress(percent) } }
                    }
                }
            }
            verify(context, partial, release)
            check(partial.renameTo(target)) { "Impossibile salvare l'aggiornamento" }
            target
        } finally { connection.disconnect(); partial.delete() }
    }

    @Suppress("DEPRECATION")
    private fun verify(context: Context, file: File, release: AppRelease) {
        check(file.length() == release.size) { "Download incompleto" }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        check(hash.equals(release.sha256, ignoreCase = true)) { "Il file scaricato non supera il controllo di integrità" }
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val apk = pm.getPackageArchiveInfo(file.absolutePath, flags) ?: error("APK non valido")
        val installed = pm.getPackageInfo(context.packageName, flags)
        check(apk.packageName == context.packageName) { "L'APK appartiene a un'altra app" }
        val code = if (Build.VERSION.SDK_INT >= 28) apk.longVersionCode else apk.versionCode.toLong()
        check(code == release.code && code > installedCode(context) && apk.versionName == release.name) { "Versione APK non valida" }
        val apkSignatures = if (Build.VERSION.SDK_INT >= 28) apk.signingInfo?.apkContentsSigners else apk.signatures
        val installedSignatures = if (Build.VERSION.SDK_INT >= 28) installed.signingInfo?.apkContentsSigners else installed.signatures
        check(!apkSignatures.isNullOrEmpty() && !installedSignatures.isNullOrEmpty() &&
            apkSignatures.toSet() == installedSignatures.toSet()) { "La firma dell'aggiornamento non corrisponde a quella dell'app installata" }
    }

    fun install(context: Context, file: File) {
        check(file.isFile) { "APK non disponibile: scarica nuovamente l'aggiornamento" }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
    }
}

@Composable
fun AppUpdateCard(prefix: String, repository: String) {
    val context = LocalContext.current
    // Debug builds have a different identity/signature and cannot consume release APKs.
    if (context.packageName.endsWith(".debug")) return
    val scope = rememberCoroutineScope()
    var release by remember { mutableStateOf<AppRelease?>(null) }
    var checking by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }
    var progress by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var readyPath by rememberSaveable { mutableStateOf<String?>(null) }
    val installedName = remember { context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty() }
    fun installReady() {
        readyPath?.let { path ->
            try { AppUpdates.install(context, File(path)); error = null }
            catch (e: Exception) { error = e.message ?: "Impossibile aprire l'installazione" }
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()) installReady()
        else error = "Per aggiornare, autorizza l'installazione da questa app e riprova."
    }
    fun requestInstall() {
        try {
            if (Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()) installReady()
            else permissionLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
        } catch (e: Exception) { error = e.message ?: "Impossibile aprire le impostazioni Android" }
    }
    fun checkUpdates(force: Boolean = false) {
        scope.launch {
            checking = true; error = null
            try { release = AppUpdates.latest(context, repository, prefix, force) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = "Controllo non riuscito. Verifica la connessione e riprova." }
            finally { checking = false }
        }
    }
    LaunchedEffect(repository, prefix) { checkUpdates() }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Aggiornamenti", style = MaterialTheme.typography.titleMedium)
            Text("Versione installata: $installedName", style = MaterialTheme.typography.bodySmall)
            when {
                checking -> Text("Controllo aggiornamenti…")
                downloading -> {
                    Text("Download aggiornamento: $progress%")
                    LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
                }
                release != null -> {
                    val available = release!!
                    Text("Disponibile la versione ${available.name}")
                    Button(onClick = {
                        scope.launch {
                            downloading = true; progress = 0; error = null
                            try {
                                val file = AppUpdates.download(context, available) { progress = it }
                                readyPath = file.absolutePath
                                requestInstall()
                            } catch (e: CancellationException) { throw e }
                            catch (e: Exception) { error = e.message ?: "Download non riuscito. Riprova." }
                            finally { downloading = false }
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text("Aggiorna alla versione ${available.name}") }
                    Text("Android chiederà di confermare l'installazione.", style = MaterialTheme.typography.bodySmall)
                }
                error == null -> Text("Nessun aggiornamento disponibile.")
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (!checking && !downloading) TextButton(onClick = { checkUpdates(true) }) { Text("Controlla aggiornamenti") }
        }
    }
}
