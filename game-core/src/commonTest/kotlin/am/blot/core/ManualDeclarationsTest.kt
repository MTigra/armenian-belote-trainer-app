package am.blot.core

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.*

class ManualDeclarationsTest {
    private fun playing(profile: String = PROFILE_VERSION): GameState {
        // A run for every player, with the trump run winning the ordinary declarations.
        var s = GameEngine.start(CardRules.deck(), Seat.SOUTH, profile)
        s = GameEngine.apply(s, Action.Bid(Seat.WEST, 8, Suit.SPADES))
        repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
        return s
    }
    @Test fun decisionIsPrivateRequiredOnceAndDoesNotPlayCard() {
        val s = playing()
        val own = GameEngine.view(s, Seat.WEST)
        assertTrue(own.options.mayDeclare)
        assertTrue(own.options.cards.isEmpty())
        assertTrue(own.options.declarationsToShow.all { it.owner == Seat.WEST && it.cards.all { card -> card in own.hand } })
        for (seat in listOf(Seat.SOUTH, Seat.NORTH, Seat.EAST)) {
            val v = GameEngine.view(s, seat)
            assertTrue(v.options.declarationsToShow.isEmpty())
            assertTrue(v.publicDeclarations.isEmpty())
        }
        assertFailsWith<IllegalArgumentException> { GameEngine.apply(s, Action.Play(Seat.WEST, own.hand.first())) }
        assertFailsWith<IllegalArgumentException> { GameEngine.apply(s, Action.Declare(Seat.NORTH)) }
        val declared = GameEngine.apply(s, Action.Declare(Seat.WEST))
        assertEquals(s.hands, declared.hands)
        assertEquals(s.turn, declared.turn)
        assertFalse(GameEngine.options(declared, Seat.WEST).mayDeclare)
        assertTrue(GameEngine.options(declared, Seat.WEST).cards.isNotEmpty())
        assertNull(declared.events.last().declaration)
        assertNotNull(declared.events.last().announcement)
        assertFailsWith<IllegalArgumentException> { GameEngine.apply(declared, Action.Declare(Seat.WEST)) }
    }
    @Test fun declineAndTimeoutLoseOrdinaryBonusButBotsAccept() {
        val s = playing()
        assertEquals(Action.Declare(s.turn), GameEngine.automaticAction(s, s.turn))
        assertEquals(Action.DeclineDeclarations(s.turn), GameEngine.automaticAction(s, s.turn, false))
        var declined = GameEngine.apply(s, Action.DeclineDeclarations(s.turn))
        val actor = s.turn
        while (declined.phase == Phase.PLAYING) declined = GameEngine.apply(declined, GameEngine.automaticAction(declined, declined.turn))
        assertTrue(actor !in declined.announced)
        assertTrue(declined.events.none { it.seat == actor && it.kind in listOf(EventKind.DECLARATION, EventKind.DECLARATION_SHOWN) })
        assertTrue(declined.events.any { it.kind == EventKind.DECLARATION_DECLINED && it.seat == actor })
    }
    @Test fun acceptedProofAppearsOnlyInSecondTrickAndRestoreKeepsChoice() {
        var s = playing()
        while (s.tricks.isEmpty()) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn))
        assertTrue(s.events.none { it.declaration != null })
        assertEquals(s.tricks.fold(Totals()) { total, t -> total.add(t.winner.team, t.cardPoints.toLong()) }, GameEngine.currentPoints(s))
        val restored = Json.decodeFromString<GameState>(Json.encodeToString(s))
        assertEquals(s, restored)
        while (s.tricks.size < 2) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn))
        assertTrue(s.events.any { it.kind == EventKind.DECLARATION_SHOWN })
        val known = s.events.mapNotNull { it.declaration }.fold(GameEngine.currentPoints(s.copy(shown = emptySet()))) { total, d -> total.add(d.owner.team, d.points.toLong()) }
        assertEquals(known, GameEngine.currentPoints(s))
        assertEquals(s, GameEngine.replay(MatchRecord(setups = s.setups, actions = s.actions)))
    }
    @Test fun declinedFourEightsDoNotCancelOpponentsBonuses() {
        val hands = mapOf(
            Seat.SOUTH to listOf(Rank.SEVEN, Rank.EIGHT).flatMap { r -> Suit.entries.map { Card(it, r) } },
            Seat.NORTH to listOf(Rank.NINE, Rank.JACK).flatMap { r -> Suit.entries.map { Card(it, r) } },
            Seat.WEST to listOf(Rank.TEN, Rank.ACE).flatMap { r -> Suit.entries.map { Card(it, r) } },
            Seat.EAST to listOf(Rank.QUEEN, Rank.KING).flatMap { r -> Suit.entries.map { Card(it, r) } })
        val order = listOf(Seat.WEST, Seat.NORTH, Seat.EAST, Seat.SOUTH)
        val deck = (0..1).flatMap { round -> order.flatMap { hands.getValue(it).subList(round * 4, round * 4 + 4) } }
        var s = GameEngine.start(deck, Seat.SOUTH)
        s = GameEngine.apply(s, Action.Bid(Seat.WEST, 8, Suit.HEARTS))
        repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
        while (s.phase == Phase.PLAYING) {
            s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn, showDeclarations = s.turn.team == Team.EAST_WEST))
        }
        assertTrue(s.events.none { it.announcement?.kind == DeclarationKind.FOUR_EIGHTS })
        val shown = s.events.mapNotNull { it.declaration }
        assertTrue(shown.isNotEmpty())
        assertTrue(shown.all { it.owner.team == Team.EAST_WEST })
        assertTrue(Seat.EAST in s.blotCompleted)
    }
    @Test fun allDeclinesPreserveAutomaticBlotAndOnlyCountWonCardsPlusReblot() {
        var s = playing()
        while (s.phase == Phase.PLAYING) {
            val o = GameEngine.options(s, s.turn)
            s = GameEngine.apply(s, if (o.mayDeclare) Action.DeclineDeclarations(s.turn) else GameEngine.automaticAction(s, s.turn))
            val v = GameEngine.view(s, Seat.SOUTH)
            val expected = s.tricks.fold(Totals()) { total, t -> total.add(t.winner.team, t.cardPoints.toLong()) }
                .let { total -> s.blotCompleted.fold(total) { points, seat -> points.add(seat.team, 20) } }
            assertEquals(expected, v.currentPoints)
        }
        assertEquals(162, s.tricks.sumOf { it.cardPoints })
        assertTrue(s.blotCompleted.isNotEmpty())
        assertTrue(s.events.none { it.declaration != null || it.announcement != null })
    }
    @Test fun shuffledDeals0to4() = shuffledDeals(0..4)
    @Test fun shuffledDeals5to9() = shuffledDeals(5..9)
    @Test fun shuffledDeals10to14() = shuffledDeals(10..14)
    @Test fun shuffledDeals15to19() = shuffledDeals(15..19)
    @Test fun shuffledDeals20to24() = shuffledDeals(20..24)
    @Test fun shuffledDeals25to29() = shuffledDeals(25..29)
    private fun shuffledDeals(seeds: IntRange) {
        for (seed in seeds) for (trump in listOf(null) + Suit.entries) {
            var s = GameEngine.start(CardRules.shuffledDeck(seed), Seat.entries[seed % 4])
            s = GameEngine.apply(s, Action.Bid(s.auction.turn, 8, trump))
            repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
            while (s.phase == Phase.PLAYING) {
                s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn, showDeclarations = seed % 2 == 0))
                assertEquals(32, s.hands.values.sumOf { it.size } + s.tricks.sumOf { it.plays.size } + s.trick.size)
            }
            assertEquals(32, s.actions.count { it is Action.Play })
            assertEquals(s, GameEngine.replay(MatchRecord(setups = s.setups, actions = s.actions)))
        }
    }
    @Test fun legacyReplayAndNextDealRetainAutomaticProfile() {
        var s = playing(LEGACY_PROFILE_VERSION)
        assertFalse(GameEngine.options(s, s.turn).mayDeclare)
        while (s.phase == Phase.PLAYING) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn))
        val record = MatchRecord(profileVersion = LEGACY_PROFILE_VERSION, setups = s.setups, actions = s.actions)
        assertEquals(s, GameEngine.replay(record))
        assertTrue(s.events.any { it.kind == EventKind.DECLARATION })
        assertEquals(LEGACY_PROFILE_VERSION, GameEngine.nextDeal(s, CardRules.deck()).profileVersion)
    }
}
