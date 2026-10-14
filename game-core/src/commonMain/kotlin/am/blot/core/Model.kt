package am.blot.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

const val PROFILE_VERSION = "armenian-training-0.1"

@Serializable enum class Suit { SPADES, HEARTS, DIAMONDS, CLUBS }
// The ordinal is the order for runs, never the order for trick-taking.
@Serializable enum class Rank { SEVEN, EIGHT, NINE, TEN, JACK, QUEEN, KING, ACE }
@Serializable data class Card(val suit: Suit, val rank: Rank) {
    val index: Int get() = suit.ordinal * 8 + rank.ordinal
}
@Serializable enum class Team { NORTH_SOUTH, EAST_WEST;
    fun other() = if (this == NORTH_SOUTH) EAST_WEST else NORTH_SOUTH
}
@Serializable enum class Seat { SOUTH, WEST, NORTH, EAST;
    val team: Team get() = if (ordinal % 2 == 0) Team.NORTH_SOUTH else Team.EAST_WEST
    fun next() = entries[(ordinal + 1) % 4]
    fun partner() = entries[(ordinal + 2) % 4]
}
@Serializable data class Totals(val northSouth: Long = 0, val eastWest: Long = 0) {
    operator fun get(team: Team) = if (team == Team.NORTH_SOUTH) northSouth else eastWest
    fun add(team: Team, amount: Long) = if (team == Team.NORTH_SOUTH) copy(northSouth = northSouth + amount)
        else copy(eastWest = eastWest + amount)
    operator fun plus(other: Totals) = Totals(northSouth + other.northSouth, eastWest + other.eastWest)
}
@Serializable data class Contract(val bidder: Seat, val amount: Int, val trump: Suit? = null, val promisedCaput: Boolean = false)
@Serializable data class PlayedCard(val seat: Seat, val card: Card)
@Serializable data class WonTrick(val plays: List<PlayedCard>, val winner: Seat, val cardPoints: Int)
@Serializable enum class Phase { BIDDING, REDOUBLE, PLAYING, REDEAL_REQUIRED, DEAL_FINISHED, MATCH_FINISHED }
@Serializable data class Auction(
    val turn: Seat,
    val contract: Contract? = null,
    val consecutivePasses: Int = 0,
    val multiplier: Int = 1,
    val pendingRedouble: Set<Seat> = emptySet(),
)
@Serializable enum class DeclarationKind { RUN, FOUR, FOUR_EIGHTS }
@Serializable data class Declaration(val owner: Seat, val kind: DeclarationKind, val cards: List<Card>, val points: Int) {
    val highRank: Rank get() = cards.maxBy { it.rank.ordinal }.rank
}
@Serializable enum class EventKind {
    DEAL_STARTED, BID, PASS, DOUBLE, REDOUBLE, DECLINE_REDOUBLE, CONTRACT_FIXED,
    DECLARATION, DECLARATION_SHOWN, BLOT, REBLOT, CARD_PLAYED, TRICK_WON, DEAL_SCORED, MATCH_WON, REDEAL,
}
/** Events contain public information only. Initial hands belong to private state/archive. */
@Serializable data class GameEvent(
    val kind: EventKind,
    val seat: Seat? = null,
    val card: Card? = null,
    val contract: Contract? = null,
    val declaration: Declaration? = null,
    val announcement: PublicDeclaration? = null,
    val totals: Totals? = null,
    val number: Int? = null,
)
@Serializable data class DealResult(val contractSucceeded: Boolean, val awarded: Totals, val base: Int)
@Serializable data class DealSetup(val dealer: Seat, val hands: Map<Seat, List<Card>>, val actionOffset: Int)
@Serializable data class MatchRecord(
    val profileVersion: String = PROFILE_VERSION,
    val formatVersion: Int = 1,
    val setups: List<DealSetup>,
    val actions: List<Action>,
)
@Serializable data class GameState(
    val profileVersion: String = PROFILE_VERSION,
    val target: Int = 301,
    val dealer: Seat,
    val dealNumber: Int = 1,
    val phase: Phase = Phase.BIDDING,
    val initialHands: Map<Seat, List<Card>>,
    val hands: Map<Seat, List<Card>> = initialHands,
    val auction: Auction = Auction(dealer.next()),
    val turn: Seat = dealer.next(),
    val trick: List<PlayedCard> = emptyList(),
    val tricks: List<WonTrick> = emptyList(),
    val declarations: Map<Seat, List<Declaration>> = emptyMap(),
    val announced: Set<Seat> = emptySet(),
    val shown: Set<Seat> = emptySet(),
    val blotFirst: Set<Seat> = emptySet(),
    val blotCompleted: Set<Seat> = emptySet(),
    val scores: Totals = Totals(),
    val setups: List<DealSetup> = listOf(DealSetup(dealer, initialHands, 0)),
    val actions: List<Action> = emptyList(),
    val result: DealResult? = null,
    val winner: Team? = null,
    val events: List<GameEvent> = listOf(GameEvent(EventKind.DEAL_STARTED, seat = dealer, number = dealNumber)),
)
@Serializable sealed class Action {
    abstract val seat: Seat
    @Serializable @SerialName("bid") data class Bid(override val seat: Seat, val amount: Int, val trump: Suit?, val caput: Boolean = false) : Action()
    @Serializable @SerialName("pass") data class Pass(override val seat: Seat) : Action()
    @Serializable @SerialName("double") data class Double(override val seat: Seat) : Action()
    @Serializable @SerialName("redouble") data class Redouble(override val seat: Seat) : Action()
    @Serializable @SerialName("decline-redouble") data class DeclineRedouble(override val seat: Seat) : Action()
    @Serializable @SerialName("play") data class Play(override val seat: Seat, val card: Card) : Action()
}
@Serializable data class ActionOptions(
    val cards: List<Card> = emptyList(),
    val minimumBid: Long? = null,
    val caputRequired: Boolean = false,
    val mayPass: Boolean = false,
    val mayDouble: Boolean = false,
    val mayRedouble: Boolean = false,
    val mayDeclineRedouble: Boolean = false,
)
@Serializable data class PublicDeclaration(val owner: Seat, val kind: DeclarationKind, val points: Int, val highRank: Rank, val trumpRun: Boolean)
/** Only this projection may go to another player's UI or the trainer during a live match. */
@Serializable data class PlayerView(
    val profileVersion: String,
    val phase: Phase,
    val dealer: Seat,
    val dealNumber: Int,
    val target: Int,
    val seat: Seat,
    val hand: List<Card>,
    val handSizes: Map<Seat, Int>,
    val turn: Seat,
    val auction: Auction,
    val trick: List<PlayedCard>,
    val tricks: List<WonTrick>,
    val scores: Totals,
    val publicDeclarations: List<PublicDeclaration>,
    val shownDeclarations: List<Declaration>,
    val events: List<GameEvent>,
    val options: ActionOptions,
)
