# Базар блот

Карточная игра на React + TypeScript + Vite с общим модулем правил Kotlin Multiplatform и Ktor-сервером. Работают офлайн-партии с ботами и приватные онлайн-столы для четырёх гостей, торговля, ходы по правилам, подсчёт до 301, локальная история и импорт/экспорт.

**[Открыть игру](https://mtigra.github.io/armenian-belote-trainer-app/)** — веб-клиент для проверки с телефона. Офлайн-режим доступен без сети после первой загрузки. Онлайн-сервер размещён на [Render Free](https://armenian-blot.onrender.com/); тот же адрес отдаёт игру. Клиент GitHub Pages подключается к нему по умолчанию. Сайт публикуется из ветки `gh-pages`; исходники находятся в `main`.

## Запуск

Нужны JDK 21, Node 24 и pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

Открыть http://localhost:5173. Первый запуск собирает JavaScript-пакет правил через Gradle Wrapper. Для последующих запусков интерфейса — `pnpm dev:web`. Production: `pnpm build`; файлы приложения — `web/dist`. Для GitHub Pages: `pnpm build:pages` задаёт подкаталог и адрес Render; публикация — `python3 scripts/publish-pages.py`.

Для онлайна: `pnpm dev:online` запускает Ktor на :8080 и Vite на :5173. Создайте стол, передайте код ещё троим и запустите партию. Четыре игрока должны использовать независимые браузерные профили или устройства. Сервер также может отдавать собранный сайт; [запуск, Docker и Render](server/README.md).

Активные онлайн-столы и гостевые сессии находятся только в памяти Ktor. Завершённые матчи и собственный чат сохраняются на устройствах; серверный архив и БД отсутствуют. Внешний AI-тренер и мобильная упаковка ещё не подключены. Ошибка тренера не останавливает игру.

## Структура

- `game-core/` — общий движок и 68 тестов для JVM и JavaScript.
- `web/` — React-интерфейс, TypeScript-адаптер, IndexedDB и браузерные тесты.
- `server/` — Ktor, гостевые сессии, столы, HTTP/WS, таймеры и серверные тесты.
- `docs/rules/` — неизменённые файлы правил пользователя, профиль `armenian-training-0.1`.
- `docs/testing/` — критерии и результаты проверок.
- `docs/design-prototype/` — предыдущий статический макет.
- `previews/` — снимки макетов и рабочего интерфейса.
- `skills/` — ранее установленные upstream-скиллы дизайна и игр, с оригинальными файлами, лицензиями и закреплёнными источниками в `SOURCES.json`.
- `scripts/publish-pages.py` — публикация собранного приложения в GitHub Pages.

Документация: [задачи и порядок разработки](docs/roadmap.md), [сервер и размещение](server/README.md), [онлайн API](docs/online-api.md), [интерфейс и запуск](web/README.md), [API ядра](game-core/README.md), [технические решения](docs/technical-decisions.md).

## Проверки

```sh
./gradlew :game-core:jvmTest :game-core:jsNodeTest :server:test -PuseSystemNode=true
pnpm typecheck
pnpm test
pnpm --filter @blot/web build
pnpm --filter @blot/web exec playwright install chromium
pnpm test:e2e
```

Первую веб-проверку выполнять после `pnpm engine:build`. Перед `pnpm test:e2e` запустите `./gradlew :server:run` в отдельном терминале. Playwright проверяет production-сборку, включая офлайн-матч, запуск без сети и онлайн-матч четырёх клиентов. [Результаты онлайна](docs/testing/online-integration.md). Временный R21 реализован без изменения; версия профиля сохраняется с матчем.
