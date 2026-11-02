package it.dueffe.streamwise

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * "Usa il server" in Settings: connects the app to the user's StreamWise server (the PWA on CasaOS)
 * with the same account as the web app, or goes back to data kept only on the phone.
 */
@Composable
internal fun ServerCard(store: LibraryStore, onChanged: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val serverStore = remember { ServerSync.store(context) }
    val config by serverStore.config.collectAsState()
    val status by ServerSync.status.collectAsState()
    var url by remember { mutableStateOf(serverStore.lastUrl) }
    var username by remember { mutableStateOf(serverStore.lastUsername) }
    var password by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var choice by remember { mutableStateOf<Pair<ServerConfig, ServerSync.Counts>?>(null) }
    var disconnecting by remember { mutableStateOf(false) }

    fun finishConnect(pending: ServerConfig, usePhone: Boolean) {
        busy = true
        scope.launch {
            message = runCatching { ServerSync.connect(context, store, pending, usePhone) }.exceptionOrNull()?.let { it.message ?: "Collegamento non riuscito" }
            if (message == null) { store.reload(); password = ""; onChanged() }
            busy = false
        }
    }

    Surface(Modifier.fillMaxWidth(), color = Sw.Surface, shape = RoundedCornerShape(24.dp), border = BorderStroke(1.dp, if (config != null) Sw.Blue.copy(alpha = .5f) else Sw.Outline)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(R.drawable.ic_broadcast), null, tint = Sw.Blue, modifier = Modifier.size(22.dp))
                Text("Usa il server", style = MaterialTheme.typography.titleLarge, color = Sw.Ink, modifier = Modifier.weight(1f).padding(start = 10.dp))
                Surface(color = if (config != null) Sw.Blue.copy(alpha = .2f) else Sw.Raised, shape = CircleShape) {
                    Text(if (config != null) "Attivo" else "Spento", color = if (config != null) Color.White else Sw.Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                }
            }
            val active = config
            if (active == null) {
                Text("Usa gli stessi dati di StreamWise web sul tuo server CasaOS: libreria, uscite seguite, persone e preferenze. Spento, i dati restano solo sul telefono.", color = Sw.Muted, fontSize = 13.sp, lineHeight = 18.sp)
                OutlinedTextField(url, { url = it.trim(); message = null }, label = { Text("Indirizzo del server") }, singleLine = true,
                    placeholder = { Text("casaos.tail1234.ts.net") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                if (url.trim().startsWith("http://", ignoreCase = true)) Text("Con http:// la password viaggia in chiaro: usalo solo in casa o dietro Tailscale.", color = Sw.Amber, fontSize = 12.sp, lineHeight = 16.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(false to "Ho già un account", true to "Creane uno").forEach { (value, label) ->
                        val selected = register == value
                        Surface(onClick = { register = value; message = null }, shape = CircleShape, color = if (selected) Sw.Blue.copy(alpha = .2f) else Sw.Raised,
                            border = BorderStroke(1.dp, if (selected) Sw.Blue else Color.Transparent)) {
                            Text(label, color = if (selected) Color.White else Sw.Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
                        }
                    }
                }
                OutlinedTextField(username, { username = it.trim(); message = null }, label = { Text("Nome utente") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(password, { password = it; message = null }, label = { Text("Password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
                message?.let { Text(it, color = Color(0xFFFF5C7A), fontSize = 13.sp, lineHeight = 18.sp) }
                Button(
                    onClick = {
                        busy = true
                        message = null
                        scope.launch {
                            runCatching { ServerSync.login(url, username, password, register) }
                                .onSuccess { (pending, serverCounts) ->
                                    val phone = ServerSync.phoneCounts(context)
                                    // Phone without data: take the server's silently.
                                    if (phone.titles == 0 && phone.follows == 0) { busy = false; finishConnect(pending, usePhone = false) }
                                    else { choice = pending to serverCounts; busy = false }
                                }
                                .onFailure { message = it.message ?: "Accesso non riuscito"; busy = false }
                        }
                    },
                    enabled = !busy && url.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Sw.Blue, contentColor = Color.White)
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    else Text("Collega il server", fontWeight = FontWeight.Bold)
                }
            } else {
                val (time, error) = status
                Text("Attivo: ${active.username} su ${active.url.removePrefix("https://").removePrefix("http://")}", color = Sw.Ink, fontSize = 14.sp)
                Text(
                    error ?: if (time > 0) "Aggiornato alle ${SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(time))}" else "In attesa del primo aggiornamento",
                    color = if (error != null) Color(0xFFFF5C7A) else Sw.Muted, fontSize = 13.sp, lineHeight = 18.sp
                )
                Text("Senza connessione vedi l'ultima copia ma non puoi salvare modifiche.", color = Sw.Muted, fontSize = 12.sp, lineHeight = 16.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton({ busy = true; scope.launch { ServerSync.pull(context, force = true); store.reload(); onChanged(); busy = false } }, enabled = !busy,
                        modifier = Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(18.dp)) {
                        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Aggiorna ora")
                    }
                    OutlinedButton({ disconnecting = true }, modifier = Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(18.dp)) { Text("Scollega") }
                }
            }
        }
    }

    choice?.let { (pending, server) ->
        val phone = remember { ServerSync.phoneCounts(context) }
        AlertDialog(
            onDismissRequest = { choice = null; scope.launch { ServerClient().logout(pending) } },
            title = { Text("Quali dati vuoi usare?") },
            text = {
                Text("Sul telefono: ${phone.titles} titoli e ${phone.follows} seguiti.\nSul server: ${server.titles} titoli e ${server.follows} seguiti.\n\n" +
                    "Quelli del telefono sostituiscono i dati dell'account sul server. In ogni caso una copia dei dati del telefono resta salvata per poterli riprendere.")
            },
            confirmButton = { TextButton({ choice = null; finishConnect(pending, usePhone = false) }) { Text("Quelli del server") } },
            dismissButton = { TextButton({ choice = null; finishConnect(pending, usePhone = true) }) { Text("Quelli del telefono") } }
        )
    }
    if (disconnecting) AlertDialog(
        onDismissRequest = { disconnecting = false },
        title = { Text("Scollegare il server?") },
        text = { Text("Il telefono smette di usare i dati del server. Puoi tenere quelli attuali o tornare a quelli che avevi prima di collegarlo.") },
        confirmButton = { TextButton({ disconnecting = false; scope.launch { ServerSync.disconnect(context, store, restorePrevious = false); store.reload(); onChanged() } }) { Text("Tieni i dati attuali") } },
        dismissButton = { TextButton({ disconnecting = false; scope.launch { ServerSync.disconnect(context, store, restorePrevious = true); store.reload(); onChanged() } }) { Text("Torna a quelli di prima") } }
    )
}
