# Testing

Run from the repository root:

```bash
npm test
npm run check
```

The automated tests cover domain rules, role restrictions, CSRF/session checks, imports, event snapshots, duplicate submissions, late-arrival review, report export, local student matching, IndexedDB transactions, upload retries and service-worker shell coverage.

Browser-module tests run in a JavaScript VM with test doubles for browser APIs. API tests exercise Express in process. These tests complement real database and phone checks.

If the environment cannot launch test subprocesses:

```bash
node --test --experimental-test-isolation=none test/*.test.js
```

## MySQL integration

Create a private environment file with connection values for a disposable MySQL instance. The account must be able to create and drop the uniquely named test database.

```bash
MYSQL_TEST_ENV=/absolute/path/to/mysql-test.env npm run test:mysql
```

The integration test creates a `safetap_test_…` database, verifies migration, persisted sessions and concurrent arrival deduplication, then removes the test database. Without `MYSQL_TEST_ENV`, the test is skipped.

## Phone acceptance checks

1. Sign in online and download the student list, an active event and scanner assets.
2. Enable airplane mode and fully reload the app. Confirm that student search works.
3. Record several arrivals with NFC, QR and manual confirmation. Confirm that they remain pending after reload.
4. Reconnect and upload. Confirm server acknowledgement and one headcount per student/event.
5. Test repeated IDs, a lost upload response, expired login and a rejected credential. Pending records must remain available until acknowledged or explicitly discarded.
6. Close an event before uploading a phone's pending records. Confirm that late arrivals require administrator review.
7. Replace a QR token or deactivate a student after the offline list was downloaded. Confirm that the server rejects stale credentials on sync.
8. Change scanner methods and navigate away. Confirm that old reader callbacks stop recording arrivals.
9. Verify camera/NFC permission denial, unsupported-browser feedback and storage-write errors.
10. Test desktop and 360–390 px phone layouts, keyboard navigation, light/dark mode, reports and printing.

Test real NFC cards and camera QR scanning on the intended Android devices.
