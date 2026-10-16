# AGENTS.md

Browser roguelite (single player in the browser) with LAN co-op up to 4 players (server-authoritative). 
All comments, UI strings, docs, and commit messages are in Russian — keep new ones in Russian. No build step, no bundler, no ES modules, no TypeScript.

## Commands

- `npm install` — only runtime dependency is `ws`; Node >= 18 (`package.json` engines).
- `npm start` — LAN server. Binds `0.0.0.0`, port from `PORT` env or auto-assigned. Opens a browser tab on Windows.
- `npm test` = `npm run lint` → `npm run test:unit` → `npm run test:integration`. Order matters.
- `npm run lint` — `scripts/check-syntax.js`: parses every `js/*.js` found in `<script src="js/...">` tags of `rougelite.html` plus a hardcoded server list (`server.js`, `server/room-manager.js`, `server/static-files.js`, `server/game-engine.js`, `server/run-store.js`). It fails when the HTML order drifts from `BROWSER_SCRIPTS` (`scripts/script-list.js`); the `scripts/*.js` files themselves are never linted.
- Single test file: `node --test tests/<feature>.test.js`.
- CI (`.github/workflows/test.yml`): Node 18/20/22, `npm ci` + `npm test`.

## Architecture

- **One codebase, two runtimes.** Browser loads plain scripts in dependency order at the bottom of `rougelite.html`; everything attaches to the global `window.RK`. The LAN server runs the *same* `js/` files unmodified inside `node:vm` (`server/game-engine.js`, `ENGINE_SCRIPTS`) and stubs `RK.UI` / `RK.Audio` / `RK.Effects`. Browser-only files (`render`, `input`, `ui`, `network`, `main`, `debug`, `assets`, `audio`, `effects`) are excluded from the engine.
- **Script lists live in one place**: `scripts/script-list.js` holds `BROWSER_SCRIPTS` (the order for `rougelite.html`), `ENGINE_SCRIPTS` (server network play, excludes browser-only files), and `GAME_SCRIPTS` / `UI_SCRIPTS` (tests). `server/game-engine.js` and `tests/helpers/sandbox.js` import them. New shared game logic goes into the lists that need it — server-side code must land in `ENGINE_SCRIPTS` or the server never sees it.
- **`js/config.js` is dual-loaded**: `<script>` → `RK.CONFIG`; `require('../js/config')` from Node (an IIFE exports both). It is the single source of truth for map sizes/limits, `SLOTS`, `PLAYER_CLASSES`, traps, zones — the server's `room-manager.js` derives its validation from it so client/server can't diverge. `ENABLE_WORLD` gates the world/location mode.
- **Tests** run `js/` files in `node:vm` with a fake DOM/WebSocket via `tests/helpers/sandbox.js` — use `createSandbox()`, `createRenderSandbox()`, `createNetworkSandbox()`; don't write your own DOM stub. Seeds are deterministic (counter-based) unless you pass `seed`.
- **LAN protocol** (`docs/lan-protocol.md` is the spec): client sends JSON with `type` over the WebSocket at `/ws`; every action must have an entry in `ACTION_RULES` (`server/room-manager.js`) — explicit rule per action, no catch-all, no prototype, arg bounds from `js/config.js` — plus a handler in `ACTION_HANDLERS` (`js/combat.js`), plus coverage in `tests/lan-server.test.js`. Server publishes one snapshot per animated step and one per non-walk action. Tokens are the only way to resume a session (`reconnect`); a plain `join` always creates a new hero.
- **Snapshots are compressed**: map matrices travel as `[value, length]` pairs in `map.matrices` (`js/map.js` owns the codec, the field list is duplicated in `js/combat.js`), and `map.vis` is not sent at all — each client recomputes visibility for its own hero. A matrix that does not decode to exactly `w × h` is rejected.
- **No empty transitions between locations**: a location map never shows an exit you cannot walk through into another location. `js/world.js` drops an exit without a real location behind it (`linksToLocation`) and one unreachable from the spawn (`reachableExits`); a teleport with no entry gate puts the hero on the location spawn — in the city that is the plaza center.

## Платформа и экран
- Основная цель — PC (клавиатура/мышь); мобильные устройства и планшеты отложены.
- Игровое поле занимает максимальное свободное место на экране; базовый отсчёт 1920×1080.
- **Persisted runs**: single-player saves to `localStorage` under `CONFIG.SAVE_KEY`; network rooms save to disk (`server/run-store.js`, `RUNS_DIR`, default `data/runs/`). Room files hold reconnect tokens, so the directory is secret. `restoreRoom()` rebuilds a room from disk on join; the file name is built only from validated room-code characters.
- **Movement/animation**: per-actor `walk.steps` in `js/combat.js`; `busy()` watches only the local hero; `tickWalk()` advances steps, `stepsDone()` counts completed ones. The server drives `tickWalk` from a timer (`TICK_MS = 16`), not `requestAnimationFrame`, so a minimized host window can't stall the game.
- **UI icons are code, not assets**: sprites drawn in `buildUiIcons()`, names in `UI_ICON_SPRITES` (`js/assets.js`), referenced by `STATIC_BUTTON_ICONS` (`js/ui.js`).
- **Docker**: non-root user, `PORT` env (3000 in `docker-compose.yml`), `RUNS_DIR=/app/data/runs` with a named volume (the directory is chowned to `nodejs` in the image so the volume inherits it), healthcheck does a GET on `/`.

## Gotchas
- Check `git log`/`git status` before assuming you broke something; `docs/world-plan.md` tracks what's done/not.
- `check-syntax.js` (lint) covers the scripts scraped from the HTML (checked against `BROWSER_SCRIPTS`) plus the hardcoded `SERVER_SCRIPTS` list in `scripts/check-syntax.js` — a new `server/` file must be added there or it is not syntax-checked, and the `scripts/*.js` files are never checked at all.
- A step publishes **two** snapshots: an intermediate one mid-animation and a final one. Anything reading run state off snapshots must take the last one, or it sees the hero half a step back.
- Meta progression key in `localStorage` is the misspelled `rogalite_meta_v1` (`js/config.js` `META_KEY`) — keep it, tests rely on it.
- Commits/branches: history uses `agents/*` branches merged into `main`; commit messages in Russian.

- Add new test files to the explicit `test:unit` / `test:integration` file lists.
Чем более изолированными и детерминированными будут тесты, тем быстрее мы будем получать чистые отчеты и тем меньше ложных срабатываний нам придется разбирать вручную.

Твой стиль комментариев: лаконичный, доступный и компактный.
Правила форматирования:
• Максимум 1–2 коротких предложения на один комментарий.
• Используй только простые слова, понятные широкой аудитории.
• Никакой лишней вежливости, вводных слов и теоретических отступлений.
• Суть — в самом начале.