# Ассеты (записка для художника)

Этот файл — единый справочник по всем графическим ассетам игры. Два независимых источника:

1. **`assets/sprites/<name>.png`** — по файлу на спрайт, все 256×256 (мировые тайлы, герои, враги, NPC, предметы, декор). Запасной путь — `assets/<name>.png`.
2. **`assets/tiny-dungeon-iso.png`** — атлас изометрии, собирается `scripts/generate-tileset.js` (5440×64 px, 85 клеток по 64×64).

Оба источника пишет `node scripts/generate-tileset.js`. Атласа 16×16 и `spritesheet.png` больше нет: одиночный PNG — единственный внешний формат.

## Атлас изометрии (`tiny-dungeon-iso.png`)

Клетка 64×64, ромб тайла — 64×32, стена поднимается на 32 px. У пола и стены
**один якорь — центр ромба клетки (32, 48)**: пол лежит ромбом в нижней половине
клетки, стена занимает всю клетку блоком (верхняя грань — ромб на высоте стены,
две боковые грани и тёмное основание).

| Индекс | Имя | Назначение |
|---:|---|---|
| 0 | `iso_floor` | Пол без стиля |
| 1 | `iso_wall` | Стена без стиля |
| 2 | `iso_floorDim` | Пол в тумане войны |
| 3 | `iso_wallDim` | Стена в тумане войны |
| 4 | `iso_fog` | Неисследованная клетка |
| 5–84 | `iso_floor_<стиль>_<0–4>`, `iso_wall_<стиль>_<0–4>` | Пол и стена стилей локаций (stone, cave, crypt, forest, mountain, desert, ruins, sewer), по 5 оттенков; пары floor→wall идут подряд в порядке ключей `CONFIG.MAP_STYLES` |

Приглушённые копии (`*_dim`) не рисуются в атлас: `js/assets.js` делает их сам при
загрузке. Персонажи, предметы и декор в изометрии — те же спрайты, что и в
виде сверху: они ставятся вертикально на ромб клетки (билборд).

## Пайплайн (порядок поиска)

1. `assets/sprites/<name>.png` (папка sprites).
2. `assets/<name>.png` (корень assets).
3. Встроенный программный спрайт (`buildBuiltin` в `js/assets.js`).

## Обязательные правила

- Мировые спрайты — **256×256**, логическая сетка 128×128, каждый пиксель — блок 2×2. При отрисовке масштабируются до `CONFIG.TILE` (48 px).
- Новые спрайты добавлять в `BUILTIN_ONLY_SPRITES` (`js/assets.js`), иначе `ensureExtraSprites()` не воссоздаст их при смене набора.
- Имя спрайта = имя файла без расширения.

## Спрайты мира

Каждому имени соответствует файл `assets/sprites/<name>.png` 256×256; встроенная копия остаётся запасной.

### Декорации локаций
`decorStone`, `decorGrass`, `decorMoss`, `decorMushroom`, `decorPuddle`, `decorLake`, `decorFountain`, `decorStream`, `decorTree`, `decorPine`, `decorBush`, `decorCactus`, `decorSand`, `decorCoffin`, `decorCross`, `decorBones`.

### Враги и боссы дикой природы
`wolf`, `spider`, `eagle`, `goat`, `scorpion`, `mummy`, `cultist`, `zombie`, `ghost`, `ghoul`, `golem`, `croc`.
Все обычные и усиленные враги лежат в 256×256 — см. раздел ниже.

### Предметы и экипировка
`sword`, `axe`, `spear`, `bow`, `crossbow`, `shield`, `shieldSmall`, `shieldLarge`, `boots`, `head`, `helmet`, `armor`, `ring`, `amulet`, `key`, `potion`.

### Еда
`bread`, `meat`, `cheese`, `apple`, `stew`.

### Оружие и одежда мага
`staff`, `magicStaff`, `druidStaff`, `wand`, `fetish`, `magicOrb`, `cloak`, `mantle`, `burka`.

### Мебель, сервис и таверна
`fireplace`, `churchCross`, `bench`, `forgeFurnace`, `anvil`, `counterGoods`, `tavernTable`, `tavernChair`, `beerBarrel`, `wineBottle`.

### Игроки и NPC
`player`, `playerPaladin`, `playerBerserker`, `playerArcher`, `playerMage`, `merchant`, `blacksmith`, `guard`, `priest`, `scholar`, `innkeeper`, `ancient_guard`, `storage`, `torch`, `torchFlame`, `torchFlame2`, `torchFlame3`.
Герои классов различаются силуэтом: паладин — щит и меч, берсерк — два топора, лучник — лук и колчан, маг — шляпа и посох с шаром.
NPC тоже различаются снаряжением: торговец — шляпа и кошель, кузнец — фартук и молот, стражник — шлем, копьё и щит, жрица — капюшон и посох, учёный — книга и свиток, трактирщик — фартук и кружка, древний страж — башенный щит и янтарные глаза.

