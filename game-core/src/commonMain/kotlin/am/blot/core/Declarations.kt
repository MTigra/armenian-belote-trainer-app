package am.blot.core

object DeclarationRules {
    private val fourOrder = listOf(Rank.QUEEN, Rank.KING, Rank.TEN, Rank.ACE, Rank.NINE, Rank.JACK)
    private fun fourPoints(rank: Rank, trump: Suit?) = when (rank) {
        Rank.JACK -> 200
        Rank.NINE -> if (trump == null) 100 else 140
        Rank.ACE -> if (trump == null) 190 else 110
        Rank.TEN, Rank.KING, Rank.QUEEN -> 100
        else -> 0
    }
    fun candidates(hand: List<Card>, owner: Seat, trump: Suit?): List<Declaration> {
        require(hand.size <= 8 && hand.distinct().size == hand.size)
        val result = mutableListOf<Declaration>()
        for (rank in Rank.entries) {
            val cards = hand.filter { it.rank == rank }.sortedBy { it.index }
            if (cards.size == 4 && rank != Rank.SEVEN) result += Declaration(owner,
                if (rank == Rank.EIGHT) DeclarationKind.FOUR_EIGHTS else DeclarationKind.FOUR, cards, fourPoints(rank, trump))
        }
        for (suit in Suit.entries) {
            val cards = hand.filter { it.suit == suit }.sortedBy { it.rank.ordinal }
            for (start in cards.indices) for (length in 3..7) {
                if (start + length > cards.size) continue
                val run = cards.subList(start, start + length)
                if (run.last().rank.ordinal - run.first().rank.ordinal == length - 1)
                    result += Declaration(owner, DeclarationKind.RUN, run, when (length) { 3 -> 20; 4 -> 50; else -> 100 })
            }
        }
        return result
    }
    /** Positive means a wins; seat order is relative to the deal's first speaker. R21 is versioned here. */
    fun compare(a: Declaration, b: Declaration, trump: Suit?, first: Seat): Int {
        val ae = a.kind == DeclarationKind.FOUR_EIGHTS
        val be = b.kind == DeclarationKind.FOUR_EIGHTS
        if (ae != be) return if (ae) 1 else -1
        if (trump == null && a.kind == DeclarationKind.FOUR && b.kind == DeclarationKind.FOUR) {
            val rank = fourOrder.indexOf(a.highRank).compareTo(fourOrder.indexOf(b.highRank))
            if (rank != 0) return rank
        } else {
            val points = a.points.compareTo(b.points)
            if (points != 0) return points
        }
        if (a.kind != b.kind) return if (a.kind == DeclarationKind.FOUR) 1 else -1
        val rank = if (a.kind == DeclarationKind.FOUR) fourOrder.indexOf(a.highRank).compareTo(fourOrder.indexOf(b.highRank))
            else a.highRank.ordinal.compareTo(b.highRank.ordinal)
        if (rank != 0) return rank
        if (a.kind == DeclarationKind.RUN && trump != null) {
            val at = a.cards.first().suit == trump
            val bt = b.cards.first().suit == trump
            if (at != bt) return if (at) 1 else -1
        }
        fun order(seat: Seat) = (seat.ordinal - first.ordinal + 4) % 4
        return order(b.owner).compareTo(order(a.owner))
    }
    /** Enumerate compatible subsets of an eight-card hand: priority, total, deterministic card order. */
    fun select(hand: List<Card>, owner: Seat, trump: Suit?, first: Seat): List<Declaration> {
        val candidates = candidates(hand, owner, trump).sortedBy { key(it) }
        var best = emptyList<Declaration>()
        fun strongest(items: List<Declaration>) = items.maxWithOrNull { a, b -> compare(a, b, trump, first) }
        fun better(a: List<Declaration>, b: List<Declaration>): Boolean {
            val aa = strongest(a); val bb = strongest(b)
            val priority = if (aa == null) if (bb == null) 0 else -1 else if (bb == null) 1 else compare(aa, bb, trump, first)
            if (priority != 0) return priority > 0
            if (a.sumOf { it.points } != b.sumOf { it.points }) return a.sumOf { it.points } > b.sumOf { it.points }
            return a.joinToString("|") { key(it) } < b.joinToString("|") { key(it) }
        }
        fun visit(index: Int, used: Set<Card>, picked: List<Declaration>) {
            if (index == candidates.size) { if (better(picked, best)) best = picked; return }
            visit(index + 1, used, picked)
            val d = candidates[index]
            if (d.cards.none { it in used }) visit(index + 1, used + d.cards, picked + d)
        }
        visit(0, emptySet(), emptyList())
        return best
    }
    private fun key(d: Declaration) = d.cards.sortedBy { it.index }.joinToString(",") { it.index.toString().padStart(2, '0') }
    fun winningTeam(declarations: List<Declaration>, trump: Suit?, first: Seat): Team? =
        declarations.maxWithOrNull { a, b -> compare(a, b, trump, first) }?.owner?.team
    fun hasBlot(hand: List<Card>, trump: Suit?): Boolean = trump != null &&
        Card(trump, Rank.KING) in hand && Card(trump, Rank.QUEEN) in hand
    fun public(d: Declaration, trump: Suit?) = PublicDeclaration(d.owner, d.kind, d.points, d.highRank,
        d.kind == DeclarationKind.RUN && d.cards.first().suit == trump)
}
