package am.blot.core

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.*

private fun closeAuction(state: GameState, amount: Int = 8, trump: Suit? = Suit.HEARTS): GameState {
    var s=GameEngine.apply(state,Action.Bid(state.auction.turn,amount,trump))
    repeat(4){s=GameEngine.apply(s,Action.Pass(s.auction.turn))}
    return s
}
private fun finishCards(state:GameState):GameState {
    var s=state
    while(s.phase==Phase.PLAYING) s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))
    return s
}
private fun completeMatch(seed:Int):GameState {
    var s=GameEngine.start(CardRules.shuffledDeck(seed),Seat.SOUTH)
    var n=0
    while(s.phase!=Phase.MATCH_FINISHED) {
        s=finishCards(closeAuction(s,trump=if(n%2==0) Suit.HEARTS else null))
        if(s.phase==Phase.DEAL_FINISHED) s=GameEngine.nextDeal(s,CardRules.shuffledDeck(seed+(++n)))
        check(n<100)
    }
    return s
}
private fun suitHands(): Map<Seat,List<Card>> = mapOf(
    Seat.SOUTH to Rank.entries.map{Card(Suit.CLUBS,it)},Seat.WEST to Rank.entries.map{Card(Suit.SPADES,it)},
    Seat.NORTH to Rank.entries.map{Card(Suit.HEARTS,it)},Seat.EAST to Rank.entries.map{Card(Suit.DIAMONDS,it)})
private fun deckFor(hands:Map<Seat,List<Card>>,dealer:Seat=Seat.SOUTH):List<Card> {
    val order=(0..3).map{Seat.entries[(dealer.ordinal+1+it)%4]}
    return (0..1).flatMap{r->order.flatMap{hands.getValue(it).subList(r*4,r*4+4)}}
}

