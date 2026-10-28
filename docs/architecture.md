# Архитектура и карта кода

Устройство кода игры: два рантайма, слои, состояние забега, основные потоки и правила, которые нельзя ломать при правках. Список файлов и порядок загрузки — в `scripts/script-list.js`; протокол сети — в [`lan-protocol.md`](lan-protocol.md); команды разработки — в [`../AGENTS.md`](../AGENTS.md).

## 1. Что это за проект

Браузерный roguelite с процедурным миром и LAN-кооперативом до `CONFIG.MAX_PLAYERS` игроков. Одиночная игра полностью работает в браузере. В сетевой комнате забег считает Node.js-сервер, а браузеры только отправляют действия и рисуют снимки.

| Компонент | Роль |
|---|---|
| `rougelite.html` | Разметка экранов и подключение скриптов в порядке зависимостей. |
| `css/style.css` | Оформление интерфейса. |
| `js/` | Игровая логика, рендер, интерфейс, сетевой клиент. Один код на браузер и сервер. |
| `server.js` | HTTP-сервер, WebSocket `/ws`, проверка Origin, запуск LAN-сервера. |
| `server/` | Комнаты, движок в `node:vm`, сохранение забегов на диск, статические файлы. |
| `scripts/` | Списки скриптов, синтаксическая проверка, запуск тестов, генератор тайлсетов. |
| `tests/` | Unit- и интеграционные тесты на `node:test`. |
| `assets/` | PNG-атласы и hi-res спрайты; форматы — в [`../assets/README.md`](../assets/README.md). |

Сборки нет: браузер загружает обычные скрипты, каждый файл дописывает свои объекты в глобальный `RK` (`window.RK`). ES-модулей, TypeScript и бандлера нет.

### Термины

- **Забег** — одно прохождение: партия, карта, враги, предметы, ход, задания.
- **Локация** — сцена мира: город, лес, болото, горы, пустыня, оазис или ярус подземелья.
- **Ярус** — этаж подземелья локации, от 1 до `CONFIG.DUNGEON_MAX_DEPTH`.
- **Партия** — герои забега; в сети до `CONFIG.MAX_PLAYERS`.
- **Снимок** — сериализованное состояние забега для клиента или файла сохранения.
- **Комната** — LAN-сессия с кодом, игроками и одним общим забегом.
- **Токен** — секрет игрока для переподключения к комнате.

## 2. Два рантайма

### 2.1 Браузер

`rougelite.html` подключает скрипты в порядке `BROWSER_SCRIPTS` из `scripts/script-list.js`. Порядок важен: конфиг и данные должны загрузиться раньше потребителей. Файлы общаются только через `RK`, поэтому перестановка скриптов ломает запуск без синтаксической ошибки.

Точка входа — `js/main.js`; порядок запуска и цикл кадров — в §5.1.

### 2.2 Сервер

`server/game-engine.js` создаёт контекст `node:vm` и загружает в него `ENGINE_SCRIPTS` — те же файлы `js/`, что и браузер, без правок. В песочнице есть `console`, `performance`, `crypto`, `localStorage`-заглушка и `document.getElementById`, который всегда возвращает `null`: рисовать на сервере нечего.

Что сервер подменяет:

- `RK.Audio` — пустые методы;
- `RK.Effects` — вызовы складываются в список и уезжают клиентам;
- `RK.GameUI` — свой приёмник: журнал и экраны NPC собираются в события снимка.

Сервер не грузит браузерные файлы: рендер, ввод, интерфейс, сеть и точку входа. `debug.js` тоже исключён: отладочная комната не нужна в сетевой игре.

### 2.3 Списки скриптов

`scripts/script-list.js` — единый источник правды:

| Список | Что содержит | Кто использует |
|---|---|---|
| `BROWSER_SCRIPTS` | Все файлы браузера в порядке загрузки. | `rougelite.html`, `check-syntax.js`. |
| `BROWSER_ONLY` | Рендер, ввод, UI, сеть, `main`, звук, эффекты, сцена, ассеты. | Исключение из серверного движка. |
| `ENGINE_SCRIPTS` | `BROWSER_SCRIPTS` без браузерных файлов и `debug.js`. | `server/game-engine.js`. |
| `GAME_SCRIPTS` | `BROWSER_SCRIPTS` без браузерных файлов, но с `debug.js`. | Тесты игровых систем. |
| `UI_SCRIPTS` | Только `config`, контент и `ui-*`. | Интерфейсные тесты. |
| `SERVER_SCRIPTS` | Старое имя `ENGINE_SCRIPTS`. | Обратная совместимость. |

