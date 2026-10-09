# SafeTap cloud migration

Target: one free Render Node web service + Aiven MySQL, retaining `https://safetap.terincorp.com`. This guide transfers accounts, blocks, rooms, and students only. IDs, password hashes, NFC IDs, QR tokens, and representative assignments are preserved. Attendance/events/reports/audit start empty on the cloud database. The original Fedora database is retained.

## Implemented and verified locally

- CA- and hostname-verified MySQL TLS (`DB_SSL=1`, `DB_SSL_CA_FILE`).
- MySQL-backed sessions storing hashed cookie tokens, CSRF tokens, and 12-hour expiry; logout/revocation/expiry remain enforced. Demo mode uses memory sessions.
- Database-aware `/health`, returning 503 without exposing provider errors if the database is unavailable.
- Directory export/import/verification with counts, checksum, referential validation, populated-target refusal, and transactional rollback. Export files are private and cannot overwrite existing files.
- Render blueprint, build-time QR/OCR assets, clean source export, and private full-database backup commands.

The implementation workspace cannot open MySQL sockets (`EPERM`) or access GitHub/Render/Aiven accounts. The attempted local schema migration did not connect. No real export, database import, cloud deployment, or DNS change has happened. Before manually restarting Fedora, run `npm run db:migrate` from your terminal. Existing installs can also add the session table on startup if their database user retains CREATE permission.

## 1. Create Aiven and private GitHub source

Create an Aiven **Free MySQL** service (not a paid trial), download its project CA certificate, and note its assigned region and connection details. Create two schemas from its MySQL console/client:

```sql
CREATE DATABASE safetap_preview CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
CREATE DATABASE safetap CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
```

Save the certificate privately, for example `.runtime/cloud/aiven-ca.pem`. Create a private `.runtime/cloud/preview.env` with these values, using the actual Aiven connection details:

```dotenv
DB_HOST=your-aiven-host
DB_PORT=your-aiven-port
DB_USER=your-aiven-user
DB_PASSWORD=your-aiven-password
DB_NAME=safetap_preview
DB_SSL=1
DB_SSL_CA_FILE=/absolute/path/to/aiven-ca.pem
```

Set `chmod 600` on cloud env files and certificate. Create `production.env` with the same connection details and `DB_NAME=safetap`. Preserve the existing project `.env`; it still refers to the original Fedora database. Never paste passwords/tokens into chat or commit them.

The implementation already prepared and staged `.runtime/render-source` as a local Git repository. Its first commit is pending your Git author name/email; no remote is configured. In this workspace, enter that directory, set your identity locally, commit, and skip the export/init commands below. For a fresh installation, prepare a clean source copy:

```bash
npm run deploy:prepare
cd .runtime/render-source
git init -b main
git add .
git commit -m "Prepare SafeTap for Render and Aiven"
```

If Git requests an author identity, configure your actual name/email before committing. Create a new **private** GitHub repo named `safetap` without starter files, then use its displayed remote URL:

```bash
git config user.name "YOUR NAME"
git config user.email "YOUR GITHUB EMAIL OR NOREPLY EMAIL"
git commit -m "Prepare SafeTap for Render and Aiven"
```

```bash
git remote add origin YOUR_PRIVATE_REPO_URL
git push -u origin main
```

The clean source copy excludes `.env`, runtime data, node_modules, provider certificates, and generated vendor files. Continue future deployment edits in this checkout, or deliberately copy updated source files into it; it is not automatically linked to the original directory.

## 2. Rehearse against a disposable database

From the original project directory:

```bash
node scripts/preview-directory.js --output .runtime/cloud/preview.json
node --env-file=.runtime/cloud/preview.env scripts/migrate-directory.js import --input .runtime/cloud/preview.json --dry-run
node --env-file=.runtime/cloud/preview.env scripts/migrate-directory.js import --input .runtime/cloud/preview.json
node --env-file=.runtime/cloud/preview.env scripts/migrate-directory.js verify --input .runtime/cloud/preview.json
MYSQL_TEST_ENV=.runtime/cloud/preview.env npm run test:mysql
```

The integration test creates and removes its own uniquely named `safetap_test_…` schema; it does not empty or replace `safetap_preview` or `safetap`. Its account needs CREATE/DROP DATABASE privileges. The preview contains fictional students and known demo passwords. Never use it as the production database.

## 3. Connect Render

Choose New → Blueprint, connect the private repo, and review the `safetap` service. The blueprint specifies **Free**, one Node process, manual deploys, build `npm ci && npm run vendor`, start `npm start`, and `/health`.

Before creating the service, change its region from the default Singapore to the nearest supported region if Aiven assigned a different region. Match the Aiven region when Render offers it; otherwise select the geographically nearest Render region.

Enter the Aiven connection values with **DB_NAME=safetap_preview**. Upload a secret file named **aiven-ca.pem**, whose runtime path is `/etc/secrets/aiven-ca.pem`. The blueprint supplies:

```dotenv
HOST=0.0.0.0
NODE_ENV=production
TRUST_PROXY=1
COOKIE_SECURE=1
DB_SSL=1
DB_SSL_CA_FILE=/etc/secrets/aiven-ca.pem
```

Do not set a fixed PORT; Render supplies it. Do not use `npm run demo`. Schema/import commands run from Fedora, not the Render build or a paid pre-deploy job. If the first deploy fails while secrets are being configured, finish configuration and manually redeploy.

