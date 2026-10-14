package am.blot.core

import kotlin.test.*

class DeclarationsTest {
    private val trump=Suit.HEARTS
    private fun run(owner:Seat,suit:Suit,start:Int,length:Int)=Declaration(owner,DeclarationKind.RUN,
        Rank.entries.subList(start,start+length).map{Card(suit,it)},when(length){3->20;4->50;else->100})
    private fun four(owner:Seat,rank:Rank,points:Int)=Declaration(owner,DeclarationKind.FOUR,Suit.entries.map{Card(it,rank)},points)
    @Test fun R13EightOfSuitSplitsIntoFivePlusThreeFor120() {
        val hand=Rank.entries.map{Card(trump,it)}
        val picked=DeclarationRules.select(hand,Seat.SOUTH,trump,Seat.WEST)
        assertEquals(120,picked.sumOf{it.points})
        assertEquals(listOf(3,5),picked.map{it.cards.size}.sorted())
        assertEquals(8,picked.flatMap{it.cards}.distinct().size)
        assertTrue(DeclarationRules.hasBlot(hand,trump))
    }
    @Test fun runOrderIsNaturalNotTrumpStrength() {
        val cards=listOf(Rank.NINE,Rank.TEN,Rank.JACK).map{Card(trump,it)}
        assertEquals(20,DeclarationRules.select(cards,Seat.SOUTH,trump,Seat.WEST).single().points)
        val notRun=listOf(Rank.JACK,Rank.NINE,Rank.ACE).map{Card(trump,it)}
        assertTrue(DeclarationRules.candidates(notRun,Seat.SOUTH,trump).isEmpty())
    }
    @Test fun overlappingFrameAndRunCannotBothCount() {
        val hand=Suit.entries.map{Card(it,Rank.NINE)}+listOf(Rank.SEVEN,Rank.EIGHT,Rank.TEN,Rank.JACK).map{Card(Suit.CLUBS,it)}
        val picked=DeclarationRules.select(hand,Seat.SOUTH,trump,Seat.WEST)
        assertEquals(140,picked.sumOf{it.points});assertEquals(DeclarationKind.FOUR,picked.single().kind)
    }
    @Test fun strongestPriorityThenCompatibleSumFindsFramePlusFourRun() {
        val hand=Suit.entries.map{Card(it,Rank.JACK)}+listOf(Rank.SEVEN,Rank.EIGHT,Rank.NINE,Rank.TEN).map{Card(Suit.CLUBS,it)}
        val picked=DeclarationRules.select(hand,Seat.SOUTH,trump,Seat.WEST)
        assertEquals(250,picked.sumOf{it.points});assertEquals(8,picked.flatMap{it.cards}.distinct().size)
    }
    @Test fun nonOverlappingRunsAdd() {
        val hand=run(Seat.SOUTH,Suit.SPADES,0,3).cards+run(Seat.SOUTH,Suit.CLUBS,3,3).cards
        assertEquals(40,DeclarationRules.select(hand,Seat.SOUTH,trump,Seat.WEST).sumOf{it.points})
    }
    @Test fun deterministicSelectionIgnoresHandListOrder() {
        val hand=Rank.entries.map{Card(Suit.SPADES,it)}
        assertEquals(DeclarationRules.select(hand,Seat.SOUTH,trump,Seat.WEST),DeclarationRules.select(hand.reversed(),Seat.SOUTH,trump,Seat.WEST))
    }
    @Test fun R09TeamStrongestSingleWinsRatherThanTotal() {
        val items=listOf(run(Seat.SOUTH,Suit.SPADES,0,3),run(Seat.NORTH,Suit.DIAMONDS,0,3),
            run(Seat.NORTH,Suit.CLUBS,0,3),run(Seat.WEST,trump,0,4))
        assertEquals(Team.EAST_WEST,DeclarationRules.winningTeam(items,trump,Seat.SOUTH))
    }
    @Test fun R10PointsThenFrameThenRankThenTrumpThenOrder() {
        val seq=run(Seat.SOUTH,Suit.CLUBS,3,5)
        assertTrue(DeclarationRules.compare(four(Seat.WEST,Rank.QUEEN,100),seq,trump,Seat.SOUTH)>0)
        assertTrue(DeclarationRules.compare(four(Seat.SOUTH,Rank.NINE,140),four(Seat.WEST,Rank.ACE,110),trump,Seat.SOUTH)>0)
        assertTrue(DeclarationRules.compare(run(Seat.WEST,trump,1,3),run(Seat.SOUTH,Suit.CLUBS,1,3),trump,Seat.SOUTH)>0)
        assertTrue(DeclarationRules.compare(run(Seat.WEST,Suit.DIAMONDS,1,3),run(Seat.SOUTH,Suit.CLUBS,1,3),trump,Seat.WEST)>0)
        assertTrue(DeclarationRules.compare(run(Seat.SOUTH,Suit.CLUBS,2,3),run(Seat.WEST,trump,1,3),trump,Seat.WEST)>0)
    }
    @Test fun provisionalR21BoiNines100BeatAces190() {
        assertTrue(DeclarationRules.compare(four(Seat.SOUTH,Rank.NINE,100),four(Seat.WEST,Rank.ACE,190),null,Seat.SOUTH)>0)
        assertTrue(DeclarationRules.compare(four(Seat.WEST,Rank.JACK,200),four(Seat.SOUTH,Rank.NINE,100),null,Seat.SOUTH)>0)
    }
    @Test fun boiHasNoTrumpTiebreaker() {
        val a=run(Seat.SOUTH,Suit.HEARTS,2,3);val b=run(Seat.WEST,Suit.SPADES,2,3)
        assertTrue(DeclarationRules.compare(a,b,null,Seat.WEST)<0)
    }
    @Test fun R23FourEightsNeutralizeOrdinaryDeclarations() {
        val eights=DeclarationRules.select(Suit.entries.map{Card(it,Rank.EIGHT)},Seat.SOUTH,trump,Seat.WEST).single()
        assertEquals(0,eights.points);assertEquals(DeclarationKind.FOUR_EIGHTS,eights.kind)
        assertEquals(Team.NORTH_SOUTH,DeclarationRules.winningTeam(listOf(eights,four(Seat.WEST,Rank.JACK,200)),trump,Seat.WEST))
    }
    @Test fun fourSevensAreNotADeclaration() {
        assertTrue(DeclarationRules.candidates(Suit.entries.map{Card(it,Rank.SEVEN)},Seat.SOUTH,trump).isEmpty())
    }
    @Test fun fourValuesFollowTrumpAndBoiTables() {
        for((rank,a,b) in listOf(Triple(Rank.NINE,140,100),Triple(Rank.ACE,110,190),Triple(Rank.JACK,200,200),Triple(Rank.KING,100,100))) {
            val hand=Suit.entries.map{Card(it,rank)}
            assertEquals(a,DeclarationRules.candidates(hand,Seat.SOUTH,trump).single().points)
            assertEquals(b,DeclarationRules.candidates(hand,Seat.SOUTH,null).single().points)
        }
    }
    @Test fun blotNeedsKingQueenInOneHandAndDoesNotExistInBoi() {
        val cards=listOf(Card(trump,Rank.KING),Card(trump,Rank.QUEEN))
        assertTrue(DeclarationRules.hasBlot(cards,trump));assertFalse(DeclarationRules.hasBlot(cards,null))
        assertFalse(DeclarationRules.hasBlot(cards.take(1),trump))
    }
    @Test fun selectionInvariantsAcrossRandomDealsAndAllContracts() {
        for(seed in 0..39) {
            val hands=CardRules.deal(CardRules.shuffledDeck(seed),Seat.SOUTH)
            for(trump in listOf(null)+Suit.entries) for(seat in Seat.entries) {
                val picked=DeclarationRules.select(hands.getValue(seat),seat,trump,Seat.WEST)
                val cards=picked.flatMap{it.cards}
                assertEquals(cards.distinct().size,cards.size)
                assertTrue(cards.all{it in hands.getValue(seat)})
            }
        }
    }
}
