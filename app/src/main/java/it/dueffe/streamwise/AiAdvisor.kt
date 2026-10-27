package it.dueffe.streamwise

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/** A title suggested by the AI, before it is matched to a TMDB entry. */
internal data class AiPick(val title: String, val year: Int?, val type: String, val reason: String)

/** Client for the StreamWise AI Worker (see ai-worker/), which runs the model on Cloudflare Workers AI. */
internal object AiAdvisor {
    val available: Boolean get() = BuildConfig.AI_ENDPOINT.isNotBlank() && BuildConfig.AI_KEY.isNotBlank()

    /** Blocking call; run it off the main thread. */
    fun recommend(
        type: String,
        request: String,
        liked: List<String>,
        disliked: List<String>,
        watching: List<String>,
        exclude: List<String>,
        count: Int = 8
    ): List<AiPick> {
        val body = JSONObject()
            .put("type", type)
            .put("request", request)
            .put("liked", JSONArray(liked))
            .put("disliked", JSONArray(disliked))
            .put("watching", JSONArray(watching))
            .put("exclude", JSONArray(exclude))
            .put("count", count)
        val connection = URL(BuildConfig.AI_ENDPOINT).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 45_000
            connection.doOutput = true
            connection.setRequestProperty("content-type", "application/json; charset=utf-8")
            connection.setRequestProperty("x-streamwise-key", BuildConfig.AI_KEY)
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (connection.responseCode !in 200..299) error("AI ${connection.responseCode}")
            val items = JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).optJSONArray("items") ?: JSONArray()
            return (0 until items.length()).mapNotNull { index ->
                val item = items.optJSONObject(index) ?: return@mapNotNull null
                val title = item.optString("title").trim()
                val kind = item.optString("type")
                if (title.isEmpty() || (kind != "movie" && kind != "tv")) null
                else AiPick(title, item.optInt("year").takeIf { it > 1800 }, kind, item.optString("reason").trim())
            }
        } finally {
            connection.disconnect()
        }
    }
}
