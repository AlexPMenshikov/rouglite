# План: стрелки, шаман, ассеты классов — ЗАВЕРШЕНО (2026-10-26)

Задача от 2026-10-25. Всё сделано, тесты проходят (120/120), изменения
закоммичены: `9789499` (шаман, часть 1), `d9efbdd` (спрайты классов),
`b9f2985` (иконки способностей в карточках, тесты).

## 1. Range-атаки стрелков — готово

- Диагноз: `behavior: 'archer'` бил `doAttack` с дистанции без анимации,
  босс «Стрелок бездны» (`boss_archer`, behavior `'boss'`) не стрелял вовсе.
- Решение: врагам ввели флаги `ranged` / `range` в DEFS:
  `archer` — 4 клетки, `boss_archer` — 5 клеток.
- `js/combat-hit.js` `enemyAct`: враг с `ranged` в упор бьёт ближней атакой,
  на дистанции при линии видимости стреляет (`enemyRangedAttack`):
  анимация `RK.Effects.addShot` + обычная формула урона. Босс тоже стреляет,
  но при сближении бьёт в ближнем бою.
- `addShot` уже был в `CONFIG.EFFECT_METHODS` — по сети проигрывается без
  правок сервера.

## 2. Шаман — готово

- `js/entities.js`: тип `shaman` (behavior `shaman`, symbol `W`).
- `js/combat-hit.js`: `resurrectNearby` — раз в ход поднимает павшего врага
  в радиусе зрения с 50% HP; анимация — `addLightning` + кольцо (обе в
  `EFFECT_METHODS`, работают в сети). Нет трупов — дерётся как обычный враг.
- `js/config.js`: шаман в `LOCATION_ENEMIES` (dungeon, crypt) и
  `BASE_ENEMY_TYPES`; `SHAMAN_LIMIT_PER_LOCATION = 2`.
- `js/spawn.js`: спавн шамана сверх лимита заменяет другим врагом;
  `shamanCount` считает и мёртвых.
- Ассеты: тайл 71 в `tiny-dungeon.png` (атлас стал 1952×16, 122 тайла),
  hi-res `assets/sprites/shaman.png`, builtin-спрайт в `js/assets.js`,
  индексы стилей сдвинуты на 72 (генератор и `KENNEY_MAP` согласованы).
- `assets/README.md` обновлён (индекс 71, сдвиг, состав пулов).

## 3. Ассеты классов и иконки способностей — готово

- Спрайты: `playerPaladin/playerBerserker/playerArcher/playerMage` —
  hi-res из генератора (стойка + 2 кадра шага, своё оружие: меч/топоры/
  лук/посох) + разные builtin-фолбэки 16×16 в `js/assets.js`.
- Иконки 12 способностей: поле `icon` в `SKILL_DEFS` (`js/skills.js`),
  рисунки `uiSkill*` в `buildUiIcons()`, имена в `UI_ICON_SPRITES`.
- Показ в трёх местах: панель способностей (`buildSkillBar`),
  окно навыков (`renderSkillsScreen`, иконка на кнопке),
  карточки классов (`renderClassList`: портрет класса + иконки всех
  трёх способностей с подсказкой уровня открытия).
- `tests/skill-icons.test.js`: у каждой способности своя иконка, у каждого
  класса свой спрайт, иконки не повторяются.
