# Общий модуль правил

Kotlin Multiplatform: один детерминированный движок для JVM (будущий Ktor-сервер) и JavaScript (будущий React-клиент). Реализует профиль `armenian-training-0.1` из `docs/rules/profile-v1.md`, включая временный R21. Цель партии фиксирована профилем: 301 малое очко.

## Сборка

Нужен **JDK 21**, а не только JRE. Gradle Wrapper закреплён на 8.14.3, Kotlin — 2.2.21. Wrapper проверяет SHA-256 дистрибутива. По умолчанию Gradle сам устанавливает Node для JS-задач; можно использовать установленный Node:

```sh
./gradlew :game-core:jvmTest :game-core:jsNodeTest
# С установленным Node (в проверенном окружении Node 24):
./gradlew :game-core:jvmTest :game-core:jsNodeTest -PuseSystemNode=true
```

Проверка готового ES-пакета после сборки: `node game-core/scripts/smoke-js.mjs`. Она проходит полную партию через публичные JS-функции, проверяет приватность, отклонение неверного действия и совпадение replay.

Отчёты: `game-core/build/reports/tests/jvmTest/index.html` и `jsNodeTest/index.html`. Тот же commonTest выполняется на обеих платформах. CI описан в `.github/workflows/game-core.yml`.

## Kotlin API

```kotlin
val state = GameEngine.start(CardRules.shuffledDeck(seed = 42), Seat.SOUTH)
val options = GameEngine.options(state, Seat.WEST)
val next = GameEngine.apply(state, Action.Bid(Seat.WEST, 8, Suit.HEARTS))
val visible = GameEngine.view(next, Seat.SOUTH)
```

- `start(deck, dealer)`: принимает полную перемешанную колоду и явно выбранного сдающего. Модуль не использует скрытые глобальные генераторы случайности.
- `options(state, seat)`: разрешённые карты, минимальная заявка и доступные действия. Заявки не перечисляются бесконечным списком; нет игрового максимума, поле `Int` ограничено только представлением числа.
- `apply(state, action)`: новый снимок, публичные события и запись действия; недопустимое действие вызывает исключение, прежний снимок не меняется.
- `automaticAction(state, seat)`: пас в торговле, отказ от реконтры либо первая допустимая карта. Не оценивает силу хода и не изучает чужие руки. Таймер и бот могут использовать эту операцию. Такой бот всегда пасует в торговле; человек должен сделать заявку, иначе правила предписывают пересдачу.
- `nextDeal(state, deck)`: разрешён после четырёх начальных пасов или законченной сдачи; сменяет сдающего. После победы в матче запрещён.
- `view(state, seat)`: только собственная рука, размеры чужих рук, публичные события и разрешённые действия. Обычная комбинация перед первой картой публикуется без её карт; показ разрешённых комбинаций идёт перед второй. Блот/реблот объявляется автоматически.
- `validate(state)`: версия профиля, целостность колоды и структурные инварианты. Это проверка снимка, а не авторизация пользователя. Сервер обязан определять место по сессии и хранить своё состояние, а не принимать полное состояние от сетевого клиента.
- `record(state)`: полная запись только после окончания матча, с исходными раздачами и действиями.
- `replay(record)`: детерминированное восстановление на закреплённой версии. Неизвестные версии отвергаются. Поддерживает промежуточную запись для диагностики/тестов; выдача полного архива пользователю всё равно ограничена завершением матча через `record`.

`GameState` сериализуется kotlinx.serialization для офлайн-сохранения после каждого действия. В нём есть все закрытые карты: нельзя передавать его другому игроку или тренеру во время онлайн-партии. Передавайте `PlayerView`.

## Граница JavaScript / TypeScript

Экспортированы обычные функции JavaScript: они принимают/возвращают JSON-строки. На стороне Kotlin аналогичные операции доступны через `RulesJson`. Это позволяет не передавать Kotlin-коллекции и enum-объекты напрямую в TypeScript. Пример действия:

```json
{"type":"bid","seat":"WEST","amount":8,"trump":"HEARTS","caput":false}
```

Типы действий: `bid`, `pass`, `double`, `redouble`, `decline-redouble`, `play`. Масти: SPADES, HEARTS, DIAMONDS, CLUBS; `null` — бой. Достоинства: SEVEN, EIGHT, NINE, TEN, JACK, QUEEN, KING, ACE. Функции JS-границы: `startGame`, `applyAction`, `playerView`, `automaticAction`, `nextDeal`, `matchRecord`, `replayMatch`, `validateSnapshot`. Kotlin-ошибка на этой границе должна быть обработана вызывающим приложением.

После `./gradlew :game-core:jsNodeProductionLibraryDistribution` пакет находится в `game-core/build/dist/js/productionLibrary`, включает ES-модули и сгенерированные TypeScript-типы `.d.mts`.

```typescript
import { startGame, applyAction, playerView } from "armenian-belote-trainer-game-core";
const state = startGame(42, "SOUTH");
const next = applyAction(state, JSON.stringify({ type: "bid", seat: "WEST", amount: 8, trump: "HEARTS" }));
const visible = JSON.parse(playerView(next, "SOUTH"));
```

JSON-архив ядра хранит данные правил. Пользовательский чат, таймер стола и другие продуктовые настройки будут добавлены в оболочку экспортного файла при реализации приложения; они не участвуют в расчёте взяток и счёта.

## Что находится вне ядра

React, Ktor, WebSocket, IndexedDB, AI, аутентификация и часы. Модуль не создаёт сетевые соединения, не вызывает модель и не запускает таймеры. Хост выбирает порядок действий (включая конкурирующую контру), сохраняет снимки и применяет серверный таймер. Это следующий этап интеграции, не часть текущей реализации.

Критерии и соответствующие тесты: `docs/testing/game-core-criteria.md`.
