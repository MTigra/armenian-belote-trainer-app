package am.blot.server

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.http.content.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import java.io.File
import java.net.URI
import kotlin.time.Duration.Companion.seconds

val defaultOrigins = setOf("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:8080", "http://127.0.0.1:8080", "https://mtigra.github.io")
fun Application.gameServer(hub: GameHub = GameHub(), origins: Set<String> = defaultOrigins, runTicker: Boolean = true, webRoot: File? = null) {
    install(ContentNegotiation) { json(wireJson) }
    install(StatusPages) {
        exception<ApiFailure> { call, cause -> call.respond(HttpStatusCode.fromValue(cause.status), cause.payload()) }
        exception<SerializationException> { call, _ -> call.respond(HttpStatusCode.BadRequest, ApiError("BAD_JSON", "Некорректный запрос.")) }
        exception<IllegalArgumentException> { call, _ -> call.respond(HttpStatusCode.BadRequest, ApiError("BAD_REQUEST", "Некорректный запрос.")) }
    }
    install(CORS) {
        origins.forEach { origin -> val uri = URI(origin); allowHost(uri.authority, schemes = listOf(uri.scheme)) }
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethod.Post)
    }
    install(WebSockets) { pingPeriod = 15.seconds; timeout = 30.seconds; maxFrameSize = 1_048_576 }
    val ticker = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    if (runTicker) ticker.launch { while (isActive) { delay(250); hub.tick() } }
    monitor.subscribe(ApplicationStopped) { ticker.cancel(); runBlocking { hub.close() } }
    routing {
        get("/api/health") { call.respond(mapOf("status" to "ok", "protocolVersion" to "1")) }
        post("/api/guests") { call.respond(HttpStatusCode.Created, hub.issue(call.receive<GuestRequest>())) }
        get("/api/me") { call.respond(hub.me(call.token())) }
        post("/api/tables") { call.respond(HttpStatusCode.Created, hub.create(call.token(), call.receive<CreateTable>())) }
        post("/api/tables/{code}/join") { call.respond(hub.join(call.token(), call.code())) }
        get("/api/tables/{code}") { call.respond(hub.snapshot(call.token(), call.code())) }
        post("/api/trainer") { call.respond(HttpStatusCode.ServiceUnavailable, ApiError("TRAINER_UNAVAILABLE", "Сервис тренера пока не подключён.")) }
        webSocket("/api/tables/{code}/ws") {
            if (call.request.headers[HttpHeaders.Origin]?.let { it !in origins } == true) { close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Origin rejected")); return@webSocket }
            handleGameSocket(hub, call.code())
        }
        webRoot?.takeIf { it.isDirectory }?.let { staticFiles("/", it, index = "index.html") }
    }
}
private fun ApplicationCall.token(): String = request.headers[HttpHeaders.Authorization]?.removePrefix("Bearer ")
    ?.takeIf { request.headers[HttpHeaders.Authorization]?.startsWith("Bearer ") == true && it.isNotBlank() }
    ?: fail(401, "AUTH_REQUIRED", "Войдите как гость.")
private fun ApplicationCall.code() = parameters["code"] ?: fail(400, "TABLE_CODE", "Не указан код стола.")
private suspend fun DefaultWebSocketServerSession.handleGameSocket(hub: GameHub, code: String) {
    var connection: Connection? = null
    try {
        val auth = withTimeout(5000) { wireJson.decodeFromString<SocketAuth>(incoming.receive().commandText()) }
        if (auth.type != "auth") fail(401, "AUTH_REQUIRED", "Сначала подтвердите гостевую сессию.")
        val attached = hub.connect(auth.token, code)
        connection = attached
        coroutineScope {
            val writer = launch { for (message in attached.messages) send(wireJson.encodeToString(message)); close() }
            try { for (frame in incoming) executeFrame(hub, attached, frame) }
            finally { writer.cancelAndJoin() }
        }
    } catch (failure: ApiFailure) {
        send(wireJson.encodeToString(ServerMessage("error", error = failure.payload())))
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, failure.code))
    } catch (_: SerializationException) {
        close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Bad JSON"))
    } catch (_: TimeoutCancellationException) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Authentication timeout"))
    } finally { connection?.let { hub.disconnect(it) } }
}
private fun Frame.commandText(): String {
    if (this !is Frame.Text) fail(400, "TEXT_REQUIRED", "Ожидается JSON-команда.")
    val text = readText()
    if (text.length > 16_384) fail(413, "COMMAND_TOO_LARGE", "Запрос слишком большой.")
    return text
}
private suspend fun DefaultWebSocketServerSession.executeFrame(hub: GameHub, connection: Connection, frame: Frame) {
    var requestId: String? = null
    try {
        val command = wireJson.decodeFromString<GameCommand>(frame.commandText())
        requestId = command.requestId
        hub.command(connection, command)
    } catch (failure: ApiFailure) {
        send(wireJson.encodeToString(ServerMessage("error", requestId = requestId, error = failure.payload())))
    } catch (_: SerializationException) {
        send(wireJson.encodeToString(ServerMessage("error", error = ApiError("BAD_JSON", "Некорректная команда."))))
    }
}
