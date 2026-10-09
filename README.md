# SafeTap

Fresh final-project implementation for CICS IT/CS classroom attendance and emergency evacuation accountability. Built with HTML, CSS, vanilla JavaScript, Node/Express, Socket.IO, and a MySQL storage adapter.

## Run the local demo

```bash
cd main
npm install
npm run vendor
npm run demo
```

Open **http://localhost:3000**. Demo mode is explicitly labeled, uses fictional students, and persists to `.runtime/demo.json`. It does not pretend to use MySQL. This workspace currently includes the existing project's Express/Socket.IO modules so the manual-attendance demo can run without downloading those again. Run `npm install` to complete the dependency set.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `SafeTapDemo123!` |
| IT representative | `repit` | `SafeTapDemo123!` |
| CS representative | `repcs` | `SafeTapDemo123!` |

These credentials exist **only in explicit demo mode**. MySQL starts with the administrator credentials you configure and no fictional students.

## MySQL setup

Requirements: Node 22+, MySQL 8+, npm, and HTTPS for use from phones. Create an empty database and dedicated account using your local MySQL administrator. Example (choose a real password):

```sql
CREATE DATABASE safetap CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
CREATE USER 'safetap'@'localhost' IDENTIFIED BY 'replace-with-your-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, REFERENCES ON safetap.* TO 'safetap'@'localhost';
```

```bash
cp .env.example .env
# Set DB_* and a unique ADMIN_PASSWORD of at least 12 characters in .env.
npm install
npm run vendor
npm run db:init
npm start
```

`db:init` creates the schema idempotently and seeds rooms plus the initial administrator only when there are no users. It does not overwrite an existing password. The complete initial SQL is also available in `migrations/001_initial.sql`. Use the init command for the password-hashed admin seed.

By default the app listens on `127.0.0.1:3000`. Put it behind an HTTPS reverse proxy for phone access. Configure `TRUST_PROXY=1` and `COOKIE_SECURE=1` only when using that trusted proxy; retain localhost binding. The proxy must forward `Host`, `X-Forwarded-Proto`, and Socket.IO WebSocket upgrades. Do not send real credentials over plain HTTP on a campus network. Localhost HTTP is for local development.

## Suggested demonstration

### Run MySQL mode in the background on Fedora

After configuring `.env` and successfully running `npm run db:init`, stop any
foreground SafeTap process on port 3000 with Ctrl+C. Install the user service:

```bash
mkdir -p "$HOME/.config/systemd/user"
install -m 644 deploy/safetap.service "$HOME/.config/systemd/user/safetap.service"
sudo systemctl enable --now mysqld tailscaled
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now safetap.service
```

The service runs Node directly in MySQL mode, loads the project `.env`, restarts
after failures, and starts at boot without an interactive login. Restart retries
also allow MySQL time to become available during boot. The supplied service uses
`/usr/bin/node` and `~/Documents/Safetap/main`; adjust these if the installation
moves. Keep `HOST=127.0.0.1`, `TRUST_PROXY=1`, and `COOKIE_SECURE=1` for Tailscale
Serve HTTPS access. Existing Tailscale Serve background configuration is retained.

```bash
systemctl --user status safetap.service --no-pager
journalctl --user -u safetap.service -n 50 --no-pager
curl http://127.0.0.1:3000/health
```

After changes to the code or `.env`, run `systemctl --user restart safetap.service`.
The PC must remain powered on and awake for phone access.

1. Sign in as admin and review fictional IT/CS blocks, students, and rooms.
2. Open **Class attendance**, open a session in LAB 3, and mark several students present. Open another block's session in a different room. Representatives can do this only for their assigned blocks.
3. Start an earthquake drill from **Overview**, specifying the actual demonstration assembly point. Review which blocks lack current attendance.
4. Open the app in another browser/profile as a representative. Go to **Scan IDs**, search for a student, and confirm arrival.
5. Watch confirmed counts update in the admin overview. Scan the same student twice; it must count once. A student outside the expected roster increments “Other arrivals.”
6. Open **Offline records** and prepare the active event. Disconnect the device, record arrivals, and refresh the app. Pending records should remain on this device.
7. Reconnect with the app open. Sync pending records. If the admin already closed the event, approve late uploads in **History & reports**.
8. Print the report or export CSV. Edit a current student name: the old event retains its saved name and block.

