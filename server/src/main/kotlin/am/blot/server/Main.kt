package am.blot.server

import io.ktor.server.engine.*
import io.ktor.server.netty.*
import java.io.File

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    val origins = System.getenv("PUBLIC_ORIGINS")?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet() ?: defaultOrigins
    val effectiveOrigins = origins + listOfNotNull(System.getenv("PUBLIC_ORIGIN"), System.getenv("RENDER_EXTERNAL_URL"))
    val root = File(System.getenv("WEB_ROOT") ?: "web/dist").takeIf { it.isDirectory } ?: File("../web/dist")
    embeddedServer(Netty, host = "0.0.0.0", port = port) { gameServer(origins = effectiveOrigins, webRoot = root) }.start(wait = true)
}
