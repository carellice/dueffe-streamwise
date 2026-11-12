package it.dueffe.streamwise

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape as Rounded

// Same-package stand-ins for Compose's RoundedCornerShape and CircleShape: files that don't import the
// originals get these, so the Modern UI skin squares every corner of the app in one place.

private val Square = Rounded(0.dp)

internal fun RoundedCornerShape(size: Dp): Rounded = if (Skin.metro) Square else Rounded(size)

internal fun RoundedCornerShape(percent: Int): Rounded = if (Skin.metro) Square else Rounded(percent)

internal fun RoundedCornerShape(topStart: Dp = 0.dp, topEnd: Dp = 0.dp, bottomEnd: Dp = 0.dp, bottomStart: Dp = 0.dp): Rounded =
    if (Skin.metro) Square else Rounded(topStart, topEnd, bottomEnd, bottomStart)

internal val CircleShape: Rounded get() = if (Skin.metro) Square else Rounded(50)

/** Modern UI writes page and section titles in lowercase. */
internal fun metroCase(text: String) = if (Skin.metro) text.lowercase() else text
