# EcoHealth — WebRTC / Signaling Server

This directory documents the WebRTC and real-time signaling components of
EcoHealth Cloud. The actual code lives in `backend/` (shared with the REST
API), but this folder provides a clear separation for understanding which
modules handle real-time communication.

## Architecture

```
Frontend (browser)
    │
    ├── WebSocket ──► Signaling Server (backend/server.js)
    │                      │
    │                      ├── backend/lib/realtime.js      (Socket.IO server)
    │                      ├── backend/lib/socketEvents.js  (event handlers)
    │                      ├── backend/realtime/signaling.js (WebRTC signaling)
    │                      ├── backend/routes/calls.js      (call REST API)
    │                      └── backend/models/CallRoom.js   (call state)
    │
    └── TURN relay ──► coturn (UDP 3478)
```

## Key Files (in `backend/`)

| File | Purpose |
|------|---------|
| `backend/lib/realtime.js` | Socket.IO server setup, connection authentication |
| `backend/lib/socketEvents.js` | Event handlers for chat, calls, DND, notifications |
| `backend/realtime/signaling.js` | WebRTC offer/answer/ICE candidate relay |
| `backend/routes/calls.js` | REST endpoints for initiating/end calls |
| `backend/models/CallRoom.js` | Database model for call sessions |
| `backend/models/CallParticipant.js` | Participants in a call |
| `backend/models/Conversation.js` | Chat conversations (tied to appointments) |
| `backend/models/Message.js` | Chat messages |

## TURN Server (coturn)

The TURN relay is a separate system service (`coturn`), not part of the
Node.js backend. It runs on the signaling server and handles NAT traversal
for WebRTC media.

Config: `/etc/turnserver.conf`
Service: `sudo systemctl status coturn`
Logs: `/var/log/turnserver.log`

## Internal API (signaling → app server)

The signaling server needs user data (DND status, caller identity) from
the app server's database. Instead of exposing PostgreSQL directly, the
app server exposes an internal API at `/internal/` protected by
`INTERNAL_API_SECRET`.

| Endpoint | Purpose |
|----------|---------|
| `GET /internal/users/:id` | Get user profile (for caller ID) |
| `GET /internal/users/:id/call-status` | Get DND status |

## Environment Variables

See `deploy/env.signaling-server.example` for the full list.

Critical (must match app server):
- `JWT_SECRET` — verify auth tokens issued by app server
- `FILE_DOWNLOAD_SECRET` — verify file download tokens
- `INTERNAL_API_SECRET` — authenticate internal API calls

Signaling-specific:
- `INTERNAL_API_BASE` — app server's base URL (e.g. `https://app.example.com`)
- `ICE_TURN_URLS` — TURN server address
- `ICE_TURN_USERNAME` / `ICE_TURN_CREDENTIAL` — TURN credentials
- `CALL_RING_TIMEOUT_MS` — ring timeout before auto-cancel

## Deployment

```bash
# First-time setup
sudo bash deploy/setup-signaling-server.sh

# Routine deploy
sudo bash deploy/deploy-signaling-server.sh
```

See `DEPLOYMENT.md` for full instructions.
