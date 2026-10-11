# LAN protocol

The LAN server serves the browser client over HTTP and relays WebSocket messages at `/ws`. Messages are JSON objects with a `type` field. The host is authoritative for gameplay: guests submit validated action requests, the host runs them, then publishes a full snapshot. The server does not simulate or verify game rules.

## Client → server

| Type | Fields | Allowed sender / effect |
|---|---|---|
| `create` | `name`, optional `classId` | New connection; creates a room and host player. |
| `join` | `room`, `name`, optional `classId` | New connection; joins a room. A disconnected player with the same name may be resumed. |
| `reconnect` | `room`, `token`, `name` | New connection; resumes the player represented by the saved token. |
| `action` | `action`, `args` | Guest only; action must be in the server allowlist, pass its argument checks, and fit the rate limit (8/sec). Forwarded to host with server-assigned `playerId`. |
| `state` | `state` | Host only; state must include `game` and `map`, and its JSON encoding must be at most 2 MiB. Stored in the room and broadcast to players. |
| `notice` | `notice`, `playerId` | Host only; currently `merchant` and `blacksmith`; relayed to the addressed connected guest. |

`classId` currently falls back to `tank` unless it is `berserker`; the client separately manages unlocked classes. Room capacity is 4 players. Room data is in memory, limited to 32 rooms, and inactive disconnected rooms expire after 2 hours. A server restart discards rooms and snapshots.

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
| `error` | Human-readable rejection in `message`. |

## Snapshot shape

The server treats snapshots as opaque JSON and only requires `state.game`, `state.map`, and the 2 MiB size limit. The client creates and applies snapshots through `RK.Combat.createSnapshot()` and `RK.Combat.applySnapshot()` in `js/combat.js`; their internal schema follows the serialized game and map state, including multiplayer player identity and active-player selection. Update snapshot production, restore logic, and reconnect handling together when changing this format. The host is trusted, so this is not a security boundary or anti-cheat validation.

## Adding an action

1. Add client sending/handling behavior in `js/network.js` and game execution in `js/combat.js` as needed.
2. Add the action name and strict argument validation to `ACTIONS` / `RoomManager.validAction()` in `server/room-manager.js`.
3. Cover valid routing, invalid arguments, and rate limiting in `tests/lan-server.test.js`.
