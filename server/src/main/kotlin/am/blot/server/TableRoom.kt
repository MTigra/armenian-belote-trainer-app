package am.blot.server

import am.blot.core.*
import java.util.UUID

internal data class RoomDetails(val id: String, val code: String, val name: String, val timerSeconds: Int?, val createdAt: Long)
internal class TableRoom(val details: RoomDetails, first: Guest) {
    val members = TableMembers(first)
    val match = RoomMatch(details.timerSeconds)
    private var hostId = first.id
    private var touchedAt = details.createdAt
    private val commands = linkedMapOf<Pair<String, String>, GameCommand>()
    fun hostId() = hostId
    fun touch(now: Long) { touchedAt = now }
    fun expired(now: Long, ttl: Long) = !members.anyConnected() && now - touchedAt > ttl
    fun refreshHost() { if (members.seatOf(hostId) == null) hostId = members.firstGuestId().orEmpty() }
    fun duplicate(guest: Guest, command: GameCommand): Boolean {
        val previous = commands[guest.id to command.requestId] ?: return false
        if (previous != command) fail(409, "REQUEST_ID_REUSED", "Идентификатор запроса уже использован.")
        return true
    }
    fun remember(guest: Guest, command: GameCommand) {
        commands[guest.id to command.requestId] = command
        if (commands.size > 1024) commands.remove(commands.keys.first())
    }
    fun execute(guest: Guest, command: GameCommand, deck: () -> List<Card>, now: Long) {
        val seat = members.requireSeat(guest.id)
        match.checkRevision(command.expectedRevision)
        when (command.type) {
            "start" -> start(guest, deck, now)
            "action" -> {
                val action = command.action ?: fail(400, "ACTION_REQUIRED", "Не указан ход.")
                if (action.seat != seat) fail(403, "WRONG_SEAT", "Нельзя совершать ход за другого игрока.")
                match.act(action, now)
            }
            "advance" -> match.advance(deck(), now)
            "seat" -> {
                if (!match.lobby()) fail(409, "GAME_STARTED", "Место можно менять только до начала партии.")
                members.choose(guest.id, command.seat ?: fail(400, "SEAT_REQUIRED", "Выберите место."))
            }
            "leave" -> {
                if (!match.lobby()) fail(409, "GAME_STARTED", "В партии место сохраняется до её завершения.")
                members.leave(guest.id)
                refreshHost()
            }
            else -> fail(400, "UNKNOWN_COMMAND", "Неизвестная команда.")
        }
        touch(now)
        remember(guest, command)
    }
    private fun start(guest: Guest, deck: () -> List<Card>, now: Long) {
        if (guest.id != hostId) fail(403, "HOST_ONLY", "Партию запускает создатель стола.")
        if (!members.ready()) fail(409, "NOT_READY", "Для старта нужны четыре подключённых игрока.")
        match.start(deck(), now)
    }
    fun snapshot(guest: Guest, now: Long): TableSnapshot {
        val seat = members.requireSeat(guest.id)
        val status = when (match.phase()) {
            null -> "LOBBY"
            Phase.MATCH_FINISHED -> "FINISHED"
            else -> "PLAYING"
        }
        return TableSnapshot(details.id, details.code, details.name, hostId, details.timerSeconds,
            details.createdAt, match.revision(), status, seat, members.snapshots(), match.view(seat),
            match.actionCount(), match.deadlines(), now, match.result(), match.winner())
    }
    fun completed(guest: Guest, now: Long): CompletedMatch {
        val state = match.requireState()
        return CompletedMatch(details.id, details.createdAt, now, GameEngine.record(state), state.scores,
            state.winner, members.requireSeat(guest.id), members.names(), details.timerSeconds)
    }
}
