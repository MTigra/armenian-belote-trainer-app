package am.blot.server

import am.blot.core.*
import kotlinx.serialization.json.*

/** Provider-only projection. The original PlayerView/candidates remain intact for validation. */
internal object TrainerModelContexts {
    const val PROMPT_VERSION = "trainer-system-2"
    private val suits = mapOf("SPADES" to "S", "HEARTS" to "H", "DIAMONDS" to "D", "CLUBS" to "C")
    private val ranks = mapOf("SEVEN" to "7", "EIGHT" to "8", "NINE" to "9", "TEN" to "10",
        "JACK" to "J", "QUEEN" to "Q", "KING" to "K", "ACE" to "A")

    /** Remove absent fields and encode a card once as e.g. SJ. No information is inferred here. */
    private fun compact(e: JsonElement): JsonElement = when (e) {
        is JsonObject -> if (e.keys == setOf("suit", "rank")) JsonPrimitive(
            suits.getValue(e.getValue("suit").jsonPrimitive.content) + ranks.getValue(e.getValue("rank").jsonPrimitive.content))
        else JsonObject(e.filter { (key, v) -> v !is JsonNull || key == "trump" }.mapValues { (key, v) ->
            if (key == "trump" && v is JsonNull) JsonPrimitive("NONE") else compact(v)
        })
        is JsonArray -> JsonArray(e.map(::compact))
        else -> e
    }
    private inline fun <reified T> value(v: T) = compact(trainerJson.encodeToJsonElement(v))

    fun json(context: TrainerContext): JsonObject {
        val v = context.playerView
        val start = v.events.indexOfLast { it.kind == EventKind.DEAL_STARTED }.coerceAtLeast(0)
        val events = v.events.drop(start)
        val view = value(v).jsonObject
        val played = (v.tricks.flatMap { it.plays } + v.trick).map { it.card }.toSet()
        val outside = CardRules.deck().filter { it !in played && it !in v.hand }
        val timeline = buildJsonArray {
            var afterCards = 0
            for (e in events) when (e.kind) {
                EventKind.CARD_PLAYED -> afterCards++
                EventKind.DEAL_STARTED, EventKind.TRICK_WON -> Unit
                else -> add(JsonObject(value(e).jsonObject + ("afterCards" to JsonPrimitive(afterCards))))
            }
        }
        // Whole messages only, newest first for selection, then restore chronological order.
        var chars = 0
        val history = context.history.asReversed().take(4).takeWhile { h ->
            (chars + h.text.length <= 4000).also { if (it) chars += h.text.length }
        }.asReversed()
        val prior = priorDeals(v.events.take(start))
        return buildJsonObject {
            put("contextVersion", 2)
            put("promptVersion", PROMPT_VERSION)
            put("rules", value(context.rules))
            put("moment", value(context.moment))
            put("perspective", context.perspective)
            put("currentDeal", buildJsonObject {
                for (key in listOf("phase", "dealer", "target", "hand", "handSizes", "turn", "auction", "scores", "currentPoints"))
                    put(key, view.getValue(key))
                put("currentTrick", view.getValue("trick"))
                put("completedTricks", view.getValue("tricks"))
                put("ownDeclarationOptions", value(v.options.declarationsToShow))
                if (v.phase == Phase.BIDDING) put("handCardPointsByTrump", buildJsonObject {
                    for (trump in Suit.entries + listOf(null))
                        put(trump?.name ?: "NONE", v.hand.sumOf { CardRules.points(it, trump) })
                })
                put("publicTimeline", timeline)
                put("outsideHandUnplayed", buildJsonObject {
                    for (suit in Suit.entries) put(suits.getValue(suit.name), value(outside.filter { it.suit == suit }
                        .sortedByDescending { CardRules.strength(it, v.auction.contract?.trump) }))
                })
            })
            put("previousDeals", JsonArray(prior.takeLast(8)))
            put("omittedPreviousDeals", prior.size.coerceAtLeast(8) - 8)
            put("actionCandidates", value(context.actionCandidates.map { it.id }))
            put("question", context.question)
            put("history", buildJsonArray { history.forEach { h -> add(buildJsonObject {
                put("role", h.role); put("text", h.text); put("dealNumber", h.moment.dealNumber); put("actionIndex", h.moment.actionIndex)
            }) } })
            put("omittedHistoryMessages", context.history.size - history.size)
            context.revealedHands?.let { put("revealedHands", value(it)) }
        }
    }

    private fun priorDeals(events: List<GameEvent>): List<JsonObject> {
        val result = mutableListOf<JsonObject>()
        var summary = linkedMapOf<String, JsonElement>()
        for (e in events) when (e.kind) {
            EventKind.DEAL_STARTED -> {
                if (summary.isNotEmpty()) result.add(JsonObject(summary))
                summary = linkedMapOf()
                e.number?.let { summary["dealNumber"] = JsonPrimitive(it) }
                e.seat?.let { summary["dealer"] = JsonPrimitive(it.name) }
            }
            EventKind.BID, EventKind.CONTRACT_FIXED -> {
                e.contract?.let { summary["contract"] = value(it) }
                if (e.kind == EventKind.CONTRACT_FIXED) e.number?.let { summary["multiplier"] = JsonPrimitive(it) }
            }
            EventKind.DEAL_SCORED -> e.totals?.let { summary["awarded"] = value(it) }
            EventKind.REDEAL -> summary["redeal"] = JsonPrimitive(true)
            else -> Unit
        }
        if (summary.isNotEmpty()) result.add(JsonObject(summary))
        return result
    }
}
