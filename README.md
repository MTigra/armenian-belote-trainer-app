# Базар блот

Карточная игра на React + TypeScript + Vite, подключённая к общему модулю правил Kotlin Multiplatform. Работают офлайн-партии с ботами, торговля, ходы по правилам, подсчёт до 301, локальное сохранение, история и импорт/экспорт.

**[Открыть игру](https://mtigra.github.io/armenian-belote-trainer-app/)** — опубликованная версия для проверки с телефона. После первой загрузки доступна без сети. Сайт публикуется из ветки `gh-pages`; исходники находятся в `main`.

## Запуск

Нужны JDK 21, Node 24 и pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

Открыть http://localhost:5173. Первый запуск собирает JavaScript-пакет правил через Gradle Wrapper. Для последующих запусков интерфейса — `pnpm dev:web`. Production: `pnpm build`; файлы приложения — `web/dist`.

Боты, сохранения и история работают локально. Онлайн-сервер Ktor, внешний AI-тренер и мобильная упаковка ещё не подключены. Ошибка тренера не останавливает игру. Согласованный дизайн сохранён, без шапки и футера на игровом экране.

## Структура

- `game-core/` — общий движок и 68 тестов для JVM и JavaScript.
- `web/` — React-интерфейс, TypeScript-адаптер, IndexedDB и браузерные тесты.
- `docs/rules/` — неизменённые файлы правил пользователя, профиль `armenian-training-0.1`.
- `docs/testing/` — критерии и результаты проверок.
- `docs/design-prototype/` — предыдущий статический макет.
- `previews/` — снимки макетов и рабочего интерфейса.
- `skills/` — ранее установленные upstream-скиллы дизайна и игр, с оригинальными файлами, лицензиями и закреплёнными источниками в `SOURCES.json`.
- `scripts/publish-pages.py` — публикация собранного приложения в GitHub Pages.

Документация: [задачи и порядок разработки](docs/roadmap.md), [интерфейс и запуск](web/README.md), [API ядра](game-core/README.md), [технические решения](docs/technical-decisions.md).

## Проверки

```sh
./gradlew :game-core:jvmTest :game-core:jsNodeTest -PuseSystemNode=true
pnpm typecheck
pnpm test
pnpm --filter @blot/web build
pnpm --filter @blot/web exec playwright install chromium
pnpm test:e2e
```

Первую веб-проверку выполнять после `pnpm engine:build`. Playwright проверяет production-сборку, включая настоящий завершённый матч и повторный запуск без интернета. Временный R21 реализован без изменения; версия профиля сохраняется с матчем.