class AuctionTest {
    private fun start()=GameEngine.start(CardRules.shuffledDeck(12),Seat.SOUTH)
    @Test fun fourInitialPassesRequestNewDeckAndRotateDealerWithoutPoints() {
        var s=start();repeat(4){s=GameEngine.apply(s,Action.Pass(s.auction.turn))}
        assertEquals(Phase.REDEAL_REQUIRED,s.phase);assertEquals(Totals(),s.scores)
        val next=GameEngine.nextDeal(s,CardRules.shuffledDeck(13))
        assertEquals(Seat.WEST,next.dealer);assertEquals(Seat.NORTH,next.auction.turn)
        assertEquals(2,next.dealNumber);assertEquals(Totals(),next.scores)
    }
    @Test fun R24ThreePassesDoNotCloseAndBidderMayRaiseAgain() {
        var s=GameEngine.apply(start(),Action.Bid(Seat.WEST,8,Suit.CLUBS))
        repeat(3){s=GameEngine.apply(s,Action.Pass(s.auction.turn))}
        assertEquals(Phase.BIDDING,s.phase);assertEquals(Seat.WEST,s.auction.turn)
        s=GameEngine.apply(s,Action.Bid(Seat.WEST,9,null))
        assertEquals(0,s.auction.consecutivePasses);assertEquals(9,s.auction.contract!!.amount)
        repeat(4){s=GameEngine.apply(s,Action.Pass(s.auction.turn))}
        assertEquals(Phase.PLAYING,s.phase);assertEquals(Seat.WEST,s.turn)
    }
    @Test fun R26AllSuitsAndBoiRequireNumericalRaise() {
        val s=GameEngine.apply(start(),Action.Bid(Seat.WEST,8,Suit.CLUBS))
        for(trump in listOf(null)+Suit.entries) {
            assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Bid(Seat.NORTH,8,trump))}
            assertEquals(9,GameEngine.apply(s,Action.Bid(Seat.NORTH,9,trump)).auction.contract!!.amount)
        }
    }
    @Test fun R27PartnerMayRaiseAndPriorPassDoesNotExcludePlayer() {
        var s=GameEngine.apply(start(),Action.Bid(Seat.WEST,8,Suit.CLUBS))
        s=GameEngine.apply(s,Action.Pass(Seat.NORTH))
        s=GameEngine.apply(s,Action.Bid(Seat.EAST,9,null))
        s=GameEngine.apply(s,Action.Pass(Seat.SOUTH));s=GameEngine.apply(s,Action.Pass(Seat.WEST))
        assertEquals(10,GameEngine.apply(s,Action.Bid(Seat.NORTH,10,Suit.HEARTS)).auction.contract!!.amount)
    }
    @Test fun R28DefenseMayDoubleOutOfTurnButContractTeamCannot() {
        val s=GameEngine.apply(start(),Action.Bid(Seat.WEST,8,Suit.CLUBS))
        assertEquals(Seat.NORTH,s.auction.turn)
        assertEquals(Phase.REDOUBLE,GameEngine.apply(s,Action.Double(Seat.SOUTH)).phase)
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Double(Seat.EAST))}
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(closeAuction(start()),Action.Double(Seat.SOUTH))}
    }
    @Test fun R29DeclineByOneDoesNotRemovePartnersRedoubleRight() {
        var s=GameEngine.apply(start(),Action.Bid(Seat.WEST,8,Suit.CLUBS))
        s=GameEngine.apply(s,Action.Double(Seat.SOUTH));s=GameEngine.apply(s,Action.DeclineRedouble(Seat.EAST))
        assertEquals(Phase.REDOUBLE,s.phase);assertEquals(setOf(Seat.WEST),s.auction.pendingRedouble)
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.DeclineRedouble(Seat.EAST))}
        s=GameEngine.apply(s,Action.Redouble(Seat.WEST))
        assertEquals(Phase.PLAYING,s.phase);assertEquals(4,s.auction.multiplier)
    }
    @Test fun bothDeclinesStartPlayWithMultiplierTwoAndFrozenContract() {
        var s=GameEngine.apply(start(),Action.Bid(Seat.WEST,11,null))
        s=GameEngine.apply(s,Action.Double(Seat.NORTH))
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Bid(Seat.EAST,12,Suit.SPADES))}
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Play(Seat.WEST,s.hands.getValue(Seat.WEST).first()))}
        s=GameEngine.apply(s,Action.DeclineRedouble(Seat.WEST));s=GameEngine.apply(s,Action.DeclineRedouble(Seat.EAST))
        assertEquals(2,s.auction.multiplier);assertEquals(11,s.auction.contract!!.amount);assertNull(s.auction.contract!!.trump)
    }
    @Test fun caputPromiseStartsAt26AndCannotBeRemoved() {
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(start(),Action.Bid(Seat.WEST,25,null,true))}
        val s=GameEngine.apply(start(),Action.Bid(Seat.WEST,26,null,true))
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Bid(Seat.NORTH,27,Suit.HEARTS,false))}
        assertEquals(27,GameEngine.apply(s,Action.Bid(Seat.NORTH,27,Suit.HEARTS,true)).auction.contract!!.amount)
    }
    @Test fun noArtificialMaximumOnBidAndMinimumIsEight() {
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(start(),Action.Bid(Seat.WEST,7,null))}
        assertEquals(10000,GameEngine.apply(start(),Action.Bid(Seat.WEST,10000,null)).auction.contract!!.amount)
    }
    @Test fun wrongTurnRejectedAndFailedActionDoesNotMutateState() {
        val s=start();val before=Json.encodeToString(s)
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Pass(Seat.SOUTH))}
        assertEquals(before,Json.encodeToString(s));assertEquals(Seat.WEST,s.turn)
    }
}

