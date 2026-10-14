# Контракты онлайн-игры, версия 1

Типы сервера: `server/src/main/kotlin/am/blot/server/Protocol.kt`. Типы клиента: `web/src/lib/onlineTypes.ts`. `Action`, `PlayerView` и `MatchRecord` используют существующий формат общего движка. Неподдерживаемая версия протокола прекращает соединение с предложением обновить приложение.

## HTTP

| Метод | Путь | Запрос и результат |
| --- | --- | --- |
| GET | `/api/health` | `{status:"ok", protocolVersion:"1"}` |
| POST | `/api/guests` | `{nickname?:string}` → 201 `{id,nickname,token}`; без ника генерируется «Гость NNNN» |
| GET | `/api/me` | Bearer token → `{id,nickname,tableCode}` |
| POST | `/api/tables` | Bearer token, `{name,timerSeconds}` → 201 личный `TableSnapshot` |
| POST | `/api/tables/{code}/join` | Bearer token, `{}` → личный `TableSnapshot`; начатую партию можно открыть только её участнику |
| GET | `/api/tables/{code}` | Bearer token → личный `TableSnapshot`; чужая сессия не получает состояние |
| POST | `/api/trainer` | Пока 503 `{code:"TRAINER_UNAVAILABLE",message}` |

Ошибки API содержат `{code,message}`. Типичные коды: `SESSION_EXPIRED`, `TABLE_GONE`, `TABLE_FULL`, `ALREADY_SEATED`, `WRONG_SEAT`, `ILLEGAL_ACTION`, `STALE_STATE`. Ни истории, ни восстановления `GameState` от клиента через HTTP нет.

## WebSocket

Путь `/api/tables/{code}/ws`. Первая текстовая команда за пять секунд:

```json
{"type":"auth","token":"<guest token>"}
```

Токен не помещается в query string. WebSocket проверяет Origin по серверной конфигурации; клиент без Origin всё равно обязан предъявить гостевой токен.

Дальнейшие команды:

```json
{"type":"start","requestId":"<unique id>","expectedRevision":0}
{"type":"action","requestId":"<unique id>","expectedRevision":1,"action":{"type":"pass","seat":"WEST"}}
{"type":"advance","requestId":"<unique id>","expectedRevision":37}
{"type":"seat","requestId":"<unique id>","expectedRevision":0,"seat":"NORTH"}
{"type":"leave","requestId":"<unique id>","expectedRevision":0}
```

`start` доступен создателю при четырёх подключённых игроках. `seat` и `leave` доступны только в лобби; место можно поменять на свободное. `advance` доступен любому участнику после завершения раздачи или четырёх начальных пасов. `action.seat` обязан совпадать с местом гостя.

Успех обычно приходит как `state`, затем `ack` с requestId. `revision` увеличивается при старте, ходе, таймере/боте и новой раздаче; изменения подключённости отправляют новый снимок без изменения игровой revision. Повтор идентичного requestId подтверждается без повторного действия, переиспользование с другим содержимым отклоняется. Устаревший expectedRevision возвращает `STALE_STATE` без изменения игры.

```json
{"type":"state","protocolVersion":1,"snapshot":"<TableSnapshot>","requestId":null,"error":null,"match":null}
{"type":"ack","protocolVersion":1,"snapshot":null,"requestId":"<id>","error":null,"match":null}
{"type":"error","protocolVersion":1,"snapshot":null,"requestId":"<id>","error":{"code":"ILLEGAL_ACTION","message":"Этот ход сейчас недопустим."},"match":null}
```

В `TableSnapshot` есть ID/код/имя стола, hostId, таймер, createdAt, revision, статус LOBBY/PLAYING/FINISHED, selfSeat, публичные участники, PlayerView, actionCount, сроки действий `deadlines`, serverTime, публичный результат раздачи и победитель. В лобби `view` равен null. Клиент оценивает отображаемое оставшееся время через serverTime, но решение об истечении принимает только сервер.

`finished` содержит финальный личный снимок и `CompletedMatch`: id, createdAt, finishedAt, record, scores, winner, seat, players, timerSeconds. Только этот пакет раскрывает исходные руки всех раздач. Чатов и токенов в нём нет. После передачи сервер удаляет стол; повторный запрос состояния возвращает `TABLE_GONE`.

Клиент хранит настоящий server selfSeat для команд, а для экрана поворачивает проекцию так, чтобы своё место было SOUTH. При этом поворачиваются все места в событиях и взятках и меняется представление счёта для EAST/WEST; авторитетный счёт и архив остаются в серверных координатах.
