package it.dueffe.streamwise

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONArray
import org.json.JSONObject

/** A title suggested by the AI, before it is matched to a TMDB entry. */
internal data class AiPick(val title: String, val year: Int?, val type: String, val reason: String)

/** Candidates for a title the user cannot name, plus a question to narrow them down. */
internal data class AiIdentification(val picks: List<AiPick>, val question: String, val options: List<String>)

/** A Workers AI failure with a message ready to show to the user. */
internal class AiException(message: String) : Exception(message)

/**
 * Runs the recommendations on Cloudflare Workers AI with the user's own account: the Account ID and
 * API token are entered in Settings, kept only on this device and sent only to api.cloudflare.com.
 */
internal object AiAdvisor {
    private const val MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    private const val PREFS = "streamwise-ai"
    private const val ACCOUNT_ID = "account-id"
    private const val API_TOKEN = "api-token"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun accountId(context: Context): String = prefs(context).getString(ACCOUNT_ID, "").orEmpty()
    fun apiToken(context: Context): String = prefs(context).getString(API_TOKEN, "").orEmpty()
    fun configured(context: Context): Boolean = accountId(context).isNotBlank() && apiToken(context).isNotBlank()

    fun save(context: Context, accountId: String, apiToken: String) {
        prefs(context).edit().putString(ACCOUNT_ID, accountId.trim()).putString(API_TOKEN, apiToken.trim()).apply()
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    /** Blocking check that the credentials can run the model; throws [AiException] otherwise. */
    fun verify(accountId: String, apiToken: String) {
        run(accountId.trim(), apiToken.trim(), JSONArray().put(JSONObject().put("role", "user").put("content", "Rispondi solo: ok")), 5)
    }

    /** Blocking call; run it off the main thread. */
    fun recommend(
        context: Context,
        type: String,
        request: String,
        liked: List<String>,
        disliked: List<String>,
        watching: List<String>,
        exclude: List<String>,
        count: Int = 8
    ): List<AiPick> {
        if (!configured(context)) throw AiException("Configura l'IA nelle Impostazioni con il tuo account Cloudflare.")
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "Sei un esperto di cinema e serie TV che dà consigli personali, concreti e motivati in italiano. Rispondi sempre e solo con JSON valido."))
            .put(JSONObject().put("role", "user").put("content", prompt(type, request, liked, disliked, watching, exclude, count.coerceIn(3, 10))))
        return parseItems(run(accountId(context), apiToken(context), messages, 900, 0.8))
    }

    /** Blocking call: films and series similar to one title, motivated by what they share with it. */
    fun similar(
        context: Context,
        title: String,
        year: String,
        type: String,
        genres: List<String>,
        liked: List<String>,
        exclude: List<String>,
        count: Int = 8
    ): List<AiPick> {
        if (!configured(context)) throw AiException("Configura l'IA nelle Impostazioni con il tuo account Cloudflare.")
        val kind = if (type == "tv") "serie TV" else "film"
        val source = "\"$title\"" + (if (year.isNotBlank()) " ($kind, $year)" else " ($kind)") + (if (genres.isNotEmpty()) ", genere ${genres.joinToString(", ")}" else "")
        val prompt = listOf(
            "Consiglia ${count.coerceIn(3, 10)} titoli tra film e serie TV simili a $source per atmosfera, temi, tono e stile, non solo per genere.",
            if (liked.isNotEmpty()) "Per variare la scelta, tieni conto che alla persona sono piaciuti anche: ${liked.joinToString("; ")}." else "",
            "Non proporre \"$title\" né suoi sequel, prequel o spin-off." + (if (exclude.isNotEmpty()) " Evita anche questi titoli, li conosce già: ${exclude.joinToString("; ")}." else ""),
            "Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.",
            "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
            "La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi cosa ha in comune con \"$title\".",
            "Rispondi solo con JSON nel formato {\"items\":[{\"title\":\"...\",\"year\":2020,\"type\":\"movie\",\"reason\":\"...\"}]}."
        ).filter { it.isNotEmpty() }.joinToString("\n")
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "Sei un esperto di cinema e serie TV che dà consigli personali, concreti e motivati in italiano. Rispondi sempre e solo con JSON valido."))
            .put(JSONObject().put("role", "user").put("content", prompt))
        return parseItems(run(accountId(context), apiToken(context), messages, 900, 0.7))
    }

    /**
     * Blocking call: guesses a title the user cannot name from their answers ([clues] as question to answer).
     * Besides the candidates it returns a follow-up question, used when none of them is the right one.
     */
    fun identify(context: Context, clues: List<Pair<String, String>>, exclude: List<String>): AiIdentification {
        if (!configured(context)) throw AiException("Configura l'IA nelle Impostazioni con il tuo account Cloudflare.")
        val prompt = listOf(
            "Una persona cerca un film o una serie TV di cui non ricorda il nome. Ecco cosa ricorda, domanda per domanda:",
            clues.joinToString("\n") { (question, answer) -> "- $question: ${answer.take(400)}" },
            if (exclude.isNotEmpty()) "Ha già escluso questi titoli, non riproporli: ${exclude.joinToString("; ")}." else "",
            "Individua da 1 a 5 titoli reali che corrispondono meglio agli indizi, dal più probabile al meno probabile. Considera che i ricordi possono essere imprecisi.",
            "Per ogni titolo indica il titolo originale, l'anno di uscita, il tipo (movie o tv) e, nel campo reason, una frase in italiano di massimo 140 caratteri che spieghi quali indizi corrispondono.",
            "Aggiungi una domanda semplice in italiano (question) che aiuterebbe a distinguere tra i candidati o a trovare quello giusto se nessuno lo è, con da 2 a 4 risposte brevi possibili (options).",
            "Rispondi solo con JSON nel formato {\"items\":[{\"title\":\"...\",\"year\":2020,\"type\":\"movie\",\"reason\":\"...\"}],\"question\":\"...\",\"options\":[\"...\",\"...\"]}."
        ).filter { it.isNotEmpty() }.joinToString("\n")
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "Sei un esperto di cinema e serie TV bravissimo a riconoscere titoli da descrizioni vaghe. Rispondi sempre e solo con JSON valido."))
            .put(JSONObject().put("role", "user").put("content", prompt))
        val response = run(accountId(context), apiToken(context), messages, 900, 0.3)
        val data = toJson(response)
        val options = data?.optJSONArray("options")
        return AiIdentification(
            parseItems(response).take(5),
            data?.optString("question").orEmpty().trim().take(160),
            (0 until (options?.length() ?: 0)).map { options!!.optString(it).trim().take(60) }.filter { it.isNotEmpty() }.take(4)
        )
    }

    private fun prompt(type: String, request: String, liked: List<String>, disliked: List<String>, watching: List<String>, exclude: List<String>, count: Int): String {
        val kind = when (type) { "movie" -> "solo film"; "tv" -> "solo serie TV"; else -> "film o serie TV" }
        return listOf(
            "Consiglia $count titoli ($kind) per una persona con questi gusti.",
            if (liked.isNotEmpty()) "Le sono piaciuti: ${liked.joinToString("; ")}." else "Non conosci ancora i suoi gusti: motiva i titoli con la richiesta e con le loro qualità, senza inventare titoli che le sarebbero piaciuti.",
            if (disliked.isNotEmpty()) "Non le sono piaciuti: ${disliked.joinToString("; ")}." else "",
            if (watching.isNotEmpty()) "Sta guardando: ${watching.joinToString("; ")}." else "",
            if (request.isNotBlank()) "Richiesta per stasera: \"${request.take(300)}\"." else "",
            if (exclude.isNotEmpty()) "Non proporre questi titoli, li conosce già: ${exclude.joinToString("; ")}." else "",
            "Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.",
            "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
            "La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi perché le piacerà: cita un titolo che le è piaciuto o la sua richiesta, non limitarti al genere.",
            "Rispondi solo con JSON nel formato {\"items\":[{\"title\":\"...\",\"year\":2020,\"type\":\"movie\",\"reason\":\"...\"}]}."
        ).filter { it.isNotEmpty() }.joinToString("\n")
    }

    /** Returns the model's `result.response`, a string or an already parsed object. */
    private fun run(accountId: String, apiToken: String, messages: JSONArray, maxTokens: Int, temperature: Double = 0.2): Any? {
        if (!Regex("[0-9a-fA-F]{32}").matches(accountId)) throw AiException("L'Account ID non è valido: sono 32 caratteri tra numeri e lettere a-f.")
        val url = URL("https://api.cloudflare.com/client/v4/accounts/${URLEncoder.encode(accountId, "UTF-8")}/ai/run/$MODEL")
        val body = JSONObject().put("messages", messages).put("max_tokens", maxTokens).put("temperature", temperature)
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 45_000
            connection.doOutput = true
            connection.setRequestProperty("content-type", "application/json; charset=utf-8")
            connection.setRequestProperty("authorization", "Bearer $apiToken")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) throw AiException(when (code) {
                400 -> "Cloudflare ha rifiutato la richiesta. Controlla l'Account ID."
                401, 403 -> "Il token non è valido o non ha il permesso Workers AI. Ricrealo con il modello “Workers AI”."
                404 -> "Account non trovato. Controlla l'Account ID."
                429 -> "Hai esaurito la quota gratuita di oggi di Workers AI. Riprova domani."
                else -> "Cloudflare non risponde (errore $code). Riprova tra poco."
            })
            return runCatching { JSONObject(text).optJSONObject("result")?.opt("response") }.getOrNull()
        } catch (error: java.io.IOException) {
            throw AiException("Non riesco a contattare l'IA. Controlla la connessione e riprova.")
        } finally {
            connection.disconnect()
        }
    }

    private fun toJson(response: Any?): JSONObject? = when (response) {
        is JSONObject -> response
        is String -> {
            val start = response.indexOf('{')
            val end = response.lastIndexOf('}')
            if (start < 0 || end <= start) null else runCatching { JSONObject(response.substring(start, end + 1)) }.getOrNull()
        }
        else -> null
    }

    private fun parseItems(response: Any?): List<AiPick> {
        val items = toJson(response)?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { index ->
            val item = items.optJSONObject(index) ?: return@mapNotNull null
            val title = item.optString("title").trim().take(120)
            val kind = item.optString("type")
            if (title.isEmpty() || (kind != "movie" && kind != "tv")) null
            else AiPick(title, item.optInt("year").takeIf { it > 1800 }, kind, item.optString("reason").trim().take(200))
        }
    }
}