class GameEngineTest {
    @Test fun allCardMovesPreserve32CardsAcrossBothContracts() {
        for(seed in 0..29) for(trump in listOf(null)+Suit.entries) {
            var s=closeAuction(GameEngine.start(CardRules.shuffledDeck(seed),Seat.entries[seed%4]),trump=trump)
            var count=0
            while(s.phase==Phase.PLAYING) {
                val o=GameEngine.options(s,s.turn);assertTrue(o.cards.isNotEmpty())
                val old=s;s=GameEngine.apply(s,Action.Play(s.turn,o.cards[count%o.cards.size]));count++
                assertEquals(32,s.hands.values.flatten().size+s.tricks.sumOf{it.plays.size}+s.trick.size)
                assertEquals(old.hands.values.flatten().size-1,s.hands.values.flatten().size)
            }
            assertEquals(32,count);assertEquals(8,s.tricks.size)
            assertEquals(162,s.tricks.sumOf{it.cardPoints});assertTrue(s.hands.values.all{it.isEmpty()})
            assertEquals(32,s.tricks.flatMap{it.plays}.map{it.card}.distinct().size)
            assertNotNull(s.result)
        }
    }
    @Test fun winnerLeadsNextTrickAndLastTrickAddsTenOnlyOnce() {
        var s=closeAuction(GameEngine.start(CardRules.shuffledDeck(7),Seat.SOUTH))
        repeat(4){s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))}
        assertEquals(s.tricks.last().winner,s.turn)
        s=finishCards(s)
        for((i,t) in s.tricks.withIndex()) assertEquals(t.plays.sumOf{CardRules.points(it.card,Suit.HEARTS)}+if(i==7)10 else 0,t.cardPoints)
    }
    @Test fun cardNotInHandOrIllegalSuitAndRepeatedPlayAreRejected() {
        var s=closeAuction(GameEngine.start(CardRules.shuffledDeck(6),Seat.SOUTH))
        val other=s.hands.getValue(s.turn.next()).first()
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,Action.Play(s.turn,other))}
        val play=GameEngine.automaticAction(s,s.turn) as Action.Play
        s=GameEngine.apply(s,play)
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(s,play)}
        val finished=finishCards(s)
        assertFailsWith<IllegalArgumentException>{GameEngine.apply(finished,Action.Pass(finished.turn))}
    }
    @Test fun declarationAnnouncedBeforeFirstCardWithoutExposingItsCards() {
        var s=closeAuction(GameEngine.start(deckFor(suitHands()),Seat.SOUTH),trump=Suit.SPADES)
        assertTrue(GameEngine.view(s,Seat.SOUTH).publicDeclarations.isEmpty())
        s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))
        val events=s.events.takeLast(2)
        assertEquals(EventKind.DECLARATION,events[0].kind);assertEquals(EventKind.CARD_PLAYED,events[1].kind)
        assertNull(events[0].declaration);assertNotNull(events[0].announcement)
        val v=GameEngine.view(s,Seat.SOUTH)
        assertEquals(1,v.publicDeclarations.size);assertTrue(v.shownDeclarations.isEmpty())
    }
    @Test fun onlyWinningDeclarationsShownInSecondTrickIncludingAlreadyPlayedCards() {
        var s=closeAuction(GameEngine.start(deckFor(suitHands()),Seat.SOUTH),trump=Suit.SPADES)
        repeat(4){s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))}
        assertEquals(Seat.WEST,s.turn)
        val previous=s.tricks.single().plays.first().card
        s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))
        val shown=s.events.filter{it.kind==EventKind.DECLARATION_SHOWN}.mapNotNull{it.declaration}
        assertEquals(2,shown.size);assertTrue(shown.all{it.owner==Seat.WEST})
        assertTrue(previous in shown.flatMap{it.cards})
        repeat(3){s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))}
        assertEquals(4,s.events.count{it.kind==EventKind.DECLARATION_SHOWN})
        assertTrue(s.events.mapNotNull{it.declaration}.all{it.owner.team==Team.EAST_WEST})
    }
    @Test fun blotAndReblotAreAutomaticAndDoNotDependOnOrdinaryDeclarationWin() {
        val s=finishCards(closeAuction(GameEngine.start(deckFor(suitHands()),Seat.SOUTH),trump=Suit.HEARTS))
        assertEquals(setOf(Seat.NORTH),s.blotCompleted)
        assertEquals(1,s.events.count{it.kind==EventKind.BLOT})
        assertEquals(1,s.events.count{it.kind==EventKind.REBLOT})
        assertEquals(20,s.events.single{it.kind==EventKind.REBLOT}.number)
    }
    @Test fun fourEightsCancelOpponentsOrdinaryBonusesButNotBlot() {
        val hands=mapOf(
            Seat.SOUTH to listOf(Rank.SEVEN,Rank.EIGHT).flatMap{r->Suit.entries.map{Card(it,r)}},
            Seat.NORTH to listOf(Rank.NINE,Rank.JACK).flatMap{r->Suit.entries.map{Card(it,r)}},
            Seat.WEST to listOf(Rank.TEN,Rank.ACE).flatMap{r->Suit.entries.map{Card(it,r)}},
            Seat.EAST to listOf(Rank.QUEEN,Rank.KING).flatMap{r->Suit.entries.map{Card(it,r)}})
        val s=finishCards(closeAuction(GameEngine.start(deckFor(hands),Seat.SOUTH),trump=Suit.HEARTS))
        val shown=s.events.mapNotNull{it.declaration}
        assertTrue(shown.all{it.owner.team==Team.NORTH_SOUTH})
        assertEquals(340,shown.sumOf{it.points})
        assertTrue(Seat.EAST in s.blotCompleted)
        assertEquals(1,s.events.count{it.kind==EventKind.REBLOT})
    }
    @Test fun boiNeverAnnouncesBlot() {
        val s=finishCards(closeAuction(GameEngine.start(deckFor(suitHands()),Seat.SOUTH),trump=null))
        assertTrue(s.blotCompleted.isEmpty());assertTrue(s.events.none{it.kind in listOf(EventKind.BLOT,EventKind.REBLOT)})
    }
    @Test fun liveProjectionDoesNotExposeOtherHandsOrUnannouncedDeclarations() {
        val hands=suitHands();val s=closeAuction(GameEngine.start(deckFor(hands),Seat.SOUTH),trump=Suit.HEARTS)
        val v=GameEngine.view(s,Seat.SOUTH)
        assertEquals(hands.getValue(Seat.SOUTH),v.hand)
        assertTrue(v.events.none{it.declaration!=null||it.announcement!=null})
        val text=Json.encodeToString(v)
        assertFalse("initialHands" in text);assertFalse("setups" in text);assertFalse("actions" in text)
        assertFalse("\"hands\"" in text);assertTrue(v.shownDeclarations.isEmpty())
        assertFailsWith<IllegalArgumentException>{GameEngine.record(s)}
    }
    @Test fun legalOptionsDoNotDependOnHiddenHandDistribution() {
        val s=closeAuction(GameEngine.start(CardRules.shuffledDeck(2),Seat.SOUTH))
        val a=s.turn.next();val b=a.next()
        val swapped=s.copy(initialHands=s.initialHands+(a to s.initialHands.getValue(b))+(b to s.initialHands.getValue(a)),
            hands=s.hands+(a to s.hands.getValue(b))+(b to s.hands.getValue(a)))
        assertEquals(GameEngine.options(s,s.turn),GameEngine.options(swapped,s.turn))
        assertEquals(GameEngine.view(s,s.turn).hand,GameEngine.view(swapped,s.turn).hand)
    }
    @Test fun snapshotJsonRoundTripCanContinueIdentically() {
        var s=closeAuction(GameEngine.start(CardRules.shuffledDeck(4),Seat.SOUTH))
        repeat(7){s=GameEngine.apply(s,GameEngine.automaticAction(s,s.turn))}
        val restored=Json.decodeFromString<GameState>(Json.encodeToString(s))
        GameEngine.validate(restored);assertEquals(s,restored);assertEquals(finishCards(s),finishCards(restored))
    }
    @Test fun fullMatchReplayRetainsDealerRotationProfileAndScore() {
        val state=completeMatch(1);val record=GameEngine.record(state)
        assertEquals(PROFILE_VERSION,record.profileVersion);assertTrue(record.setups.size>1)
        val decoded=Json.decodeFromString<MatchRecord>(Json.encodeToString(record))
        assertEquals(state,GameEngine.replay(decoded))
        assertNotNull(state.winner);assertTrue(state.scores[state.winner!!]>=301)
        assertFailsWith<IllegalArgumentException>{GameEngine.nextDeal(state,CardRules.deck())}
    }
    @Test fun replayIncludesAllPassRedeal() {
        var s=GameEngine.start(CardRules.shuffledDeck(1),Seat.SOUTH)
        repeat(4){s=GameEngine.apply(s,Action.Pass(s.auction.turn))}
        s=GameEngine.nextDeal(s,CardRules.shuffledDeck(2));s=finishCards(closeAuction(s))
        assertEquals(s,GameEngine.replay(MatchRecord(setups=s.setups,actions=s.actions)))
    }
    @Test fun invalidSnapshotAndUnknownVersionsAreRejected() {
        val s=GameEngine.start(CardRules.deck(),Seat.SOUTH)
        assertFailsWith<IllegalArgumentException>{GameEngine.validate(s.copy(hands=s.hands+(Seat.SOUTH to emptyList())))}
        assertFailsWith<IllegalArgumentException>{GameEngine.validate(s.copy(profileVersion="future"))}
        assertFailsWith<IllegalArgumentException>{GameEngine.replay(MatchRecord(profileVersion="future",setups=s.setups,actions=emptyList()))}
        assertFailsWith<IllegalArgumentException>{GameEngine.replay(MatchRecord(formatVersion=2,setups=s.setups,actions=emptyList()))}
    }
    @Test fun JSONBoundaryExposesSameCoreToJSAndJVM() {
        val initial=RulesJson.start(4,"SOUTH")
        assertTrue(RulesJson.validateSnapshot(initial))
        val next=RulesJson.apply(initial,Json.encodeToString<Action>(Action.Bid(Seat.WEST,8,Suit.HEARTS)))
        val v=Json.decodeFromString<PlayerView>(RulesJson.view(next,"SOUTH"))
        assertEquals(8,v.auction.contract!!.amount);assertEquals(8,v.hand.size)
        assertEquals(Action.Pass(Seat.NORTH),Json.decodeFromString<Action>(RulesJson.automaticAction(next,"NORTH")))
    }
}
