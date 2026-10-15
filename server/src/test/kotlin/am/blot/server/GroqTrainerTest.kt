package am.blot.server

import am.blot.core.*
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.*

class GroqTrainerTest {
    private fun context(profile: String = PROFILE_VERSION): TrainerContext {
        val s = GameEngine.start(CardRules.deck(), Seat.SOUTH, profile)
        val r = TrainerRequest(1, "9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", "1234", "Оцени руку",
            TrainerSource.Offline("9d096a51-f42c-4b92-9a6f-ab2ddb89d6a3", 0, GameEngine.view(s, Seat.WEST)))
        return TrainerContexts.build(TrainerContexts.offline(r.source as TrainerSource.Offline), r, compactRules = true)
    }
    private val success = """{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"{\"answerType\":\"rules\",\"suggestionActionId\":null,\"explanation\":\"Объяснение\",\"alternatives\":[],\"assumptions\":[],\"ruleRefs\":[]}","reasoning":"private model reasoning"}}],"usage":{"prompt_tokens":6200,"completion_tokens":200,"total_tokens":6400}}"""
    @Test fun chatUsesBearerMessagesAndStrictSchemaWithoutSecretsOrReasoningInReply() = runBlocking {
        val c = context()
        val engine = MockEngine { r ->
            assertEquals("https://api.groq.com/openai/v1/chat/completions", r.url.toString())
            assertEquals("Bearer test-key", r.headers[HttpHeaders.Authorization])
            assertNull(r.headers["X-goog-api-key"])
            val body = trainerJson.parseToJsonElement(r.body.toByteArray().decodeToString()).jsonObject
            assertEquals("openai/gpt-oss-120b", body["model"]!!.jsonPrimitive.content)
            assertEquals(2048, body["max_completion_tokens"]!!.jsonPrimitive.int)
            assertEquals("medium", body["reasoning_effort"]!!.jsonPrimitive.content)
            assertEquals(false, body["stream"]!!.jsonPrimitive.boolean)
            val messages = body["messages"]!!.jsonArray
            assertEquals(listOf("system", "user"), messages.map { it.jsonObject["role"]!!.jsonPrimitive.content })
            assertEquals(TrainerResources.prompt, messages[0].jsonObject["content"]!!.jsonPrimitive.content)
            val ctx = trainerJson.parseToJsonElement(messages[1].jsonObject["content"]!!.jsonPrimitive.content).jsonObject
            assertFalse(ctx.containsKey("requestId"))
            assertFalse(ctx.toString().contains("test-key"))
            assertFalse(ctx.toString().contains("accessCode"))
            assertNull(ctx["revealedHands"]?.takeUnless { it is JsonNull })
            val format = body["response_format"]!!.jsonObject
            assertEquals("json_schema", format["type"]!!.jsonPrimitive.content)
            assertTrue(format["json_schema"]!!.jsonObject["strict"]!!.jsonPrimitive.boolean)
            assertFalse(body.containsKey("tools"))
            respond(success, HttpStatusCode.OK)
        }
        GroqTrainer(TrainerSettings(apiKey = "test-key"), HttpClient(engine)).use {
            val reply = it.answer(c)
            assertEquals("Объяснение", reply.explanation)
            assertEquals("rules", reply.answerType)
        }
    }
    @Test fun compactRulesRetainProfileDifferencesAndReferences() {
        val legacy = context(LEGACY_PROFILE_VERSION).rules
        val current = context().rules
        assertTrue(current.text.length < TrainerResources.rules(PROFILE_VERSION).text.length / 2)
        assertTrue(current.text.contains("PROVISIONAL R21"))
        assertTrue(current.text.contains("R34"))
        assertTrue(current.text.contains("decline-declarations"))
        assertFalse(legacy.text.contains("Override for armenian-training-0.2"))
        assertTrue(current.text.contains("0:52"))
        assertTrue(current.text.contains("250 INSTEAD OF162"))
        assertEquals(PROFILE_VERSION, current.profileVersion)
    }
    @Test fun quotaAuthSizeAndModelErrorsAreActionableAndNotRetried() = runBlocking {
        for ((status, code) in listOf(429 to "TRAINER_RATE_LIMITED", 413 to "TRAINER_CONTEXT_TOO_LARGE", 401 to "TRAINER_PROVIDER_AUTH",
            403 to "TRAINER_PROVIDER_AUTH", 404 to "TRAINER_MODEL_UNAVAILABLE", 400 to "TRAINER_PROVIDER_REQUEST", 422 to "TRAINER_PROVIDER_REQUEST")) {
            var calls = 0
            val engine = MockEngine { calls++; respond("""{"error":{"code":"rate_limit_exceeded","message":"private upstream text"}}""", HttpStatusCode.fromValue(status), headersOf(HttpHeaders.RetryAfter,"2.1")) }
            GroqTrainer(TrainerSettings(apiKey = "test-key"), HttpClient(engine)).use {
                val e = assertFailsWith<TrainerFailure> { it.answer(context()) }
                assertEquals(code, e.code)
                assertEquals(1, calls)
                assertFalse(e.message.contains("private"))
                if (status == 429) assertEquals(3, e.retryAfterSeconds)
            }
        }
    }
    @Test fun overloadRetriesOnlyOnce() = runBlocking {
        var calls = 0
        val engine = MockEngine { calls++; respond("{}", HttpStatusCode.ServiceUnavailable) }
        GroqTrainer(TrainerSettings(), HttpClient(engine)).use {
            val e = assertFailsWith<TrainerFailure> { it.answer(context()) }
            assertEquals("TRAINER_PROVIDER_BUSY", e.code)
            assertTrue(e.retryable)
            assertEquals(2, calls)
        }
    }
    @Test fun refusesTruncationToolsRefusalsAndMalformedContent() = runBlocking {
        val bodies = listOf("{}", "not json", success.replace("\"stop\"", "\"length\""),
            success.replace("\"role\":\"assistant\"", "\"role\":\"assistant\",\"tool_calls\":[{}]"),
            success.replace("\"role\":\"assistant\"", "\"role\":\"assistant\",\"refusal\":\"no\""))
        for (body in bodies) {
            val engine = MockEngine { respond(body) }
            GroqTrainer(TrainerSettings(), HttpClient(engine)).use {
                assertEquals("TRAINER_INVALID_RESPONSE", assertFailsWith<TrainerFailure> { it.answer(context()) }.code)
            }
        }
    }
}
