package am.blot.server

import am.blot.core.*
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.*

class GeminiTrainerTest {
    private fun context(): TrainerContext {
        val s = GameEngine.start(CardRules.deck(), Seat.SOUTH)
        val r = TrainerRequest(1, "9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", "1234", "Оцени руку", TrainerSource.Offline("9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", 0, GameEngine.view(s, Seat.WEST)))
        return TrainerContexts.build(TrainerContexts.offline(r.source as TrainerSource.Offline), r)
    }
    @Test fun restEnvelopeUsesSystemPromptJsonSchemaAndSecretHeaderOnly() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("test-key", request.headers["X-goog-api-key"])
            assertFalse(request.url.toString().contains("test-key"))
            val sent = trainerJson.parseToJsonElement(request.body.toByteArray().decodeToString()).jsonObject
            assertEquals(TrainerResources.prompt, sent["systemInstruction"]!!.jsonObject["parts"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content)
            val contextText = sent["contents"]!!.jsonArray[0].jsonObject["parts"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content
            assertFalse(contextText.contains("test-key"))
            assertFalse(contextText.contains("accessCode"))
            assertNotNull(sent["generationConfig"]!!.jsonObject["responseJsonSchema"])
            respond("""{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\"answerType\":\"rules\",\"suggestionActionId\":null,\"explanation\":\"Объяснение\",\"alternatives\":[],\"assumptions\":[],\"ruleRefs\":[]}"}]}}],"usageMetadata":{"totalTokenCount":100}}""", HttpStatusCode.OK)
        }
        GeminiTrainer(TrainerSettings(apiKey = "test-key"), HttpClient(engine)).use { provider ->
            assertEquals("Объяснение", provider.answer(context()).explanation)
        }
    }
    @Test fun providerFailuresAreSanitizedAndRateLimitIsNotRetried() = runBlocking {
        for ((status, code) in listOf(HttpStatusCode.TooManyRequests to "TRAINER_RATE_LIMITED", HttpStatusCode.Unauthorized to "TRAINER_UNAVAILABLE", HttpStatusCode.NotFound to "TRAINER_UNAVAILABLE")) {
            var calls = 0
            val engine = MockEngine { calls++; respond("secret upstream error", status, headersOf(HttpHeaders.RetryAfter, "60")) }
            GeminiTrainer(TrainerSettings(apiKey = "test-key"), HttpClient(engine)).use { provider ->
                val failure = assertFailsWith<TrainerFailure> { provider.answer(context()) }
                assertEquals(code, failure.code)
                assertFalse(failure.message.contains("secret"))
                assertEquals(1, calls)
                if (status == HttpStatusCode.TooManyRequests) assertEquals(60, failure.retryAfterSeconds)
            }
        }
    }
    @Test fun truncatedOrMalformedResponseIsRejected() = runBlocking {
        for (body in listOf("{}", "not json", """{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[]}}]}""")) {
            val engine = MockEngine { respond(body) }
            GeminiTrainer(TrainerSettings(), HttpClient(engine)).use { provider ->
                assertEquals("TRAINER_INVALID_RESPONSE", assertFailsWith<TrainerFailure> { provider.answer(context()) }.code)
            }
        }
    }
}
