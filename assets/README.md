# Ассеты (записка для художника)

Этот файл — единый справочник по всем графическим ассетам игры. Два независимых источника:

1. **`assets/tiny-dungeon.png`** — единый 16×16-атлас, собирается `scripts/generate-tileset.js` (1904×16 px, 119 тайлов). Индексы ниже совпадают с `KENNEY_MAP` (`js/assets.js`). Используется как fallback.
2. **`assets/sprites/<name>.png`** (и запасной путь `assets/<name>.png`) — hi-res версии того же имени, 256×256 или больше. При загрузке перекрывают атлас.

Для изометрии — третий источник:

3. **`assets/tiny-dungeon-iso.png`** — атлас изометрии, собирается тем же скриптом (5440×64 px, 85 клеток по 64×64). Пол и стена для каждого стиля локации.

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

Приглушённые копии (`*_dim`) не рисуются в атлас: атлас.js делает их сама при
загрузке. Персонажи, предметы и декор в изометрии — те же спрайты 16×16, что и в
виде сверху: они ставятся вертикально на ромб клетки (билборд).

## Пайплайн (порядок поиска)

1. `assets/sprites/<name>.png` (папка sprites).
2. `assets/<name>.png` (корень assets).
3. 16×16-атлас (`tiny-dungeon.png` / `spritesheet.png`).
4. Встроенный программный спрайт (`buildBuiltin` в `js/assets.js`).

## Обязательные правила

- Размер тайла кратен **16×16** (базовый шаг `16`); при отрисовке масштабируется до `CONFIG.TILE` (48 px).
- Новые спрайты добавлять в `BUILTIN_ONLY_SPRITES` (`js/assets.js`), иначе `ensureExtraSprites()` не воссоздаст их при смене набора.
- Имя спрайта = имя файла без расширения и = ключ в `KENNEY_MAP`, иначе внешний атлас не подхватится.
- Иконки интерфейса перечислены в `UI_ICON_SPRITES` и рисуются в `buildUiIcons()`.

## Атлас `tiny-dungeon.png` (16×16, индекс → имя)

| Индекс | Имя | Назначение |
|---:|---|---|
| 0 | floor | Пол пещер/подземелий |
| 1 | wall | Стена пещер/подземелий |
| 2 | floorDim | Пол в тумане войны |
| 3 | wallDim | Стена в тумане войны |
| 4 | stairs | Лестница/выход между локациями |
| 5 | player | Герой-воин |
| 6 | slime | Слизень |
| 7 | rat | Крыса |
| 8 | skeleton | Скелет |
| 9 | archer | Вражеский лучник |
| 10 | bat | Летучая мышь |
| 11 | demon | Демон |
| 12 | boss | Босс-заглушка |
| 13 | gold | Золото |
| 14 | potion | Зелье |
| 15 | sword | Меч |
| 16 | fog | Туман неисследованной области |
| 17 | key | Ключ |
| 18 | merchant | Торговец |
| 19 | door | Дверь |
| 20 | chest | Сундук |
| 21 | torch | Факел |
| 22 | torchFlame | Пламя факела |
| 23 | shield | Щит |
| 24 | boots | Сапоги |
| 25 | ring | Кольцо |
| 26 | amulet | Амулет |
| 27 | head | Шлем |
| 28 | armor | Броня |
| 29 | boss_slime | Босс-слизень |
| 30 | boss_rat | Босс-крыса |
| 31 | boss_bone | Босс-скелет |
| 32 | boss_archer | Босс-лучник |
| 33 | boss_bat | Босс-летучая мышь |
| 34 | boss_brute | Босс-грубиян |
| 35 | boss_witch | Босс-ведьма |
| 36 | boss_knight | Босс-рыцарь |
| 37 | boss_demon | Босс-демон |
| 38 | boss_lich | Босс-лич |
| 39 | blacksmith | Кузнец |
| 40 | axe | Топор |
| 41 | spear | Копьё |
| 42 | decorFountain | Фонтан (центральная площадь города) |
| 43 | tree | Дерево |
| 44 | flowerBed | Клумба с цветами |
| 45 | wallWindow | Стена с окном |
| 46 | buildingFloorStone | Пол здания: камень |
| 47 | buildingFloorPlaster | Пол здания: штукатурка |
| 48 | buildingFloorWood | Пол здания: дерево |
| 49 | buildingWallBrick | Стена здания: кирпич |
| 50 | buildingWallPlaster | Стена здания: штукатурка |
| 51 | buildingWallTimber | Стена здания: фахверк |
| 52 | fireplace | Камин в доме |
| 53 | churchCross | Крест в церкви |
| 54 | bench | Скамья |
| 55 | forgeFurnace | Кузнечная печь |
| 56 | anvil | Наковальня |
| 57 | counterGoods | Товары на прилавке |
| 58 | tavernTable | Стол в таверне |
| 59 | tavernChair | Стул в таверне |
| 60 | beerBarrel | Бочка с пивом |
| 61 | wineBottle | Бутылка с вином |
| 67 | magicOrb | Магический Шар (offhand мага) |
| 68 | cloak | Плащ (одежда мага) |
| 69 | mantle | Мантия (одежда мага) |
| 70 | burka | Бурка (одежда мага) |
| 71–118 | floor_/wall_<стиль>_<0–2> | Пол и стены стилей локаций (stone, cave, crypt, forest, mountain, desert, ruins, sewer), по 3 оттенка; пары floor→wall идут подряд в порядке ключей `CONFIG.MAP_STYLES` |

