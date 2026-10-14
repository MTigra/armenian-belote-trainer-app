package am.blot.server

import am.blot.core.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val wireJson = Json { encodeDefaults = true }

@Serializable data class GuestRequest(val nickname: String? = null)
@Serializable data class RenameGuest(val nickname: String)
@Serializable data class GuestCredentials(val id: String, val nickname: String, val token: String)
@Serializable data class GuestStatus(val id: String, val nickname: String, val tableCode: String? = null)
@Serializable data class CreateTable(val name: String = "Базар блот", val timerSeconds: Int? = 60)
@Serializable data class SocketAuth(val type: String, val token: String)
@Serializable data class GameCommand(
    val requestId: String,
    val type: String,
    val expectedRevision: Long,
    val action: Action? = null,
    val seat: Seat? = null,
)
@Serializable data class MemberView(val id: String, val nickname: String, val seat: Seat, val connected: Boolean, val bot: Boolean)
@Serializable data class TableSnapshot(
    val id: String,
    val code: String,
    val name: String,
    val hostId: String,
    val timerSeconds: Int?,
    val createdAt: Long,
    val revision: Long,
    val status: String,
    val selfSeat: Seat,
    val members: List<MemberView>,
    val view: PlayerView? = null,
    val actionCount: Int = 0,
    val deadlines: Map<Seat, Long> = emptyMap(),
    val serverTime: Long,
    val result: DealResult? = null,
    val winner: Team? = null,
)
@Serializable data class CompletedMatch(
    val id: String,
    val createdAt: Long,
    val finishedAt: Long,
    val record: MatchRecord,
    val scores: Totals,
    val winner: Team?,
    val seat: Seat,
    val players: Map<Seat, String>,
    val timerSeconds: Int?,
)
@Serializable data class ApiError(val code: String, val message: String)
@Serializable data class ServerMessage(
    val type: String,
    val protocolVersion: Int = 2,
    val snapshot: TableSnapshot? = null,
    val requestId: String? = null,
    val error: ApiError? = null,
    val match: CompletedMatch? = null,
)
class ApiFailure(val status: Int, val code: String, override val message: String) : RuntimeException(message) {
    fun payload() = ApiError(code, message)
}
fun fail(status: Int, code: String, message: String): Nothing = throw ApiFailure(status, code, message)
