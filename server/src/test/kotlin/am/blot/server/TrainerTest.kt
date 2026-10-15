package am.blot.server

import am.blot.core.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import java.util.UUID
import kotlin.test.*

class TrainerTest {
    private fun request(view: PlayerView = GameEngine.view(GameEngine.start(CardRules.deck(), Seat.SOUTH), Seat.WEST)) =
        TrainerRequest(1, UUID.randomUUID().toString(), "1234", "Что делать?",
            TrainerSource.Offline(UUID.randomUUID().toString(), 0, view))
    private fun model(id: String? = null) = TrainerModelAnswer("advice", id, "Совет по текущему моменту.", emptyList(), emptyList(), emptyList())
    private fun service(hub: GameHub = GameHub(), timeout: Long = 25000, provider: TrainerProvider) =
        TrainerService(hub, TrainerSettings(accessCode = "1234", timeoutMs = timeout), provider)
    private fun bidding(state: GameState): GameState {
        var s = GameEngine.apply(state, Action.Bid(state.auction.turn, 8, Suit.HEARTS))
        repeat(4) { s = GameEngine.apply(s, Action.Pass(s.auction.turn)) }
        return s
    }
    private fun completed(profile: String = PROFILE_VERSION): GameState {
        var state = GameEngine.start(CardRules.deck(), Seat.SOUTH, profile)
        var deals = 0
        while (state.phase != Phase.MATCH_FINISHED) {
            state = bidding(state)
            while (state.phase == Phase.PLAYING) state = GameEngine.apply(state, GameEngine.automaticAction(state, state.turn))
            if (state.phase != Phase.MATCH_FINISHED) state = GameEngine.nextDeal(state, CardRules.deck().shuffled(kotlin.random.Random(++deals)))
            check(deals < 100)
        }
        return state
    }
    @Test fun offlineRecomputesOptionsAndSupportsBothProfilesAndDeclarations() {
        for (profile in listOf(PROFILE_VERSION, LEGACY_PROFILE_VERSION)) {
            val s = bidding(GameEngine.start(CardRules.deck(), Seat.SOUTH, profile))
            val v = GameEngine.view(s, s.turn)
            val r = request(v)
            val snapshot = TrainerContexts.offline(r.source as TrainerSource.Offline)
            val context = TrainerContexts.build(snapshot, r)
            val serialized = trainerJson.encodeToString(context)
            assertFalse(serialized.contains("initialHands"))
            assertNull(context.revealedHands)
            if (profile == PROFILE_VERSION) {
                assertEquals(setOf("declare", "decline-declarations"), context.actionCandidates.map { it.id }.toSet())
            } else assertTrue(context.actionCandidates.all { it.action is Action.Play })
            assertFailsWith<IllegalArgumentException> { TrainerContexts.offline((r.source as TrainerSource.Offline).copy(view = v.copy(options = ActionOptions(mayDouble = true)))) }
            val first = context.actionCandidates.first()
            assertEquals(first.action, validateTrainerAnswer(model(first.id), context, s, r.requestId).suggestion)
            assertFailsWith<TrainerFailure> { validateTrainerAnswer(model("invented-action"), context, s, r.requestId) }
            assertFailsWith<TrainerFailure> { validateTrainerAnswer(model(first.id).copy(alternatives = listOf(ModelAlternative(first.id, "Дубль"))), context, s, r.requestId) }
        }
    }
    @Test fun bidCandidatesKeepDoubleOutsideTurnAndNeverInventUpperRuleLimit() {
        var state = GameEngine.start(CardRules.deck(), Seat.SOUTH)
        state = GameEngine.apply(state, Action.Bid(Seat.WEST, 8, Suit.HEARTS))
        val v = GameEngine.view(state, Seat.SOUTH)
        assertTrue(TrainerContexts.candidates(v).any { it.action is Action.Double })
        assertFalse(TrainerContexts.candidates(v).any { it.action is Action.Bid })
        state = state.copy(auction = state.auction.copy(contract = state.auction.contract!!.copy(amount = Int.MAX_VALUE)))
        val bids = TrainerContexts.candidates(GameEngine.view(state, state.auction.turn))
        assertTrue(bids.none { it.action is Action.Bid })
    }
    @Test fun actualSecondDealThirdCardProjectionAgreesWithReplayAndHasNoFutureData() {
        var s = bidding(GameEngine.start(CardRules.deck(), Seat.SOUTH))
        while (s.phase == Phase.PLAYING) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn))
        s = bidding(GameEngine.nextDeal(s, CardRules.deck().reversed()))
        while (s.trick.size < 2) s = GameEngine.apply(s, GameEngine.automaticAction(s, s.turn))
        val view = GameEngine.view(s, s.turn)
        assertEquals(2, view.dealNumber)
        assertEquals(2, view.trick.size)
        val record = MatchRecord(profileVersion = s.profileVersion, setups = s.setups, actions = s.actions)
        assertEquals(s, GameEngine.replay(record))
        val r = request(view).copy(source = TrainerSource.Offline(UUID.randomUUID().toString(), s.actions.size, view))
        val ctx = TrainerContexts.build(TrainerContexts.offline(r.source as TrainerSource.Offline), r)
        assertEquals(view, ctx.playerView)
        assertEquals(GameEngine.options(s, s.turn), ctx.playerView.options)
        assertNull(ctx.revealedHands)
    }
    @Test fun reviewRequiresCompletionAndProjectsOnlyChosenPrefixIncludingDealBoundaries() {
        for (profile in listOf(PROFILE_VERSION, LEGACY_PROFILE_VERSION)) {
            val final = completed(profile)
            val record = GameEngine.record(final)
            val setup = record.setups[1]
            val src = TrainerSource.Review("archive", "player", Seat.EAST, 2, setup.actionOffset, record)
            val snap = TrainerContexts.review(src)
            assertEquals(2, snap.view.dealNumber)
            assertEquals(8, snap.view.hand.size)
            assertEquals(Phase.BIDDING, snap.view.phase)
            assertEquals(setup.actionOffset, snap.state!!.actions.size)
            val r = request().copy(source = src)
            val player = TrainerContexts.build(snap, r)
            assertNull(player.revealedHands)
            val full = TrainerContexts.build(TrainerContexts.review(src.copy(perspective = "all_hands")), r)
            assertEquals(32, full.revealedHands!!.values.flatten().size)
            assertFailsWith<TrainerFailure> { TrainerContexts.review(src.copy(record = record.copy(actions = record.actions.take(4), setups = record.setups.take(1)))) }
        }
    }
    @Test fun historyCannotCarryRevealedFutureOrOtherPlayersDialogue() {
        val r = request()
        val snapshot = TrainerContexts.offline(r.source as TrainerSource.Offline)
        val m = snapshot.moment
        fun history(text: String, moment: TrainerMoment = m, perspective: String = "player") = TrainerHistory("user", text, moment, perspective)
        val context = TrainerContexts.build(snapshot, r.copy(history = listOf(history("допустимо"), history("будущее", m.copy(actionIndex = 9)),
            history("другой матч", m.copy(matchId = "other")), history("другой игрок", m.copy(seat = Seat.NORTH)), history("все руки", perspective = "all_hands"))))
        assertEquals(listOf("допустимо"), context.history.map { it.text })
    }
    @Test fun concurrentDuplicatesShareCallAndConflictingPayloadIsRejected() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val entered = CompletableDeferred<Unit>()
        var calls = 0
        val service = service { context -> calls++; entered.complete(Unit); gate.await(); model(context.actionCandidates.first().id) }
        try {
            val r = request()
            val a = async { service.ask(r, null) }; entered.await()
            val b = async { service.ask(r, null) }
            yield()
            assertEquals("REQUEST_ID_CONFLICT", assertFailsWith<TrainerFailure> { service.ask(r.copy(question = "Другой вопрос"), null) }.code)
            gate.complete(Unit)
            assertEquals(a.await(), b.await())
            assertEquals(a.await(), service.ask(r, null))
            assertEquals(1, calls)
            assertEquals("TRAINER_ACCESS_DENIED", assertFailsWith<TrainerFailure> { service.ask(r.copy(accessCode = "1111"), null) }.code)
            assertEquals(1, calls)
        } finally { service.close() }
    }
    @Test fun failuresAreNotCachedAndTimeoutDoesNotChangeGame() = runBlocking {
        var calls = 0
        val service = service(timeout = 150) { calls++; delay(1000); model() }
        try {
            val r = request()
            repeat(2) { assertEquals("TRAINER_TIMEOUT", assertFailsWith<TrainerFailure> { service.ask(r, null) }.code) }
            assertEquals(2, calls)
        } finally { service.close() }
    }
    @Test fun onlineSnapshotStaysPrivateAndDoesNotBlockCommandsOrClockAndCachedAnswerSurvivesRevisionChange() = runBlocking {
        var time = 1000L
        val hub = GameHub(now = { time }, deck = CardRules::deck)
        val guests = List(4) { hub.issue(GuestRequest()) }
        val table = hub.create(guests[0].token, CreateTable(timerSeconds = 30))
        guests.drop(1).forEach { hub.join(it.token, table.code) }
        val connections = guests.map { hub.connect(it.token, table.code) }
        hub.command(connections[0], GameCommand("start", "start", 0))
        val gate = CompletableDeferred<Unit>()
        val context = CompletableDeferred<TrainerContext>()
        var calls = 0
        val service = service(hub) { c -> calls++; context.complete(c); gate.await(); model() }
        try {
            val r = request().copy(source = TrainerSource.Online(table.code, 1))
            val pending = async { service.ask(r, guests[2].token) }
            val captured = context.await()
            assertEquals(Seat.NORTH, captured.moment.seat)
            assertEquals(hub.snapshot(guests[2].token, table.code).view!!.hand, captured.playerView.hand)
            assertNull(captured.revealedHands)
            time += 30001
            withTimeout(1000) { hub.tick() }
            assertEquals(2, hub.snapshot(guests[2].token, table.code).revision)
            gate.complete(Unit)
            val answer = pending.await()
            assertEquals(1, answer.moment.revision)
            assertEquals(answer, service.ask(r, guests[2].token))
            assertEquals("STALE_STATE", assertFailsWith<TrainerFailure> { service.ask(r.copy(requestId = UUID.randomUUID().toString()), guests[2].token) }.code)
            val outsider = hub.issue(GuestRequest())
            assertEquals(403, assertFailsWith<TrainerFailure> { service.ask(r, outsider.token) }.status)
            assertEquals(1, calls)
        } finally { service.close(); hub.close() }
    }
    @Test fun httpUsesStrictContractAndSanitizedErrors() = testApplication {
        val hub = GameHub()
        val trainer = service(hub) { c -> model(c.actionCandidates.first().id) }
        application { gameServer(hub, runTicker = false, trainer = trainer) }
        val r = request()
        val good = client.post("/api/trainer") { contentType(ContentType.Application.Json); setBody(trainerJson.encodeToString(r)) }
        assertEquals(200, good.status.value)
        assertEquals(r.requestId, trainerJson.decodeFromString<TrainerAnswer>(good.bodyAsText()).requestId)
        val unknown = client.post("/api/trainer") { setBody(trainerJson.encodeToString(r).dropLast(1) + ",\"secretExtra\":true}") }
        assertEquals(400, unknown.status.value)
        val wrong = client.post("/api/trainer") { setBody(trainerJson.encodeToString(r.copy(accessCode = "0000"))) }
        assertEquals(401, wrong.status.value)
        val tooLarge = client.post("/api/trainer") { setBody("x".repeat(512 * 1024 + 1)) }
        assertEquals(413, tooLarge.status.value)
    }
}
