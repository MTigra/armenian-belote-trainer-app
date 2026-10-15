package am.blot.server

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.io.IOException
import kotlin.math.ceil
import kotlin.random.Random

/** Groq Chat Completions, non-streaming strict JSON Schema; no tools or provider fallback. */
class GroqTrainer(private val settings: TrainerSettings, private val client: HttpClient = trainerHttpClient()) : TrainerProvider, AutoCloseable {
    private val log = org.slf4j.LoggerFactory.getLogger(GroqTrainer::class.java)
    internal fun requestBody(context: TrainerContext): JsonObject {
        val schema = JsonObject(TrainerResources.schema.jsonObject.filterKeys { it !in setOf("\$schema", "title") })
        return buildJsonObject {
            put("model", settings.model)
            putJsonArray("messages") {
                add(buildJsonObject { put("role", "system"); put("content", TrainerResources.prompt) })
                add(buildJsonObject { put("role", "user"); put("content", trainerJson.encodeToString(context)) })
            }
            put("stream", false)
            put("n", 1)
            put("max_completion_tokens", settings.maxOutputTokens)
            if (settings.model in setOf("openai/gpt-oss-120b", "openai/gpt-oss-20b")) put("reasoning_effort", "medium")
            put("response_format", buildJsonObject {
                put("type", "json_schema")
                put("json_schema", buildJsonObject { put("name", "trainer_answer_v1"); put("strict", true); put("schema", schema) })
            })
        }
    }
    override suspend fun answer(context: TrainerContext): TrainerModelAnswer {
        val body = requestBody(context)
        for (attempt in 0..1) {
            try {
                return client.preparePost("https://api.groq.com/openai/v1/chat/completions") {
                    bearerAuth(settings.apiKey); contentType(ContentType.Application.Json); setBody(body.toString())
                }.execute { response ->
                    val status = response.status.value
                    if (status != 200) {
                        val providerCode = try {
                            trainerJson.parseToJsonElement(response.bodyAsChannel().trainerBytes(16 * 1024).decodeToString()).jsonObject["error"]
                                ?.jsonObject?.get("code")?.jsonPrimitive?.content?.takeIf { it in setOf("rate_limit_exceeded", "invalid_api_key",
                                    "model_not_found", "model_decommissioned", "json_validate_failed", "context_length_exceeded", "invalid_request_error") } ?: "UNKNOWN"
                        } catch (e: CancellationException) { throw e } catch (_: Exception) { "UNKNOWN" }
                        log.warn("trainer upstream requestId={} provider=groq model={} attempt={} httpStatus={} providerCode={}",
                            context.requestId, settings.model, attempt + 1, status, providerCode)
                        val retryAfter = response.headers[HttpHeaders.RetryAfter]?.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 && it <= Int.MAX_VALUE }
                            ?.let { ceil(it).toInt() }
                        when {
                            status == 429 -> trainerFail(429, "TRAINER_RATE_LIMITED", "Квота тренера исчерпана. Попробуйте позже.", true, retryAfter)
                            status == 413 -> trainerFail(413, "TRAINER_CONTEXT_TOO_LARGE", "Контекст партии превышает лимит модели. Выберите более ранний момент или задайте вопрос без длинной истории.")
                            status in listOf(401, 403) -> trainerFail(503, "TRAINER_PROVIDER_AUTH", "Провайдер отклонил доступ тренера. Сообщите владельцу приложения.")
                            status == 404 -> trainerFail(503, "TRAINER_MODEL_UNAVAILABLE", "Выбранная модель тренера недоступна. Сообщите владельцу приложения.")
                            providerCode == "json_validate_failed" -> invalidAnswer()
                            status in listOf(400, 422) -> trainerFail(503, "TRAINER_PROVIDER_REQUEST", "Провайдер отклонил запрос тренера. Сообщите владельцу приложения.")
                            status >= 500 -> trainerFail(503, "TRAINER_PROVIDER_BUSY", "Модель тренера временно недоступна. Повторите вопрос немного позже.", true)
                            else -> trainerFail(503, "TRAINER_UNAVAILABLE", "Тренер сейчас недоступен. Игру можно продолжить.")
                        }
                    }
                    val raw = try { response.bodyAsChannel().trainerBytes(128 * 1024).decodeToString() } catch (_: TrainerFailure) { invalidAnswer() }
                    val envelope = try { trainerJson.parseToJsonElement(raw).jsonObject } catch (_: Exception) { invalidAnswer() }
                    envelope["usage"]?.jsonObject?.let { usage ->
                        log.info("trainer requestId={} provider=groq model={} inputTokens={} outputTokens={} totalTokens={}",
                            context.requestId, settings.model, usage["prompt_tokens"]?.jsonPrimitive?.intOrNull,
                            usage["completion_tokens"]?.jsonPrimitive?.intOrNull, usage["total_tokens"]?.jsonPrimitive?.intOrNull)
                    }
                    val choice = envelope["choices"]?.jsonArray?.singleOrNull()?.jsonObject ?: invalidAnswer()
                    if (choice["finish_reason"]?.jsonPrimitive?.content != "stop") invalidAnswer()
                    val message = choice["message"]?.jsonObject ?: invalidAnswer()
                    if (message["role"]?.jsonPrimitive?.content != "assistant" ||
                        (message["tool_calls"]?.takeUnless { it is JsonNull }?.jsonArray?.isNotEmpty() == true) ||
                        (message["refusal"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content?.isNotBlank() == true)) invalidAnswer()
                    val content = message["content"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content ?: invalidAnswer()
                    try { trainerJson.decodeFromString<TrainerModelAnswer>(content) } catch (_: Exception) { invalidAnswer() }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: TrainerFailure) { if (attempt == 1 || e.status != 503 || !e.retryable) throw e }
            catch (e: IOException) {
                log.warn("trainer transport requestId={} provider=groq model={} attempt={} exceptionType={}", context.requestId, settings.model, attempt + 1, e.javaClass.simpleName)
                if (attempt == 1) trainerFail(503, "TRAINER_CONNECTION_FAILED", "Нет связи с тренером. Попробуйте позже.", true)
            } catch (_: Exception) { invalidAnswer() }
            delay(Random.nextLong(500, 1501))
        }
        error("Unreachable")
    }
    override fun close() = client.close()
}
