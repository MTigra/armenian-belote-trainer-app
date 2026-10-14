@file:OptIn(kotlin.js.ExperimentalJsExport::class)

package am.blot.core

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.js.JsExport

/** String-based boundary avoids exposing Kotlin collections/enums/Longs as opaque JS objects. */
object RulesJson {
    private val json = Json { encodeDefaults = true }
    fun start(seed: Int, dealer: String): String = json.encodeToString(GameEngine.start(CardRules.shuffledDeck(seed), Seat.valueOf(dealer)))
    fun apply(stateJson: String, actionJson: String): String = json.encodeToString(GameEngine.apply(
        json.decodeFromString<GameState>(stateJson), json.decodeFromString<Action>(actionJson)))
    fun view(stateJson: String, seat: String): String = json.encodeToString(GameEngine.view(
        json.decodeFromString<GameState>(stateJson), Seat.valueOf(seat)))
    fun automaticAction(stateJson: String, seat: String): String = json.encodeToString(GameEngine.automaticAction(
        json.decodeFromString<GameState>(stateJson), Seat.valueOf(seat)))
    fun nextDeal(stateJson: String, seed: Int): String = json.encodeToString(GameEngine.nextDeal(
        json.decodeFromString<GameState>(stateJson), CardRules.shuffledDeck(seed)))
    fun record(stateJson: String): String = json.encodeToString(GameEngine.record(json.decodeFromString<GameState>(stateJson)))
    fun replay(recordJson: String): String = json.encodeToString(GameEngine.replay(json.decodeFromString<MatchRecord>(recordJson)))
    fun validateSnapshot(stateJson: String): Boolean {
        GameEngine.validate(json.decodeFromString<GameState>(stateJson))
        return true
    }
}

// Plain exports produce straightforward .d.mts signatures for the React/TypeScript adapter.
@JsExport fun startGame(seed: Int, dealer: String): String = RulesJson.start(seed, dealer)
@JsExport fun applyAction(stateJson: String, actionJson: String): String = RulesJson.apply(stateJson, actionJson)
@JsExport fun playerView(stateJson: String, seat: String): String = RulesJson.view(stateJson, seat)
@JsExport fun automaticAction(stateJson: String, seat: String): String = RulesJson.automaticAction(stateJson, seat)
@JsExport fun nextDeal(stateJson: String, seed: Int): String = RulesJson.nextDeal(stateJson, seed)
@JsExport fun matchRecord(stateJson: String): String = RulesJson.record(stateJson)
@JsExport fun replayMatch(recordJson: String): String = RulesJson.replay(recordJson)
@JsExport fun validateSnapshot(stateJson: String): Boolean = RulesJson.validateSnapshot(stateJson)
