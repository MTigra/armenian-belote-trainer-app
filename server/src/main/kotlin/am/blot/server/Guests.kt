package am.blot.server

import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

internal data class Guest(val id: String, var nickname: String, val token: String, var tableCode: String? = null, var touchedAt: Long)
internal class Guests(private val random: SecureRandom = SecureRandom()) {
    private val tokens = mutableMapOf<String, Guest>()
    fun issue(input: GuestRequest, now: Long): GuestCredentials {
        if (tokens.size >= 10_000) fail(503, "CAPACITY", "Сервер заполнен. Попробуйте позже.")
        val nickname = input.nickname?.trim()?.takeIf { it.isNotEmpty() } ?: "Гость ${random.nextInt(10_000).toString().padStart(4, '0')}"
        validateNickname(nickname)
        val token = ByteArray(32).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        val guest = Guest(UUID.randomUUID().toString(), nickname, token, touchedAt = now)
        tokens[token] = guest
        return GuestCredentials(guest.id, nickname, token)
    }
    fun authenticate(token: String, now: Long): Guest {
        val guest = tokens[token] ?: fail(401, "SESSION_EXPIRED", "Гостевая сессия недоступна. Войдите заново.")
        guest.touchedAt = now
        return guest
    }
    fun status(guest: Guest) = GuestStatus(guest.id, guest.nickname, guest.tableCode)
    fun rename(guest: Guest, nickname: String) {
        val name = nickname.trim()
        validateNickname(name)
        guest.nickname = name
    }
    private fun validateNickname(name: String) {
        if (name.isEmpty() || name.length > 32 || name.any { it.isISOControl() })
            fail(400, "NICKNAME", "Имя должно содержать от 1 до 32 символов без управляющих знаков.")
    }
    fun purge(now: Long) { tokens.entries.removeIf { it.value.tableCode == null && now - it.value.touchedAt > 86_400_000L } }
}
