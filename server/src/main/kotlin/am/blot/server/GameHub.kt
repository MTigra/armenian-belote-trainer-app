package am.blot.server

import am.blot.core.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.SecureRandom
import java.util.UUID

internal data class Connection(val id: String, val code: String, val guest: Guest, val messages: Channel<ServerMessage>)
class GameHub(
    private val now: () -> Long = System::currentTimeMillis,
    private val deck: () -> List<Card> = { CardRules.deck().toMutableList().also { java.util.Collections.shuffle(it, SecureRandom()) } },
    private val timing: ServerTiming = ServerTiming(),
) {
    private val mutex = Mutex()
    private val guests = Guests()
    private val rooms = mutableMapOf<String, TableRoom>()
    private val connections = mutableMapOf<String, Connection>()
    private val random = SecureRandom()
    suspend fun issue(request: GuestRequest) = mutex.withLock { guests.issue(request, now()) }
    suspend fun me(token: String) = mutex.withLock { guests.status(guests.authenticate(token, now())) }
    suspend fun rename(token: String, request: RenameGuest) = mutex.withLock {
        val guest = guests.authenticate(token, now())
        guests.rename(guest, request.nickname)
        guest.tableCode?.let { rooms[it] }?.let(::broadcast)
        guests.status(guest)
    }
    suspend fun create(token: String, request: CreateTable): TableSnapshot = mutex.withLock {
        val guest = guests.authenticate(token, now())
        if (guest.tableCode != null) fail(409, "ALREADY_SEATED", "Сначала вернитесь к текущему столу или покиньте его лобби.")
        if (rooms.size >= 256) fail(503, "CAPACITY", "Сервер заполнен. Попробуйте позже.")
        if (request.timerSeconds !in listOf(null, 30, 60, 120)) fail(400, "TIMER", "Таймер: без ограничения, 30, 60 или 120 секунд.")
        val name = request.name.trim()
        if (name.isEmpty() || name.length > 32) fail(400, "TABLE_NAME", "Название стола должно содержать от 1 до 32 символов.")
        val code = generateSequence { random.nextInt(1_000_000).toString().padStart(6, '0') }.first { it !in rooms }
        val room = TableRoom(RoomDetails(UUID.randomUUID().toString(), code, name, request.timerSeconds, now()), guest)
        rooms[code] = room
        guest.tableCode = code
        room.snapshot(guest, now())
    }
    suspend fun join(token: String, code: String): TableSnapshot = mutex.withLock {
        val guest = guests.authenticate(token, now())
        val room = room(code)
        if (guest.tableCode != null && guest.tableCode != code) fail(409, "ALREADY_SEATED", "Вы уже занимаете место за другим столом.")
        if (!room.match.lobby() && room.members.seatOf(guest.id) == null) fail(409, "GAME_STARTED", "За этим столом уже идёт партия.")
        room.members.add(guest)
        guest.tableCode = code
        room.touch(now())
        broadcast(room)
        room.snapshot(guest, now())
    }
    suspend fun snapshot(token: String, code: String) = mutex.withLock { room(code).snapshot(guests.authenticate(token, now()), now()) }
    internal suspend fun trainerGuest(token: String): String = mutex.withLock { guests.authenticate(token, now()).id }
    internal suspend fun trainerSnapshot(token: String, source: TrainerSource.Online): TrainerSnapshot = mutex.withLock {
        val guest = guests.authenticate(token, now())
        val room = room(source.tableCode)
        val seat = room.members.requireSeat(guest.id)
        room.match.checkRevision(source.expectedRevision)
        val state = room.match.requireState()
        TrainerSnapshot(state, GameEngine.view(state, seat),
            TrainerMoment(room.details.id, state.dealNumber, state.actions.size, room.match.revision(), seat))
    }
    internal suspend fun connect(token: String, code: String): Connection = mutex.withLock {
        val guest = guests.authenticate(token, now())
        val room = room(code)
        room.members.requireSeat(guest.id)
        val connection = Connection(UUID.randomUUID().toString(), code, guest, Channel(32))
        connections[connection.id] = connection
        room.members.attach(guest.id, connection.id)
        room.touch(now())
        broadcast(room)
        connection
    }
    internal suspend fun disconnect(connection: Connection) = mutex.withLock {
        connections.remove(connection.id)
        connection.messages.close()
        val room = rooms[connection.code] ?: return@withLock
        room.members.detach(connection.guest.id, connection.id, now())
        room.touch(now())
        broadcast(room)
    }
    internal suspend fun command(connection: Connection, command: GameCommand) = mutex.withLock {
        if (connection.id !in connections) fail(401, "CONNECTION_CLOSED", "Соединение закрыто.")
        if (!Regex("[a-zA-Z0-9_-]{1,80}").matches(command.requestId)) fail(400, "REQUEST_ID", "Некорректный идентификатор запроса.")
        val room = room(connection.code)
        if (room.duplicate(connection.guest, command)) {
            send(connection, ServerMessage("ack", requestId = command.requestId))
            return@withLock
        }
        room.execute(connection.guest, command, deck, now())
        if (room.members.seatOf(connection.guest.id) == null) {
            recipients(room).filter { it.guest.id == connection.guest.id }.forEach { link ->
                send(link, ServerMessage("left")); connections.remove(link.id); link.messages.close()
            }
        }
        publish(room)
        if (room.match.phase() != Phase.MATCH_FINISHED && connection.id in connections) send(connection, ServerMessage("ack", requestId = command.requestId))
    }
    suspend fun tick() = mutex.withLock {
        guests.purge(now())
        rooms.values.toList().forEach(::tickRoom)
    }
    private fun tickRoom(room: TableRoom) {
        if (room.expired(now(), timing.abandonedTtl)) { discard(room); return }
        val changed = !room.match.lobby() && room.members.claimBots(now(), timing.reconnectGrace)
        val seat = room.match.automaticSeat(room.members, now(), timing)
        if (seat != null) room.match.automatic(seat, now())
        if (changed || seat != null) publish(room)
    }
    private fun publish(room: TableRoom) {
        if (room.match.phase() == Phase.MATCH_FINISHED) { finish(room); return }
        if (room.members.empty()) { discard(room); return }
        broadcast(room)
    }
    private fun broadcast(room: TableRoom) {
        recipients(room).forEach { connection ->
            if (room.members.seatOf(connection.guest.id) != null)
                send(connection, ServerMessage("state", snapshot = room.snapshot(connection.guest, now())))
        }
    }
    private fun finish(room: TableRoom) {
        recipients(room).forEach { connection ->
            send(connection, ServerMessage("finished", snapshot = room.snapshot(connection.guest, now()), match = room.completed(connection.guest, now())))
        }
        discard(room)
    }
    private fun discard(room: TableRoom) {
        rooms.remove(room.details.code)
        room.members.release()
        recipients(room).forEach { connections.remove(it.id); it.messages.close() }
    }
    private fun recipients(room: TableRoom) = connections.values.filter { it.code == room.details.code }
    private fun send(connection: Connection, message: ServerMessage) {
        if (connection.messages.trySend(message).isFailure) connection.messages.close()
    }
    private fun room(code: String): TableRoom {
        if (!Regex("[0-9]{6}").matches(code)) fail(400, "TABLE_CODE", "Код стола состоит из шести цифр.")
        return rooms[code] ?: fail(404, "TABLE_GONE", "Стол недоступен. Возможно, сервер был перезапущен или партия завершилась.")
    }
    suspend fun close() = mutex.withLock { rooms.values.toList().forEach(::discard) }
}
