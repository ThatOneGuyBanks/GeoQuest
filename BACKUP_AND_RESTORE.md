# Backup and restore

This repository is the canonical backup for Day Tripping Quiz. A fresh clone contains the full application, all currently authored routes, all required icons, the test suite and the locked development dependency versions.

## Restore on a rebuilt Windows PC

Install these tools first:

- Git
- Node.js 22 LTS (the same major version used by GitHub Actions)

Then open PowerShell and run:

```powershell
git clone https://github.com/ThatOneGuyBanks/GeoQuest.git D:\day-tripping-quiz
Set-Location D:\day-tripping-quiz
npm ci
npx playwright install chromium
npm run validate
```

`npm ci` recreates `node_modules` from `package-lock.json`; do not back up or commit `node_modules`. The application itself is static and does not require a build step, database, server, API key or `.env` file. The `START_GAME_WINDOWS.bat` launcher uses Python's simple HTTP server if you want to run the site locally, while the automated tests use the included Node test server.

## What is included in GitHub

- Application files: `index.html`, `privacy.html`, `app.js`, `styles.css`, the web manifest and service worker.
- All route definitions in `packs/` and the distance catalogue in `data/`.
- All required PNG app icons and logos in `assets/`.
- The Playwright tests, test server, locked npm dependency versions and GitHub Actions workflow.
- Project, privacy, security, support and route-authoring documentation.

The `npm run check:backup` command verifies that required files exist, all JSON parses, every route in `packs/index.json` exists, no authored route is omitted from the index, route and stop IDs are unique, manifest icons exist, and local HTML/service-worker references resolve to files in the clone.

## External services and dependencies

These are intentionally not stored in the repository:

- Leaflet 1.9.4 CSS and JavaScript are loaded from `unpkg.com`. Their Subresource Integrity hashes are pinned in `index.html`; the service worker caches them after a successful visit.
- Map tiles are loaded from `tile.openstreetmap.org`. Recently used tiles may be cached by the browser, but the repository does not contain a map-tile archive.
- Google Maps, Apple Maps and venue-hours links open external websites and require internet access.
- GitHub Pages deployment settings and the public site URL live in the GitHub repository settings. After a repository transfer or recreation, enable Pages from the `main` branch/root and update the canonical URLs if the account or repository name changes.

There are no third-party route photographs or audio files at present: every route's `Image` and `Audio` fields are `null`. All locally referenced images are committed under `assets/`.

## Data that needs a separate backup

Player progress is not part of the source repository. Scores, achievements, settings, passport stamps and saved-adventure state live in each browser's site storage. Discovery photos and field notes exist only in memory for the current adventure and are discarded when the page is refreshed or left. Back up any downloaded completion postcards or other personal photos separately before rebuilding the PC.

GitHub account access is also outside this repository. Before rebuilding, confirm that you can sign in to GitHub and that any two-factor recovery codes or passkeys are backed up securely. Never commit passwords, tokens, private keys or recovery codes.

## Ongoing backup routine

Before wiping a machine, run the following from the working clone:

```powershell
git status
npm run validate
git push origin main
git status -sb
```

The final status should show a clean tree and `main` aligned with `origin/main`. Files ignored by Git—currently `node_modules/`, Playwright reports/results and operating-system metadata—are reproducible or disposable and do not need backup.
