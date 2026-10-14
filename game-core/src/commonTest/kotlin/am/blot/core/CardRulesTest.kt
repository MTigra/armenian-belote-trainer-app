package am.blot.core

import kotlin.test.*

class CardRulesTest {
    private val h = Suit.HEARTS; private val c = Suit.CLUBS; private val d = Suit.DIAMONDS
    private fun card(s: Suit, r: Rank) = Card(s, r)
    @Test fun deckHas32UniqueCardsAndBothContractsTotal162() {
        assertEquals(32, CardRules.deck().toSet().size)
        for (trump in listOf(null) + Suit.entries) assertEquals(162, CardRules.deck().sumOf { CardRules.points(it, trump) } + 10)
    }
    @Test fun dealUsesTwoRoundsOfFourStartingLeftOfDealer() {
        val deck = CardRules.deck(); val hands = CardRules.deal(deck, Seat.SOUTH)
        assertEquals(deck.take(4) + deck.subList(16,20), hands.getValue(Seat.WEST))
        assertEquals(deck.subList(12,16) + deck.subList(28,32), hands.getValue(Seat.SOUTH))
        assertEquals(32, hands.values.flatten().distinct().size)
        assertTrue(hands.values.all { it.size == 8 })
    }
    @Test fun duplicateOrMissingCardsRejectDeal() {
        assertFailsWith<IllegalArgumentException> { CardRules.deal(CardRules.deck().drop(1), Seat.SOUTH) }
        assertFailsWith<IllegalArgumentException> { CardRules.deal(List(32) { CardRules.deck().first() }, Seat.SOUTH) }
    }
    @Test fun trumpJackBeatsNineAndAceButBoiAceBeatsTen() {
        val plays = listOf(PlayedCard(Seat.SOUTH, card(h,Rank.ACE)), PlayedCard(Seat.WEST,card(h,Rank.NINE)),
            PlayedCard(Seat.NORTH,card(h,Rank.JACK)), PlayedCard(Seat.EAST,card(h,Rank.TEN)))
        assertEquals(Seat.NORTH, CardRules.winner(plays,h).seat)
        assertEquals(Seat.SOUTH, CardRules.winner(plays,null).seat)
    }
    @Test fun offSuitAceCannotWinOverLeadSeven() {
        val trick = listOf(PlayedCard(Seat.SOUTH, card(c,Rank.SEVEN)), PlayedCard(Seat.WEST, card(d,Rank.ACE)))
        assertEquals(Seat.SOUTH, CardRules.winner(trick,null).seat)
        assertEquals(Seat.SOUTH, CardRules.winner(trick,h).seat)
    }
    @Test fun followingPlainSuitIsMandatoryButRaisingIsNot() {
        val low = card(c,Rank.SEVEN); val high = card(c,Rank.ACE)
        assertEquals(listOf(low,high).sortedBy{it.index},CardRules.legalCards(listOf(low,high,card(h,Rank.JACK)),Seat.WEST,
            listOf(PlayedCard(Seat.SOUTH,card(c,Rank.KING))),h))
    }
    @Test fun R01CannotOvertrumpOpponentAllowsDiscard() {
        val trick = listOf(PlayedCard(Seat.SOUTH,card(c,Rank.ACE)),PlayedCard(Seat.WEST,card(h,Rank.JACK)))
        val hand = listOf(card(h,Rank.NINE),card(d,Rank.SEVEN))
        assertEquals(hand.sortedBy{it.index},CardRules.legalCards(hand,Seat.NORTH,trick,h))
    }
    @Test fun R02TrumpLeadMustRaiseEvenWhenPartnerWins() {
        val trick = listOf(PlayedCard(Seat.SOUTH,card(h,Rank.TEN)),PlayedCard(Seat.WEST,card(h,Rank.SEVEN)))
        val high = card(h,Rank.ACE)
        assertEquals(listOf(high),CardRules.legalCards(listOf(high,card(h,Rank.EIGHT),card(d,Rank.ACE)),Seat.NORTH,trick,h))
    }
    @Test fun trumpLeadWithoutHigherTrumpStillRequiresTrump() {
        val low = card(h,Rank.SEVEN)
        assertEquals(listOf(low),CardRules.legalCards(listOf(low,card(d,Rank.ACE)),Seat.WEST,
            listOf(PlayedCard(Seat.SOUTH,card(h,Rank.JACK))),h))
    }
    @Test fun noLeadSuitAndOpponentWinningRequiresWinningTrump() {
        val high = card(h,Rank.JACK)
        val trick = listOf(PlayedCard(Seat.SOUTH,card(c,Rank.SEVEN)),PlayedCard(Seat.WEST,card(h,Rank.NINE)))
        assertEquals(listOf(high),CardRules.legalCards(listOf(high,card(h,Rank.EIGHT),card(d,Rank.ACE)),Seat.NORTH,trick,h))
    }
    @Test fun R03PartnerWinningAllowsDiscardButVoluntaryTrumpMustRaise() {
        val trick = listOf(PlayedCard(Seat.WEST,card(c,Rank.SEVEN)), PlayedCard(Seat.NORTH,card(h,Rank.NINE)),
            PlayedCard(Seat.EAST,card(h,Rank.SEVEN)))
        val high=card(h,Rank.JACK); val discard=card(d,Rank.SEVEN)
        assertEquals(listOf(high,discard).sortedBy{it.index}, CardRules.legalCards(
            listOf(high,discard,card(h,Rank.EIGHT)),Seat.SOUTH,trick,h))
    }
    @Test fun partnerWinningWithoutTrumpStillForbidsLowVoluntaryTrumpIfHigherExists() {
        val trick = listOf(PlayedCard(Seat.SOUTH,card(c,Rank.ACE)),PlayedCard(Seat.WEST,card(c,Rank.SEVEN)))
        // No trump on table: every trump beats the trick, so all are legal.
        val hand = listOf(card(h,Rank.SEVEN),card(h,Rank.JACK),card(d,Rank.ACE))
        assertEquals(hand.sortedBy{it.index},CardRules.legalCards(hand,Seat.NORTH,trick,h))
    }
    @Test fun boiFollowingSuitDoesNotRequireRaise() {
        val hand=listOf(card(c,Rank.SEVEN),card(c,Rank.ACE),card(d,Rank.ACE))
        assertEquals(hand.filter{it.suit==c}.sortedBy{it.index},CardRules.legalCards(hand,Seat.WEST,
            listOf(PlayedCard(Seat.SOUTH,card(c,Rank.KING))),null))
    }
    @Test fun boiVoidAllowsEveryCard() {
        val hand=listOf(card(h,Rank.SEVEN),card(d,Rank.ACE))
        assertEquals(hand.sortedBy{it.index},CardRules.legalCards(hand,Seat.WEST,listOf(PlayedCard(Seat.SOUTH,card(c,Rank.KING))),null))
    }
    @Test fun noTrumpsWhenTrumpLedAllowsEveryCard() {
        val hand=listOf(card(c,Rank.SEVEN),card(d,Rank.ACE))
        assertEquals(hand.sortedBy{it.index},CardRules.legalCards(hand,Seat.WEST,listOf(PlayedCard(Seat.SOUTH,card(h,Rank.KING))),h))
    }
    @Test fun duplicateCardsAndWrongTurnAreRejected() {
        assertFailsWith<IllegalArgumentException> { CardRules.legalCards(listOf(card(c,Rank.ACE),card(c,Rank.ACE)),Seat.WEST,emptyList(),h) }
        assertFailsWith<IllegalArgumentException> { CardRules.legalCards(listOf(card(c,Rank.ACE)),Seat.NORTH,listOf(PlayedCard(Seat.SOUTH,card(c,Rank.SEVEN))),h) }
    }
}