`scripts/check-syntax.js` разбирает каждый скрипт из HTML, сверяет порядок с `BROWSER_SCRIPTS` и проверяет `server/*.js` и `scripts/*.js`. Это только синтаксис: опечатка в имени (`RK.Nender`) ловится падением или тестом.

### 2.4 Схема зависимостей

```text
main.js
  ├─ UI (ui-*) + Input + Network
  ├─ Render → Scene → View (topdown / ascii / iso)
  └─ Combat (фасад)
      ├─ CombatRun   → RK.GAME, партия, этаж, ход
      ├─ CombatMove  → шаг, анимация, автопроход
      ├─ CombatHit   → урон, статусы, враги
      ├─ CombatServices → NPC, сундуки, таверна, храм
      └─ CombatSnapshot → MapCodec + World
  └─ World → MapGen → MapBase / MapGenDungeon / MapGenCity / MapDecor
  └─ Spawn / Items / Npc / Quests / Spells / Inventory
```

## 3. Карта файлов

Таблица описывает ответственность файла и его главные точки входа. Внутренние функции не перечислены: их ищите по имени в самом файле.

### 3.1 Ядро

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/config.js` | Единственный источник правды: размеры карт, лимиты, слоты, классы, редкости, ловушки, зоны, цены, клавиши, сохранения. | `RK.CONFIG`; CommonJS-экспорт для сервера. |
| `js/game-ui.js` | Контракт «игра → интерфейс»: журнал, рассказчик, экран, перерисовка, итог забега. | `RK.GameUI`, `RK.GameUI.SCREENS`. |
| `js/rng.js` | Детерминированный ГПСЧ `mulberry32`. | `RK.RNG.reset`, `rand`, `int`, `pick`, `chance`, `randomSeed`. |
| `js/map-codec.js` | RLE-кодек матриц карты и списки полей снимка. | `RK.MapCodec`; `MATRIX_FIELDS`, `MAP_STATE_FIELDS`, `MAP_STATIC_FIELDS`. |

### 3.2 Мир и карта

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/map-objects.js` | Объекты на карте: двери, сундуки, ловушки, таверна, кровь, границы. | `RK.MapObjects`. |
| `js/pathfind.js` | Проходимость, BFS-путь, поиск свободной клетки, привязка выходов. | `RK.Pathfind`. |
| `js/map-base.js` | Общее для генераторов: пустая карта, профиль локации, seeded random, регионы, факелы. | `RK.MapBase`. |
| `js/map-decor.js` | Деревья, камни, озёра, ручьи и прочие декорации. | `RK.MapDecor.placeDecorations`. |
| `js/mapgen-dungeon.js` | Комнаты, коридоры, двери, ловушки, зоны и лестница подземелья. | `RK.MapGenDungeon.generate`. |
| `js/mapgen-city.js` | Улицы, кварталы, здания и двери города. | `RK.MapGenCity.generateCity`, `getBuilding`. |
| `js/map.js` | Фасад карты: выбирает генератор, собирает `RK.MapGen`, хранит текущую карту. | `RK.Map`, `RK.MapGen.generateLocation`. |
| `js/world.js` | Граф локаций, переходы, ярусы подземелий, состояние посещённых, сохранения мира. | `RK.World.init`, `travel`, `travelTo`, `getNetworkState`, `saveRun`, `loadRun`. |

