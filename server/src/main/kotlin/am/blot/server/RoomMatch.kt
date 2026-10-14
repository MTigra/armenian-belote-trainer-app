package am.blot.server

import am.blot.core.*

internal class RoomMatch(seconds: Int?) {
    private var state: GameState? = null
    private var revision = 0L
    private val clock = MatchClock(seconds)
    fun revision() = revision
    fun lobby() = state == null
    fun phase() = state?.phase
    fun requireState() = state ?: fail(409, "NOT_STARTED", "Партия ещё не началась.")
    fun checkRevision(expected: Long) {
        if (expected != revision) fail(409, "STALE_STATE", "Партия изменилась. Повторите действие по текущему состоянию.")
    }
    fun start(deck: List<Card>, now: Long) {
        if (!lobby()) fail(409, "ALREADY_STARTED", "Партия уже началась.")
        commit(GameEngine.start(deck, Seat.SOUTH), null, now)
    }
    fun act(action: Action, now: Long) {
        val current = requireState()
        val updated = try { GameEngine.apply(current, action) } catch (_: IllegalArgumentException) {
            fail(409, "ILLEGAL_ACTION", "Этот ход сейчас недопустим.")
        }
        commit(updated, action.seat, now)
    }
    fun advance(deck: List<Card>, now: Long) {
        val current = requireState()
        if (current.phase !in listOf(Phase.DEAL_FINISHED, Phase.REDEAL_REQUIRED)) fail(409, "ROUND_ACTIVE", "Раздача ещё продолжается.")
        commit(GameEngine.nextDeal(current, deck), null, now)
    }
    private fun commit(next: GameState, moved: Seat?, now: Long) {
        state = next
        revision++
        clock.update(next, moved, now)
    }
    fun view(seat: Seat) = state?.let { GameEngine.view(it, seat) }
    fun result() = state?.result
    fun winner() = state?.winner
    fun actionCount() = state?.actions?.size ?: 0
    fun deadlines() = clock.deadlines()
    fun automaticSeat(members: TableMembers, now: Long, timing: ServerTiming): Seat? {
        val current = state ?: return null
        clock.expired(now)?.let { return it }
        val delay = timing.botDelay.coerceAtLeast(if (current.trick.isEmpty() && current.tricks.isNotEmpty()) 1000 else 0)
        return requiredSeats(current).firstOrNull { members.botControls(it) && clock.botReady(it, now, delay) }
    }
    fun automatic(seat: Seat, now: Long) = act(GameEngine.automaticAction(requireState(), seat), now)
}
