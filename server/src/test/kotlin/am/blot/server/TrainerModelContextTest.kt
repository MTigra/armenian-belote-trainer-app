package am.blot.server

import am.blot.core.*
import kotlinx.serialization.json.*
import kotlinx.serialization.encodeToString
import java.io.File
import kotlin.test.*

class TrainerModelContextTest {
    private fun context(s: GameState): TrainerContext {
        val v = GameEngine.view(s, s.turn)
        val r = TrainerRequest(1, "9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", "1234", "Что лучше сделать?",
            TrainerSource.Offline("9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", s.actions.size, v))
        return TrainerContexts.build(TrainerContexts.offline(r.source as TrainerSource.Offline), r, compactRules = true)
    }
    private fun bid(s: GameState): GameState {
        var state = GameEngine.apply(s, Action.Bid(s.turn, 8, Suit.HEARTS))
        repeat(4) { state = GameEngine.apply(state, Action.Pass(state.auction.turn)) }
        return state
    }
    private fun secondDeal(): GameState {
        var state = bid(GameEngine.start(CardRules.deck(), Seat.SOUTH))
        while (state.phase == Phase.PLAYING) state = GameEngine.apply(state, GameEngine.automaticAction(state, state.turn))
        state = bid(GameEngine.nextDeal(state, CardRules.deck().reversed()))
        while (state.trick.size < 2) state = GameEngine.apply(state, GameEngine.automaticAction(state, state.turn))
        return state
    }
    @Test fun secondDealKeepsCurrentPublicFactsWithoutHistoricDeclarationsOrDuplicateCards() {
        val ctx = context(secondDeal())
        val model = TrainerModelContexts.json(ctx)
        val current = model.getValue("currentDeal").jsonObject
        val v = ctx.playerView
        val start = v.events.indexOfLast { it.kind == EventKind.DEAL_STARTED }
        val currentEvents = v.events.drop(start)
        assertFalse(model.containsKey("playerView"))
        assertFalse(current.containsKey("events"))
        assertFalse(current.containsKey("publicDeclarations"))
        val timeline = current.getValue("publicTimeline").jsonArray
        assertEquals(currentEvents.filter { it.kind !in setOf(EventKind.DEAL_STARTED, EventKind.CARD_PLAYED, EventKind.TRICK_WON) }
            .map { it.kind.name }, timeline.map { it.jsonObject.getValue("kind").jsonPrimitive.content })
        var cards = 0
        var index = 0
        currentEvents.forEach { e -> when(e.kind) {
            EventKind.CARD_PLAYED -> cards++
            EventKind.DEAL_STARTED, EventKind.TRICK_WON -> Unit
            else -> assertEquals(cards, timeline[index++].jsonObject.getValue("afterCards").jsonPrimitive.int)
        } }
        assertEquals(v.trick.size, current.getValue("currentTrick").jsonArray.size)
        assertEquals(v.tricks.size, current.getValue("completedTricks").jsonArray.size)
        val prior = model.getValue("previousDeals").jsonArray.single().jsonObject
        assertEquals(1, prior.getValue("dealNumber").jsonPrimitive.int)
        assertEquals(8, prior.getValue("contract").jsonObject.getValue("amount").jsonPrimitive.int)
        assertNotNull(prior["awarded"])
        assertFalse(prior.containsKey("declaration"))
        assertTrue(model.toString().length < trainerJson.encodeToString(TrainerContext.serializer(), ctx).length * 0.65)
        // Adding/removing earlier public details cannot change this deal's view.
        assertEquals(current, TrainerModelContexts.json(ctx.copy(playerView = v.copy(events = currentEvents))) ["currentDeal"])
        assertEquals(ctx.actionCandidates.map { it.id }, model.getValue("actionCandidates").jsonArray.map { it.jsonPrimitive.content })
    }
    @Test fun outsideHandPoolUsesOnlyOwnHandAndPublicPlaysAndDoesNotAssignOwners() {
        var s = secondDeal()
        repeat(12) { if (s.phase == Phase.PLAYING) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn)) }
        val c = context(s)
        val current = TrainerModelContexts.json(c).getValue("currentDeal").jsonObject
        val hand = current.getValue("hand").jsonArray.map { it.jsonPrimitive.content }
        val pool = current.getValue("outsideHandUnplayed").jsonObject.values.flatMap { it.jsonArray.map { it.jsonPrimitive.content } }
        val plays = c.playerView.tricks.flatMap { it.plays } + c.playerView.trick
        assertEquals(32 - plays.size - hand.size, pool.size)
        assertEquals(pool.size, pool.distinct().size)
        assertTrue(pool.none { it in hand })
        assertFalse(TrainerModelContexts.json(c).containsKey("revealedHands"))
        val exposed = TrainerModelContexts.json(c.copy(perspective = "all_hands", revealedHands = s.hands))
        assertEquals(4, exposed.getValue("revealedHands").jsonObject.size)
        assertEquals(hand, exposed.getValue("revealedHands").jsonObject.getValue(c.moment.seat.name).jsonArray.map { it.jsonPrimitive.content })
    }
    @Test fun conversationRetainsWholeRecentMessagesWithExplicitOmissionCounts() {
        val c = context(secondDeal())
        val history = (0..7).map { TrainerHistory("user", "$it".repeat(1500), c.moment, "player") }
        val model = TrainerModelContexts.json(c.copy(history = history))
        assertEquals(listOf(history[6].text, history[7].text), model.getValue("history").jsonArray.map { it.jsonObject.getValue("text").jsonPrimitive.content })
        assertEquals(6, model.getValue("omittedHistoryMessages").jsonPrimitive.int)
        val short = TrainerModelContexts.json(c.copy(history = history.map { it.copy(text = it.text.take(10)) }))
        assertEquals(4, short.getValue("history").jsonArray.size)
    }
    @Test fun noTrumpIsExplicitAndHandPointTotalsUseCorrectNoTrumpAceValues() {
        var s = GameEngine.start(CardRules.deck(), Seat.SOUTH)
        s = GameEngine.apply(s, Action.Bid(s.turn, 8, null))
        repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
        val model = TrainerModelContexts.json(context(s)).getValue("currentDeal").jsonObject
        assertEquals("NONE", model.getValue("auction").jsonObject.getValue("contract").jsonObject.getValue("trump").jsonPrimitive.content)
        val bidding = context(GameEngine.start(CardRules.deck(), Seat.SOUTH))
        val totals = TrainerModelContexts.json(bidding).getValue("currentDeal").jsonObject.getValue("handCardPointsByTrump").jsonObject
        assertEquals(bidding.playerView.hand.sumOf { CardRules.points(it, null) }, totals.getValue("NONE").jsonPrimitive.int)
    }
    @Test fun redealsAreSummarizedAndOlderSummariesHaveExplicitOmissionCount() {
        var s = GameEngine.start(CardRules.deck(), Seat.SOUTH)
        repeat(12) {
            repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
            s = GameEngine.nextDeal(s, CardRules.deck())
        }
        val model = TrainerModelContexts.json(context(s))
        val prior = model.getValue("previousDeals").jsonArray
        assertEquals(8, prior.size)
        assertEquals(4, model.getValue("omittedPreviousDeals").jsonPrimitive.int)
        assertEquals((5..12).toList(), prior.map { it.jsonObject.getValue("dealNumber").jsonPrimitive.int })
        assertTrue(prior.all { it.jsonObject.getValue("redeal").jsonPrimitive.boolean })
    }
    private fun opening(): GameState {
        val hand = listOf(Card(Suit.SPADES, Rank.JACK), Card(Suit.SPADES, Rank.NINE), Card(Suit.SPADES, Rank.SEVEN),
            Card(Suit.DIAMONDS, Rank.TEN), Card(Suit.DIAMONDS, Rank.ACE), Card(Suit.HEARTS, Rank.KING), Card(Suit.CLUBS, Rank.JACK), Card(Suit.CLUBS, Rank.SEVEN))
        val others = CardRules.deck().filter { it !in hand }.chunked(8)
        val hands = mapOf(Seat.SOUTH to hand, Seat.WEST to others[0], Seat.NORTH to others[1], Seat.EAST to others[2])
        val s = GameState(dealer = Seat.EAST, initialHands = hands)
        GameEngine.validate(s)
        return s
    }
    @Test fun openingJackNineSevenHasSpadeBidNineAndAllCandidatesRemainExecutable() {
        val s = opening()
        val ctx = context(s)
        assertTrue(ctx.actionCandidates.any { it.id == "bid:9:SPADES:false" })
        ctx.actionCandidates.forEach { GameEngine.apply(s, it.action) }
        val json = TrainerModelContexts.json(ctx)
        assertEquals(61, json.getValue("currentDeal").jsonObject.getValue("handCardPointsByTrump")
            .jsonObject.getValue("SPADES").jsonPrimitive.int)
        assertTrue(json.toString().contains("SJ"))
        assertTrue(json.toString().contains("S9"))
        assertTrue(json.toString().contains("S7"))
        assertTrue(TrainerResources.prompt.contains("J+9+another trump"))
    }
    @Test fun reproducibleExamplesUseProductionProjectionAndKeepOriginalViewValid() {
        val old = trainerJson.decodeFromString<TrainerContext>(File("../docs/examples/trainer/context-deal2-card3.json").readText())
        val source = TrainerSource.Offline(old.moment.matchId, old.moment.actionIndex, old.playerView)
        val request = TrainerRequest(1, "d6c5a0bb-ecf2-41a5-9d9a-821fd755c6b6", "1234", old.question, source)
        val ctx = TrainerContexts.build(TrainerContexts.offline(source), request, compactRules = true)
        val out = File("build/trainer-fixtures").apply { mkdirs() }
        GroqTrainer(TrainerSettings()).use { provider ->
            File(out, "deal2-card3-groq.json").writeText(provider.requestBody(ctx).toString())
            File(out, "deal2-card3-http.json").writeText(trainerJson.encodeToString(request))
            val opening = opening()
            val c = context(opening)
            File(out, "opening-groq.json").writeText(provider.requestBody(c).toString())
            File(out, "opening-http.json").writeText(trainerJson.encodeToString(request.copy(question = c.question,
                source = TrainerSource.Offline(c.moment.matchId, opening.actions.size, c.playerView))))
        }
        assertEquals(2, TrainerModelContexts.json(ctx).getValue("contextVersion").jsonPrimitive.int)
        assertEquals(old.playerView, ctx.playerView)
    }
}
