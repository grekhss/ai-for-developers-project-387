# Calendar of Meetings

A shared calendar for booking meeting slots: an admin defines the types of
meetings on offer, and guests reserve a free time slot for one of them.

## Published service

The application is deployed on [Amvera Cloud](https://amvera.ru) and available at:

- **Guest view** (book a meeting): https://calendarofmeetings-grekhss.msk1.amvera.tech/
- **Admin view** (manage meeting types and observe all planned meetings): https://calendarofmeetings-grekhss.msk1.amvera.tech/admin

The service runs with the development auth bypass enabled (`AUTH_DISABLED=1`):
the role is derived from the URL (`/admin` - owner, anything else - guest), so
no password is required to open the demo. See "Access" below for the regular
signed-session flow.

## What it does

- **Booking scenario** - a guest picks a meeting type, a day in the calendar and
  a free slot, then confirms the booking.
- **Slot conflicts** - a taken slot cannot be booked twice, including across
  different meeting types, and the user sees a clear conflict message.
- **Server-side rules** - booking rules (past days, weekends, the booking
  window, slot grid, meeting-type integrity) are enforced on the server, not
  just in the UI.
- **Admin page** - the owner sees planned meetings of all types in a single list
  and can create or deactivate meeting types.
- **Contract-first API** - the OpenAPI specification is generated from TypeSpec,
  and the client SDK and server artifacts are generated from it.
- **Booking window** - 14 days, in 30-minute slots.

## Running locally

The app is packaged as a single Docker image; the server serves both the API and
the built static frontend from one process.

```bash
cd calendar-of-meetings
docker build -t calendar-of-meetings .
docker run --rm -p 4000:4000 calendar-of-meetings
```

Then open http://localhost:4000 (or http://localhost:4000/admin).

The image builds with `AUTH_DISABLED=1` by default, so the demo works without
passwords. For a real deployment, set `AUTH_DISABLED=0` and provide
`ADMIN_PASSWORD`, `GUEST_PASSWORD` and `SESSION_SECRET` (see
`calendar-of-meetings/.env.example`).

Without Docker (requires Node 20 / npm 10, run from `calendar-of-meetings/`):

```bash
npm ci
npm run build   # contract + typecheck + frontend + server
npm start       # node dist-server/index.js
```

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port the server listens on | `4000` |
| `MEETINGS_DB_PATH` | Path to the SQLite database file | `data/meetings.sqlite` |
| `NODE_ENV` | `production` marks the session cookie `Secure` | - |
| `AUTH_DISABLED` | `1` disables password checks (dev bypass) | `1` in the image |
| `ADMIN_PASSWORD` | Password for the admin role | - |
| `GUEST_PASSWORD` | Shared password for the guest role | - |
| `SESSION_SECRET` | Secret that signs session cookies | - |

## Layout

The application package lives in `calendar-of-meetings/`:

- `contract/` - TypeSpec source of truth for the API contract
- `server/` - Express + better-sqlite3 backend (serves the API and static build)
- `src/` - React + Mantine frontend
- `Dockerfile` - multi-stage build (per-package); the repository root also
  carries a `Dockerfile` adapted to the root build context for automated checks
