# План технических долгов

Здесь то, что мешает менять код и доки без расхождений. Порядок — от дешёвого к дорогому.
Живой список: закрыл пункт — отметь `[x]` и укажи коммит.

## Код

| # | Долг | Где | Что сделать |
|---|------|-----|-------------|
| 1 | `[x]` `scripts/*.js` не разбирал лнт — опечатка в списке или в самом линте видна только при запуске. Закрыто: `check-syntax.js` собирает `server/` и `scripts/` из каталогов | `scripts/check-syntax.js` | — |
| 2 | `[x]` Игровые факты живут в двух местах: README «Возможности» и справка в игре. Закрыто: справка собирает классы из `CLASS_DEFS`, а вместимость комнаты — из `CONFIG.MAX_PLAYERS`; README проверяется тестом `tests/docs-facts.test.js` | `js/ui-help.js` (`renderHelpScreen`), `js/config.js`, `README.md` | — |
| 3 | Клиенту уходят чужие рюкзаки и экипировка: `game.players` несёт полного героя каждому, а сопернику по партии нужен только его | `js/combat.js` (`M.players`), `server/room-manager.js` (`publish`) | Слать каждому своему героя целиком, остальным — имя, класс, HP и клетку. Усложняет снимок: он перестаёт быть общим для всех в комнате |
| 4 | `[x]` Кнопки таверны подписывались на каждой перерисовке: клик списывал золото по разу за открытие. Закрыто: подписка одна в `initTavernControls`, тест считает обработчики | `js/ui-npc.js`, `tests/tavern-service.test.js` | — |
| 5 | `[x]` Склад гильдии рисовался в тот же список, что и задания, и затирал доску. Закрыто: свой `#guild-store-list` | `js/ui-npc.js`, `rougelite.html`, `tests/ui-guild-temple.test.js` | — |
| 6 | `[x]` Иконка закрытого навыка `uiLock` не существовала — кнопка оставалась без картинки. Закрыто: спрайт добавлен, а `tests/ui-icons.test.js` ловит и лишние, и недостающие иконки | `js/assets.js`, `js/ui-core.js`, `js/ui-hud.js` | — |
| 7 | `[x]` Формула опыта и список режимов взаимодействия жили в трёх местах каждая. Закрыто: `CONFIG.xpNeed()` и `CONFIG.INTERACT_MODES` | `js/config.js`, `js/combat.js`, `js/input.js`, `server/room-manager.js` | — |
| 8 | `[x]` Мёртвый код: `affix.apply;`, `makeChampion`, `VISIBLE_ALPHA`, класс `.sub`, `.inventory-heading`, спрайты `uiHp`/`uiXp`. Закрыто: удалено | `js/entities.js`, `js/config.js`, `js/assets.js`, `css/style.css`, `rougelite.html` | — |
| 9 | `[x]` Список полей снимка вручную: новое изменяемое поле карты не попадёт в `MAP_STATE_FIELDS`, и карта поедет целиком на каждом шаге. Закрыто: списки живут в `js/map.js` рядом с `MATRIX_FIELDS`, а `tests/map-fields.test.js` требует классифицировать каждое поле карты | `js/map.js`, `js/combat-snapshot.js`, `tests/map-fields.test.js` | — |
| 10 | `[x]` Размеры локаций не проверяются против `CONFIG.MAP_LIMITS`: сервер отвергнет легальные координаты. Закрыто: проверка при старте мира плюс тест на каждую локацию | `js/world.js`, `tests/location-limits.test.js` | — |
| 11 | `[x]` Виды городских зданий назначаются по индексу: если зданий меньше шести, часть NPC не появится. Закрыто: тест на many-seed проверяет и здания, и NPC в каждом городе | `tests/city-buildings.test.js` | — |
| 12 | `[x]` Экран храма недостижим: `showTemple` никто не зовёт, у жрицы нет сервиса. Закрыто: у жрицы сервис `temple`, экран открывается по разговору, её задание — на доске храма; благословение стало временным, лечение стоит золота | `js/npc.js`, `js/combat.js`, `js/ui-npc.js`, `js/network.js`, `server/game-engine.js`, `tests/temple.test.js` | — |
| 13 | `[x]` `js/world.js` читает забег из ключа, который игра не пишет — ветка жила ради старого теста. Закрыто: fallback убран, тест пишет в настоящий формат, а «Продолжить» появляется только для читаемого забега | `js/world.js`, `tests/world.test.js` | — |
| 14 | `[x]` Один и тот же список видов ближнего боя скопирован в четыре файла, названия статусов — в два. Закрыто: `CONFIG.MELEE_KINDS`, проверка списков при загрузке, а интерфейс берёт названия статусов из реестра | `js/config.js`, `js/classes.js`, `js/items.js`, `js/render.js`, `js/ui-hud.js`, `tests/melee-kinds.test.js` | — |
| 15 | `[x]` God-файлы: `js/combat.js` — 3 тысячи строк, `js/ui.js` — 2,5 тысячи. Закрыто: логика статусов, спавна, инвентаря, квестов и спеллов вынесена в `js/statuses.js`, `js/spawn.js`, `js/inventory.js`, `js/quests.js`, `js/spells.js`; интерфейс разбит на `js/ui-*.js` по экранам. Модули о забеге не знают — контекст приходит из боя. `js/combat.js` — 2 тысячи строк, `js/ui.js` больше нет | `js/combat.js`, `js/statuses.js`, `js/spawn.js`, `js/inventory.js`, `js/quests.js`, `js/spells.js`, `js/ui-*.js`, `tests/game-modules.test.js` | — |
| 17 | Мёртвый код: около 20 экспортов, которые никто не зовёт | `js/world.js`, `js/items.js`, `js/npc.js`, `js/network.js`, `js/assets.js`, `js/ui-core.js`, `js/combat.js` | Убрать. Фаза Ф1 в `docs/refactor-plan.md` — закрыто |
| 18 | Правило живёт в двух местах: формула удара в трёх копиях, золото — в трёх формулах и пяти литералах, типы ловушек и зон, классы по умолчанию, длина чата и имени | `js/config.js`, `js/combat.js`, `js/spells.js`, `js/items.js`, `js/spawn.js`, `js/events.js`, `js/map.js`, `js/meta.js`, `js/network.js`, `js/ui-core.js`, `server/room-manager.js`, `server/run-store.js` | Свести к `js/config.js`. Фаза Ф2 в `docs/refactor-plan.md` — закрыто |
| 19 | Копия псевдонимов действий в тесте разошлась с манифестом: группа `useFood` в тесте отсутствует | `tests/lan-server.test.js`, `js/config.js` | Тест читает `CONFIG.ACTION_ALIASES`. Фаза Ф2 в `docs/refactor-plan.md` — закрыто |
| 20 | `js/map.js` — три генератора, поиск пути и кодек матриц в одном файле | `js/map.js` | Разделить. Фаза Ф3 в `docs/refactor-plan.md` — закрыто |
| 21 | `js/combat.js` — жизненный цикл забега, движение, бой и городские сервисы в одном файле | `js/combat.js` | Разделить по образцу `setContext(runContext)`. Фаза Ф4 в `docs/refactor-plan.md` — закрыто |
| 22 | Игра зовёт интерфейс напрямую: 185 мест `RK.UI.*` в разделяемых модулях, а сервер подменяет интерфейс целиком | `js/combat-*.js`, `js/inventory.js`, `js/spells.js`, `js/quests.js`, `js/narrator.js`, `js/camp.js`, `js/events.js`, `js/statuses.js`, `js/spawn.js`, `server/game-engine.js` | Контракт `RK.GameUI`: игра говорит «что произошло», приёмник решает «как показать». Фаза Ф5 в `docs/refactor-plan.md` — закрыто |

## Игровые правила

| # | Долг | Где | Что сделать |
|---|------|-----|-------------|
| 16 | `[x]` В городе был туман войны: игрок и тем более клиент в сетевой комнате видели город по своему обзору. Закрыто: правило `LOCATION_TYPES.city.alwaysVisible` в конфиге, обзор считают и сервер, и клиент | `js/config.js`, `js/fov.js`, `js/render.js`, `tests/city-visibility.test.js` | — |
