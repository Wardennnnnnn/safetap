# SafeTap

SafeTap is a classroom attendance and evacuation accountability system for CICS IT and CS students. Administrators manage students, blocks, representatives and evacuation events. Class representatives record attendance and confirm arrivals using NFC, QR codes, student search or ID-photo matching.

Built with vanilla JavaScript, Node.js, Express, Socket.IO and MySQL.

## Features

- Role-based accounts with representative block assignments.
- Classroom attendance and event snapshots of expected students.
- Student registration, CSV import, NFC registration and QR cards.
- Offline student lookup and scan storage on the representative's phone.
- Batch uploads, retry handling and one headcount per student per event.
- Live arrival summaries, event history, CSV exports and printable reports.

## Requirements

Node.js 22 or later and npm. MySQL 8 or later is required for persistent server storage. Phone camera/NFC use requires HTTPS and compatible hardware/browser support.

## Run the demo

From the repository root:

```bash
npm ci
npm run vendor
npm run demo
```

Open `http://localhost:3000`.

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `SafeTapDemo123!` |
| IT representative | `repit` | `SafeTapDemo123!` |
| CS representative | `repcs` | `SafeTapDemo123!` |

These accounts contain fictional data and exist only in explicit demo mode. Demo records are saved in `.runtime/demo.json`.

## Configure MySQL

Create a database and a dedicated MySQL account with access to it. Then:

```bash
cp .env.example .env
```

Set the `DB_*` values and a unique administrator password of at least 12 characters in `.env`.

```bash
npm run db:init
npm start
```

`db:init` initializes the schema and creates the first administrator when no users exist. For an existing database, use `npm run db:migrate`. Keep `.env`, certificates, database exports and real student records out of the repository.

## Offline scanning

Sign in while connected and wait for the student list and offline assets to finish saving under **Offline records**. The app saves all active student IDs on the phone. Connect after an evacuation starts to download that event before scanning offline.

NFC and QR matching use the downloaded list without a request per scan. Each arrival is saved in IndexedDB first, then uploaded in batches of up to 100 after a five-second collection window. Reconnection and manual upload also trigger sync. Pending records survive an offline reload; the server validates uploaded credentials and prevents duplicate headcounts. Late uploads for closed events require administrator review.

Use the same account and website address. Browser storage can be cleared or evicted, so upload records promptly and avoid clearing site data while records are waiting.

NFC requires a browser exposing Web NFC and a readable card serial number that matches the student's registration. QR and ID-photo scanning require the assets prepared by `npm run vendor`. ID-photo matches always require human confirmation.

## Student CSV format

```csv
studentNumber,name,blockId,nfcUid
2026-00001,Student One,,04:A1:B2:C3:D4:E5
2026-00002,"Student, Two",,
```

Choose a default block during import. Blank `blockId` fields use that selection. All rows are validated before the import is saved.

## Development

```bash
npm run dev
npm test
npm run check
```

| Path | Purpose |
|---|---|
| `server.js` | Application startup and shutdown |
| `src/` | Authentication, domain rules, routes and persistence |
| `public/` | Browser app, scanner modules and service worker |
| `migrations/` | Database schema migrations |
| `scripts/` | Database, scanner asset and source export commands |
| `test/` | Domain, API, browser-module and integration tests |
| `deploy/` | Local service configuration |
| `docs/` | Architecture, testing and deployment guides |

See [Architecture](docs/architecture.md), [Testing](docs/testing.md) and [Deployment](docs/deployment.md).
