package am.blot.server


import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.engine.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.random.Random

internal suspend fun ByteReadChannel.trainerBytes(limit: Int): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val n = readAvailable(buffer, 0, minOf(buffer.size, limit + 1 - out.size()))
        if (n < 0) break
        out.write(buffer, 0, n)
        if (out.size() > limit) trainerFail(413, "TRAINER_REQUEST_TOO_LARGE", "Запрос слишком большой.")
    }
    return out.toByteArray()
}
internal fun trainerHttpClient() = HttpClient(CIO) {
    engine { System.getenv("HTTPS_PROXY")?.takeIf { it.isNotBlank() }?.let { proxy = ProxyBuilder.http(it) } }
}
class GeminiTrainer(private val settings: TrainerSettings, private val client: HttpClient = trainerHttpClient()) : TrainerProvider, AutoCloseable {
    private val log = org.slf4j.LoggerFactory.getLogger(GeminiTrainer::class.java)
    override suspend fun answer(context: TrainerContext): TrainerModelAnswer {
        // Provider subset: semantic bounds are enforced again by our validator.
        fun subset(e: JsonElement): JsonElement = when (e) {
            is JsonObject -> JsonObject(e.filterKeys { it !in setOf("\$schema", "title", "minLength", "maxLength", "pattern") }.mapValues { subset(it.value) })
            is JsonArray -> JsonArray(e.map(::subset))
            else -> e
        }
        val body = buildJsonObject {
            put("systemInstruction", buildJsonObject { putJsonArray("parts") { add(buildJsonObject { put("text", TrainerResources.prompt) }) } })
            putJsonArray("contents") { add(buildJsonObject {
                put("role", "user"); putJsonArray("parts") { add(buildJsonObject { put("text", TrainerModelContexts.json(context).toString()) }) }
            }) }
            put("generationConfig", buildJsonObject {
                put("responseMimeType", "application/json"); put("responseJsonSchema", subset(TrainerResources.schema)); put("maxOutputTokens", settings.maxOutputTokens)
            })
        }
        for (attempt in 0..1) {
            try {
                val result = client.preparePost("https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent") {
                    contentType(ContentType.Application.Json); header("X-goog-api-key", settings.apiKey); setBody(body.toString())
                }.execute { response ->
                    val status = response.status.value
                    if (status != 200) {
                        // Log only the allowlisted status, never the upstream message/body (it may echo secrets or input).
                        val providerCode = try {
                            val error = trainerJson.parseToJsonElement(response.bodyAsChannel().trainerBytes(16 * 1024).decodeToString())
                                .jsonObject["error"]?.jsonObject?.get("status")?.jsonPrimitive?.content
                            error?.takeIf { it in setOf("UNAVAILABLE", "INTERNAL", "RESOURCE_EXHAUSTED", "INVALID_ARGUMENT",
                                "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND", "FAILED_PRECONDITION", "DEADLINE_EXCEEDED") } ?: "UNKNOWN"
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                          catch (_: Exception) { "UNKNOWN" }
                        log.warn("trainer upstream requestId={} model={} attempt={} httpStatus={} providerCode={}",
                            context.requestId, settings.model, attempt + 1, status, providerCode)
                        when (status) {
                            429 -> trainerFail(429, "TRAINER_RATE_LIMITED", "Квота тренера исчерпана. Попробуйте позже.", true,
                                response.headers[HttpHeaders.RetryAfter]?.toIntOrNull()?.coerceAtLeast(0))
                            401, 403 -> trainerFail(503, "TRAINER_PROVIDER_AUTH", "Провайдер отклонил доступ тренера. Сообщите владельцу приложения.")
                            404 -> trainerFail(503, "TRAINER_MODEL_UNAVAILABLE", "Выбранная модель тренера недоступна. Сообщите владельцу приложения.")
                            400, 422 -> trainerFail(503, "TRAINER_PROVIDER_REQUEST", "Провайдер отклонил запрос тренера. Сообщите владельцу приложения.")
                            503 -> trainerFail(503, "TRAINER_PROVIDER_BUSY", "Модель тренера сейчас перегружена. Повторите вопрос немного позже.", true)
                            else -> trainerFail(503, "TRAINER_UNAVAILABLE", "Тренер сейчас недоступен. Игру можно продолжить.", status >= 500)
                        }
                    }
                    val text = try { response.bodyAsChannel().trainerBytes(128 * 1024).decodeToString() }
                        catch (e: TrainerFailure) { invalidAnswer() }
                    val envelope = try { trainerJson.parseToJsonElement(text).jsonObject } catch (_: Exception) { invalidAnswer() }
                    envelope["usageMetadata"]?.jsonObject?.let { usage ->
                        log.info("trainer model={} inputTokens={} outputTokens={} thinkingTokens={} totalTokens={}", settings.model, usage["promptTokenCount"], usage["candidatesTokenCount"], usage["thoughtsTokenCount"], usage["totalTokenCount"])
                    }
                    val candidate = envelope["candidates"]?.jsonArray?.firstOrNull()?.jsonObject ?: invalidAnswer()
                    if (candidate["finishReason"]?.jsonPrimitive?.content != "STOP") invalidAnswer()
                    val parts = candidate["content"]?.jsonObject?.get("parts")?.jsonArray ?: invalidAnswer()
                    val answerText = parts.mapNotNull { it.jsonObject["text"]?.jsonPrimitive?.content }.joinToString("")
                    try { trainerJson.decodeFromString<TrainerModelAnswer>(answerText) } catch (_: Exception) { invalidAnswer() }
                }
                return result
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: TrainerFailure) { if (attempt == 1 || e.status != 503 || !e.retryable) throw e }
            catch (e: IOException) {
                log.warn("trainer transport requestId={} model={} attempt={} exceptionType={}",
                    context.requestId, settings.model, attempt + 1, e.javaClass.simpleName)
                if (attempt == 1) trainerFail(503, "TRAINER_CONNECTION_FAILED", "Нет связи с тренером. Попробуйте позже.", true)
            }
            catch (_: Exception) { invalidAnswer() }
            delay(Random.nextLong(500, 1501))
        }
        error("Unreachable")
    }
    override fun close() = client.close()
}
