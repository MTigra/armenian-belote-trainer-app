@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
package am.blot.server

import am.blot.core.*
import kotlinx.serialization.*
import kotlinx.serialization.json.*

internal val trainerJson = Json { encodeDefaults = true; explicitNulls = true }
@Serializable @JsonClassDiscriminator("kind")
sealed class TrainerSource {
    @Serializable @SerialName("offline") data class Offline(val localMatchId: String, val actionIndex: Int, val view: PlayerView) : TrainerSource()
    @Serializable @SerialName("online") data class Online(val tableCode: String, val expectedRevision: Long) : TrainerSource()
    @Serializable @SerialName("review") data class Review(val localMatchId: String, val perspective: String, val seat: Seat,
        val dealNumber: Int, val actionIndex: Int, val record: MatchRecord) : TrainerSource()
}
@Serializable data class TrainerMoment(val matchId: String, val dealNumber: Int, val actionIndex: Int, val revision: Long?, val seat: Seat)
@Serializable data class TrainerHistory(val role: String, val text: String, val moment: TrainerMoment, val perspective: String)
@Serializable data class TrainerRequest(val protocolVersion: Int, val requestId: String, val accessCode: String,
    val question: String, val source: TrainerSource, val history: List<TrainerHistory> = emptyList())
@Serializable data class TrainerRules(val profileVersion: String, val text: String)
@Serializable data class TrainerCandidate(val id: String, val action: Action)
@Serializable data class TrainerContext(val contextVersion: Int = 1, val rules: TrainerRules, val moment: TrainerMoment,
    val perspective: String, val playerView: PlayerView, val actionCandidates: List<TrainerCandidate>, val question: String,
    val history: List<TrainerHistory>, val revealedHands: Map<Seat, List<Card>>? = null,
    @Transient val requestId: String = "")
@Serializable data class ModelAlternative(val actionId: String, val explanation: String)
@Serializable data class TrainerModelAnswer(val answerType: String, val suggestionActionId: String?, val explanation: String,
    val alternatives: List<ModelAlternative>, val assumptions: List<String>, val ruleRefs: List<String>)
@Serializable data class TrainerAlternative(val action: Action, val explanation: String)
@Serializable data class TrainerValidation(val format: String = "passed", val actions: String, val strategy: String = "not_evaluated")
@Serializable data class TrainerAnswer(val protocolVersion: Int = 1, val requestId: String, val moment: TrainerMoment,
    val perspective: String, val profileVersion: String, val answerType: String, val suggestion: Action?, val explanation: String,
    val alternatives: List<TrainerAlternative>, val assumptions: List<String>, val ruleRefs: List<String>, val validation: TrainerValidation)
@Serializable data class TrainerError(val code: String, val message: String, val requestId: String?, val retryable: Boolean,
    val retryAfterSeconds: Int? = null)
class TrainerFailure(val status: Int, val code: String, override val message: String, val retryable: Boolean = false,
    val retryAfterSeconds: Int? = null) : RuntimeException(message) {
    fun payload(id: String?) = TrainerError(code, message, id, retryable, retryAfterSeconds)
}
internal fun trainerFail(status: Int, code: String, message: String, retryable: Boolean = false, retryAfterSeconds: Int? = null): Nothing =
    throw TrainerFailure(status, code, message, retryable, retryAfterSeconds)
internal fun invalidTrainer(): Nothing = trainerFail(400, "INVALID_TRAINER_REQUEST", "Некорректный запрос или состояние партии.")
internal fun invalidAnswer(): Nothing = trainerFail(502, "TRAINER_INVALID_RESPONSE", "Тренер прислал неподдерживаемый ответ. Повторите запрос.", true)
