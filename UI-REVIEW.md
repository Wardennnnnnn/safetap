# Campus interface revision — 2026-10-09

## OCR availability follow-up

Verified existing local OCR scripts, WASM, and English language data; regenerated assets with `npm run vendor`. The in-process API returns `ocrAvailable: true` and `qrAvailable: true`. Live localhost and the systemd user bus are blocked in the execution sandbox, so the currently running deployment response still needs verification from the Fedora terminal.

Refresh now obtains current server capabilities instead of retaining old flags from an offline session. If OCR availability changes, the ID photo controls rerender even during a background refresh, and the updated configuration is saved for offline use. Added regression coverage; all 29 tests pass. Assets/cache use `v=5-ocr-config` / `safetap-shell-v5-ocr-config`.

## Appearance and photo follow-up

Current assets use `v=4-appearance` and service-worker cache `safetap-shell-v4-appearance`. Added a saved light/dark preference, sun/moon controls on login and header, more consistent SVG icons on actions/sections, and separate Choose file / Take photo inputs for ID photos. A theme change does not rerender or stop the NFC reader. Both image inputs retain the on-device OCR and explicit student confirmation flow.

All 28 tests pass, including device theme fallback, reload persistence, blocked storage, keeping NFC running during appearance changes, and separate photo-input routing. Syntax checks pass. The dark desktop overview, dark phone photo page, light 360px photo page, and dark phone login were rendered for visual review. Camera launch and real card scanning still require the phone.

The immediately previous frontend is in `.runtime/ui-backups/public-before-theme/`; previews are in `.runtime/ui-enhancements/preview/`. To restore that revision, copy `.runtime/ui-backups/public-before-theme/.` over `public/` and reload online. Queued scans are preserved.

## Initial campus redesign

Changed the login, overview, attendance, scanner, students/blocks, representatives, reports, offline records, navigation, and dialogs. Public assets use `v=3-campus`; the service-worker shell uses `safetap-shell-v3-campus`. IndexedDB names and queue records remain compatible.

## Validation

All 24 API, domain, and frontend tests pass with `node --test --experimental-test-isolation=none test/*.test.js`. This avoids subprocess isolation restrictions in the execution sandbox. `npm run check` passes. New frontend cases cover offline NFC ID normalization, persist/upload/deduplication, reader cleanup, stale NFC callbacks, administrator/representative More navigation, and session recovery after offline reload. A different authenticated account cannot upload another operator’s saved queue.

Synthetic HTML previews are generated from the actual frontend with test fixtures in `.runtime/ui-redesign/preview/`. These contain fictional students. Browser screenshots verify layout only; they do not prove camera, NFC hardware, live MySQL, or network connectivity.

Headless Firefox screenshots were inspected for the 1440px desktop overview, 360px phone overview, and 390px phone scanner/login. A missing word space in the narrow login heading was corrected after review. The logo uses the existing local SVG. The wider schematic and tables scroll within their sections.

The 360px students and offline pages were also inspected. Screenshots are stored under `.runtime/ui-redesign/preview/` alongside the fixtures.

## Release and rollback

The original frontend is backed up in `.runtime/ui-backups/public-before-redesign/`. The staged revision is in `.runtime/ui-redesign/`. Static files are served directly, so this frontend-only change does not require restarting Node or signing users out.

Reload the HTTPS app while online to receive the new shell, then reload once more if an older service worker controls the page. Do not clear site storage while records are waiting to upload. Confirm the Scan IDs page, NFC start/stop, duplicate counting, offline reload/upload, and More menu on the real phone.

To restore the previous frontend, copy `.runtime/ui-backups/public-before-redesign/.` over `public/`. The rollback uses the previous shell version and will update on a subsequent online visit. This restore does not modify MySQL or queued scans.