### 3.3 Контент и правила

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/entities.js` | Реестр врагов, боссов, чемпионов; создание героя. | `RK.Entities.DEFS`, `makeEnemy`, `makeBoss`, `createPlayer`. |
| `js/items.js` | Генерация добычи, зелий, еды, ключей, ловушек; улучшение предметов. | `RK.Items`. |
| `js/fov.js` | Поле зрения и видимость клеток. | `RK.Fov.compute`, `computeVisibility`. |
| `js/classes.js` | Классы, оружие, экипировка, ограничения, способности. | `RK.Classes.getClassDef`, `canEquip`, `useSkill`, `tickSkillCooldowns`. |
| `js/skills.js` | Дерево навыков: базовая способность и две улучшенные. | `RK.Skills.SKILL_DEFS`, `skillsFor`, `skillDef`. |
| `js/npc.js` | Описания NPC, расстановка в городе, диалоги и задания. | `RK.Npc.placeCityNpcs`, `service`, `dialogue`. |
| `js/status-defs.js` | Реестр статусов: горение, яд, кровотечение, холод, оглушение. | `RK.Statuses.DEFS`. |
| `js/statuses.js` | Применение статусов, тики, урон и смерть от них. | `RK.Statuses.apply`, `tick`. |
| `js/spawn.js` | Спавн врагов, боссов, сундуков и NPC на этаже. | `RK.Spawn.spawnEnemies`, `placeChests`, `placeFloorNpcs`. |
| `js/inventory.js` | Рюкзак, экипировка, подбор, использование, продажа, ловушки в рюкзаке. | `RK.Inventory`. |
| `js/quests.js` | Выдача заданий, прогресс, сдача, диалоговые выборы. | `RK.Quests`. |
| `js/spells.js` | Заклинания и классовые умения: файрбол, молния, щит, град стрел. | `RK.Spells.activateClassSkill`, `castMageSpell`. |
| `js/meta.js` | Мета-прогресс: банк, улучшения, разблокировка классов, настройки, фракция. | `RK.Meta`, `RK.Faction`. |

### 3.4 Забег и бой

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/combat-run.js` | `RK.GAME`, партия, герой, этаж, ход, автосохранение, смерть, итог забега. | `RK.CombatRun`. |
| `js/combat-move.js` | Шаг, анимация перехода, автопроход, занятость хода. | `RK.CombatMove.tryStep`, `tryMoveToward`, `tickWalk`, `busy`, `stepsDone`. |
| `js/combat-hit.js` | Урон, статусы, чемпионы, ход врагов, ловушки, кровь. | `RK.CombatHit`. |
| `js/combat-services.js` | Городские службы: торговля, кузнец, таверна, храм, склад, сундуки. | `RK.CombatServices`. |
| `js/combat-snapshot.js` | Сборка и разбор снимка: карта, `mapState`, мир, анимация шага. | `RK.CombatSnapshot.createSnapshot`, `applySnapshot`. |
| `js/combat.js` | Фасад боя и таблица сетевых действий; связывает модули контекстом забега. | `RK.Combat.performAction`, `actionHandlers`. |
| `js/events.js` | Случайные мировые события; состояние лежит в `GAME.events`. | `RK.Events.init`, `tick`, `force`. |
| `js/camp.js` | Привал с костром; состояние лежит в `GAME.camp`. | `RK.Camp.init`, `rest`, `leave`, `tick`. |
| `js/narrator.js` | Рассказчик, случайные реплики и модификаторы забега. | `RK.Narrator`. |
| `js/debug.js` | Отладочная комната: все объекты на одной карте. | `RK.Debug.open`. |

