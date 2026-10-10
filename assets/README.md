# Пиксельная графика — бесплатные источники

Игра уже рисует **встроенные спрайты 16×16** в духе RPG 80–90-х.  
Чтобы подключить **внешний тайлсет**, положите PNG в эту папку.

## Быстрое подключение

1. Скачайте бесплатный набор **16×16** (см. ниже).
2. Нарежьте или используйте готовый spritesheet в одну строку/сетку кратную 16 px.
3. Сохраните как **`assets/tiny-dungeon.png`** или **`assets/spritesheet.png`**.

Порядок тайлов в spritesheet (слева направо, сверху вниз):

| # | Спрайт |
|---|--------|
| 0 | пол (светлый) |
| 1 | стена |
| 2 | пол (тёмный, исследованный) |
| 3 | стена (тёмная) |
| 4 | лестница |
| 5 | игрок |
| 6 | слизень |
| 7 | крыса |
| 8 | скелет |
| 9 | лучник |
| 10 | нетопырь |
| 11 | демон |
| 12 | босс |
| 13 | золото |
| 14 | зелье |
| 15 | меч |
| 16 | туман (неисследованное) |

Если файла нет — используются встроенные спрайты.

## Варианты пола и стен по этажам

Для 4–6 этажей можно добавить тайлы `assets/floor-dark.png` и
`assets/wall-dark.png`, для 7–10 — `assets/floor-deep.png` и
`assets/wall-deep.png`. Каждый файл должен содержать тайл размером не менее
16×16 px в левом верхнем углу. Тайлы пола/стен для исследованных клеток
формируются из соответствующих тёмных тайлов автоматически.

Если файл или отдельный тайл отсутствует, игра затемняет текущий тайл пола
или стены и использует его как вариант этажа. Туман войны остаётся без изменений.

---

## Где брать текстуры бесплатно

### Kenney (CC0 — можно всё, без указания авторства)

- **[Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)** — классика для roguelike, 16×16.
- **[Micro Roguelike](https://kenney.nl/assets/micro-roguelike)** — ещё один набор для подземелий.
- **[1-Bit Pack](https://kenney.nl/assets/1-bit-pack)** — минималистичный ретро-стиль.

### OpenGameArt.org (смотрите лицензию на каждый пак)

- **[LPC Base Assets](https://opengameart.org/content/lpc-base-assets-sprites-map-tiles)** — огромная база RPG-тайлов.
- **[Dungeon Tileset II](https://opengameart.org/content/dungeon-tileset-ii)** — каменные стены и пол.
- Поиск: [opengameart.org](https://opengameart.org) → теги `16x16`, `dungeon`, `roguelike`.

### itch.io (много CC0 / free)

- **[Free Pixel Art Top-Down Asset Pack](https://anokolisa.itch.io/free-pixel-art-asset-pack-topdown-tileset)** — вид сверху, подземелья.
- Поиск на [itch.io/game-assets/free](https://itch.io/game-assets/free/tag-pixel-art) — теги `pixel-art`, `top-down`, `dungeon`.

### Другие

- **[Glitch assets (GitHub)](https://github.com/opensourcerers/glitch-assets)** — архив CC0-спрайтов.
- **[Craftpix free section](https://craftpix.net/freebies/)** — иногда бесплатные dungeon-паки (читайте лицензию).

---

## Лицензии — кратко

| Метка | Можно в игре? |
|-------|----------------|
| **CC0** | Да, свободно |
| **CC-BY** | Да, укажите автора в титрах/README |
| **CC-BY-SA** | Да, но производные тоже под SA |
| **NC (non-commercial)** | Только некомmercial проекты |

---

## Ретро-шрифты (бесплатно)

- **[Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)** — уже подключён в игре (Google Fonts, OFL).
- **[Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans)** — чуть мягче, тоже бесплатно.
