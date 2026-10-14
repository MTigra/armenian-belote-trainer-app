package am.blot.core

import kotlin.random.Random

object CardRules {
    fun deck(): List<Card> = Suit.entries.flatMap { s -> Rank.entries.map { Card(s, it) } }
    /** All randomness is an explicit input; a saved deck is the replay authority. */
    fun shuffledDeck(seed: Int): List<Card> = deck().shuffled(Random(seed))
    private val plainOrder = listOf(Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.TEN, Rank.ACE)
    private val trumpOrder = listOf(Rank.SEVEN, Rank.EIGHT, Rank.QUEEN, Rank.KING, Rank.TEN, Rank.ACE, Rank.NINE, Rank.JACK)
    fun strength(card: Card, trump: Suit?): Int = (if (card.suit == trump) trumpOrder else plainOrder).indexOf(card.rank)
    fun points(card: Card, trump: Suit?): Int = when (card.rank) {
        Rank.ACE -> if (trump == null) 19 else 11
        Rank.TEN -> 10
        Rank.KING -> 4
        Rank.QUEEN -> 3
        Rank.JACK -> if (card.suit == trump) 20 else 2
        Rank.NINE -> if (card.suit == trump) 14 else 0
        else -> 0
    }
    fun winner(trick: List<PlayedCard>, trump: Suit?): PlayedCard {
        require(trick.isNotEmpty() && trick.size <= 4) { "A trick contains 1..4 cards" }
        require(trick.map { it.seat }.distinct().size == trick.size) { "A player cannot play twice in a trick" }
        require(trick.map { it.card }.distinct().size == trick.size) { "Duplicate card in trick" }
        val lead = trick.first().card.suit
        return trick.maxBy { if (it.card.suit == trump) 100 + strength(it.card, trump)
            else if (it.card.suit == lead) strength(it.card, trump) else -1 }
    }
    /** Only the player's hand and public trick are required, not any other hand. */
    fun legalCards(hand: List<Card>, seat: Seat, trick: List<PlayedCard>, trump: Suit?): List<Card> {
        require(hand.distinct().size == hand.size) { "Duplicate card in hand" }
        require(trick.size < 4) { "Trick is already complete" }
        if (trick.isEmpty()) return hand.sortedBy { it.index }
        require(trick.last().seat.next() == seat) { "Not this player's turn" }
        val lead = trick.first().card.suit
        val following = hand.filter { it.suit == lead }
        val winning = winner(trick, trump)
        val trumps = hand.filter { it.suit == trump }
        val highestTrump = trick.filter { it.card.suit == trump }.maxOfOrNull { strength(it.card, trump) }
        val higher = trumps.filter { strength(it, trump) > (highestTrump ?: -1) }
        val allowed = when {
            lead == trump && following.isNotEmpty() -> higher.ifEmpty { following }
            following.isNotEmpty() -> following
            trump == null || trumps.isEmpty() -> hand
            winning.seat.team != seat.team -> higher.ifEmpty { hand }
            higher.isNotEmpty() -> hand.filter { it.suit != trump } + higher
            else -> hand
        }
        return allowed.sortedBy { it.index }
    }
    fun deal(deck: List<Card>, dealer: Seat): Map<Seat, List<Card>> {
        require(deck.size == 32 && deck.toSet() == this.deck().toSet()) { "A deal needs the complete 32-card deck" }
        val order = (0..3).map { Seat.entries[(dealer.ordinal + 1 + it) % 4] }
        return order.mapIndexed { i, seat -> seat to (deck.subList(i * 4, i * 4 + 4) + deck.subList(16 + i * 4, 20 + i * 4)) }.toMap()
    }
}