### 3.5 Рендер и звук

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/assets.js` | Спрайты, атласы, hi-res замены, иконки UI, изометрия. | `RK.Assets.init`, `draw`, `drawIso`, `source`. |
| `js/audio.js` | Синтезированный звук на Web Audio, без файлов. | `RK.Audio.start`, `playStep`, `playAttack`. |
| `js/effects.js` | Вспышки, тряска, числа урона, снаряды, качество эффектов. | `RK.Effects.add`, `tick`, `draw`. |
| `js/scene.js` | Список фактов для отрисовки: кто где, что видно, какой спрайт. | `RK.Scene.build`. |
| `js/view.js` | Общие помощники видов: камера, сетка, пикинг, окружение. | `RK.View`. |
| `js/view-topdown.js` | Вид сверху. | `RK.Views.topdown`. |
| `js/view-ascii.js` | Текстовый вид. | `RK.Views.ascii`. |
| `js/view-iso.js` | Изометрия с поворотом камеры на 45°. | `RK.Views.iso`. |
| `js/view-target.js` | Прицел дистанционных атак. | `RK.ViewTarget`. |
| `js/render.js` | Канвас, камера, режимы, зум, подсказки под курсором. | `RK.Render.draw`, `setMode`, `pickTile`. |

### 3.6 Интерфейс

| Файл | Ответственность | Точки входа |
|---|---|---|
| `js/input.js` | Клавиатура, мышь, клик по карте, превью пути. | `RK.Input.attach`. |
| `js/ui-core.js` | Экраны, DOM-помощники, журнал, чат, кнопки, переходы. | `RK.UI.show`, `makeButton`, `commit`. |
| `js/ui-hud.js` | HUD: строка статуса, панель героя, действия, экипировка, способности. | `RK.UI` (дописывает методы). |
| `js/ui-inventory.js` | Инвентарь и хранилище: сортировка, экипировка, обмен. | `RK.UI`. |
| `js/ui-npc.js` | Экраны NPC: торговец, кузнец, таверна, гильдия, храм, разговор. | `RK.UI`. |
| `js/ui-questlog.js` | Журнал заданий. | `RK.UI`. |
| `js/ui-help.js` | Справка: управление, классы, правила. | `RK.UI`. |
| `js/ui-menu.js` | Меню, выбор класса, магазин мета-прогресса, итог забега. | `RK.UI`. |
| `js/ui-lan.js` | Лобби: список комнат, игроки, вход, продолжение. | `RK.UI`. |
| `js/ui-settings.js` | Настройки, сохранения, журнал боя. | `RK.UI`. |
| `js/ui-binding.js` | Переводит события `RK.GameUI` в вызовы `RK.UI`. | `RK.GameUI.setHandlers`. |
| `js/network.js` | WebSocket-клиент, комнаты, действия, переподключение, кэш карты и мира. | `RK.Network`. |
| `js/main.js` | Загрузка, меню, цикл кадров. | `DOMContentLoaded`. |

### 3.7 Сервер и инструменты

| Файл | Ответственность | Точки входа |
|---|---|---|
| `server.js` | HTTP, WebSocket `/ws`, Origin, heartbeat, LAN-адреса, graceful shutdown. | `createLanServer`, `lanAddresses`. |
| `server/game-engine.js` | Загружает `ENGINE_SCRIPTS` в `node:vm`, создаёт забег, крутит шаги. | `createRun`, `loadEngine`. |
| `server/room-manager.js` | Комнаты, игроки, токены, правила действий, очередь, рассылка снимков, диск. | `RoomManager`, `ACTION_RULES`. |
| `server/run-store.js` | Атомарное сохранение забегов комнат в `RUNS_DIR`. | `saveRun`, `loadRun`, `deleteRun`. |
| `server/static-files.js` | Раздача только разрешённых файлов, MIME, CSP и защитные заголовки. | `createStaticFileHandler`, `resolvePublicFile`. |
| `scripts/script-list.js` | Списки и порядок загрузки. | `BROWSER_SCRIPTS`, `ENGINE_SCRIPTS`, `GAME_SCRIPTS`, `UI_SCRIPTS`. |
| `scripts/check-syntax.js` | Синтаксис всех скриптов и сверка порядка HTML. | `npm run lint`. |
| `scripts/run-tests.js` | Собирает тесты из каталога и делит на unit/integration. | `npm run test:unit`, `test:integration`. |
| `scripts/generate-tileset.js` | Генерирует PNG-атласы 16×16 и изометрию. | `node scripts/generate-tileset.js`. |

## 4. Состояние забега

### 4.1 Где что лежит

| Объект | Что хранит | Кто владеет |
|---|---|---|
| `RK.GAME` | Партия, герой, этаж, ход, враги, предметы, NPC, задания, события, лагерь, статистика. | `js/combat-run.js`; создаётся в `newRun`. |
| `RK.Map` | Текущая карта: клетки, стены, комнаты, выходы, двери, сундуки, ловушки, зоны, факелы, декорации. | `js/map.js`, `js/world.js`. |
| `RK.World` | Граф локаций, текущая локация, посещённые сцены. | `js/world.js`. |
| `RK.CombatMove.walk` | Анимация шага по каждому участнику, автопроход, счётчик завершённых шагов. | `js/combat-move.js`. |
| `RK.Meta.data` | Мета-прогресс и настройки: банк, улучшения, классы, режим показа, звук, камера. | `js/meta.js`; ключ `rogalite_meta_v1`. |
| `RK.Network` | Сокет, комната, игрок, токен, хост, последняя карта и мир. | `js/network.js`. |

`RK.GAME` — единый источник состояния забега. Модули не создают свои копии мира: они получают контекст с `getGame()` и читают `RK.GAME` по требованию. Поэтому смена героя, этажа или загрузка снимка не ломает ссылки.

### 4.2 Части снимка

Снимок делится на части по частоте изменений; формат, сжатие и проверки — в [`lan-protocol.md`](lan-protocol.md).

Поля карты объявлены в `js/map-codec.js` (`MATRIX_FIELDS`, `MAP_STATE_FIELDS`, `MAP_STATIC_FIELDS`): новое поле добавляется туда, а не в снимок вручную. `createSnapshot` и `applySnapshot` (`js/combat-snapshot.js`) меняются вместе.

### 4.3 Сохранения

Одиночная игра:

| Ключ | Что лежит |
|---|---|
| `rogalite_save_v1:index` | Список сохранений, максимум 20. |
| `rogalite_save_v1:<id>` | `{ version, savedAt, snapshot }`. |
| `rogalite_meta_v1` | Мета-прогресс и настройки. |

`CONFIG.SAVE_VERSION` сейчас `3`. Автосохранение идёт раз в `SAVE_EVERY_TURNS` ходов (20), а также сразу при переходе локации и в финале забега. `World.loadRun` проверяет версию, размеры карты, матрицы, локацию и партию: битый или старый файл не загружается. При несовместимом изменении формата поднимайте `SAVE_VERSION`.

Сетевая комната:

| Путь | Что лежит |
|---|---|
| `RUNS_DIR` (`data/runs/`) | `<КОД>.json` — `{ version: 1, savedAt, state, players }`. |
| `players` | Идентификаторы, токены, имена, классы, удача и признак хоста. |

Файл пишется атомарно: временный файл, затем переименование. Читается с проверкой размера (до 4 МБ), версии, формы игроков и класса. Имя файла собирается только из `[A-Z0-9]{4,8}`: код приходит от клиента и не должен стать путём.

## 5. Основные потоки

### 5.1 Запуск

```text
DOMContentLoaded
  → RK.Meta.load
  → RK.Render.resizeCanvas
  → RK.UI.init
  → RK.Input.attach
  → RK.Assets.init
      → RK.UI.show('menu')
      → RK.Render.draw()
      → RK.Network.reconnect()
  → requestAnimationFrame(loop)
