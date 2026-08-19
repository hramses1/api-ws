# API WS — WhatsApp REST API

REST API over [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
(NestJS). Send text and media, reply quoting a received message, check numbers,
receive incoming messages (chat history + webhooks) and manage the session.

## Features

- **Send** text messages to contacts **and groups** (`POST /messages/send`)
- **Bulk send in parallel** — one call, many recipients, per-recipient result
  (`POST /messages/bulk`)
- **Send media** by URL or base64, with caption (`POST /messages/media`)
- **Reply** to a received message, quoting it (`POST /messages/reply`)
- **Delete for everyone**, edit, react, forward, star and pin messages
- **Groups**: create, list, participants, admins, permissions, invite links,
  picture and membership requests
- **Check** if a number is on WhatsApp (`GET /check-number`)
- **Receive** incoming messages (chat history + optional **webhook** forwarding)
- **Chat history** in memory (`GET /chats`, `GET /chat-history`)
- **Session**: status (`GET /status`), QR as JSON/SVG (`GET /qr`,
  `GET /get-session-qr-code`), logout (`POST /logout`)
- **Health** probe (`GET /health`)
- API-key auth (global, constant-time), rate limiting, consistent JSON errors,
  auto-reconnect, env validation, Swagger docs

## Setup

```bash
npm install
cp .env.example .env   # set API_KEY, PORT, optional WEBHOOK_URL
npm run start          # use start (NOT start:dev) for WhatsApp — watch restarts break the session
```

On first run a QR is generated. Scan it from your phone:

1. `GET /api/whatsapp/status` → wait for `QR_REQUIRED`
2. `GET /api/whatsapp/qr` (JSON: raw + PNG data-URL) or
   `GET /api/whatsapp/get-session-qr-code` (SVG) and scan it in
   WhatsApp → Linked devices
3. Wait for status `READY` before sending

Session persists in `.wwebjs_auth/` — no rescan needed on later starts.

## Configuration (`.env`)

| Var              | Default   | Description                                                  |
| ---------------- | --------- | ------------------------------------------------------------ |
| `PORT`           | `3000`    | HTTP port                                                    |
| `API_KEY`        | _(unset)_ | Required in `x-api-key` header for all but `/status`+`/health`. If unset, those endpoints are **open** (dev only; a warning is logged). |
| `WEBHOOK_URL`    | _(unset)_ | If set, incoming messages are POSTed here as JSON.           |
| `WEBHOOK_SECRET` | _(unset)_ | If set, payloads are signed (HMAC-SHA256) in `x-webhook-signature`. |
| `WWEB_MAX_CONCURRENCY` | `5` | How many operations hit the browser at once. Drives bulk parallelism; too high saturates Chrome. |
| `WWEB_OP_TIMEOUT_MS` | `30000` | Per-operation timeout; a slower call returns 504 instead of hanging. |
| `WWEB_BULK_MAX_RECIPIENTS` | `50` | Hard cap on recipients per bulk call. |
| `THROTTLE_TTL` | `60000` | Rate-limit window in ms. |
| `THROTTLE_LIMIT` | `30` | Requests per window per IP. |

## Endpoints

Base path: `/api/whatsapp` (health at `/api/health`). Swagger UI:
`http://localhost:3000/docs`. All endpoints require `x-api-key` **except**
`/status` and `/health`.

| Method | Path                       | Auth | Description                          |
| ------ | -------------------------- | ---- | ----------------------------------- |
| GET    | `/health`                  | no   | Liveness probe                      |
| GET    | `/whatsapp/status`         | no   | Connection status + QR availability |
| GET    | `/whatsapp/qr`             | yes  | QR as JSON (raw + PNG data-URL)     |
| GET    | `/whatsapp/get-session-qr-code` | yes | QR code as SVG                  |
| GET    | `/whatsapp/get-logged-in-user-info` | yes | Linked account info        |
| GET    | `/whatsapp/check-number`   | yes  | Is a number registered on WhatsApp  |
| GET    | `/whatsapp/chats`          | yes  | Chats with last message             |
| GET    | `/whatsapp/chat-history?cellPhone=` | yes | Messages of a chat          |
| POST   | `/whatsapp/logout`         | yes  | Unlink the session                  |

#### Messages

`to` accepts a phone number, a contact id (`…@c.us`) or a **group id**
(`…@g.us`) — there is no separate endpoint for groups.

| Method | Path                             | Description                                |
| ------ | -------------------------------- | ------------------------------------------ |
| POST   | `/whatsapp/messages/send`        | Send a text message                        |
| POST   | `/whatsapp/messages/bulk`        | Send to many recipients, in parallel       |
| POST   | `/whatsapp/messages/media`       | Send image/document (url or base64)        |
| POST   | `/whatsapp/messages/media/bulk`  | Send media to many recipients, in parallel |
| POST   | `/whatsapp/messages/reply`       | Reply quoting a message                    |
| GET    | `/whatsapp/messages/:id`         | Message detail                             |
| DELETE | `/whatsapp/messages/:id`         | Delete — `?everyone=true` revokes for all  |
| PATCH  | `/whatsapp/messages/:id`         | Edit the text                              |
| POST   | `/whatsapp/messages/:id/react`   | React with an emoji (empty string removes) |
| POST   | `/whatsapp/messages/:id/forward` | Forward to another chat                    |
| POST   | `/whatsapp/messages/:id/star`    | Star / unstar                              |
| POST   | `/whatsapp/messages/:id/pin`     | Pin / unpin                                |

#### Groups

| Method | Path                                               | Description                    |
| ------ | -------------------------------------------------- | ------------------------------ |
| POST   | `/whatsapp/groups`                                 | Create a group                 |
| GET    | `/whatsapp/groups`                                 | List your groups               |
| POST   | `/whatsapp/groups/join`                            | Join with an invite code       |
| GET    | `/whatsapp/groups/:id`                             | Detail + participants          |
| PATCH  | `/whatsapp/groups/:id`                             | Change subject / description   |
| DELETE | `/whatsapp/groups/:id`                             | Leave the group (`?deleteChat=true` also removes the conversation) |
| POST   | `/whatsapp/groups/:id/participants`                | Add participants               |
| DELETE | `/whatsapp/groups/:id/participants`                | Remove participants            |
| POST   | `/whatsapp/groups/:id/participants/promote`        | Promote to admin               |
| POST   | `/whatsapp/groups/:id/participants/demote`         | Demote to member               |
| PATCH  | `/whatsapp/groups/:id/settings`                    | Who can post / edit info / add |
| GET    | `/whatsapp/groups/:id/invite`                      | Invite code + link             |
| POST   | `/whatsapp/groups/:id/invite/revoke`               | Revoke and reissue the code    |
| PUT    | `/whatsapp/groups/:id/picture`                     | Set the picture                |
| DELETE | `/whatsapp/groups/:id/picture`                     | Remove the picture             |
| GET    | `/whatsapp/groups/:id/membership-requests`         | Pending join requests          |
| POST   | `/whatsapp/groups/:id/membership-requests/approve` | Approve requests               |
| POST   | `/whatsapp/groups/:id/membership-requests/reject`  | Reject requests                |

#### Deprecated (still working)

`POST /whatsapp/send-message`, `/whatsapp/send-media` and
`/whatsapp/reply-message` keep their original contracts (`cellPhone` field).
Use the `/whatsapp/messages/*` equivalents in new code.

### Examples

```bash
# Send text
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"cellPhone":"573001234567","message":"Hola"}'

# Send media by URL
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"cellPhone":"573001234567","url":"https://picsum.photos/400","caption":"Foto"}'

# Check a number
curl "http://localhost:3000/api/whatsapp/check-number?cellPhone=573001234567" \
  -H "x-api-key: $API_KEY"

# Reply (quotedMessageId comes from chat history / a send response)
curl -X POST http://localhost:3000/api/whatsapp/messages/reply \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"to":"573001234567","message":"Te respondo","quotedMessageId":"true_..."}'

# Send to 5 people at once — the sends run in parallel, not one by one
curl -X POST http://localhost:3000/api/whatsapp/messages/bulk \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"recipients":["573001111111","573002222222","573003333333"],"message":"Hola"}'

# Send to a group (same endpoint, group id as recipient)
curl -X POST http://localhost:3000/api/whatsapp/messages/send \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"to":"120363000000000000@g.us","message":"Hola equipo"}'

# Delete a message for everyone (URL-encode the id)
curl -X DELETE "http://localhost:3000/api/whatsapp/messages/true_573001234567%40c.us_3EB0ABC123?everyone=true" \
  -H "x-api-key: $API_KEY"

# Create a group
curl -X POST http://localhost:3000/api/whatsapp/groups \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"title":"Equipo","participants":["573001111111","573002222222"]}'
```

### Bulk sending

`POST /messages/bulk` runs the sends concurrently (bounded by
`WWEB_MAX_CONCURRENCY`) and answers with one entry per recipient, so a bad
number never aborts the batch:

```json
{
  "total": 3,
  "sent": 2,
  "failed": 1,
  "results": [
    { "to": "573001111111@c.us", "status": "sent", "messageId": "true_..." },
    { "to": "573002222222@c.us", "status": "sent", "messageId": "true_..." },
    { "to": "573003333333@c.us", "status": "failed", "error": "Chat not found" }
  ]
}
```

### Group quirks worth knowing

- **Adding someone may return `invited` instead of `ok`.** If their privacy
  settings restrict who can add them to groups, WhatsApp refuses the direct add
  and hands back an invite link, which the response carries as `inviteUrl`.
  Send them that link — there is no way around it from the API.
- **Leaving does not delete the conversation.** Pass `?deleteChat=true` to
  `DELETE /groups/:id` to remove it as well.
- **A deleted group can still appear in `GET /groups`** for a while, with an
  empty name and no participants: WhatsApp Web keeps the entry in its local
  chat collection after the conversation is gone from the phone.
- **Creating groups is rate-limited.** A burst of creations starts failing with
  `CreateGroupError`; waiting a minute clears it.

> **Ban risk:** WhatsApp blocks numbers that send many simultaneous messages to
> people who never wrote first. Batches stay capped at
> `WWEB_BULK_MAX_RECIPIENTS`, but that lowers the risk — it does not remove it.

### Webhook payload

When `WEBHOOK_URL` is set, each incoming message is POSTed:

```json
{ "event": "message", "data": { "id": "...", "chatId": "573001234567@c.us", "from": "...", "body": "Hola", "fromMe": false, "timestamp": 1719500000, "hasMedia": false, "type": "chat" } }
```

Verify `x-webhook-signature` = `HMAC_SHA256(WEBHOOK_SECRET, rawBody)` (hex).

## Tests

```bash
npm test          # unit
npm run test:e2e  # e2e (WhatsApp client is mocked)
```

## Notes

- History is **in memory** — lost on restart (cap 500 msgs/chat).
- Deleting for everyone only works on your own messages inside the window
  WhatsApp allows (group admins may also revoke others'); otherwise → 409.
- `GET /whatsapp/status` reports the concurrency pool (`inFlight`, `queued`,
  `limit`) — useful when bulk sends feel slow.
- Rate limit: 30 requests / 60s per IP by default (avoids WhatsApp bans),
  configurable with `THROTTLE_LIMIT`/`THROTTLE_TTL`.
- Auto-reconnects 5s after an unexpected disconnect (LocalAuth keeps session).
- Use `npm run start`, not `start:dev`: watch-mode restarts relaunch Chrome and
  can trigger WhatsApp's "can't link new devices" rate limit.
```
