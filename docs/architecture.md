# How SafeTap is organized

SafeTap uses vanilla JavaScript, Express and MySQL. The browser modules run directly without a bundler.

## Server modules

| File | Responsibility |
|---|---|
| `server.js` | Open storage, start HTTP, handle shutdown |
| `src/application.js` | Connect middleware, Socket.IO and routes |
| `src/authentication.js` | Login, cookies, CSRF, session discovery and account validation |
| `src/routes/directory.js` | Administrator student, block and representative changes |
| `src/routes/attendance.js` | Classes, events, check-ins and batch sync |
| `src/routes/reports.js` | Reports, CSV exports and QR cards |
| `src/domain.js` | Attendance and evacuation rules, independent of Express |
| `src/offline-directory.js` | Minimal active-student download and content version |
| `src/store.js` | Demo-file and MySQL transactions, scoped reads and batched writes |
| `src/scan-data.js` | Load only the records referenced by a scan batch |
| `src/sessions.js` | Authentication session persistence |
| `src/schema.js` | Database schema |
| `src/release.js` | Public build identifier and deployment commit |

When adding a rule, start in the domain layer. Routes should validate transport-level details, call a domain function and return a response. The application-level mutation wrapper keeps transaction handling and invalidation notices consistent.

## Browser modules

| File | Responsibility |
|---|---|
| `public/app.js` | Shared application state, API calls, navigation/forms and startup |
| `public/js/views.js` | Page markup and rendering |
| `public/js/device-store.js` | IndexedDB reads and transactional updates |
| `public/js/student-directory.js` | NFC/QR/ID indexes and local student search |
| `public/js/offline-controller.js` | Durable capture, duplicate checks, roster download and batch upload |
| `public/js/scanners.js` | NFC reader and camera QR lifecycle |
| `public/js/assets.js` | Shared script loader with concurrent-load deduplication |
| `public/sw.js` | Offline app shell and static scanner assets |

These are ordinary deferred scripts loaded in order by `index.html`. Each exposes one `SafeTap…` object. Controllers receive state and callbacks through `create(...)`, so they can be exercised without a camera or an actual server. Shared application state is named `state`; it is not a server-confirmed result by itself. `views.js` builds markup without HTTP/storage calls. No credentials or CSRF token are saved in the cached login session.

If you add a browser script, also add it to `index.html`, the service worker shell and the frontend test setup. Change the asset version in the HTML, worker and `src/release.js` when releasing changed assets; immutable cached files must get a new version.

## What happens when a class rep scans

1. While online, SafeTap downloads every active student in the authorized CICS directory, including NFC IDs and QR tokens. It saves the directory in IndexedDB even if there is no evacuation yet. `/api/state` supplies a content version; unchanged directory data is omitted from later state refreshes.
2. When an event starts, its ID and details are saved on the phone. An offline phone cannot discover a new server event.
3. NFC/QR lookup uses in-memory maps built from the saved directory. Search also uses local students. No lookup request is sent per scan.
4. A recognized arrival is written to IndexedDB first. Only after the transaction commits does the interface say it was saved on the phone. Repeated pending IDs are suppressed locally.
5. A five-second collection window uploads queued records in batches of up to 100. Manual upload, reconnection, returning to the app and periodic retries also trigger sync. The scan reader does not wait for this network operation.
6. The server authenticates the operator, validates each credential and event, and returns confirmed/duplicate/review/rejected outcomes. Server transactions preserve one headcount per student/event. Closed-event arrivals need administrator review.
7. Only acknowledged records leave the device queue. Rejected records keep their error. If a response is lost, the original submission ID is retried, so a committed arrival is not counted again.

The queue uses read-modify-write operations inside one IndexedDB transaction. Upload acknowledgements remove only their own submission IDs, preserving scans added during the upload or from another tab. The existing `safetap-device` database and `queue`, `pack`, `session` keys are retained for upgrade compatibility.

## Limits to understand

Browser storage can be evicted or manually cleared. Persistent-storage requests help, but are not a backup. Keep the same account and website origin, wait for offline readiness, and upload promptly. Cross-device counts update only after the server receives the batch; a device capture is shown as pending until then. Offline caches may contain old IDs until the phone reconnects; the server revalidates them during sync.

Authentication uses an indexed user lookup. Read endpoints load only their required tables, and scan uploads load only the referenced users, students, blocks, events, submission IDs and matching arrivals. Scan processing keeps the existing transaction lock and credential checks. Changed rows are written in groups of up to 100 per table; a failed statement rolls back the whole transaction.

Administrative mutations still use a full snapshot, and dashboard history still grows with the number of events. These are future pagination/query optimization targets. The global write lock deliberately serializes mutations; keep it until an alternative provides the same cross-request correctness. The optional MySQL integration suite covers 2,840 students, concurrent batches, duplicate arrivals and SQL rollback. Phone NFC/cards, camera permissions and browser storage eviction still require actual device testing.
