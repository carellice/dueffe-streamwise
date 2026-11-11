package it.dueffe.streamwise

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

/** The public page of a title on TMDB: the link that is shared, and that StreamWise opens again. */
internal fun tmdbLink(media: Models.Media): String = "https://www.themoviedb.org/${media.mediaType}/${media.tmdbId}"

/** The StreamWise id ("tmdb-movie-603") of a TMDB link, also one with the title after the number; null for other links. */
internal fun mediaIdOfLink(link: String?): String? =
    link?.let { Regex("""themoviedb\.org/(?:[a-z]{2}(?:-[A-Z]{2})?/)?(movie|tv)/(\d+)""").find(it) }
        ?.let { "tmdb-${it.groupValues[1]}-${it.groupValues[2]}" }

/**
 * Shares [media] as a picture of the whole title (artwork, title, year, genres, rating, plot, where
 * to watch, cast) with its TMDB link: whoever has StreamWise opens the link in the app, anyone else
 * still sees the title in the picture.
 */
internal suspend fun shareMedia(context: Context, media: Models.Media) {
    val file = withContext(Dispatchers.IO) {
        val card = drawCard(media, image(media.backdrop), image(media.poster.replace("/w342/", "/w500/")))
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        File(dir, "streamwise-${media.mediaType}-${media.tmdbId}.png").also { f -> f.outputStream().use { card.compress(Bitmap.CompressFormat.PNG, 100, it) } }
    }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
    val text = "${media.title}${if (media.year != "S.D.") " (${media.year})" else ""}\n${tmdbLink(media)}\n\nScarica StreamWise: https://carellice.github.io/dueffe-home/#/p/dueffe-streamwise"
    val send = Intent(Intent.ACTION_SEND)
        .setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .putExtra(Intent.EXTRA_TEXT, text)
        .putExtra(Intent.EXTRA_TITLE, media.title)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    send.clipData = ClipData.newRawUri(media.title, uri)
    context.startActivity(Intent.createChooser(send, "Condividi ${media.title}").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun image(url: String): Bitmap? =
    url.takeIf { it.startsWith("http") }?.let { runCatching { URL(it).openStream().use(BitmapFactory::decodeStream) }.getOrNull() }

private const val W = 1080
private const val PAD = 64f
private const val BACKDROP_H = 608f

private fun paint(size: Float, color: Int, bold: Boolean = false, italic: Boolean = false) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = size
    this.color = color
    typeface = Typeface.create(Typeface.DEFAULT, when { bold && italic -> Typeface.BOLD_ITALIC; bold -> Typeface.BOLD; italic -> Typeface.ITALIC; else -> Typeface.NORMAL })
}

private fun layout(text: String, paint: TextPaint, width: Int, maxLines: Int): StaticLayout =
    StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setLineSpacing(0f, 1.18f)
        .setMaxLines(maxLines)
        .setEllipsize(TextUtils.TruncateAt.END)
        .build()

/** Draws the card: its height follows the text, so nothing is cut but the longest plots. */
private fun drawCard(media: Models.Media, backdrop: Bitmap?, poster: Bitmap?): Bitmap {
    val ink = 0xFFF7F5F3.toInt()
    val muted = 0xFFA4A8B5.toInt()
    val accent = 0xFFFF5964.toInt()
    val background = 0xFF0A0B10.toInt()

    val posterW = 300f
    val posterH = 450f
    val posterTop = BACKDROP_H - 230f
    val sideX = PAD + posterW + 40f
    val sideW = (W - sideX - PAD).toInt()

    val kind = layout(if (media.isSeries()) "SERIE TV" else "FILM", paint(30f, accent, bold = true).apply { letterSpacing = 0.12f }, sideW, 1)
    val title = layout(media.title, paint(60f, ink, bold = true), sideW, 4)
    val meta = listOfNotNull(
        media.year.takeIf { it != "S.D." },
        media.genres.take(3).joinToString(", ").takeIf { it.isNotEmpty() },
        media.rating.takeIf { it > 0 }?.let { "★\u00A0%.1f".format(java.util.Locale.ITALY, it) },
        (if (media.isSeries()) media.episodeRuntime else media.runtime).takeIf { it > 0 }?.let { "$it\u00A0min" },
    ).joinToString("  ·  ")
    val metaLayout = layout(meta, paint(32f, muted), sideW, 3)
    val sideTop = BACKDROP_H + 24f
    val sideBottom = sideTop + kind.height + 8f + title.height + 14f + metaLayout.height

    val bodyW = (W - 2 * PAD).toInt()
    val sections = mutableListOf<StaticLayout>()
    if (media.tagline.isNotBlank()) sections += layout("«${media.tagline}»", paint(36f, ink, italic = true), bodyW, 3)
    sections += layout(media.overview, paint(36f, ink), bodyW, 14)
    val providers = media.flatrate.map { it.name }.distinct()
    if (providers.isNotEmpty()) sections += layout("Dove guardarlo:  " + providers.joinToString(", "), paint(34f, accent, bold = true), bodyW, 3)
    if (media.directors.isNotEmpty()) sections += layout("Regia:  " + media.directors.take(2).joinToString(", ") { it.name }, paint(32f, muted), bodyW, 2)
    if (media.cast.isNotEmpty()) sections += layout("Con:  " + media.cast.take(5).joinToString(", ") { it.name }, paint(32f, muted), bodyW, 3)
    val footer = layout("Condiviso da StreamWise  ·  ${tmdbLink(media).removePrefix("https://")}", paint(26f, muted), bodyW, 2)

    val bodyTop = maxOf(posterTop + posterH, sideBottom) + 56f
    val height = (bodyTop + sections.sumOf { it.height + 36 } + 40f + footer.height + PAD).toInt()

    val out = Bitmap.createBitmap(W, height, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    c.drawColor(background)
    if (backdrop != null) {
        // Center-crop the backdrop into the top band, then fade it into the background.
        val scale = maxOf(W / backdrop.width.toFloat(), BACKDROP_H / backdrop.height)
        val sw = (W / scale).toInt()
        val sh = (BACKDROP_H / scale).toInt()
        val sx = (backdrop.width - sw) / 2
        val sy = (backdrop.height - sh) / 2
        c.drawBitmap(backdrop, Rect(sx, sy, sx + sw, sy + sh), RectF(0f, 0f, W.toFloat(), BACKDROP_H), Paint(Paint.FILTER_BITMAP_FLAG))
    }
    c.drawRect(0f, 0f, W.toFloat(), BACKDROP_H + 2f, Paint().apply {
        shader = LinearGradient(0f, BACKDROP_H * 0.35f, 0f, BACKDROP_H, 0x000A0B10, background, Shader.TileMode.CLAMP)
    })

    val posterRect = RectF(PAD, posterTop, PAD + posterW, posterTop + posterH)
    c.drawRoundRect(RectF(posterRect).apply { inset(-3f, -3f) }, 30f, 30f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33FFFFFF })
    if (poster != null) {
        c.save()
        c.clipPath(android.graphics.Path().apply { addRoundRect(posterRect, 28f, 28f, android.graphics.Path.Direction.CW) })
        c.drawBitmap(poster, null, posterRect, Paint(Paint.FILTER_BITMAP_FLAG))
        c.restore()
    } else {
        c.drawRoundRect(posterRect, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1D2029.toInt() })
    }

    var y = sideTop
    fun draw(l: StaticLayout, x: Float, gap: Float) {
        c.save(); c.translate(x, y); l.draw(c); c.restore()
        y += l.height + gap
    }
    draw(kind, sideX, 8f)
    draw(title, sideX, 14f)
    draw(metaLayout, sideX, 0f)

    y = bodyTop
    for (s in sections) draw(s, PAD, 36f)
    c.drawRect(PAD, y, W - PAD, y + 2f, Paint().apply { color = 0xFF2C303C.toInt() })
    y += 38f
    draw(footer, PAD, 0f)
    return out
}
