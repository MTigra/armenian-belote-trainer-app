package am.blot.server

import am.blot.core.*

internal fun requiredSeats(state: GameState): List<Seat> = when (state.phase) {
    Phase.BIDDING -> listOf(state.auction.turn)
    Phase.PLAYING -> listOf(state.turn)
    Phase.REDOUBLE -> Seat.entries.filter { it in state.auction.pendingRedouble }
    Phase.REDEAL_REQUIRED, Phase.DEAL_FINISHED, Phase.MATCH_FINISHED -> emptyList()
}
internal class MatchClock(private val seconds: Int?) {
    private var context: Pair<Phase, Int>? = null
    private var started = emptyMap<Seat, Long>()
    fun update(state: GameState, moved: Seat?, now: Long) {
        val nextContext = state.phase to state.dealNumber
        val previous = started.takeIf { context == nextContext }.orEmpty()
        started = requiredSeats(state).associateWith { seat -> previous[seat]?.takeIf { seat != moved } ?: now }
        context = nextContext
    }
    fun deadlines(): Map<Seat, Long> = seconds?.let { limit -> started.mapValues { it.value + limit * 1000L } }.orEmpty()
    fun expired(now: Long) = deadlines().entries.firstOrNull { it.value <= now }?.key
    fun botReady(seat: Seat, now: Long, delay: Long) = started[seat]?.let { now - it >= delay } == true
}
data class ServerTiming(val reconnectGrace: Long = 120_000L, val botDelay: Long = 650L, val abandonedTtl: Long = 21_600_000L)
