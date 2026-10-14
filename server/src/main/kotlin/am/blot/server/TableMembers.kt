package am.blot.server

import am.blot.core.Seat

internal class Occupant(val guest: Guest) {
    private val connections = mutableSetOf<String>()
    private var disconnectedAt: Long? = guest.touchedAt
    private var bot = false
    fun attach(id: String) { connections.add(id); disconnectedAt = null; bot = false }
    fun detach(id: String, now: Long) {
        connections.remove(id)
        if (connections.isEmpty()) disconnectedAt = now
    }
    fun connected() = connections.isNotEmpty()
    fun botControls() = bot
    fun claimBot(now: Long, grace: Long): Boolean {
        val since = disconnectedAt ?: return false
        if (bot || now - since < grace) return false
        bot = true
        return true
    }
    fun view(seat: Seat) = MemberView(guest.id, guest.nickname, seat, connected(), bot)
    fun guestId() = guest.id
}
internal class TableMembers(first: Guest) {
    private val seats = linkedMapOf(Seat.SOUTH to Occupant(first))
    fun add(guest: Guest): Seat {
        seatOf(guest.id)?.let { return it }
        val seat = Seat.entries.firstOrNull { it !in seats } ?: fail(409, "TABLE_FULL", "За столом уже четыре игрока.")
        seats[seat] = Occupant(guest)
        return seat
    }
    fun seatOf(guestId: String) = seats.entries.firstOrNull { it.value.guestId() == guestId }?.key
    fun requireSeat(guestId: String) = seatOf(guestId) ?: fail(403, "NOT_MEMBER", "Вы не занимаете место за этим столом.")
    fun attach(guestId: String, connectionId: String) = seats.getValue(requireSeat(guestId)).attach(connectionId)
    fun detach(guestId: String, connectionId: String, now: Long) { seatOf(guestId)?.let { seats.getValue(it).detach(connectionId, now) } }
    fun leave(guestId: String) { seats.remove(requireSeat(guestId))?.guest?.tableCode = null }
    fun choose(guestId: String, requested: Seat) {
        val current = requireSeat(guestId)
        if (current == requested) return
        if (requested in seats) fail(409, "SEAT_TAKEN", "Это место уже занято.")
        seats[requested] = seats.remove(current) ?: error("Missing member")
    }
    fun ready() = seats.size == 4 && seats.values.all { it.connected() }
    fun anyConnected() = seats.values.any { it.connected() }
    fun empty() = seats.isEmpty()
    fun firstGuestId() = seats.values.firstOrNull()?.guestId()
    fun snapshots() = Seat.entries.mapNotNull { seat -> seats[seat]?.view(seat) }
    fun names() = snapshots().associate { it.seat to it.nickname }
    fun botControls(seat: Seat) = seats[seat]?.botControls() == true
    fun claimBots(now: Long, grace: Long) = seats.values.map { it.claimBot(now, grace) }.any { it }
    fun release() { seats.values.forEach { it.guest.tableCode = null } }
}