## What is implemented

- Admin/representative login, scrypt password hashes, 12-hour HTTP-only session cookies, login throttling, CSRF/origin validation, protected APIs and authenticated Socket.IO.
- Program + block code + academic term identity; representative block assignments and account disabling.
- Student registration/editing, normalized unique campus-card UID fields for administrative registration/import, active/inactive state, atomic CSV import, opaque QR issuance and rotation.
- Rep-managed class sessions, current rooms, manual attendance/departures, and class closure. Only open sessions dated today in Asia/Manila form the baseline. Changes are locked during evacuation.
- Event snapshot, cross-block emergency scanning, unique student headcounts, additional students, audited baseline corrections, check-in voiding, and review of late uploads.
- Responsive overview with live floor/room counts, per-block progress, student filters, recent check-ins, and last-refresh/stale indicators.
- Floors 1–4 use room labels from the supplied reference. The interactive view is a **schematic, not to scale**. The source image is available in the reference dialog. Floor 5 remains visible as **CAFAD — outside monitoring scope**.
- Camera QR reader, on-device OCR candidate matching with human confirmation, and manual search. NFC is the default scanner method; supported Android browsers can submit the serial number exposed by Web NFC. Camera QR, ID-photo matching, and search remain available as alternatives.
- Service-worker app shell, IndexedDB roster and durable scan queue, persist-before-send submissions, reconnect retries, rejected-record handling, and explicit pending/confirmed states.
- History with saved identities/baselines, admin audit trail, CSV export protected against spreadsheet formula injection, and printable PDF reports.

## Scanner prerequisites

Run `npm run vendor` after `npm install`. It copies QR/OCR browser scripts, Tesseract WebAssembly files, and English trained data into `public/vendor/` and writes an offline asset manifest. They are hosted by this app, not a public CDN. English trained data can take time to download/cache. The readiness page distinguishes available assets from a prepared event roster.

- **NFC:** Open **Scan IDs → NFC**, enable phone NFC, and tap **Start NFC scan**. Use HTTPS and a browser exposing `NDEFReader`. The app uses the reader event’s serial number; the student must have the matching registered NFC ID. Availability depends on the phone, browser, and card. An unreadable or empty serial number produces an error rather than recording an arrival. This does not implement arbitrary card memory/block access. Tap **Stop reader** when finished; changing methods or leaving the scanner also stops it.
- **Unsupported devices:** NFC stays visible and explains why it cannot start. Use QR, ID photo, or search.
- **OCR:** Photos are processed on the device, not stored by the server. Student-number matches take priority; name matches are candidates only. The representative always confirms. A clear image is necessary; OCR accuracy is not guaranteed.
- **Offline:** While signed in and connected, the active event and student IDs save automatically on every state refresh. Scanner assets download in the background; the scanner and Offline records page show readiness or a retryable setup error. Scans persist before upload, survive offline reload, and upload automatically on reconnect, returning to the app, or periodic retries. Keep the same operator account and website address. New events and classroom edits require a connection; an offline device cannot discover a new event. An expired login requires signing in again, and rejected records remain available for review. Server validation remains authoritative.
- Browser storage can be evicted by the OS/browser. Keep the app available and sync promptly; device-only records are not a server backup. Logout blocks until unsynced records have been synced or explicitly discarded.

## CSV format

Select a default block in the import dialog. `blockId` can be blank to use that selection; supplied IDs must match actual block IDs. All rows are validated transactionally; one invalid row rejects the whole import. Imports add records; existing students are edited through their detail form.

```csv
studentNumber,name,blockId,nfcUid
2026-00001,Student One,,04:A1:B2:C3:D4:E5
2026-00002,"Student, Two",,
```