### Кадры шага (walk-анимация, герои и боссы 256×256)
Герои и боссы имеют стойку и два кадра шага, которые подставляются при движении. Базовый файл `<имя>.png` — стойка, `<имя>_walk1` / `<имя>_walk2` — шаг. У героев кадры двигают ноги, руки, плащ и оружие, у боссов — ноги или крылья, руки, мантии и хвосты:
`playerPaladin_walk1`, `playerPaladin_walk2`, `playerBerserker_walk1`, `playerBerserker_walk2`, `playerArcher_walk1`, `playerArcher_walk2`, `playerMage_walk1`, `playerMage_walk2`,
`boss_slime_walk1`, `boss_slime_walk2`, `boss_rat_walk1`, `boss_rat_walk2`, `boss_bone_walk1`, `boss_bone_walk2`, `boss_archer_walk1`, `boss_archer_walk2`, `boss_bat_walk1`, `boss_bat_walk2`,
`boss_brute_walk1`, `boss_brute_walk2`, `boss_witch_walk1`, `boss_witch_walk2`, `boss_knight_walk1`, `boss_knight_walk2`, `boss_demon_walk1`, `boss_demon_walk2`, `boss_lich_walk1`, `boss_lich_walk2`.
У NPC кадров шага нет: в городе они неподвижны, поэтому у каждого один файл 256×256 — `merchant`, `blacksmith`, `guard`, `priest`, `scholar`, `innkeeper`, `ancient_guard`.

### Ловушки
`trapSpike`, `trapNeedle`, `trapFlame`, `trapDisarmed`, `trapTriggered`.

## Иконки интерфейса

Список — `UI_ICON_SPRITES`, рисует `buildUiIcons()` в `js/assets.js`; внешних PNG у иконок нет:
`uiPlay`, `uiBack`, `uiHelp`, `uiInventory`, `uiSoundOn`, `uiSoundOff`, `uiView`, `uiRest`, `uiShop`, `uiDebug`, `uiRoom`, `uiLan`, `uiLog`, `uiSkill`, `uiSend`, `uiBuy`, `uiEquip`, `uiTrash`, `uiUpgrade`, `uiQuest`, `uiCamp`, `uiLock`, `uiGold`, `uiKey`, `uiGem`, `uiTag`, `uiList`, `uiCity`.

## Город: требования к арту

- Центральная площадь: **фонтан** (`decorFountain`), четыре **дерева** по углам, клумбы (`flowerBed`) по краям.
- Каждое здание города должно получить **уникальный набор стены и пола** из новых ассетов `buildingFloor*` / `buildingWall*`; не смешивать один и тот же набор в двух зданиях.
- **`wallWindow`** — стена с окном. Генератор ставит окна по периметру каждого здания с шагом 3, пропуская дверь и углы.
- В домах ставятся **камины** (`fireplace`) и стол со стульями.
- В церкви — **крест** (`churchCross`) и **скамьи** (`bench`).
- У кузнеца — **кузнечная печь** (`forgeFurnace`) и **наковальня** (`anvil`).
- У продавца на прилавке лежат **товары** (`counterGoods`).
- В таверне — **камин** (`fireplace`), **барная стойка** (`counterGoods`), **столы** (`tavernTable`), **стулья** (`tavernChair`), **бочки с пивом** (`beerBarrel`) и **бутылки с вином** (`wineBottle`).
- В RTL/LOD сохраняется правило «напольный ассет = 256×256, опорная точка низ по центру».

## Анимация и варианты

- Walk-кадры называются `<имя>_walk1` / `<имя>_walk2` и подставляются актеру в движении. Кадры должны совпадать по масштабу и нижней точке, иначе герой «прыгает».
- У NPC и обычных врагов walk-кадров нет: NPC стоят на месте, враги стоят на целых клетках. Усиленные версии — `<тип>_enhanced.png`, палитра ярче и добавлены детали.

Обычные враги и их усиленные версии:
`slime`, `rat`, `skeleton`, `archer`, `bat`, `demon`, `wolf`, `spider`, `eagle`, `goat`, `scorpion`, `mummy`, `cultist`, `zombie`, `ghost`, `ghoul`, `golem`, `croc`, `shaman` — каждому нужны `<тип>.png` и `<тип>_enhanced.png`.

## Проверка после добавления ассета

Ассет живёт в одном из двух мест:

- **Внешний спрайт**: рисуется в `scripts/generate-tileset.js` и пишется в `assets/sprites/<name>.png`. Герои, боссы, NPC и предметы перечислены в вызовах генератора, усиленные враги берутся из `RK.Entities.DEFS`.
- **Встроенный спрайт** (только из `BUILTIN_ONLY_SPRITES`): рисуется кодом в `buildBuiltin()` (`js/assets.js`) и остаётся запасным, если PNG не загрузился.

Порядок действий:

1. Для внешнего спрайта — добавить функцию отрисовки и вызов генератора (или запись в `ENEMY_SPRITES`).
2. Для встроенного спрайта — добавить имя в `BUILTIN_ONLY_SPRITES` (`js/assets.js`), иначе `ensureExtraSprites()` не воссоздаст его при смене набора.
3. Запустить `node scripts/generate-tileset.js`.
4. Запустить `npm test`.