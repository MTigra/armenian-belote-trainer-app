package am.blot.server

import am.blot.core.*
import java.util.UUID

internal object TrainerResources {
    fun text(name: String): String = requireNotNull(javaClass.getResourceAsStream("/trainer/$name")) { "Missing trainer resource" }
        .bufferedReader().use { it.readText() }
    val prompt by lazy { text("trainer-system-prompt.txt") }
    val schema by lazy { trainerJson.parseToJsonElement(text("trainer-model.schema.json")) }
    fun rules(version: String): TrainerRules {
        if (!supportedProfile(version)) trainerFail(422, "UNSUPPORTED_RULES_PROFILE", "Версия правил не поддерживается.")
        return TrainerRules(version, text("rules/profile-v1.md") + if (version == PROFILE_VERSION)
            "\n\nСледующее дополнение имеет приоритет над базовым текстом:\n" + text("rules/profile-v2.md") else "")
    }
}
internal data class TrainerSnapshot(val state: GameState?, val view: PlayerView, val moment: TrainerMoment, val perspective: String = "player")
internal fun validUuid(value: String) = runCatching { UUID.fromString(value).toString().equals(value, true) }.getOrDefault(false)
internal fun validateTrainerRequest(r: TrainerRequest) {
    if (r.protocolVersion != 1) trainerFail(422, "UNSUPPORTED_TRAINER_VERSION", "Обновите приложение: версия тренера не поддерживается.")
    if (!validUuid(r.requestId) || r.question.trim().codePointCount(0, r.question.trim().length) !in 1..2000) invalidTrainer()
    if (r.history.size > 12 || r.history.sumOf { it.text.codePointCount(0, it.text.length) } > 12000) invalidTrainer()
    if (r.history.any { it.role !in listOf("user", "coach") || it.text.isBlank() || it.text.codePointCount(0, it.text.length) > 2000 ||
        it.perspective !in listOf("player", "all_hands") || it.moment.actionIndex < 0 || it.moment.dealNumber < 1 ||
        it.moment.matchId.length !in 1..100 || (it.moment.revision?.let { v -> v < 0 } == true) }) invalidTrainer()
    when (val s = r.source) {
        is TrainerSource.Offline -> if (!validUuid(s.localMatchId) || s.actionIndex < 0) invalidTrainer()
        is TrainerSource.Online -> if (!Regex("[0-9]{6}").matches(s.tableCode) || s.expectedRevision < 0) invalidTrainer()
        is TrainerSource.Review -> if (s.localMatchId.length !in 1..100 || s.perspective !in listOf("player", "all_hands") ||
            s.dealNumber < 1 || s.actionIndex !in 0..s.record.actions.size || s.record.setups.size > 1000 || s.record.actions.size > 20000) invalidTrainer()
    }
}
internal object TrainerContexts {
    fun offline(s: TrainerSource.Offline): TrainerSnapshot {
        val view = validateOfflineView(s.view)
        return TrainerSnapshot(null, view, TrainerMoment(s.localMatchId, view.dealNumber, s.actionIndex, null, view.seat))
    }
    fun review(s: TrainerSource.Review): TrainerSnapshot {
        TrainerResources.rules(s.record.profileVersion)
        if (s.record.formatVersion != 1) invalidTrainer()
        val completed = GameEngine.replay(s.record)
        if (completed.phase != Phase.MATCH_FINISHED) invalidTrainer()
        val setups = s.record.setups.take(s.dealNumber)
        if (setups.size != s.dealNumber || setups.last().actionOffset > s.actionIndex ||
            s.record.setups.getOrNull(s.dealNumber)?.actionOffset?.let { it < s.actionIndex } == true) invalidTrainer()
        val state = GameEngine.replay(s.record.copy(setups = setups, actions = s.record.actions.take(s.actionIndex)))
        if (state.dealNumber != s.dealNumber) invalidTrainer()
        return TrainerSnapshot(state, GameEngine.view(state, s.seat),
            TrainerMoment(s.localMatchId, state.dealNumber, s.actionIndex, null, s.seat), s.perspective)
    }
    fun build(snapshot: TrainerSnapshot, r: TrainerRequest): TrainerContext {
        val v = snapshot.view
        return TrainerContext(rules = TrainerResources.rules(v.profileVersion), moment = snapshot.moment, perspective = snapshot.perspective,
            playerView = v, actionCandidates = candidates(v), question = r.question.trim(), history = r.history.filter {
                it.moment.matchId == snapshot.moment.matchId && it.moment.seat == snapshot.moment.seat &&
                it.perspective == snapshot.perspective && it.moment.actionIndex <= snapshot.moment.actionIndex &&
                it.moment.dealNumber <= snapshot.moment.dealNumber
            }, revealedHands = if (snapshot.perspective == "all_hands") snapshot.state!!.hands else null, requestId = r.requestId)
    }
    fun candidates(v: PlayerView): List<TrainerCandidate> = buildList {
        val o = v.options
        fun add(id: String, a: Action) { add(TrainerCandidate(id, a)) }
        o.cards.forEach { add("play:${it.suit}:${it.rank}", Action.Play(v.seat, it)) }
        if (o.mayPass) add("pass", Action.Pass(v.seat))
        if (o.mayDouble) add("double", Action.Double(v.seat))
        if (o.mayRedouble) add("redouble", Action.Redouble(v.seat))
        if (o.mayDeclineRedouble) add("decline-redouble", Action.DeclineRedouble(v.seat))
        if (o.mayDeclare) add("declare", Action.Declare(v.seat))
        if (o.mayDeclineDeclarations) add("decline-declarations", Action.DeclineDeclarations(v.seat))
        o.minimumBid?.let { minimum ->
            for (caput in listOf(false, true)) {
                if (!caput && o.caputRequired) continue
                val from = if (caput) maxOf(26, minimum) else minimum
                for (n in from..minOf(from + 4, Int.MAX_VALUE.toLong())) for (suit in Suit.entries + listOf(null))
                    add("bid:$n:${suit ?: "NONE"}:$caput", Action.Bid(v.seat, n.toInt(), suit, caput))
            }
        }
    }
    /** Derives options using engine code; never accepts client options as an authority. */
    private fun validateOfflineView(v: PlayerView): PlayerView {
        TrainerResources.rules(v.profileVersion)
        require(v.target == 301 && v.dealNumber >= 1 && v.hand.size <= 8 && v.trick.size < 4 && v.tricks.size <= 8)
        require(v.handSizes.keys == Seat.entries.toSet() && v.handSizes.values.all { it in 0..8 })
        require(v.handSizes.getValue(v.seat) == v.hand.size && v.scores.northSouth >= 0 && v.scores.eastWest >= 0)
        require(v.auction.multiplier in listOf(1, 2, 4) && v.auction.consecutivePasses in 0..4)
        v.auction.contract?.let { require(it.amount >= 8 && (!it.promisedCaput || it.amount >= 26)) }
        require(v.phase !in listOf(Phase.PLAYING, Phase.REDOUBLE, Phase.DEAL_FINISHED, Phase.MATCH_FINISHED) || v.auction.contract != null)
        val plays = v.tricks.flatMap { it.plays } + v.trick
        require(v.handSizes.values.sum() + plays.size == 32)
        require((v.hand + plays.map { it.card }).distinct().size == v.hand.size + plays.size)
        require(v.trick.zipWithNext().all { (a,b) -> a.seat.next() == b.seat })
        if (v.phase == Phase.PLAYING && v.trick.isNotEmpty()) require(v.turn == v.trick.last().seat.next())
        for (t in v.tricks) {
            require(t.plays.size == 4 && t.plays.map { it.seat }.toSet().size == 4)
            require(t.plays.zipWithNext().all { (a,b) -> a.seat.next() == b.seat })
            require(t.winner == CardRules.winner(t.plays, v.auction.contract!!.trump).seat)
            require(t.cardPoints == t.plays.sumOf { CardRules.points(it.card, v.auction.contract!!.trump) } + if (v.tricks.indexOf(t) == 7) 10 else 0)
        }
        for (seat in Seat.entries) require(v.handSizes.getValue(seat) + plays.count { it.seat == seat } == 8)
        val currentEvents = v.events.drop(v.events.indexOfLast { it.kind == EventKind.DEAL_STARTED }.coerceAtLeast(0))
        val initialOwn = v.hand + plays.filter { it.seat == v.seat }.map { it.card }
        val ownDeclarations = v.auction.contract?.let { DeclarationRules.select(initialOwn, v.seat, it.trump, v.dealer.next()) } ?: emptyList()
        val decisions = currentEvents.filter { it.kind in listOf(EventKind.DECLARATION, EventKind.DECLARATION_DECLINED) }.mapNotNull { it.seat }.toSet() +
            plays.map { it.seat }
        // This partial internal object is used only by options(), never apply/view/validate.
        val hands = Seat.entries.associateWith { if (it == v.seat) v.hand else emptyList() }
        val partial = GameState(profileVersion = v.profileVersion, dealer = v.dealer, initialHands = hands, hands = hands,
            phase = v.phase, auction = v.auction, turn = v.turn, trick = v.trick, tricks = v.tricks,
            declarations = Seat.entries.associateWith { if (it == v.seat) ownDeclarations else emptyList() }, declarationDecisions = decisions)
        val options = GameEngine.options(partial, v.seat)
        require(v.options == options) { "Inconsistent visible options" }
        require(v.publicDeclarations == v.events.mapNotNull { it.announcement } && v.shownDeclarations == v.events.mapNotNull { it.declaration })
        return v.copy(options = options)
    }
}
internal fun validateTrainerAnswer(raw: TrainerModelAnswer, context: TrainerContext, state: GameState?, requestId: String): TrainerAnswer {
    if (raw.answerType !in listOf("advice", "rules", "analysis", "clarification") || raw.explanation.isBlank() || raw.explanation.length > 4000 ||
        raw.alternatives.size > 3 || raw.assumptions.size > 5 || raw.assumptions.any { it.isBlank() || it.length > 500 } ||
        raw.ruleRefs.size > 10 || raw.ruleRefs.distinct().size != raw.ruleRefs.size ||
        raw.ruleRefs.any { !Regex("R[0-9]{2}").matches(it) || !context.rules.text.contains(it) }) invalidAnswer()
    if (raw.answerType == "clarification" && (raw.suggestionActionId != null || raw.alternatives.isNotEmpty())) invalidAnswer()
    val ids = listOfNotNull(raw.suggestionActionId) + raw.alternatives.map { it.actionId }
    if (ids.distinct().size != ids.size) invalidAnswer()
    val candidates = context.actionCandidates.associate { it.id to it.action }
    fun action(id: String): Action = candidates[id]?.also { a ->
        if (state != null) try { GameEngine.apply(state, a) } catch (_: IllegalArgumentException) { invalidAnswer() }
    } ?: invalidAnswer()
    val suggestion = raw.suggestionActionId?.let(::action)
    val alternatives = raw.alternatives.map {
        if (it.explanation.isBlank() || it.explanation.length > 1000) invalidAnswer()
        TrainerAlternative(action(it.actionId), it.explanation)
    }
    return TrainerAnswer(requestId = requestId, moment = context.moment, perspective = context.perspective,
        profileVersion = context.rules.profileVersion, answerType = raw.answerType, suggestion = suggestion,
        explanation = raw.explanation, alternatives = alternatives, assumptions = raw.assumptions, ruleRefs = raw.ruleRefs,
        validation = TrainerValidation(actions = if (ids.isEmpty()) "not_applicable" else "passed"))
}
