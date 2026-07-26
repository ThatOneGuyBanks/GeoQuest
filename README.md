# GeoQuest — modular route-pack edition

A static, mobile-friendly location quiz. Every route is stored as a separate JSON pack under `packs/`.

## Included packs

- Peterborough — Main Route
- Ely — Main Route
- Huntingdon — Main Route
- St Ives — Main Route
- St Neots — Main Route

## Publish or update with GitHub Pages

### Replacing the existing project

1. Extract this ZIP.
2. In your GitHub repository, upload the contents of this folder to the repository root.
3. Replace the old `app.js`, `service-worker.js`, and other matching files.
4. Delete the old root-level `data.json`; it is no longer used.
5. Upload the complete `packs` folder, including `packs/index.json`.
6. Commit the changes.
7. GitHub Pages will rebuild automatically. Open the HTTPS Pages address after the deployment completes.

If the old version appears, refresh the page, close and reopen it, or clear the site's cached data. The service-worker cache name has changed for this edition.

## Add another route later

1. Copy `packs/PACK_TEMPLATE.json`.
2. Rename and edit it.
3. Add the filename to `packs/index.json`.
4. Upload/commit those two changed files.

The website loads every enabled entry listed in the index. A broken pack is skipped while valid packs continue to load; errors are shown in the browser console.

## Why an index is required

GitHub Pages is a static web host. Browser JavaScript cannot ask it to list all files inside `packs/`, so `packs/index.json` acts as the folder catalogue. This is the only extra file you update when adding or removing a route.

## GPS and HTTPS

Use the HTTPS GitHub Pages address on your phone. Browser geolocation is blocked on ordinary insecure HTTP pages, except local development addresses such as `localhost`.

## Local testing

Windows: double-click `START_GAME_WINDOWS.bat`.

macOS/Linux: run `START_GAME_MAC_LINUX.command`.
