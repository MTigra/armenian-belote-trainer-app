package am.blot.core

/** Immutable, synchronous rule transitions. Network ordering and timers are host responsibilities. */
object GameEngine {
    fun start(deck: List<Card>, dealer: Seat, profileVersion: String = PROFILE_VERSION): GameState = fromHands(CardRules.deal(deck, dealer), dealer, profileVersion)
    private fun fromHands(hands: Map<Seat, List<Card>>, dealer: Seat, profileVersion: String): GameState {
        val frozen = Seat.entries.associateWith { hands.getValue(it).toList() }
        return GameState(profileVersion = profileVersion, dealer = dealer, initialHands = frozen).also { validate(it) }
    }
    fun options(state: GameState, seat: Seat): ActionOptions {
        require(supportedProfile(state.profileVersion)) { "Unsupported rules profile" }
        return when (state.phase) {
            Phase.BIDDING -> ActionOptions(
                minimumBid = if (seat == state.auction.turn) (state.auction.contract?.amount?.toLong()?.plus(1) ?: 8L) else null,
                caputRequired = state.auction.contract?.promisedCaput == true,
                mayPass = seat == state.auction.turn,
                mayDouble = state.auction.contract?.bidder?.team?.let { it != seat.team } ?: false,
            )
            Phase.REDOUBLE -> ActionOptions(mayRedouble = seat in state.auction.pendingRedouble,
                mayDeclineRedouble = seat in state.auction.pendingRedouble)
            Phase.PLAYING -> {
                val deciding = seat == state.turn && state.profileVersion == PROFILE_VERSION &&
                    state.tricks.isEmpty() && seat !in state.declarationDecisions && state.declarations.getValue(seat).isNotEmpty()
                ActionOptions(cards = if (seat == state.turn && !deciding)
                    CardRules.legalCards(state.hands.getValue(seat), seat, state.trick, state.auction.contract!!.trump) else emptyList(),
                    mayDeclare = deciding, mayDeclineDeclarations = deciding,
                    declarationsToShow = if (deciding) state.declarations.getValue(seat) else emptyList())
            }
            else -> ActionOptions()
        }
    }
    fun apply(state: GameState, action: Action): GameState {
        validate(state)
        val o = options(state, action.seat)
        val next = when (action) {
            is Action.Bid -> {
                require(o.minimumBid != null && action.amount.toLong() >= o.minimumBid) { "Bid must raise the current amount on your turn" }
                require(!action.caput || action.amount >= 26) { "Promised caput starts at 26" }
                require(!o.caputRequired || action.caput) { "A caput promise cannot be removed" }
                val c = Contract(action.seat, action.amount, action.trump, action.caput)
                state.copy(auction = Auction(action.seat.next(), c), turn = action.seat.next(),
                    events = state.events + GameEvent(EventKind.BID, action.seat, contract = c))
            }
            is Action.Pass -> {
                require(o.mayPass) { "Cannot pass now" }
                val a = state.auction.copy(turn = action.seat.next(), consecutivePasses = state.auction.consecutivePasses + 1)
                val passed = state.copy(auction = a, turn = a.turn, events = state.events + GameEvent(EventKind.PASS, action.seat))
                if (a.consecutivePasses == 4) {
                    if (a.contract == null) passed.copy(phase = Phase.REDEAL_REQUIRED,
                        events = passed.events + GameEvent(EventKind.REDEAL)) else beginPlay(passed)
                } else passed
            }
            is Action.Double -> {
                require(o.mayDouble) { "Only defense may double while bidding is open" }
                val team = state.auction.contract!!.bidder.team
                val pending = Seat.entries.filter { it.team == team }.toSet()
                state.copy(phase = Phase.REDOUBLE,
                    auction = state.auction.copy(multiplier = 2, pendingRedouble = pending),
                    events = state.events + GameEvent(EventKind.DOUBLE, action.seat))
            }
            is Action.Redouble -> {
                require(o.mayRedouble) { "No remaining right to redouble" }
                beginPlay(state.copy(auction = state.auction.copy(multiplier = 4, pendingRedouble = emptySet()),
                    events = state.events + GameEvent(EventKind.REDOUBLE, action.seat)))
            }
            is Action.DeclineRedouble -> {
                require(o.mayDeclineRedouble) { "No remaining right to decline" }
                val a = state.auction.copy(pendingRedouble = state.auction.pendingRedouble - action.seat)
                val declined = state.copy(auction = a, events = state.events + GameEvent(EventKind.DECLINE_REDOUBLE, action.seat))
                if (a.pendingRedouble.isEmpty()) beginPlay(declined) else declined
            }
            is Action.Declare -> {
                require(o.mayDeclare) { "Cannot declare now" }
                val trump = state.auction.contract!!.trump
                val strongest = state.declarations.getValue(action.seat).maxWith { a, b -> DeclarationRules.compare(a, b, trump, state.dealer.next()) }
                state.copy(declarationDecisions = state.declarationDecisions + action.seat, announced = state.announced + action.seat,
                    events = state.events + GameEvent(EventKind.DECLARATION, action.seat, announcement = DeclarationRules.public(strongest, trump)))
            }
            is Action.DeclineDeclarations -> {
                require(o.mayDeclineDeclarations) { "Cannot decline declarations now" }
                state.copy(declarationDecisions = state.declarationDecisions + action.seat,
                    events = state.events + GameEvent(EventKind.DECLARATION_DECLINED, action.seat))
            }
            is Action.Play -> {
                require(action.card in o.cards) { "Card is not a legal action" }
                play(state, action)
            }
        }
        return next.copy(actions = state.actions + action).also { validate(it) }
    }
    private fun beginPlay(state: GameState): GameState {
        val contract = state.auction.contract!!
        val declarations = Seat.entries.associateWith { DeclarationRules.select(state.initialHands.getValue(it), it, contract.trump, state.dealer.next()) }
        return state.copy(phase = Phase.PLAYING, turn = state.dealer.next(), declarations = declarations,
            auction = state.auction.copy(pendingRedouble = emptySet()),
            events = state.events + GameEvent(EventKind.CONTRACT_FIXED, contract = contract, number = state.auction.multiplier))
    }
    private fun play(original: GameState, action: Action.Play): GameState {
        val trump = original.auction.contract!!.trump
        var state = original
        var events = state.events
        if (state.profileVersion == LEGACY_PROFILE_VERSION && state.tricks.isEmpty() && action.seat !in state.announced) {
            val strongest = state.declarations.getValue(action.seat).maxWithOrNull { a, b -> DeclarationRules.compare(a, b, trump, state.dealer.next()) }
            if (strongest != null) events = events + GameEvent(EventKind.DECLARATION, action.seat,
                announcement = DeclarationRules.public(strongest, trump))
            state = state.copy(announced = state.announced + action.seat)
        }
        if (state.tricks.size == 1 && action.seat !in state.shown) {
            if (eligibleDeclarations(state).any { it.owner == action.seat })
                events = events + eligibleDeclarations(state).filter { it.owner == action.seat }.map {
                    GameEvent(EventKind.DECLARATION_SHOWN, action.seat, declaration = it)
                }
            state = state.copy(shown = state.shown + action.seat)
        }
        if (action.card.suit == trump && action.card.rank in listOf(Rank.KING, Rank.QUEEN) &&
            DeclarationRules.hasBlot(state.initialHands.getValue(action.seat), trump)) {
            if (action.seat !in state.blotFirst) {
                state = state.copy(blotFirst = state.blotFirst + action.seat)
                events = events + GameEvent(EventKind.BLOT, action.seat)
            } else {
                state = state.copy(blotCompleted = state.blotCompleted + action.seat)
                events = events + GameEvent(EventKind.REBLOT, action.seat, number = 20)
            }
        }
        val trick = state.trick + PlayedCard(action.seat, action.card)
        val hands = state.hands + (action.seat to state.hands.getValue(action.seat).filter { it != action.card })
        events = events + GameEvent(EventKind.CARD_PLAYED, action.seat, card = action.card)
        if (trick.size < 4) return state.copy(hands = hands, trick = trick, turn = action.seat.next(), events = events)
        val winner = CardRules.winner(trick, trump).seat
        val points = trick.sumOf { CardRules.points(it.card, trump) } + if (state.tricks.size == 7) 10 else 0
        val won = WonTrick(trick, winner, points)
        val next = state.copy(hands = hands, trick = emptyList(), tricks = state.tricks + won, turn = winner,
            events = events + GameEvent(EventKind.TRICK_WON, winner, number = points))
        return if (next.tricks.size == 8) finishDeal(next) else next
    }
    /** Only declared combinations of the winning team are eligible; no losing bonuses resurrect. */
    private fun eligibleDeclarations(state: GameState): List<Declaration> {
        val candidates = state.declarations.filterKeys { it in state.announced }.values.flatten()
        val team = DeclarationRules.winningTeam(candidates, state.auction.contract!!.trump, state.dealer.next())
        return candidates.filter { it.owner.team == team }
    }
    private fun finishDeal(state: GameState): GameState {
        val contract = state.auction.contract!!
        val cteam = contract.bidder.team
        val eligible = eligibleDeclarations(state).filter { it.owner in state.shown }
        fun bonus(team: Team) = eligible.filter { it.owner.team == team }.sumOf { it.points } +
            state.blotCompleted.count { it.team == team } * 20
        val cTricks = state.tricks.filter { it.winner.team == cteam }
        val result = Scoring.score(contract, state.auction.multiplier, cTricks.size, cTricks.sumOf { it.cardPoints },
            bonus(cteam), bonus(cteam.other()))
        val scores = state.scores + result.awarded
        val winner = Scoring.matchWinner(scores, state.target, cteam, result.contractSucceeded)
        val events = state.events + GameEvent(EventKind.DEAL_SCORED, totals = result.awarded) +
            if (winner != null) listOf(GameEvent(EventKind.MATCH_WON, seat = Seat.entries.first { it.team == winner })) else emptyList()
        return state.copy(phase = if (winner == null) Phase.DEAL_FINISHED else Phase.MATCH_FINISHED,
            result = result, scores = scores, winner = winner, events = events)
    }
    fun nextDeal(state: GameState, deck: List<Card>): GameState {
        validate(state)
        require(state.phase in listOf(Phase.REDEAL_REQUIRED, Phase.DEAL_FINISHED)) { "Cannot redeal during a live or finished match" }
        val next = start(deck, state.dealer.next(), state.profileVersion)
        val number = state.dealNumber + 1
        return next.copy(dealNumber = number, scores = state.scores,
            setups = state.setups + DealSetup(next.dealer, next.initialHands, state.actions.size), actions = state.actions,
            events = state.events + GameEvent(EventKind.DEAL_STARTED, next.dealer, number = number))
    }
    fun view(state: GameState, seat: Seat): PlayerView {
        validate(state)
        val trump = state.auction.contract?.trump
        return PlayerView(state.profileVersion, state.phase, state.dealer, state.dealNumber, state.target, seat,
            state.hands.getValue(seat).toList(), state.hands.mapValues { it.value.size }, state.turn, state.auction,
            state.trick, state.tricks, state.scores,
            state.events.mapNotNull { it.announcement },
            state.events.mapNotNull { it.declaration }, state.events, options(state, seat), currentPoints(state))
    }
    fun currentPoints(state: GameState): Totals {
        val cards = state.tricks.fold(Totals()) { total, trick -> total.add(trick.winner.team, trick.cardPoints.toLong()) }
        val bonuses = if (state.auction.contract == null) emptyList() else eligibleDeclarations(state).filter { it.owner in state.shown }
        return bonuses.fold(cards) { total, declaration -> total.add(declaration.owner.team, declaration.points.toLong()) }
            .let { total -> state.blotCompleted.fold(total) { points, seat -> points.add(seat.team, 20) } }
    }
    /** A simple bot/timeout picks only from the actor's legal public options, never evaluates other hands. */
    fun automaticAction(state: GameState, seat: Seat, showDeclarations: Boolean = true): Action {
        val o = options(state, seat)
        return when {
            o.mayPass -> Action.Pass(seat)
            o.mayDeclineRedouble -> Action.DeclineRedouble(seat)
            o.mayDeclare -> if (showDeclarations) Action.Declare(seat) else Action.DeclineDeclarations(seat)
            o.cards.isNotEmpty() -> Action.Play(seat, o.cards.first())
            else -> throw IllegalArgumentException("No automatic action for this seat")
        }
    }
    fun record(state: GameState): MatchRecord {
        require(state.phase == Phase.MATCH_FINISHED) { "Full match record is available only after completion" }
        return MatchRecord(profileVersion = state.profileVersion, setups = state.setups, actions = state.actions)
    }
    fun replay(record: MatchRecord): GameState {
        require(record.formatVersion == 1 && supportedProfile(record.profileVersion)) { "Unsupported replay version" }
        require(record.setups.isNotEmpty() && record.setups.first().actionOffset == 0)
        var state = fromHands(record.setups.first().hands, record.setups.first().dealer, record.profileVersion)
        var setupIndex = 1
        for (i in 0..record.actions.size) {
            if (setupIndex < record.setups.size && record.setups[setupIndex].actionOffset == i) {
                val setup = record.setups[setupIndex++]
                require(setup.dealer == state.dealer.next()) { "Invalid dealer rotation" }
                val order = (0..3).map { Seat.entries[(setup.dealer.ordinal + 1 + it) % 4] }
                require(setup.hands.keys == Seat.entries.toSet() && setup.hands.values.all { it.size == 8 })
                val deck = (0..1).flatMap { round -> order.flatMap { setup.hands.getValue(it).subList(round * 4, round * 4 + 4) } }
                state = nextDeal(state, deck)
            }
            if (i < record.actions.size) state = apply(state, record.actions[i])
        }
        require(setupIndex == record.setups.size) { "Unreachable setup in replay" }
        return state
    }
    /** Card conservation is checked after every transition and when restoring a snapshot. */
    fun validate(state: GameState) {
        require(supportedProfile(state.profileVersion) && state.target == 301) { "Unsupported profile or target" }
        val seats = Seat.entries.toSet()
        require(state.initialHands.keys == seats && state.hands.keys == seats)
        require(state.initialHands.values.all { it.size == 8 })
        require(state.initialHands.values.flatten().toSet() == CardRules.deck().toSet())
        val played = state.tricks.flatMap { it.plays } + state.trick
        require(state.trick.size < 4 && state.tricks.size <= 8)
        val all = state.hands.values.flatten() + played.map { it.card }
        require(all.size == 32 && all.toSet().size == 32) { "Cards lost or duplicated" }
        for (seat in Seat.entries) require((state.hands.getValue(seat) + played.filter { it.seat == seat }.map { it.card }).toSet() == state.initialHands.getValue(seat).toSet())
        for ((i, trick) in state.tricks.withIndex()) {
            require(trick.plays.size == 4 && trick.plays.map { it.seat }.toSet().size == 4)
            require(trick.plays.zipWithNext().all { (a, b) -> a.seat.next() == b.seat })
            require(trick.winner == CardRules.winner(trick.plays, state.auction.contract!!.trump).seat)
            require(trick.cardPoints == trick.plays.sumOf { CardRules.points(it.card, state.auction.contract.trump) } + if (i == 7) 10 else 0)
        }
        require(state.trick.zipWithNext().all { (a, b) -> a.seat.next() == b.seat })
        if (state.phase == Phase.PLAYING && state.trick.isNotEmpty()) require(state.turn == state.trick.last().seat.next())
        if (state.phase in listOf(Phase.PLAYING, Phase.DEAL_FINISHED, Phase.MATCH_FINISHED)) require(state.auction.contract != null)
        if (state.phase in listOf(Phase.BIDDING, Phase.REDOUBLE, Phase.REDEAL_REQUIRED)) require(played.isEmpty())
        if (state.phase in listOf(Phase.DEAL_FINISHED, Phase.MATCH_FINISHED)) require(state.tricks.size == 8 && state.result != null)
        require(state.phase == Phase.MATCH_FINISHED || state.winner == null)
    }
}