## Data and server design

`src/domain.js` holds the rules independently from HTTP/storage. `src/schema.js` defines normalized MySQL tables and uniqueness/foreign-key constraints. `src/store.js` loads a consistent relational snapshot and commits changed rows inside a transaction. A single database coordination row serializes mutations, including scans from different operators, so checking a duplicate and updating headcounts are atomic. This favors clarity and correctness for a single-building final-project deployment; loading the full state per request is not intended for a large multi-campus installation. Move to targeted queries before that scale.

Tables: users, blocks, rooms, students, classes, attendance, events, participants, checkins, submissions, audit, and the transaction coordination row. Representative block assignments and event coverage metadata use JSON columns; students, attendance, snapshots, and check-ins remain separate rows with unique keys.

Authentication sessions in MySQL mode are stored in `app_sessions` with hashed cookie tokens and a 12-hour expiry, so a restart preserves unexpired logins. Demo sessions remain in memory. Device queues survive and can sync after the same operator signs back in. Run one Node process; clustered deployments still require a Socket.IO adapter and shared login-rate limiting.

Public API groups are `/api/login`, `/api/me`, `/api/state`, `/api/students`, `/api/blocks`, `/api/reps`, `/api/classes`, `/api/events`, `/api/checkins`, `/api/offline`, and `/api/sync`. Mutating requests require the session's `X-CSRF-Token`. A scan carries `submissionId`, `eventId`, `method`, `capturedAt`, and a credential or confirmed student ID. The server determines operator and receive time. Socket.IO sends invalidation notices; clients fetch a fresh authorized snapshot rather than trusting client-computed totals.

## Validation and current environment limitations

```bash
npm test
npm run check
```

Tests cover real domain operations and the real Express middleware stack via in-process HTTP request/response objects. They do not require a listening port. They test authorization, CSRF, revocation, program/block separation, room restrictions, historical snapshots, duplicates/concurrency, additional arrivals, late uploads, audited corrections, and rollback.

During implementation, this sandbox blocked npm registry DNS/network access, TCP listening, and browser launch. No MySQL server is installed. Consequently:

- MySQL adapter/schema are implemented but require an integration run against your MySQL instance.
- QR generation and camera QR/OCR vendor assets have not been device-tested here. Browser NFC now uses `NDEFReader` serial numbers where supported. Actual phone/card compatibility still requires device testing.
- A real desktop/mobile browser visual check and Socket.IO transport test must be completed on your machine.
- This is a final-project implementation and still needs the above hardware/network checks before any real emergency use.

See `TESTING.md` for the acceptance checklist and manual device tests.

## Campus interface revision

Cloud migration tools and the Render blueprint are ready. See [MIGRATION.md](MIGRATION.md) for private-repository setup, Aiven TLS, preview tests, accounts/students-only migration, the same-domain cutover, backups, and rollback. `npm run db:migrate` applies schema changes without creating a replacement administrator. No live migration or DNS switch has been performed from this sandbox.

OCR availability follow-up: the frontend refreshes current server capabilities after reconnecting, including previously disabled ID photo controls. Current assets use `v=5-ocr-config`; 29 tests pass. If the running server still reports OCR unavailable, check `curl -s http://127.0.0.1:3000/api/config` in the Fedora terminal. The local OCR assets are prepared by `npm run vendor`.

The latest frontend adds a saved light/dark preference, clean SVG action icons, and separate **Choose file** / **Take photo** buttons under **Scan IDs → ID photo**. Switch appearance from the header or sign-in page; switching does not stop an active NFC reader. The current automated suite has 28 passing tests. Reload online to update the `v=4-appearance` app shell.

See [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), and [UI-REVIEW.md](UI-REVIEW.md) for the interface direction, checks, and rollback. The frontend uses local Open Sans, phone bottom navigation, plain labels, NFC start/stop controls, and an updated offline shell. All 24 automated tests pass; synthetic desktop and phone layouts were rendered in headless Firefox. Existing API and MySQL rules are retained.
