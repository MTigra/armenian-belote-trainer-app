package am.blot.server

import kotlinx.serialization.encodeToString

import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

class TrainerService(private val hub: GameHub, private val settings: TrainerSettings = TrainerSettings.environment(),
    provider: TrainerProvider? = null, private val now: () -> Long = System::currentTimeMillis) : AutoCloseable {
    private val provider = provider ?: if (settings.apiKey.isBlank()) TrainerProvider { trainerFail(503, "TRAINER_UNAVAILABLE", "Сервис тренера пока не подключён. Игру можно продолжить.") } else GeminiTrainer(settings)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private data class Cached(val digest: String, val result: CompletableDeferred<TrainerAnswer>, var completedAt: Long? = null)
    private val requests = linkedMapOf<String, Cached>()
    private val closed = AtomicBoolean(false)
    private val log = org.slf4j.LoggerFactory.getLogger(TrainerService::class.java)
    private fun digest(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
    suspend fun ask(r: TrainerRequest, token: String?): TrainerAnswer {
        if (!Regex("[0-9]{4}").matches(settings.accessCode)) trainerFail(503, "TRAINER_UNAVAILABLE", "Сервис тренера пока не подключён. Игру можно продолжить.")
        if (!Regex("[0-9]{4}").matches(r.accessCode) || !MessageDigest.isEqual(r.accessCode.toByteArray(), settings.accessCode.toByteArray()))
            trainerFail(401, "TRAINER_ACCESS_DENIED", "Код доступа не принят. Проверьте код и повторите запрос.")
        validateTrainerRequest(r)
        val owner = when (val s = r.source) {
            is TrainerSource.Online -> hub.trainerGuest(token ?: trainerFail(401, "SESSION_EXPIRED", "Войдите как гость."))
            is TrainerSource.Offline -> "offline:${s.localMatchId}:${s.view.seat}"
            is TrainerSource.Review -> "review:${s.localMatchId}:${s.seat}"
        }
        if (closed.get()) trainerFail(503, "TRAINER_UNAVAILABLE", "Сервис тренера останавливается.", true)
        val key = "$owner:${r.requestId}"
        val hash = digest(trainerJson.encodeToString(r.copy(accessCode = "", question = r.question.trim())))
        val result = mutex.withLock {
            requests.entries.removeIf { it.value.completedAt?.let { t -> now() - t >= 300000 } == true }
            requests[key]?.let {
                if (it.digest != hash) trainerFail(409, "REQUEST_ID_CONFLICT", "Этот идентификатор уже использован для другого запроса.")
                return@withLock it.result
            }
            if (requests.size >= 128) trainerFail(503, "TRAINER_UNAVAILABLE", "Тренер занят. Попробуйте позже.", true)
            val cached = Cached(hash, CompletableDeferred())
            requests[key] = cached
            scope.launch {
                val started = System.nanoTime()
                try {
                    val answer = withTimeout(settings.timeoutMs) {
                        val snapshot = try {
                            when (val s = r.source) {
                                is TrainerSource.Offline -> TrainerContexts.offline(s)
                                is TrainerSource.Review -> TrainerContexts.review(s)
                                is TrainerSource.Online -> hub.trainerSnapshot(token!!, s)
                            }
                        } catch (e: IllegalArgumentException) { invalidTrainer() }
                        val context = TrainerContexts.build(snapshot, r)
                        val model = provider.answer(context)
                        validateTrainerAnswer(model, context, snapshot.state, r.requestId)
                    }
                    mutex.withLock { cached.completedAt = now() }
                    log.info("trainer requestId={} model={} profile={} promptVersion=trainer-system-1 elapsedMs={} status=ok", r.requestId, settings.model, answer.profileVersion, (System.nanoTime() - started) / 1000000)
                    cached.result.complete(answer)
                } catch (e: Throwable) {
                    val failure = when (e) {
                        is TimeoutCancellationException -> TrainerFailure(504, "TRAINER_TIMEOUT", "Ответ не получен вовремя. Повторите запрос.", true)
                        is TrainerFailure -> e
                        is ApiFailure -> TrainerFailure(e.status, if (e.code == "NOT_MEMBER") "TRAINER_FORBIDDEN" else e.code, e.message)
                        is CancellationException -> TrainerFailure(503, "TRAINER_UNAVAILABLE", "Тренер недоступен.", true)
                        else -> TrainerFailure(502, "TRAINER_INVALID_RESPONSE", "Тренер прислал неподдерживаемый ответ.", true)
                    }
                    log.info("trainer requestId={} model={} elapsedMs={} error={}", r.requestId, settings.model, (System.nanoTime() - started) / 1000000, failure.code)
                    withContext(NonCancellable) {
                        mutex.withLock { requests.remove(key) }
                        cached.result.completeExceptionally(failure)
                    }
                }
            }
            cached.result
        }
        return result.await()
    }
    override fun close() { closed.set(true); scope.cancel(); (provider as? AutoCloseable)?.close() }
}
