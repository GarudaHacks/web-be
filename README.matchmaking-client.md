# Matchmaking Client Integration Guide

This document is for frontend/client implementors integrating the matchmaking feature.

## Feature summary

- Participants opt in once.
- Opted-in participants can fetch a random swipe deck.
- A swipe can be `left` or `right`.
- A match is created only when both users swipe `right`.
- Users can list their matches and view details of a specific match.

## Non-negotiable product behavior

- Only confirmed RSVP users can opt in.
- Mentors and admins are excluded from matchmaking.
- Opt-in is irreversible in this version.
- No undo, unmatch, or re-swipe.
- No notification system yet.
- No in-app chat. Contact happens outside the app.

## Auth and request requirements

Matchmaking endpoints rely on the existing session-cookie auth + CSRF middleware.

Client requirements:

1. Send cookies with requests (for `__session`).
2. Send `x-xsrf-token` header for write requests (`POST`) using the token value from the `XSRF-TOKEN` cookie.
3. Use `Content-Type: application/json` for JSON bodies.

If these are missing, the backend may return `401` or `403`.

## Base route

All routes are under:

- `/match`

If your app prefixes API routes (for example `/api`), apply the same prefix as other existing endpoints in your app.

## Endpoint contracts

## 1) Get matchmaking config

- `GET /match/config`

Success:

```json
{
  "data": {
    "isMatchOpen": true,
    "startDate": "...",
    "endDate": "..."
  }
}
```

Notes:

- If config document does not exist, backend returns:

```json
{
  "status": 400,
  "error": "Config not found"
}
```

## 2) Get my matchmaking status

- `GET /match/status`

Success:

```json
{
  "data": {
    "optedIn": true,
    "eligible": true
  }
}
```

Use this to decide whether to show:

- Ineligible state
- Opt-in CTA
- Swipe experience

## 3) Opt in

- `POST /match/opt-in`
- Body: none

Success:

```json
{
  "message": "Opt-in successful"
}
```

Already opted in:

```json
{
  "message": "You are already opted in"
}
```

Ineligible:

```json
{
  "error": "You are not eligible to opt in"
}
```

Status code: `403`.

## 4) Get swipe deck

- `GET /match/deck?limit=10`
- `limit` is optional. Default = `10`. Backend caps high values.

Success:

```json
{
  "data": [
    {
      "id": "uid_123",
      "firstName": "Jane",
      "lastName": "Doe",
      "school": "Example High School"
    }
  ]
}
```

Important behaviors:

- Returns empty array when exhausted:

```json
{
  "data": []
}
```

- Requires opted in (`403` otherwise).
- Requires matchmaking open (`403` otherwise).

## 5) Swipe on a user

- `POST /match/swipe`
- Body:

```json
{
  "targetId": "uid_target",
  "direction": "left"
}
```

or

```json
{
  "targetId": "uid_target",
  "direction": "right"
}
```

Success (no match):

```json
{
  "matched": false,
  "match": null
}
```

Success (new match):

```json
{
  "matched": true,
  "match": {
    "id": "uidA_uidB"
  }
}
```

Validation and errors:

- `400` missing fields or invalid direction
- `400` self-swipe not allowed
- `400` already swiped that target
- `400` target unavailable
- `403` not opted in / matchmaking closed
- `429` rate-limited (more than 15 swipes in 60 seconds)

## 6) Get my matches

- `GET /match/matches`

Success:

```json
{
  "data": [
    {
      "id": "uidA_uidB",
      "createdAt": 1717000000,
      "user": {
        "id": "uid_other",
        "firstName": "Alex",
        "lastName": "Smith",
        "school": "Example University"
      }
    }
  ]
}
```

Notes:

- This is where the first swiper eventually discovers matches (no push notification yet).

## 7) Get one match detail

- `GET /match/matches/:id`

Success:

```json
{
  "data": {
    "id": "uidA_uidB",
    "createdAt": 1717000000,
    "user": {
      "id": "uid_other",
      "firstName": "Alex",
      "lastName": "Smith",
      "school": "Example University"
    }
  }
}
```

Errors:

- `404` if match not found
- `403` if current user is not part of that match

## Recommended client state machine

At page load:

1. Call `GET /match/status`.
2. If `eligible === false`, show ineligible view.
3. If `eligible === true` and `optedIn === false`, show opt-in CTA.
4. After opt-in success, call `GET /match/config` then `GET /match/deck`.
5. If config says closed, show closed state.

During swipe loop:

1. Render current card.
2. On swipe submit `POST /match/swipe`.
3. Optimistically remove card from local deck.
4. If response has `matched: true`, show matched modal/toast.
5. When deck has low remaining cards, prefetch next `GET /match/deck`.
6. If deck becomes empty, show exhausted state.

Matches screen:

1. Call `GET /match/matches`.
2. Render list sorted client-side if desired.
3. Optional detail screen: call `GET /match/matches/:id`.

## UX and error handling guidance

- Handle `429` with a user-friendly cooldown message.
- Handle `403` closed status with a dedicated message, not a generic error.
- Handle `400` already-swiped silently if it occurs during retries.
- Keep copy explicit that opt-in is permanent in this release.

## Deferred items (do not block implementation)

- Discord handle for hackers in match payload
- Incoming likes view
- Notification delivery when matched
- Block/report backend flows
- In-app chat

Build UI with extension points for these additions, but do not wait for them.
