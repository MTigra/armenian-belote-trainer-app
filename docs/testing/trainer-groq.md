# Переход на Groq — 15 октября 2026

Документация: https://console.groq.com/docs/api-reference#chat-create и
https://console.groq.com/docs/structured-outputs . Модель: openai/gpt-oss-120b.

- Реальный запрос с PlayerView второй раздачи перед третьей картой прошёл через
  локальный Ktor: HTTP 200 за 9,78 с, strict JSON, действие прошло серверный валидатор.
- Прямой запрос: HTTP 200, 6200 input / 570 output / 6770 total токенов.
- Полные Markdown-правила превышали 8000 TPM этого Free-аккаунта (HTTP 413).
  Компактная редакция сохраняет правила и ссылки; длинный контекст может по-прежнему
  получить 413, серия запросов — 429. История не обрезается автоматически.
- Проверки формата и действий не подтверждают стратегию: в реальном ответе модель
  перепутала объявления прошлой раздачи с текущими. Качество советов требует
  отдельной оценки; validation.strategy=not_evaluated.
- Серверные тесты: 35, включая endpoint/auth/schema, compact rules, ошибки
  413/429/401/404/503, ограниченный повтор и отказ от обрезанных/невалидных ответов.

## Публикация

- Код: `60be8311aff503c4a24623721449b96ef17b7d5b`, main.
- Render: https://armenian-blot.onrender.com/, deploy `dep-db8jqfmq1p3s738vpvp0`,
  live с 20:56:10 UTC. Обновление env инициировало сборку этого коммита.
- Созданы серверные GROQ_API_KEY, AI_PROVIDER=groq, GROQ_MODEL=openai/gpt-oss-120b,
  TRAINER_MAX_OUTPUT_TOKENS=2048 через Render plugin. Обновление с merge,
  существующая Environment Group belote и TRAINER_ACCESS_CODE не менялись.
- Startup: apiKeyConfigured=true, accessCodeConfigured=true, provider=groq,
  model=openai/gpt-oss-120b. Значения секретов не выводились.
- Health HTTP 200, protocolVersion=2. Ключ хранится только в окружении сервера.
- Публичный авторизованный вызов модели не выполнялся: действующий код доступа
  не предоставлялся. Реальный успешный Groq-вызов выше выполнен через локальный Ktor.
- Клиентский контракт не менялся; GitHub Pages использует обновлённый Render API,
  отдельная публикация фронтенда не требовалась.
- [CI](https://github.com/MTigra/armenian-belote-trainer-app/actions/runs/38805545811):
  success: Docker, JVM/JS, серверные тесты и React integration.


Публичный отрицательный запрос с неформатным кодом: HTTP 401
TRAINER_ACCESS_DENIED, retryable=false; CORS разрешил GitHub Pages.
