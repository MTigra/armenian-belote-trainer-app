package am.blot.core

object Scoring {
    /** Inputs are raw card points (last trick included), never rounded small points. */
    fun score(contract: Contract, multiplier: Int, contractTricks: Int, contractCardPoints: Int,
              contractBonus: Int = 0, defenseBonus: Int = 0): DealResult {
        require(contract.amount >= 8)
        require(!contract.promisedCaput || contract.amount >= 26)
        require(multiplier in listOf(1, 2, 4))
        require(contractTricks in 0..8 && contractCardPoints in 0..162)
        require(contractBonus >= 0 && defenseBonus >= 0 && contractBonus % 10 == 0 && defenseBonus % 10 == 0)
        require(contractTricks != 0 || contractCardPoints == 0)
        require(contractTricks != 8 || contractCardPoints == 162)
        val caput = contractTricks == 0 || contractTricks == 8
        val base = if (caput) 25 else 16
        val forContract = if (contractTricks == 8) 250 else contractCardPoints
        val success = contractTricks > 0 && (!contract.promisedCaput || contractTricks == 8) &&
            forContract.toLong() + contractBonus >= contract.amount.toLong() * 10
        val c = contractBonus.toLong() / 10
        val d = defenseBonus.toLong() / 10
        val stake = contract.amount.toLong() * multiplier
        val (awardedContract, awardedDefense) = when {
            !success -> 0L to (stake + base + c + d)
            multiplier > 1 -> (stake + base + c + d) to 0L
            contractTricks == 8 -> (stake + 25 + c) to d
            else -> {
                val defenseSmall = (162 - contractCardPoints + 5) / 10
                (stake + 16 - defenseSmall + c) to (defenseSmall.toLong() + d)
            }
        }
        val totals = Totals().add(contract.bidder.team, awardedContract).add(contract.bidder.team.other(), awardedDefense)
        return DealResult(success, totals, base)
    }
    fun matchWinner(scores: Totals, target: Int, contractTeam: Team, success: Boolean): Team? {
        require(target > 0)
        val c = scores[contractTeam] >= target
        val d = scores[contractTeam.other()] >= target
        return when { c && d -> if (success) contractTeam else contractTeam.other()
            c -> contractTeam; d -> contractTeam.other(); else -> null }
    }
}
