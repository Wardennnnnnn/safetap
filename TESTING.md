# Acceptance checks

## Automated

Cloud tests cover verified TLS configuration, MySQL-session restart behavior through a SQL adapter contract, expiry/logout/revocation, database-aware health responses, directory validation, read-only dry runs, populated-target refusal, and rollback on insertion failure. These mocked adapter tests are not a substitute for real MySQL testing.

For provider integration, set `MYSQL_TEST_ENV` to a private Aiven env-file path and run `npm run test:mysql`. It creates/removes only a unique `safetap_test_…` schema and checks real imports, persisted sessions, and concurrent headcount deduplication. Without this setting the integration test is skipped. Follow `MIGRATION.md` for cloud browser/hardware acceptance checks.

Run `npm test` and `npm run check` from `main`. API tests exercise Express in process without opening a TCP port. Domain concurrency tests use the serialized test store; they do not substitute for MySQL transaction tests.

## MySQL / deployment integration

- Install dependencies, provision MySQL 8, set `.env`, run `npm run db:init` twice. Second execution must preserve existing data/admin password.
- Run the same workflow as the README using MySQL mode; restart Node and verify event history is retained. Reauthenticate and sync an existing device queue.
- With two authenticated representatives, submit concurrent scans for one student. Confirm one check-in row and one headcount.
- Submit one invalid row in a roster import: none of the valid rows in that import should persist.
- Open dashboard on another browser; confirm scan changes arrive within two seconds on the demo network. Disconnect/reconnect and verify snapshot reload.
- Check that unauthenticated Socket.IO connections fail and no student data is transmitted in invalidation events.
- Verify HTTPS, Secure/HttpOnly/SameSite cookies, denied cross-origin writes, and representative restrictions.

## Android Chrome and iPhone Safari

- Test at desktop width and 360 and 390 px mobile widths. All navigation, dialogs, forms, and horizontal tables remain usable; no page-wide overflow.
- Prepare offline while connected; check device storage, camera permission denial, and successful camera QR recognition of a generated QR.
- On the supported Android phone, open **Scan IDs → NFC**, start the reader, grant permission, and tap a registered ID. Confirm the name, server record, and single headcount. Repeat the tap; it must not add another arrival. Test permission denial, NFC switched off, unregistered IDs, and unreadable cards.
- Stop the reader, change methods, navigate away, and change events. Old reader callbacks must not submit arrivals. Unsupported browsers must keep the NFC option visible and offer a clear fallback message.
- Confirm QR, OCR, and manual workflows on supported phone browsers. Test phone More navigation as both administrator and representative.
- OCR: clear photo, glare, two students with the same name, no match, and unreadable ID. No case may log safe without selecting and confirming a student.
- Record several offline scans; refresh the app; confirm they remain pending. Reconnect while app is open and verify each record becomes confirmed/duplicate or enters review.
- Simulate the server committing a scan but the response being lost. Retrying the same submission must not create another check-in.
- Close an event before offline upload: late records remain in review, excluded from safe counts until approval.
- Replace a QR or deactivate a student after roster preparation. Old cached credentials must be rejected by server sync, with an actionable queue message.
- Sign out with queued records: blocked until sync or explicit discard. Another account must not inherit the offline roster or submit the previous account's queue.
- Print/export a report. Verify totals, saved names/blocks, and CAFAD exclusion.

## Accountability interpretation

- Baseline includes only present students in open sessions for today (Manila time).
- Stale/missing class attendance remains visible as unknown; a room with no baseline never displays “cleared.”
- Last recorded room is not actual current location.
- Additional accounted students do not reduce baseline unaccounted counts.
- Floor 5 is visibly CAFAD/outside scope with no implied clearance.

## Campus interface automated coverage

Appearance/photo revision: 28 tests pass. Test light/dark switching on the login page and main header, persistence after reload, and switching during an active NFC reader. Test both ID photo buttons on the actual phone: Choose file should allow an existing image and Take photo should request the rear camera where supported. Confirm that OCR still needs student confirmation and never records an arrival merely from choosing a file. Inspect dialogs, errors, pending records, floor maps, and printed reports in both appearances.

The frontend suite includes offline NFC lookup with normalized UID, persistent queue upload and deduplication, NFC cleanup/stale callback rejection, and mobile More role restrictions. Run `node --test --experimental-test-isolation=none test/*.test.js` if the environment blocks test subprocesses. Do not clear site storage to update the UI when scans are still waiting to upload.
