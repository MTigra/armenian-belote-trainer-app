package am.blot.server

fun interface TrainerProvider { suspend fun answer(context: TrainerContext): TrainerModelAnswer }
data class TrainerSettings(val apiKey: String = "", val accessCode: String = "", val model: String = "openai/gpt-oss-120b",
    val timeoutMs: Long = 25000, val maxOutputTokens: Int = 2048, val provider: String = "groq") {
    companion object {
        fun environment(): TrainerSettings {
            val provider = System.getenv("AI_PROVIDER")?.trim()?.lowercase() ?: "groq"
            val groq = provider == "groq"
            val modelVariable = if (groq) "GROQ_MODEL" else "GEMINI_MODEL"
            val model = System.getenv(modelVariable)?.takeIf { it.length <= 128 && Regex(if (groq) "[a-zA-Z0-9._/-]+" else "[a-zA-Z0-9._-]+").matches(it) }
                ?: if (groq) "openai/gpt-oss-120b" else "gemini-3.8-flash"
            return TrainerSettings(System.getenv(if (groq) "GROQ_API_KEY" else "GEMINI_API_KEY").orEmpty(),
                System.getenv("TRAINER_ACCESS_CODE").orEmpty(), model,
                System.getenv("TRAINER_TIMEOUT_MS")?.toLongOrNull()?.coerceIn(1000, 25000) ?: 25000,
                System.getenv("TRAINER_MAX_OUTPUT_TOKENS")?.toIntOrNull()?.coerceIn(256, 8192) ?: 2048, provider)
        }
    }
}
