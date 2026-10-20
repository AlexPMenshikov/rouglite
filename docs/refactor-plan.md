# План рефакторинга: разделение модулей и единственный владелец правил

Продолжение `docs/tech-debt-plan.md` (пункт 15 — god-файлы). Цель: убрать god-файлы
и развести дублирующиеся правила по одному владельцу. Функциональность не меняется.

Живой список: закрыл фазу — отметь `[x]` и укажи коммит.

## Правила переноса

П1. **Число и порядок розыгрышей RNG — инвариант.** RNG детерминирован по seed, и лишний
розыгрыш сдвигает весь дальнейший забег. Формула переносится вместе со своим числом
вызовов RNG. Пример: `playerAttackDamage` при кровожажде бросает кубик дважды.

П2. **Дубликат — одинаковое правило в двух местах. Похожие, но разные — не дубликат.**
Золота три: с карты и из сундука (формула одна), за врага и из события (формулы свои).
Сливать их — правка баланса. Значит: литерал золота в одном месте, числа — в конфиге
тремя именованными правилами, значения сохраняются.

## Гейт

После каждой фазы:

```
node scripts/check-syntax.js
node scripts/run-tests.js unit
node scripts/run-tests.js integration
```

## Ф1 — Мёртвый код

Экспорты, которые никто не зовёт. Перед удалением — поиск по `js/`, `server/`, `scripts/`,
`tests/` **по голому имени**: в коде экспорт — литерал `ready: ready`, и поиск по
`Assets.ready` даёт ноль и врёт.

| Удалить | Файл |
|---------|------|
| `RK.World.bossRoute` вместе с функцией, `RK.World.restoreState` (экспорт; функция жива) | `js/world.js` |
| `RK.Network.refreshRuns` | `js/network.js` |
| `RK.Assets.ready` вместе с функцией | `js/assets.js` |
| `RK.Items.RARITY_ORDER`, `RARITY_NAMES`, `SLOTS`, `SLOT_LABELS`, `FOODS`, `foodDef`, `weaponTypeForLoot` | `js/items.js` |
| `RK.Npc.bossQuest`, `RK.Npc.dialogueNode` (экспорт) | `js/npc.js` |
| `RK.UI.appendIcon` (экспорт; функция жива) | `js/ui-core.js` |

Не трогать: `RK.MapGen.MATRIX_FIELDS`, `MAP_STATE_FIELDS`, `MAP_STATIC_FIELDS` (читаются
как данные), `RK.Combat.walk`, `party`, `startStep` (читаются как значения).

Три исключения, найденные при удалении:

- `RK.World.getState` — не мёртвый: `tests/world.test.js` смотрит в него, чтобы проверить
  пересборку записи текущей локации. `getNetworkState` для этого не годится — он
  выбрасывает карту текущей локации.
- `RK.Combat.usePotion`, `useFood`, `dropInventoryItem`, `campRest` — контракт с
  интерфейсом: `tests/quests.test.js` сверяет имена действий из UI с фасадом `RK.Combat`.
  Фасад `RK.Combat` — не место для подрезки.
- `RK.Items.RARITY_COLORS` — живая зависимость: его подменяют `tests/network-focus.test.js`
  и `tests/render-mode.test.js`. `RK.Items.TRAP_NAMES` живёт в `tests/items.test.js` —
  перевод теста на `C.TRAP_NAMES` отложен до Ф2.

- [x] Ф1 закрыт

## Ф2 — Правила под один владелец

| Что | Сейчас | Куда | Значения |
|-----|--------|------|----------|
| Длина чата | `js/network.js`, `server/room-manager.js`, `js/ui-core.js` | `CONFIG.CHAT_MAX_LENGTH` | 280 |
| Длина имени | `js/ui-core.js`, `server/room-manager.js`, `server/run-store.js` | `CONFIG.PLAYER_NAME_MAX` | 18 |
| Типы ловушек | `js/map.js` | `C.TRAP_TYPES` | без change |
| Виды зон | `js/map.js` | ключи `C.ZONES` | без change |
| Классы по умолчанию | `js/meta.js` | `C.PLAYER_CLASSES` | без change |
| Отступы спавна и лестницы | `js/map.js` | `C.SPAWN_CLEARANCE`, `C.STAIR_CLEARANCE` | без change |
| Урон ловушки | `js/map.js`, `js/combat.js`, `js/events.js` | `C.trapDamage(floor)` | см. ниже |
| Золото (три правила) | `js/items.js`, `js/spawn.js`, `js/combat.js`, `js/events.js` | `C.goldFromFloor`, `goldFromKill`, `goldFromEvent` | без change |
| Литерал предмета «золото» | 5 мест | `RK.Items.makeGold(amt, x, y)` | без change |
| Псевдонимы действий | копия в `tests/lan-server.test.js` | читать `CONFIG.ACTION_ALIASES` | без change |
| `MAX_ACTION_ARGS \|\| 5` | `js/combat.js`, `server/room-manager.js` | `C.MAX_ACTION_ARGS` без фолбэка | без change |
| `\|\| 'city_start'` | `js/combat.js`, `js/world.js`, `js/ui-hud.js` | `C.WORLD_START_LOCATION` без фолбэка | без change |

