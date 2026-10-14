package am.blot.core

import kotlin.test.*

class ScoringTest {
    private fun contract(n:Int=10, caput:Boolean=false, seat:Seat=Seat.SOUTH) = Contract(seat,n,Suit.HEARTS,caput)
    @Test fun allProfileScoreExamples() {
        data class Case(val n:Int,val m:Int,val tricks:Int,val points:Int,val cb:Int,val db:Int,val caput:Boolean,val expected:Totals)
        val cases=listOf(
            Case(10,1,8,162,0,0,false,Totals(35,0)),
            Case(10,1,0,0,0,0,false,Totals(0,35)),
            Case(10,2,8,162,0,0,false,Totals(45,0)),
            Case(10,2,0,0,0,0,false,Totals(0,45)),
            Case(10,4,8,162,0,0,false,Totals(65,0)),
            Case(10,4,0,0,0,0,false,Totals(0,65)),
            Case(8,1,0,0,100,0,false,Totals(0,43)),
            Case(10,1,8,162,20,20,false,Totals(37,2)),
            Case(10,2,8,162,20,20,false,Totals(49,0)),
            Case(26,1,8,162,20,0,true,Totals(53,0)),
            Case(26,1,7,150,100,0,true,Totals(0,52)),
        )
        for(c in cases) assertEquals(c.expected,Scoring.score(contract(c.n,c.caput),c.m,c.tricks,c.points,c.cb,c.db).awarded,c.toString())
    }
    @Test fun sharedRoundingWithDefensePriority() {
        for((raw,c,d) in listOf(Triple(117,11,5),Triple(106,10,6),Triple(147,14,2))) {
            assertEquals(Totals(8+c.toLong(),d.toLong()),Scoring.score(contract(8),1,5,raw).awarded)
        }
    }
    @Test fun contractCheckUsesUnroundedPointsAndOwnBonusesOnly() {
        assertFalse(Scoring.score(contract(8),1,3,79).contractSucceeded)
        assertTrue(Scoring.score(contract(8),1,3,80).contractSucceeded)
        assertTrue(Scoring.score(contract(8),1,3,60,20).contractSucceeded)
        assertFalse(Scoring.score(contract(8),1,3,60,0,200).contractSucceeded)
    }
    @Test fun contractNeedNotOutscoreDefense() {
        assertTrue(Scoring.score(contract(8),1,3,80).contractSucceeded) // defense has 82
    }
    @Test fun multiplierOnlyAffectsBidNotBaseOrBonuses() {
        assertEquals(Totals(10*4+16+2+5L,0),Scoring.score(contract(),4,5,110,20,50).awarded)
        assertEquals(Totals(0,10*4+16+2+5L),Scoring.score(contract(),4,2,60,20,50).awarded)
    }
    @Test fun actualCaputDoesNotAutomaticallyFulfillHighBid() {
        assertFalse(Scoring.score(contract(26),1,8,162).contractSucceeded)
        assertEquals(Totals(0,51),Scoring.score(contract(26),1,8,162).awarded)
        assertTrue(Scoring.score(contract(26),1,8,162,20).contractSucceeded)
    }
    @Test fun declaredCaputNeedsAllEightEvenWithEnoughPoints() {
        assertFalse(Scoring.score(contract(26,true),1,7,160,200).contractSucceeded)
        assertEquals(16,Scoring.score(contract(26,true),1,7,160,200).base)
    }
    @Test fun R34ZeroTricksCannotFulfillWithDeclarations() {
        assertFalse(Scoring.score(contract(8),1,0,0,200).contractSucceeded)
    }
    @Test fun bonusesAreExactSmallPointsNotRoundedWithTricks() {
        assertEquals(Totals(8+11+14L,5),Scoring.score(contract(8),1,4,117,140).awarded)
    }
    @Test fun bidderTeamMapsResultCorrectly() {
        assertEquals(Totals(0,35),Scoring.score(contract(seat=Seat.WEST),1,8,162).awarded)
    }
    @Test fun simultaneous301UsesContractOutcomeNotHigherScore() {
        assertEquals(Team.NORTH_SOUTH,Scoring.matchWinner(Totals(301,500),301,Team.NORTH_SOUTH,true))
        assertEquals(Team.EAST_WEST,Scoring.matchWinner(Totals(500,301),301,Team.NORTH_SOUTH,false))
        assertNull(Scoring.matchWinner(Totals(50,70),301,Team.NORTH_SOUTH,false))
        assertEquals(Team.NORTH_SOUTH,Scoring.matchWinner(Totals(301,70),301,Team.NORTH_SOUTH,true))
    }
    @Test fun invalidInputsRejectedAndLargeBidsDoNotOverflow() {
        assertFailsWith<IllegalArgumentException> { Scoring.score(contract(),3,4,100) }
        assertFailsWith<IllegalArgumentException> { Scoring.score(contract(),1,8,100) }
        assertFailsWith<IllegalArgumentException> { Scoring.score(contract(),1,4,100,15) }
        assertEquals(8_589_934_604L,Scoring.score(contract(Int.MAX_VALUE),4,1,1).awarded.eastWest)
    }
}