```

`loop` каждый кадр двигает эффекты и шаги (`RK.Combat.tickWalk`) и перерисовывает сцену, если есть анимация, эффекты, факелы, вода, взведённые ловушки или видимый босс.

### 5.2 Старт одиночного забега

1. Меню выбирает класс и имя, `RK.Meta` хранит разблокировки и банк.
2. `RK.Combat.newRun(options)` сбрасывает игру, выбирает размер и стиль карты, сбрасывает RNG, создаёт стартовое задание, героя и партию.
3. `RK.World.init()` загружает стартовую локацию (город) через `startFloor`.
4. `startFloor` генерирует карту, спавнит врагов, предметы, сундуки и NPC, расставляет партию.
5. `RK.GameUI.screen('game')`, журнал и `refresh` показывают экран игры.

### 5.3 Ход

```text
ввод / клик
  → playerAction / tryStep / interact
  → бой, предмет, навык или служба
  → finishTurn
      → turn++
      → autosave
      → кулдауны и временные эффекты
      → статусы и голод
      → ход врагов
      → FOV
      → рассказчик, события, лагерь
      → посещённое состояние локации: при входе и переходе, не на каждом ходу
      → GameUI.refresh
      → проверка смерти
```

`finishTurn` не вызывается, если действие не потратило ход. Смерть героя заканчивает забег: `endRun` ставит `GAME.over`, очищает сохранение, начисляет банк и зовёт `GameUI.over`.

### 5.4 Движение и автопроход

- `tryStep` проверяет клетку, врагов, двери и ловушки, затем `startStep`.
- `startStep` кладёт шаг в `walk.steps[player.id]`; `getDrawPos` интерполирует позицию для отрисовки.
- `busy()` смотрит только на локального героя: ход считается занятым, пока идёт его анимация.
- `tickWalk` завершает шаги, увеличивает `walk.done` и зовёт `onDone`.
- Автопроход идёт по пути, останавливается при новом враге в поле зрения, достижении цели или перекрытии пути.
- Сервер вызывает `tickWalk` по таймеру `TICK_MS = 16`, а не по кадрам: свёрнутое окно хоста не останавливает игру.
- Клиент анимирует изменение на одну клетку из снимка; телепорт и смена этажа показываются сразу.

### 5.5 Мир и подземелья

- `WORLD_START_LOCATION` — город Арген; из него ведут ворота в лес, горы и пустыню.
- `LOCATIONS` в `js/world.js` описывает поверхностные узлы и их выходы.
- Ярусы подземелий строятся по требованию: `dungeonNode(parentId, depth)` создаёт `parent:dN`.
- Переход: `travel(exitId)` или `travelTo(locationId)` → `goTo` → сохранить текущую локацию → войти в целевую (восстановить или сгенерировать) → `startFloor` → сохранить забег.
- Выход без реальной локации за ним отбрасывается (`linksToLocation`), недостижимый от спавна — тоже (`reachableExits`). Пустых переходов на карте быть не должно.
- Телепорт без входных ворот ставит героя на спавн локации; в городе это центр площади.
- Порядок боссов подземелий задан `DUNGEON_BOSS_ORDER`; при старте проверяется, что он покрывает все не-городские локации и что ярусов хватает на всех боссов.

### 5.6 Бой

- Ближний бой: `CombatHit.doAttack`; дистанционный: `doRangedAttack`.
- Урон, шансы, стихии, резисты и уязвимости считает `CombatHit`.
- Статусы применяются через `Statuses.apply` и тикают в `finishTurn`.
- Чемпионы имеют аффиксы и фазы; фаза запускается один раз и переживает снимок.
- Враги ходят в `CombatHit.enemiesAct`; босс двигается по правилам этажа.
- Городские службы (`CombatServices`) открывают экран NPC через `GameUI.screen`; в сети экран получает тот, кто вызвал действие.

### 5.7 Сеть

Клиент открывает WebSocket на `/ws` и шлёт сообщения с `type`. Хост создаёт комнату, остальные входят или возвращаются по токену; сервер проверяет действие, выполняет его на общем забеге, крутит шаги и рассылает снимок. После перезапуска сервера комната поднимается из файла. Сообщения, снимок и очередь — в [`lan-protocol.md`](lan-protocol.md).

### 5.8 Клиентский снимок

`js/network.js`:

- копит журнал и эффекты из сообщения;
- запоминает `state.map` и `state.world`, если они пришли;
- зовёт `RK.Combat.applySnapshot(snapshot, playerId)`;
- открывает экран NPC, если `message.screen.playerId` совпал с локальным героем;
- начисляет банк золота хосту один раз на `runSeed`;
- переключает меню на игру и рисует кадр.

## 6. Контракты и инварианты

### 6.1 Игра и интерфейс

Игровой код зовёт только `RK.GameUI`:

- `log(text)` — строка журнала;
- `narrate(text)` — реплика рассказчика;
- `screen(name, npcId)` — экран из `SCREENS`;
- `refresh()` — перерисовать состояние;
- `syncState()` — пришёл сетевой снимок;
- `over(...)` — забег окончен.

`SCREENS` делит экраны на два вида:

- `panel` — панель едет в снимке и открывается у конкретного игрока: торговец, кузнец, таверна, гильдия, храм, склад, разговор;
- `view` — переключение вида (`game`), клиент открывает сам.

В браузере приёмник — `js/ui-binding.js`. На сервере — приёмник в `game-engine.js`: он собирает журнал, экраны и итог в события снимка. Поэтому игровая логика не знает, есть ли перед ней DOM.

### 6.2 Действия сети

Действие объявлено правилом в `ACTION_RULES` (`server/room-manager.js`), обработчиком в `actionHandlers()` (`js/combat.js`), отправкой в `js/network.js` и тестом в `tests/lan-server.test.js`. Нет catch-all, таблицы без прототипа, пределы аргументов — из `js/config.js`. Порядок добавления — в [`lan-protocol.md`](lan-protocol.md).

### 6.3 Безопасность

Сервер рассчитан на доверенную LAN, а не на открытый интернет. Проверка Origin, токены, allowlist файлов, CSP, имена и путь файла забега — в [`lan-protocol.md`](lan-protocol.md).

### 6.4 Детерминизм и целостность мира

- Генерация карт и лута идёт через seeded RNG: тесты получают повторяемый мир.
- `World.generateLocation` до пяти раз пробует seed, чтобы сохранить все достижимые выходы.
- Пустые и недостижимые переходы удаляются с карты.
- Порядок боссов и размеры локаций проверяются при старте.

## 7. Как расширять

| Задача | Куда смотреть |
|---|---|
| Новый класс | `js/classes.js` (`CLASS_DEFS`), `js/skills.js`, `js/meta.js` (разблокировка), `js/ui-help.js`; проверки — `tests/class-access.test.js`, тесты класса. |
| Новый предмет | `js/items.js` (генерация и поля), `js/assets.js` + `js/render.js` (спрайт), `js/inventory.js` и `js/spells.js` (применение); тест генерации, подбора и использования. |
| Новое сетевое действие | `ACTION_RULES` (`server/room-manager.js`), `actionHandlers()` (`js/combat.js`), отправка в `js/network.js`, покрытие в `tests/lan-server.test.js`; рецепт — [`lan-protocol.md`](lan-protocol.md). |
| Новая кнопка | `buildUiIcons()` и `UI_ICON_SPRITES` (`js/assets.js`), затем `STATIC_BUTTON_ICONS` (`js/ui-core.js`) или `makeButton(иконка, подпись)`. |
| Новое поле карты | `MATRIX_FIELDS` / `MAP_STATE_FIELDS` / `MAP_STATIC_FIELDS` (`js/map-codec.js`); тест `tests/map-fields.test.js`. |
| Новая локация | `LOCATIONS` и `DUNGEON_BOSS_ORDER` (`js/world.js`), `LOCATION_TYPES` и `LOCATION_ENEMIES` (`js/config.js`), лимиты карты; тесты `tests/world.test.js`, `tests/location-*.test.js`. |
| Новый ассет | `scripts/generate-tileset.js` и `assets/README.md`; hi-res — `assets/sprites/<name>.png` или `assets/<name>.png`. |
| Изменение формата сейва | Поднять `CONFIG.SAVE_VERSION`, обновить `World.isSnapshotUsable`/`run-store` и тесты сохранений; старый файл должен молча уйти. |
| Новый тест | Файл `tests/<feature>.test.js`, харнес `tests/helpers/sandbox.js`; категория выводится из имени. |

## 8. Тесты

`tests/helpers/sandbox.js` поднимает игру в `node:vm` с минимальным DOM, WebSocket и Web Audio и детерминированным seed. Основные помощники:

- `createSandbox` — игровые системы и UI;
- `createRenderSandbox` — канвас и рендер;
- `createNetworkSandbox` — `network.js` с `MockWebSocket`;
- `createAudioSandbox` — Web Audio заглушки;
- `startRunAsClass`, `placeAdjacentEnemy`, `findOpenNeighbor` — короткие сценарии для тестов.

Полезные тесты:

| Тест | Что охраняет |
|---|---|
| `tests/lan-server.test.js` | Протокол, `ACTION_RULES`, очередь, переподключение, снимки. |
| `tests/world.test.js` | Граф локаций, переходы, ярусы, сохранения мира. |
| `tests/location-gen.test.js` | Генерация локаций и достижимость выходов. |
| `tests/map-fields.test.js` | Полнота списков полей карты. |
| `tests/game-loop.test.js` | Полный ход, снимок, восстановление героя. |
| `tests/player-movement.test.js` | Шаг, автопроход, занятость хода. |
| `tests/run-finale.test.js` | Смерть, итог и банк золота. |
| `tests/network-focus.test.js`, `tests/network-reconnect.test.js` | Клиентская сеть и переподключение. |
| `tests/ui-*.test.js` | Экраны интерфейса. |
| `tests/docs-facts.test.js` | README не расходится с классами и вместимостью комнаты. |

## 9. Связанные документы

- [`lan-protocol.md`](lan-protocol.md) — протокол LAN, сообщения, снимок, безопасность.
- [`world-plan.md`](world-plan.md) — план развития мира локаций.
- [`tech-debt-plan.md`](tech-debt-plan.md) — технические долги.
- [`../assets/README.md`](../assets/README.md) — атласы, hi-res спрайты, лицензии.
- [`../AGENTS.md`](../AGENTS.md) — команды и правила разработки.