**Единственное числовое отличие.** Генератор ловушек даёт `3 + ⌊этаж·1.3⌋` (4/5/6/8),
запасной путь в бою и мировое событие — `⌊этаж·1.5⌋ + 2` (3/5/6/8). Расходятся только на
первом этаже. Сведение к `C.trapDamage(floor)` меняет этот путь: 3 → 4 HP. Обычные
ловушки не меняются — у них значение уже было 4.

Тесты: у каждой ловушки, редкости, слота и класса из конфига есть имя, цвет, множитель
и спрайт; псевдонимы из `CONFIG.ACTION_ALIASES` покрыты правилом и обработчиком.

Сделано:

- В `CONFIG` добавлены `CHAT_MAX_LENGTH`, `PLAYER_NAME_MAX`, `trapDamage(floor)`,
  `GOLD_ROLL`, `goldFromFloor`, `goldFromKill`, `goldFromEvent`.
- Правила золота разведены по именам: с карты и из сундука считает одно правило, за
  врага и из события — свои. Раньше формула за врага была один раз, а с карты — два.
- Бросок кубика остался на стороне вызывающего: `GOLD_ROLL` хранит диапазон, а саму
  величину берёт `RK.RNG`. Порядок розыгрышей влияет на забег, двигать его нельзя.
- Литерал предмета «золото» собирает `RK.Items.makeGold(amt, x, y)` — раньше он был
  написан в пяти местах и разъезжался по ключам.
- Экспорт `RK.Items.TRAP_NAMES` убран, тест читает `CONFIG.TRAP_NAMES`.
- Новый тест `tests/config-facts.test.js` (7 проверок).

- [x] Ф2 закрыт

## Ф3 — Разделить `js/map.js`

| Новый файл | Что переезжает |
|------------|----------------|
| `js/mapgen-dungeon.js` | `generate`, `assignRegions`, регион-хелперы, `placeDoors`, `placeTraps`, `placeZones`, `placeTorches`, `carve`/`connect`, `chooseTavern` |
| `js/mapgen-city.js` | `generateCity`, `cityLines`, `blockRanges`, `carveCityStreets`, здания, двери, `getBuilding` |
| `js/map-decor.js` | `placeDecorations`, озёра и ручьи, `placeWilderness` |
| `js/pathfind.js` | `isInside`, `isWalkable`, `isMapWalkable`, `manhattan`, `findPath`, `findPathOnMap`, `findPathNear`, `randomFloorNear` |
| `js/map-codec.js` | `MATRIX_FIELDS`, `MAP_STATE_FIELDS`, `MAP_STATIC_FIELDS`, кодирование и разворот матриц |
| `js/map.js` | фасад: глобальный `RK.Map` и сборка `RK.MapGen` |

Правка `scripts/script-list.js` и порядка `<script>` в `rougelite.html` — линт сверяет их.
Тест: набор ключей `RK.MapGen` не изменился.

- [ ] Ф3 закрыт

## Ф4 — Разделить `js/combat.js`

| Новый файл | Что переезжает |
|------------|----------------|
| `js/combat-run.js` | `resetGame`, `newRun`, `heroOf`, `initPartyMember`, `placePartyMembers`, `startFloor`, `createDebugContext`, `placePartyAtEntry`, `checkStairs`, `autosave` |
| `js/combat-move.js` | состояние `walk`, `tickWalk`, `getDrawPos`, `startStep`, `tryStep`, `tryMoveToward`, автопроход, `movePlayer`, `setFacing`, `makeOccupancy` |
| `js/combat-hit.js` | `doAttack`, `playerAttackDamage`, `enemyAttackDamage`, `doRangedAttack`, `finishPlayerAttack`, `finishEnemyAttack`, `elementalMultiplier`, `clampChance`, `splatBlood`, чемпионы |
| `js/combat-services.js` | `tavernRest`, `tavernRumors`, `tavernBuyFood`, `templeHeal`, `templeBlessing`, `storeInWarehouse`, `campRest`, `teleportToCity`, `nearService`, `openNpcScreen` |
| `js/combat.js` | фасад `RK.Combat`, ход, взаимодействие, `runContext`, сборка `ACTION_HANDLERS` |

Шов уже есть в проекте: модули получают состояние через `setContext(runContext)` — так
сделаны `statuses`, `spawn`, `inventory`, `quests`, `spells`. Новые модули входят в тот
же список.

Единая формула удара — чистая функция, розыгрыш приходит снаружи (П1):

```js
RK.CombatHit.hitDamage = function (atk, bonus, targetDef, roll) {
  return atk + bonus + roll - targetDef;
};
```

Три места зовут её: ближний бой, дальний бой, град стрел. Кровожажда в ближнем бою
сохраняет оба розыгрыша: первый общий, второй пересчитывает без защиты.

Тест: набор ключей `RK.Combat` не изменился; снимок забега до и после переноса совпадает.

- [ ] Ф4 закрыт

## Что осталось за рамками

- Ф5 — отвязка игровой логики от интерфейса: 185 мест `RK.UI.*` в разделяемых модулях,
  сервер подменяет интерфейс целиком (`server/game-engine.js`).
- Ф6 — сведение двух путей отрисовки (`js/render.js`) к общему списку сцены.
- Пункт 3 `docs/tech-debt-plan.md` — `game.players` несёт полного героя каждому клиенту.
- Паритет ASCII-режима: зоны, кровь, освещение, подсветка босса, конус взгляда, вода.
