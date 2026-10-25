# План: стрелки, шаман, ассеты классов (задача от 2026-10-25)

## Постановка

1. Проверить range-атаки лучника, усиленного лучника и босса «Стрелок бездны» + анимацию выстрела.
2. Новый уникальный враг-шаман: воскрешает павших, лимит 2 на локацию, ассет и анимация способности.
3. Свои ассеты классам и иконки каждой способности: генератор `scripts/generate-tileset.js` + README; иконки на кнопках способностей, в описании классов до старта и в окне навыков.

## Сделано

### П.1 — дальний бой врагов (готово)

- Диагноз: у лучника `behavior: 'archer'` бил функцией ближнего боя `doAttack` с расстояния без анимации; у `boss_archer` был `behavior: 'boss'` — вообще не стрелял, только догонял. Усиленный лучник behavior наследует — с ним порядок.
- `js/combat-hit.js`:
  - `enemyAct` переписан: любой враг с флагом `e.ranged` в упор бьёт ближней атакой, на дистанции `e.range` (по умолчанию 4) при линии видимости — новым `enemyRangedAttack` (анимация `RK.Effects.addShot` + урон обычной формулой), иначе догоняет.
  - `finishEnemyAttack` различает сообщение «стреляет в вас» / «бьёт вас».
- `js/entities.js`: `archer` получил `ranged: true, range: 4`; `boss_archer` — `ranged: true, range: 5`; в сборку DEFS боссов прокинуты `ranged`/`range`.
- Анимация `addShot` уже есть в `CONFIG.EFFECT_METHODS` — по сети проигрывается.

### П.2 — шаман (готово)

- `js/entities.js`: тип `shaman` (name «Шаман», symbol `W`, asset `shaman`, behavior `shaman`, hp 20, atk 5, xp 16, dodge 0.1).
- `js/combat-hit.js`: `resurrectNearby` поднимает павшего в радиусе `ENEMY_VISION_RADIUS` с 50% HP; анимация — `addLightning` + кольцо.
- `js/config.js`: `shaman` в `LOCATION_ENEMIES` для `dungeon`/`crypt`, `SHAMAN_LIMIT_PER_LOCATION = 2`.
- `js/spawn.js`: сверх лимита шаман заменяется; `shamanCount()` считает и мёртвых.
- Ассеты: тайл 71 в атласе, hi-res `assets/sprites/shaman.png`, встроенный спрайт, `KENNEY_MAP`, `STYLE_START = 72`.
- Тесты: `tests/shaman.test.js` (пул, лимит, воскрешение); `location-enemies` допускает один тип в нескольких локациях.

### П.3 — ассеты классов и иконки способностей (готово)

- `scripts/generate-tileset.js`: `spriteClass` пишет стойку + `_walk1/_walk2` с оружием класса; `spritePlayer` + `spriteShaman`.
- `js/assets.js`: разные встроенные `playerPaladin`/`Berserker`/`Archer`/`Mage`; 12 иконок способностей в `buildUiIcons` / `UI_ICON_SPRITES`.
- `js/skills.js`: поле `icon` у каждой способности.
- Показ: панель (`buildSkillBar`), окно навыков (`renderSkillsScreen`), выбор класса (`renderClassList` + портрет).
- `assets/README.md`: шаман (71), сдвиг стилей, спрайты классов, иконки способностей.

### Финал

- [x] `npm test` целиком — зелёный.

## Заметки

- Трупы врагов остаются в `RK.GAME.enemies` с `alive === false` — шаман их находит и поднимает на месте.
- `shaman_enhanced` смотрит на тот же тайл 71.
- Отдельную `addResurrect` не вводили: хватает `addLightning` + `add` из `EFFECT_METHODS`.
- Коммит — по запросу пользователя.
