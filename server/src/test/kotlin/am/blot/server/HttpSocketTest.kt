package am.blot.server

import am.blot.core.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.call.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.testing.*
import io.ktor.websocket.*
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.encodeToString
import kotlin.test.*

class HttpSocketTest {
    @Test fun httpRejectsMissingIdentityAndBadInputs() = testApplication {
        application { gameServer(runTicker = false) }
        val client = createClient { install(ContentNegotiation) { json(wireJson) } }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/me").status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/me") { contentType(ContentType.Application.Json); setBody(RenameGuest("Тигран")) }.status)
        val guest = client.post("/api/guests") { contentType(ContentType.Application.Json); setBody(GuestRequest()) }.body<GuestCredentials>()
        val renamed = client.post("/api/me") { bearerAuth(guest.token); contentType(ContentType.Application.Json); setBody(RenameGuest("Тигран")) }.body<GuestStatus>()
        assertEquals(guest.id, renamed.id)
        assertEquals("Тигран", client.get("/api/me") { bearerAuth(guest.token) }.body<GuestStatus>().nickname)
        assertEquals(HttpStatusCode.BadRequest, client.post("/api/tables") { bearerAuth(guest.token); contentType(ContentType.Application.Json); setBody(CreateTable(timerSeconds = 12)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/tables/abc") { bearerAuth(guest.token) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.post("/api/trainer").status)
        assertEquals("INVALID_TRAINER_REQUEST", client.post("/api/trainer").body<TrainerError>().code)
    }
    @Test fun fourRealSocketsReceivePrivateStateAndRecoverAfterInvalidCommand() = testApplication {
        application { gameServer(runTicker = false) }
        val client = createClient { install(ContentNegotiation) { json(wireJson) }; install(WebSockets) }
        val guests = (0..3).map { client.post("/api/guests") { contentType(ContentType.Application.Json); setBody(GuestRequest("Игрок $it")) }.body<GuestCredentials>() }
        val table = client.post("/api/tables") { bearerAuth(guests[0].token); contentType(ContentType.Application.Json); setBody(CreateTable(timerSeconds = null)) }.body<TableSnapshot>()
        guests.drop(1).forEach { guest -> client.post("/api/tables/${table.code}/join") { bearerAuth(guest.token); contentType(ContentType.Application.Json); setBody("{}") } }
        val sockets = guests.map { guest -> client.webSocketSession("/api/tables/${table.code}/ws") { header(HttpHeaders.Origin, "http://localhost:5173") }.also { it.send(wireJson.encodeToString(SocketAuth("auth", guest.token))) } }
        sockets.forEach { assertEquals("LOBBY", it.state().status) }
        sockets[0].send(wireJson.encodeToString(GameCommand("start", "start", 0)))
        val views = sockets.map { it.state(1).view ?: error("Missing hand") }
        assertEquals(32, views.flatMap { it.hand }.distinct().size)
        assertEquals(Seat.entries, views.map { it.seat })
        sockets[0].send(wireJson.encodeToString(GameCommand("bad-seat", "action", 1, Action.Pass(Seat.WEST))))
        val rejected = sockets[0].message("error")
        assertEquals("WRONG_SEAT", rejected.error?.code)
        sockets[1].send(wireJson.encodeToString(GameCommand("pass", "action", 1, Action.Pass(Seat.WEST))))
        sockets.forEach { assertEquals(1, it.state(2).actionCount) }
        sockets.forEach { it.close() }
    }
    @Test fun socketRejectsUnapprovedOriginAndInvalidGuestToken() = testApplication {
        application { gameServer(runTicker = false) }
        val client = createClient { install(WebSockets) }
        assertEquals(HttpStatusCode.Forbidden, client.get("/api/health") { header(HttpHeaders.Origin, "https://wrong.example") }.status)
        assertFailsWith<IllegalStateException> {
            client.webSocketSession("/api/tables/123456/ws") { header(HttpHeaders.Origin, "https://wrong.example") }
        }
        client.webSocket("/api/tables/123456/ws") {
            send(wireJson.encodeToString(SocketAuth("auth", "bad-token")))
            assertEquals("SESSION_EXPIRED", message("error").error?.code)
        }
    }
    private suspend fun DefaultClientWebSocketSession.message(type: String): ServerMessage = withTimeout(5000) {
        while (true) {
            val frame = incoming.receive()
            if (frame !is Frame.Text) continue
            val message = wireJson.decodeFromString<ServerMessage>(frame.readText())
            if (message.type == type) return@withTimeout message
        }
        error("unreachable")
    }
    private suspend fun DefaultClientWebSocketSession.state(revision: Long = 0): TableSnapshot = withTimeout(5000) {
        while (true) {
            val snapshot = message("state").snapshot ?: error("Missing snapshot")
            if (snapshot.revision >= revision) return@withTimeout snapshot
        }
        error("unreachable")
    }
}
