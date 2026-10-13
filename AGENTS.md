# AGENTS.md

Browser roguelite (single player in the browser) with LAN co-op up to 4 players (server-authoritative). 
All comments, UI strings, docs, and commit messages are in Russian — keep new ones in Russian. No build step, no bundler, no ES modules, no TypeScript.

## Commands

- `npm install` — only runtime dependency is `ws`; Node >= 18 (`package.json` engines).
- `npm start` — LAN server. Binds `0.0.0.0`, port from `PORT` env or auto-assigned. Opens a browser tab on Windows.
- `npm test` = `npm run lint` → `npm run test:unit` → `npm run test:integration`. Order matters.
- `npm run lint` — `scripts/check-syntax.js`: parses every `js/*.js` found in `<script src="js/...">` tags of `rougelite.html` plus a hardcoded server list (`server.js`, `server/room-manager.js`, `server/static-files.js`). A new script not added to the HTML is silently not linted.
- Single test file: `node --test tests/<feature>.test.js`.
- CI (`.github/workflows/test.yml`): Node 18/20/22, `npm ci` + `npm test`.

## Architecture

- **One codebase, two runtimes.** Browser loads plain scripts in dependency order at the bottom of `rougelite.html`; everything attaches to the global `window.RK`. The LAN server runs the *same* `js/` files unmodified inside `node:vm` (`server/game-engine.js`, `ENGINE_SCRIPTS`) and stubs `RK.UI` / `RK.Audio` / `RK.Effects`. Browser-only files (`render`, `input`, `ui`, `network`, `main`, `debug`, `assets`, `audio`, `effects`) are excluded from the engine.
- **Script lists live in 3 places and must stay in sync and in HTML order**: `rougelite.html` (browser), `ENGINE_SCRIPTS` (`server/game-engine.js`, server needs them for network play), and `GAME_SCRIPTS` / `UI_SCRIPTS` in `tests/helpers/sandbox.js` (tests). New shared game logic must be added to all lists that need it.
- **`js/config.js` is dual-loaded**: `<script>` → `RK.CONFIG`; `require('../js/config')` from Node (an IIFE exports both). It is the single source of truth for map sizes/limits, `SLOTS`, `PLAYER_CLASSES`, traps, zones — the server's `room-manager.js` derives its validation from it so client/server can't diverge. `ENABLE_WORLD` gates the world/location mode.
- **Tests** run `js/` files in `node:vm` with a fake DOM/WebSocket via `tests/helpers/sandbox.js` — use `createSandbox()`, `createRenderSandbox()`, `createNetworkSandbox()`; don't write your own DOM stub. Seeds are deterministic (counter-based) unless you pass `seed`.
- **LAN protocol** (`docs/lan-protocol.md` is the spec): client sends JSON with `type` over the WebSocket at `/ws`; every action must have an entry in `ACTION_RULES` (`server/room-manager.js`) — explicit rule per action, no catch-all, no prototype, arg bounds from `js/config.js` — plus a handler in `ACTION_HANDLERS` (`js/combat.js`), plus coverage in `tests/lan-server.test.js`. Server publishes one snapshot per animated step and one per non-walk action. Tokens are the only way to resume a session (`reconnect`); a plain `join` always creates a new hero.
- **Movement/animation**: per-actor `walk.steps` in `js/combat.js`; `busy()` watches only the local hero; `tickWalk()` advances steps, `stepsDone()` counts completed ones. The server drives `tickWalk` from a timer (`TICK_MS = 16`), not `requestAnimationFrame`, so a minimized host window can't stall the game.
- **UI icons are code, not assets**: sprites drawn in `buildUiIcons()`, names in `UI_ICON_SPRITES` (`js/assets.js`), referenced by `STATIC_BUTTON_ICONS` (`js/ui.js`).
- **Docker**: non-root user, `PORT` env (3000 in `docker-compose.yml`), healthcheck does a GET on `/`.

## Gotchas
- Check `git log`/`git status` before assuming you broke something; `docs/world-plan.md` tracks what's done/not.
- `check-syntax.js` (lint) only covers scripts scraped from the HTML plus three hardcoded server files — a new `server/` file (e.g. `server/game-engine.js` today) is not syntax-checked.
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