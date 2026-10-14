package am.blot.server

import am.blot.core.*
import kotlinx.coroutines.*
import kotlin.test.*

class GameHubTest {
    private class Clock { var value = 1_000L; fun advance(ms: Long) { value += ms } }
    private class Table(val hub: GameHub, val code: String, val guests: List<GuestCredentials>, val links: List<Connection>) {
        private var sequence = 0
        suspend fun view(index: Int = 0) = hub.snapshot(guests[index].token, code)
        suspend fun command(index: Int, type: String, action: Action? = null, seat: Seat? = null, id: String = "request-${sequence++}", revision: Long? = null): GameCommand {
            val command = GameCommand(id, type, revision ?: view(index).revision, action, seat)
            hub.command(links[index], command)
            return command
        }
        fun drain() = links.flatMap { connection -> generateSequence { connection.messages.tryReceive().getOrNull() }.toList() }
    }
    private suspend fun table(hub: GameHub = GameHub(), timer: Int? = null): Table {
        val guests = (0..3).map { hub.issue(GuestRequest()) }
        val room = hub.create(guests[0].token, CreateTable(timerSeconds = timer))
        guests.drop(1).forEach { hub.join(it.token, room.code) }
        val links = guests.map { hub.connect(it.token, room.code) }
        return Table(hub, room.code, guests, links).also { it.drain() }
    }
    @Test fun guestsAndLobbyRespectOwnership() = runBlocking<Unit> {
        val table = table()
        val outsider = table.hub.issue(GuestRequest())
        assertFailsWith<ApiFailure> { table.hub.snapshot(outsider.token, table.code) }.also { assertEquals(403, it.status) }
        assertFailsWith<ApiFailure> { table.hub.join(outsider.token, table.code) }.also { assertEquals("TABLE_FULL", it.code) }
        assertFailsWith<ApiFailure> { table.hub.me("invented") }.also { assertEquals(401, it.status) }
        assertEquals(table.code, table.hub.me(table.guests[0].token).tableCode)
        assertFailsWith<ApiFailure> { table.command(1, "start") }.also { assertEquals("HOST_ONLY", it.code) }
    }
    @Test fun startRequiresFourConnectedGuestsAndProjectsOnlyOwnHand() = runBlocking<Unit> {
        val table = table()
        table.hub.disconnect(table.links[3])
        assertFailsWith<ApiFailure> { table.command(0, "start") }.also { assertEquals("NOT_READY", it.code) }
        table.hub.connect(table.guests[3].token, table.code)
        table.command(0, "start")
        val views = (0..3).map { table.view(it).view ?: error("Missing player view") }
        assertEquals(32, views.flatMap { it.hand }.distinct().size)
        views.forEach { assertEquals(8, it.hand.size); assertTrue(it.handSizes.values.all { size -> size == 8 }) }
        assertEquals(Seat.entries, views.map { it.seat })
        assertFalse(wireJson.encodeToString(TableSnapshot.serializer(), table.view()).contains("initialHands"))
    }
    @Test fun invalidSeatIllegalMoveAndStaleCommandDoNotMutateGame() = runBlocking<Unit> {
        val table = table(); table.command(0, "start")
        assertFailsWith<ApiFailure> { table.command(0, "action", Action.Pass(Seat.WEST)) }.also { assertEquals("WRONG_SEAT", it.code) }
        assertFailsWith<ApiFailure> { table.command(0, "action", Action.Pass(Seat.SOUTH)) }.also { assertEquals("ILLEGAL_ACTION", it.code) }
        assertEquals(1L, table.view().revision)
        table.command(1, "action", Action.Pass(Seat.WEST))
        assertFailsWith<ApiFailure> { table.command(2, "action", Action.Pass(Seat.NORTH), revision = 1) }.also { assertEquals("STALE_STATE", it.code) }
        assertEquals(1, table.view().actionCount)
    }
    @Test fun duplicateRequestIsAcknowledgedOnceAndCannotBeReusedForAnotherAction() = runBlocking<Unit> {
        val table = table(); table.command(0, "start"); table.drain()
        val command = table.command(1, "action", Action.Pass(Seat.WEST), id = "same")
        table.hub.command(table.links[1], command)
        assertEquals(1, table.view().actionCount)
        assertFailsWith<ApiFailure> { table.hub.command(table.links[1], command.copy(action = Action.Bid(Seat.WEST, 8, Suit.HEARTS))) }
    }
    @Test fun simultaneousCommandsHaveOneAuthoritativeWinner() = runBlocking<Unit> {
        val table = table(); table.command(0, "start")
        val outcomes = coroutineScope {
            listOf(Action.Pass(Seat.WEST), Action.Bid(Seat.WEST, 8, Suit.HEARTS)).mapIndexed { index, action ->
                async { runCatching { table.command(1, "action", action, id = "race-$index", revision = 1) } }
            }.awaitAll()
        }
        assertEquals(1, outcomes.count { it.isSuccess })
        assertEquals(1, table.view().actionCount)
    }
    @Test fun timerKeepsHumanControlAndRunsWhileDisconnected() = runBlocking<Unit> {
        val clock = Clock(); val table = table(GameHub(clock::value), 30)
        table.command(0, "start"); val deadline = table.view().deadlines.getValue(Seat.WEST)
        table.hub.disconnect(table.links[1]); clock.advance(30_001); table.hub.tick()
        assertEquals(1, table.view().actionCount)
        assertFalse(table.view().members.first { it.seat == Seat.WEST }.bot)
        val reconnect = table.hub.connect(table.guests[1].token, table.code)
        assertTrue(reconnect.messages.tryReceive().isSuccess)
        assertTrue(deadline < clock.value)
        assertEquals(Seat.NORTH, table.view().view?.auction?.turn)
    }
    @Test fun disabledTimerWaitsTwoMinutesAndReturningPlayerReclaimsControl() = runBlocking<Unit> {
        val clock = Clock(); val table = table(GameHub(clock::value))
        table.command(0, "start"); table.hub.disconnect(table.links[1])
        clock.advance(119_999); table.hub.tick(); assertEquals(0, table.view().actionCount)
        clock.advance(2); table.hub.tick(); assertEquals(1, table.view().actionCount)
        assertTrue(table.view().members.first { it.seat == Seat.WEST }.bot)
        table.hub.connect(table.guests[1].token, table.code)
        assertFalse(table.view().members.first { it.seat == Seat.WEST }.bot)
        table.command(2, "action", Action.Pass(Seat.NORTH)); table.drain()
        table.command(3, "action", Action.Pass(Seat.EAST)); table.drain()
        table.command(0, "action", Action.Bid(Seat.SOUTH, 8, Suit.HEARTS)); table.drain()
        clock.advance(2000); table.hub.tick()
        assertEquals(4, table.view().actionCount)
        assertEquals(Seat.WEST, table.view().view?.auction?.turn)
    }
    @Test fun reconnectDoesNotResetTurnDeadlineAndAnotherTabKeepsSeatConnected() = runBlocking<Unit> {
        val clock = Clock(); val table = table(GameHub(clock::value), 60)
        table.command(0, "start")
        val before = table.view().deadlines
        val otherTab = table.hub.connect(table.guests[1].token, table.code)
        table.hub.disconnect(table.links[1]); clock.advance(5000)
        assertTrue(table.view().members.first { it.seat == Seat.WEST }.connected)
        assertEquals(before, table.view().deadlines)
        table.hub.disconnect(otherTab)
        assertFalse(table.view().members.first { it.seat == Seat.WEST }.connected)
    }
    @Test fun redoublePartnersHaveIndependentDeadlines() = runBlocking<Unit> {
        val clock = Clock(); val table = table(GameHub(clock::value), 30)
        table.command(0, "start")
        table.command(1, "action", Action.Bid(Seat.WEST, 8, Suit.HEARTS))
        table.command(0, "action", Action.Double(Seat.SOUTH))
        val eastDeadline = table.view().deadlines.getValue(Seat.EAST)
        clock.advance(10_000); table.command(1, "action", Action.DeclineRedouble(Seat.WEST))
        assertEquals(eastDeadline, table.view().deadlines.getValue(Seat.EAST))
        clock.advance(20_001); table.hub.tick()
        assertEquals(Phase.PLAYING, table.view().view?.phase)
    }
    @Test fun completedRecordIsDeliveredThenRemovedFromServer() = runBlocking<Unit> {
        val table = table(); table.command(0, "start"); table.drain()
        table.command(1, "action", Action.Bid(Seat.WEST, 400, Suit.HEARTS)); table.drain()
        repeat(4) { val view = table.view().view ?: error("view"); table.command(view.auction.turn.ordinal, "action", Action.Pass(view.auction.turn)); table.drain() }
        var receipts = emptyList<CompletedMatch>()
        repeat(32) {
            val view = table.view().view ?: error("view")
            val actor = view.turn
            val actorView = table.view(actor.ordinal).view ?: error("view")
            table.command(actor.ordinal, "action", Action.Play(actor, actorView.options.cards.first()))
            receipts = table.drain().mapNotNull { it.match }.ifEmpty { receipts }
        }
        assertEquals(4, receipts.size)
        assertEquals(Seat.entries.toSet(), receipts.map { it.seat }.toSet())
        receipts.forEach { assertEquals(Phase.MATCH_FINISHED, GameEngine.replay(it.record).phase) }
        assertEquals(receipts[0].record, receipts[3].record)
        assertFailsWith<ApiFailure> { table.view() }.also { assertEquals("TABLE_GONE", it.code) }
        assertNull(table.hub.me(table.guests[0].token).tableCode)
    }
    @Test fun lobbySeatChangeAndLeaveDoNotLeakOrLoseHost() = runBlocking<Unit> {
        val hub = GameHub(); val a = hub.issue(GuestRequest()); val b = hub.issue(GuestRequest())
        val code = hub.create(a.token, CreateTable()).code; hub.join(b.token, code)
        val left = hub.connect(a.token, code); val right = hub.connect(b.token, code)
        hub.command(right, GameCommand("seat", "seat", 0, seat = Seat.NORTH))
        assertEquals(Seat.NORTH, hub.snapshot(b.token, code).selfSeat)
        hub.command(left, GameCommand("leave", "leave", 0))
        assertEquals(b.id, hub.snapshot(b.token, code).hostId)
        assertNull(hub.me(a.token).tableCode)
    }
    @Test fun abandonedTablesAndExpiredGuestsAreReleased() = runBlocking<Unit> {
        val clock = Clock(); val hub = GameHub(clock::value, timing = ServerTiming(abandonedTtl = 1000))
        val guest = hub.issue(GuestRequest()); val code = hub.create(guest.token, CreateTable()).code
        clock.advance(1001); hub.tick()
        assertNull(hub.me(guest.token).tableCode)
        assertFailsWith<ApiFailure> { hub.snapshot(guest.token, code) }
        clock.advance(86_400_001); hub.tick()
        assertFailsWith<ApiFailure> { hub.me(guest.token) }.also { assertEquals(401, it.status) }
    }
}
