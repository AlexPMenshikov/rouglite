# LAN protocol

The LAN server serves the browser client over HTTP and relays WebSocket messages at `/ws`. Messages are JSON objects with a `type` field.

The server is authoritative for co-op runs: it loads the same game scripts the browser does (`config`, `rng`, `map`, `entities`, `items`, `fov`, `narrator`, `classes`, `meta`, `combat`) into a `node:vm` context, executes validated player actions and broadcasts the resulting snapshot to the room after every turn. Single-player runs stay entirely in the browser and never touch the server.

Authority lives on the server because the previous host-authoritative design tied the shared turn clock to the host's `requestAnimationFrame`: a minimized or backgrounded host window stops producing frames, so the step animation never finished and no remote player could move. The server process is not throttled by any browser window.

## Client → server

| Type | Fields | Allowed sender / effect |
|---|---|---|
| `list` | — | Any connection; answers with the room list and, while the socket is not in a room, subscribes it to room-list updates. |
| `create` | `name`, optional `classId`, optional `luck` | New connection; creates a room and host player. `luck` is the host's meta-progression luck and applies to party gold finds. |
| `join` | `room`, `name`, optional `classId` | New connection; joins a room as a new hero. A hero can only be resumed with `reconnect` and its token. |
| `reconnect` | `room`, `token`, `name` | New connection; resumes the player represented by the saved token. The token is the only credential for returning to a session. |
| `start` | `options` (`size`, `style`) | Host only; begins a run for the whole party. Unknown `size`/`style` fall back to the run defaults. |
| `action` | `action`, `args` | Action name must be in the server allowlist and pass its argument checks, and the connection must fit the rate limit (8/sec). Executed on the shared run. |
| `chat` | `text` | Any player; rate limited (5 per 5 s). |

`classId` must be one of the ids in `PLAYER_CLASSES` (`js/config.js`) and otherwise falls back to `tank`. Room capacity is 4 players. Room data is in memory, limited to 32 rooms, and inactive disconnected rooms expire after 2 hours. A server restart discards rooms and runs.

Actions of one room run strictly one at a time through a per-room queue: the simulation is shared, so two concurrent turns would interleave in the same state.

Resuming a hero requires its token: a plain `join` always creates a new hero even when the name matches a disconnected one, so knowing a room code and a player name is not enough to take over a session.

## Server → client

| Type | Meaning |
|---|---|
| `rooms` | Room list: for each room `code`, `started`, `capacity` and its `players` (`id`, `name`, `classId`, `host`, `connected`). Sent on `list` and, to subscribed sockets, on every change to any room. |
| `room-created` | Room created; contains `room`, `playerId`, reconnect `token`, and `players`. |
| `joined`, `host-reconnected` | Join/resume success; includes identity and players; `state` is included for a resumed player when available. |
| `players` | Updated player list for the current room. |
| `host-disconnected` | The host's browser went away; the run keeps going on the server. |
| `state` | Run snapshot: `state`, `turn`, `actor`, plus `log` (party journal lines since the previous snapshot), `screen` (`merchant`/`blacksmith` requested by `actor`) and `banked` (party gold, only with the final snapshot). One snapshot is sent per completed walk step, and one per action for actions without a step (attack, skill, item). |
| `chat` | A chat message from a player. |
| `chat-error` | Chat rejected by the rate limit. |
| `error` | Human-readable rejection in `message`, plus a stable `code` when the client must react (`bad-token` and `no-room`: the saved session is dead and must be forgotten). |

Clients apply `state` for everyone: `RK.Combat.applySnapshot()` in `js/combat.js` points `RK.GAME.player` at the hero whose `id` the client owns, and `js/render.js` recomputes field of view from that hero because the snapshot's `map.vis` belongs to whoever acted. A one-tile change of any party member is animated locally so no hero teleports.

The server publishes per step rather than per action because a click-to-move autowalk is a single `playerAction` covering many tiles. `RK.Combat.stepsDone()` counts finished step animations; `createRun().act()` reports them through its `onStep` callback and `RoomManager.applyAction()` publishes a snapshot for each. When an action produced no steps at all, the snapshot is sent once after it completes, so clients never see duplicates.

## Transport security

The server is intended for a trusted LAN and is not hardened against an untrusted network:

- The WebSocket upgrade rejects requests whose `Origin` does not match the request's own host and scheme, which blocks cross-site WebSocket hijacking from a page opened in the host's browser.
- HTTP responses carry a restrictive `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
- Connections are pinged periodically; sockets that miss a round are terminated instead of holding a room slot.
- Reconnect tokens are compared in constant time, and names are normalized and length-capped before being stored or rebroadcast.
- Object keys taken from clients are looked up with `hasOwnProperty`, so `size: 'constructor'` cannot smuggle a value in through `Object.prototype`.

Room state still lives in process memory, so this is session hygiene rather than a security boundary. The server now runs the game rules, which removes the previous "host browser decides" trust problem, but it still does not try to stop a modified client from sending unusual actions within the allowlist.

## Snapshot shape

The server treats snapshots as its own serialization and only requires `state.game` and `state.map`. The client creates and applies snapshots through `RK.Combat.createSnapshot()` and `RK.Combat.applySnapshot()` in `js/combat.js`; their internal schema follows the serialized game and map state, including multiplayer player identity. Update snapshot production in `server/game-engine.js` and restore logic in `js/combat.js` together when changing this format.

## Adding an action

1. Add the action in `js/combat.js`: put it in `ACTION_HANDLERS` if it may arrive from a player, and check it works locally too.
2. Add the action name and strict argument validation to `ACTION_RULES` in `server/room-manager.js`. Every action needs an explicit rule: the table has no prototype and there is no catch-all, so a missing entry is rejected rather than silently accepted. Argument bounds that mirror the game (map dimensions, equipment slots) come from `js/config.js`, which the server requires directly.
3. Cover valid execution, invalid arguments, and rate limiting in `tests/lan-server.test.js`.