## Встроенные спрайты (не в атласе)

### Декорации локаций
`decorStone`, `decorGrass`, `decorMoss`, `decorMushroom`, `decorPuddle`, `decorLake`, `decorFountain`, `decorStream`, `decorTree`, `decorPine`, `decorBush`, `decorCactus`, `decorSand`, `decorCoffin`, `decorCross`, `decorBones`.

### Враги и боссы дикой природы
`wolf`, `spider`, `eagle`, `goat`, `scorpion`, `mummy`, `cultist`, `zombie`, `ghost`, `ghoul`, `golem`, `croc`.

### Предметы и экипировка
`sword`, `axe`, `spear`, `bow`, `crossbow`, `shield`, `shieldSmall`, `shieldLarge`, `boots`, `head`, `helmet`, `armor`, `ring`, `amulet`, `key`, `potion`.

### Еда
`bread`, `meat`, `cheese`, `apple`, `stew`.

### Оружие и одежда мага
`staff`, `magicStaff`, `druidStaff`, `wand`, `fetish`, `magicOrb`, `cloak`, `mantle`, `burka`.

### Мебель, сервис и таверна
`fireplace`, `churchCross`, `bench`, `forgeFurnace`, `anvil`, `counterGoods`, `tavernTable`, `tavernChair`, `beerBarrel`, `wineBottle`.

### Игроки и NPC
`player`, `playerPaladin`, `playerBerserker`, `playerArcher`, `playerMage`, `merchant`, `blacksmith`, `storage`, `torch`, `torchFlame`.

### Ловушки
`trapSpike`, `trapNeedle`, `trapFlame`, `trapDisarmed`, `trapTriggered`.

### Иконки интерфейса (`UI_ICON_SPRITES`)
`uiPlay`, `uiBack`, `uiHelp`, `uiInventory`, `uiSoundOn`, `uiSoundOff`, `uiView`, `uiRest`, `uiShop`, `uiDebug`, `uiRoom`, `uiLan`, `uiLog`, `uiSkill`, `uiSend`, `uiBuy`, `uiEquip`, `uiTrash`, `uiUpgrade`, `uiQuest`, `uiCamp`, `uiLock`, `uiGold`, `uiKey`, `uiGem`, `uiTag`, `uiList`, `uiCity`.

## Город: требования к арту

- Центральная площадь: **фонтан** (`decorFountain`), четыре **дерева** по углам, клумбы (`flowerBed`) по краям.
- Каждое здание города должно получить **уникальный набор стены и пола** из новых ассетов `buildingFloor*` / `buildingWall*`; не смешивать один и тот же набор в двух зданиях.
- **`wallWindow`** — стена с окном, ставится на фасады жилых зданий вместо глухой стены.
- В домах ставятся **камины** (`fireplace`).
- В церкви — **крест** (`churchCross`) и **скамьи** (`bench`).
- У кузнеца — **кузнечная печь** (`forgeFurnace`) и **наковальня** (`anvil`).
- У продавца на прилавке лежат **товары** (`counterGoods`).
- В таверне — **столы** (`tavernTable`), **стулья** (`tavernChair`), **бочки с пивом** (`beerBarrel`) и **бутылки с вином** (`wineBottle`).
- В RTL/LOD сохраняется правило «напольный ассет = 16×16, опорная точка низ по центру».

## Hi-res правила (256×256)

- Файл `assets/sprites/<name>.png` полностью перекрывает атлас по имени.
- Запасной путь: `assets/<name>.png`.
- Пропорции и силуэт должны совпадать с 16×16-эталоном из `generate-tileset.js` — этот скрипт является референсом для художника.

## Проверка после добавления ассета

Ассет живёт в одном из двух мест — и это разные места:

- **Спрайт атласа** (есть свой номер в `KENNEY_MAP`): рисуется в `scripts/generate-tileset.js`, попадает в `assets/tiny-dungeon.png` по своему индексу.
- **Встроенный спрайт** (только из `BUILTIN_ONLY_SPRITES`): рисуется кодом в `buildBuiltin()` (`js/assets.js`), в атласе ему места нет.

Порядок действий:

1. Для встроенного спрайта — добавить имя в `BUILTIN_ONLY_SPRITES` (`js/assets.js`), иначе `ensureExtraSprites()` не воссоздаст его при смене набора.
2. Для спрайта атласа — добавить реализацию в `scripts/generate-tileset.js` с нужным индексом; первый свободный индекс держит `STYLE_START`, а тайлы стилей (`floor_/wall_<стиль>_<0–2>`) добавляются циклом по `CONFIG.MAP_STYLES`, `COUNT` считается сам.
3. Запустить `node scripts/generate-tileset.js`.
4. Запустить `npm test`.