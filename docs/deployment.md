# Deployment

Deploy this repository's root directory. The parent workspace, archived versions and internal notes are separate local folders.

## Render configuration

`render.yaml` defines a Node web service with:

- Build: `npm ci && npm run vendor`
- Start: `npm start`
- Health endpoint: `/health`

Configure database credentials and upload the database provider's CA certificate through the hosting platform's secret settings. The included configuration uses:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
TRUST_PROXY=1
COOKIE_SECURE=1
DB_SSL=1
DB_SSL_CA_FILE=/etc/secrets/aiven-ca.pem
```

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` for the deployed database. Initialize a new database with `npm run db:init`; apply schema upgrades to an existing database with `npm run db:migrate`. Run these commands with the intended database environment and back up existing data before migration.

The platform supplies `PORT`. Run the normal MySQL mode for persistent deployment; `npm run demo` uses fictional accounts and local file storage.

## Second deployment

`deploy/render-preview.yaml` configures the `safetap-preview` service from the `ui/safetap-foundation` branch. Its normal MySQL startup uses the same database and accounts as the original service. Despite the URL's preview name, changes to students, attendance and events affect the shared live records.

The Blueprint references `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` from the original `safetap` service. Set `DB_CA_CERT` in the second service's environment settings to the database CA certificate's PEM content. Startup writes this certificate outside the public directory before the existing TLS validation runs. Credentials and the certificate are not stored in Git.

The Blueprint only manages `safetap-preview`; it does not manage the original `safetap` service or run database initialization or migrations. Automatic deploys and Blueprint auto-sync remain off. After rotating credentials on the original service, sync this Blueprint and redeploy the second service so it receives the updated values.

Browser sessions and offline queues belong to each URL separately. Upload pending records on their original URL before switching. Real-time socket notifications stay within each service; the existing polling refresh picks up changes made through the other service.

## HTTPS and local hosting

For local hosting, `deploy/safetap.service` is a sample systemd user service. Adjust its working directory and Node path to match the installation. Put the app behind an HTTPS reverse proxy and enable `TRUST_PROXY=1` and `COOKIE_SECURE=1` only for that trusted setup. The proxy must forward the original host/protocol and support Socket.IO WebSocket upgrades.

Keep one Node process unless shared Socket.IO and rate-limit coordination are configured.

## Verify a release

Check `/health`, `/api/config` and `/api/version`. The version endpoint reports the release, frontend build and deployed commit when available. Render supplies `RENDER_GIT_COMMIT`; other hosts can set `SAFETAP_COMMIT` during deployment.

Verify login, role restrictions, student counts, scanner assets, offline reload/upload and report export. Run the [phone acceptance checks](testing.md) on the intended devices.

Build-versioned JavaScript/CSS use long cache lifetimes in production. Change the version in `public/index.html`, `public/sw.js` and `src/release.js` together when publishing changed assets. HTML, the service worker and API responses must remain fresh. Reload online and wait for offline readiness after an update. Preserve phone storage while scans are pending.

## Optional source export

The repository itself is ready for Git. To create a separate source-only copy:

```bash
npm run deploy:prepare
```

The copy is written to `.runtime/source-export` and excludes Git metadata, runtime data, local notes, secrets, generated vendor files and dependencies. Existing output is never overwritten. Use `npm run deploy:prepare -- --output /path/to/new-folder` for a different destination.
