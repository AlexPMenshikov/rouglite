# LAN protocol

The LAN server serves the browser client over HTTP and relays WebSocket messages at `/ws`. Messages are JSON objects with a `type` field. The host is authoritative for gameplay: guests submit validated action requests, the host runs them, then publishes a full snapshot. The server does not simulate or verify game rules.

## Client → server

| Type | Fields | Allowed sender / effect |
|---|---|---|
| `create` | `name`, optional `classId` | New connection; creates a room and host player. |
| `join` | `room`, `name`, optional `classId` | New connection; joins a room as a new hero. A hero can only be resumed with `reconnect` and its token. |
| `reconnect` | `room`, `token`, `name` | New connection; resumes the player represented by the saved token. The token is the only credential for returning to a session. |
| `action` | `action`, `args` | Guest only; action must be in the server allowlist, pass its argument checks, and fit the rate limit (8/sec). Forwarded to host with server-assigned `playerId`. |
| `state` | `state` | Host only; state must include `game` and `map`, and its JSON encoding must be at most 2 MiB. Stored in the room and broadcast to players. |
| `notice` | `notice`, `playerId` | Host only; currently `merchant` and `blacksmith`; relayed to the addressed connected guest. |

`classId` must be one of the ids in `PLAYER_CLASSES` (`js/config.js`) and otherwise falls back to `tank`; the client separately manages unlocked classes. Room capacity is 4 players. Room data is in memory, limited to 32 rooms, and inactive disconnected rooms expire after 2 hours. A server restart discards rooms and snapshots.

Resuming a hero requires its token: a plain `join` always creates a new hero even when the name matches a disconnected one, so knowing a room code and a player name is not enough to take over a session.

## Server → client

| Type | Meaning |
|---|---|
| `room-created` | Room created; contains `room`, `playerId`, reconnect `token`, and `players`. |
| `joined`, `host-reconnected` | Join/resume success; includes identity and players; `state` is included for a resumed player when available. |
| `players` | Updated player list (`id`, `name`, `classId`, `host`, `connected`). |
| `player-joined`, `player-disconnected` | Host notification to add or mark a remote hero disconnected. |
| `host-disconnected` | Guests should wait for host reconnect. |
| `action` | Host receives the guest's `playerId`, allowlisted action name, and validated args. |
| `state` | Latest host snapshot broadcast to guests. |
| `notice` | UI request for a guest to open merchant or blacksmith. |
| `error` | Human-readable rejection in `message`, plus a stable `code` when the client must react (`bad-token` and `no-room`: the saved session is dead and must be forgotten). |

## Transport security

The server is intended for a trusted LAN and is not hardened against an untrusted network:

- The WebSocket upgrade rejects requests whose `Origin` does not match the request's own host and scheme, which blocks cross-site WebSocket hijacking from a page opened in the host's browser.
- HTTP responses carry a restrictive `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
- Connections are pinged periodically; sockets that miss a round are terminated instead of holding a room slot.
- Reconnect tokens are compared in constant time, and names are normalized and length-capped before being stored or rebroadcast.

Room state still lives in process memory and the host remains authoritative for gameplay, so this is session hygiene rather than a security boundary.

## Snapshot shape

The server treats snapshots as opaque JSON and only requires `state.game`, `state.map`, and the 2 MiB size limit. The client creates and applies snapshots through `RK.Combat.createSnapshot()` and `RK.Combat.applySnapshot()` in `js/combat.js`; their internal schema follows the serialized game and map state, including multiplayer player identity and active-player selection. Update snapshot production, restore logic, and reconnect handling together when changing this format. The host is trusted, so this is not a security boundary or anti-cheat validation.

## Adding an action

1. Add client sending/handling behavior in `js/network.js` and game execution in `js/combat.js` as needed.
2. Add the action name and strict argument validation to `ACTION_RULES` in `server/room-manager.js`. Every action needs an explicit rule: the table has no prototype and there is no catch-all, so a missing entry is rejected rather than silently accepted. Argument bounds that mirror the game (map dimensions, equipment slots) come from `js/config.js`, which the server requires directly.
3. Add the same name to the network handler table in `js/combat.js`. That table is also prototype-less, so only real handlers can be dispatched.
4. Cover valid routing, invalid arguments, and rate limiting in `tests/lan-server.test.js`.