At the temporary `onrender.com` HTTPS URL, check `/health` for `storage: mysql` and `/api/config` for both scanner assets available. Sign in with the fictional preview accounts, test role restrictions, QR, photo OCR, and phone NFC using an explicitly registered test card. Start a drill and verify one count per student, offline reload/upload, live updates between devices, reports, light/dark mode, and login survival after a manual restart. Login expiry remains 12 hours, not indefinite.

## 4. Final migration and same-domain cutover

1. Sync every participating phone's queue, finish the current Fedora event, and freeze use of the old service. No device should hold an old-event pending scan: old event records will not exist in the cloud.
2. Stop the old service during the final snapshot, then run these commands from the original project directory. Stopping SafeTap does not stop MySQL:

```bash
systemctl --user stop safetap.service
node --env-file=.env scripts/backup-db.js --output .runtime/cloud/fedora-before-cutover.sql
node --env-file=.env scripts/migrate-directory.js export --dry-run
node --env-file=.env scripts/migrate-directory.js export --output .runtime/cloud/final-directory.json
node --env-file=.runtime/cloud/production.env scripts/migrate-directory.js import --input .runtime/cloud/final-directory.json --dry-run
node --env-file=.runtime/cloud/production.env scripts/migrate-directory.js import --input .runtime/cloud/final-directory.json
node --env-file=.runtime/cloud/production.env scripts/migrate-directory.js verify --input .runtime/cloud/final-directory.json
```

3. In Render, set **DB_NAME=safetap**, save, and manually deploy. Keep auto deploy disabled. Sign in at the temporary URL using your existing credentials; verify accounts, assignments, student counts, NFC/QR identity preservation, and fresh operational history. Perform final drill tests there.
4. Add **safetap.terincorp.com** under Render Custom Domains. Record the current Cloudflare `safetap` CNAME target, proxy state, and tunnel route for rollback. Replace only that hostname's tunnel CNAME with the Render service hostname, **DNS only** initially. Do not change nameservers, the root website, MX, SPF, DKIM, or other email records. Verify the Render custom domain/certificate. Keep the existing named tunnel, but it is no longer the public site's route.
5. Visit the same HTTPS domain, sign in once, refresh the shell, and prepare a new offline download. The temporary Render URL has separate browser storage; its test scans do not transfer to the custom domain. Never clear storage containing pending scans.
6. With Fedora off and phone mobile data enabled, verify login, scans, uploads, and live updates. Existing physical IDs/QRs should work without reissuing them. Fedora is no longer the writer for new records.

If any snapshot/import/validation step fails, stop the cutover and leave DNS on Fedora. Import refuses an already populated production target; it never wipes it for a retry. Keep repeated exports in new files rather than overwriting the previous evidence.

## Rollback and backups

Before cloud writes exist, restore the saved tunnel DNS record and start Fedora against its original database. After cloud writes exist, restore **hosting only**: run this upgraded Fedora code against the same Aiven production database using a securely backed-up `.env` and the local CA path, then restore the tunnel DNS record. Run one public writer while DNS settles. Do not revert to the stale original local database and lose cloud records.

If Aiven itself is unavailable, stop writes, preserve device queues, and restore a verified recent cloud backup to a separate recovery schema before changing database settings. Do not overwrite the original local archive as a shortcut.

Download weekly and pre-presentation full cloud backups:

```bash
node --env-file=.runtime/cloud/production.env scripts/backup-db.js --output .runtime/cloud/cloud-backup-YYYY-MM-DD.sql
```

Restore a backup into a separate empty recovery schema with `mysql` (TLS `VERIFY_IDENTITY` and the provider CA for Aiven). Use a private MySQL option file for credentials, never password arguments. Validate restored student counts, logins, and a representative event report before calling the backup verified. Do not run restore against the live production schema.

Create a new empty `safetap_recovery` schema. In `.runtime/cloud/recovery.cnf`, put `[client]` followed by `host`, `port`, `user`, `password`, `ssl-mode=VERIFY_IDENTITY`, and `ssl-ca` settings, one per line. Protect this file with `chmod 600`. Create `recovery.env` from the cloud env with `DB_NAME=safetap_recovery`. Restore only a trusted dump created by the backup command:

```bash
mysql --defaults-extra-file=.runtime/cloud/recovery.cnf safetap_recovery < .runtime/cloud/cloud-backup-YYYY-MM-DD.sql
node --env-file=.runtime/cloud/recovery.env scripts/migrate-directory.js export --dry-run --allow-active-preview
HOST=127.0.0.1 PORT=3001 COOKIE_SECURE=0 TRUST_PROXY=0 node --env-file=.runtime/cloud/recovery.env server.js
```

The recovery app is localhost-only at port 3001. Compare backup counts and inspect a saved report/login there, then stop it. Do not scan new arrivals into this recovery database.

Free Render sleeps after 15 minutes without traffic and can need about a minute to wake. Aiven can pause inactive free services. Open and test the site before each rehearsal/December presentation, monitor usage/provider notices, and keep a fresh backup. This free setup is intended for the project demonstration rather than guaranteed emergency availability.

Official references: [Render free limits](https://render.com/docs/free), [Render Cloudflare DNS](https://render.com/docs/configure-cloudflare-dns), [Aiven free MySQL](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier), [Aiven TLS](https://aiven.io/docs/platform/concepts/tls-ssl-certificates).
