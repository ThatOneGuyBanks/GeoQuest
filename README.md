# GeoQuest — Discovery Edition

A GitHub Pages-ready static GPS adventure game with modular JSON route packs.

## Uploading to GitHub
Upload every file in this folder to the root of your existing repository, replacing matching files. Keep `packs/` as a folder. Commit to `main`; GitHub Pages will redeploy automatically.

## Adding a route
1. Copy `packs/PACK_TEMPLATE.json`.
2. Add your route and stop data.
3. Add the filename to `packs/index.json`.
4. Upload both files and commit.

## Pack discovery metadata
Cards and filters use: `route_distance_km`, `estimated_minutes`, `difficulty_label`, `tags`, `collections`, `featured`, `daily_eligible`, and `cover_theme`.

## Map
The map uses Leaflet and OpenStreetMap tiles. The overview shows town-level adventure pins only. The route line, numbered stops and landmark names are revealed in the completed-route recap, so the clues are not spoiled before play. GPS and compass permission require HTTPS, which GitHub Pages provides.

## Player record

Scores, achievements, daily completions, route progress, distance-unit preference and personal bests are stored locally in the browser. A discovered stop awards 100 points, with 25 points deducted for each revealed hint. Skipped stops award no points. Explorer totals are open-ended and do not require players to finish every installed pack. No account or server is required.

## Live guidance

On supported phones, the guidance arrow uses the device compass and points relative to the top of the phone. If compass data is unavailable, it falls back to a north-relative bearing. The in-game GPS scanner supports kilometres or miles, remembers the player's choice, and turns raw distance readings into visual comparisons.

Distance comparisons are loaded from `data/distance-comparisons.json`, so new objects, animals, landmarks and journeys can be added without changing the game code. The catalogue includes both near-match and scaled comparisons, with a light-speed fact as a bonus.

## Hidden test mode

Tap **I'm stuck** five times within roughly two seconds to unlock the location simulator. Its logarithmic slider covers 0 metres to 5,000 kilometres and includes useful presets. A simulated reading inside the current stop's discovery radius opens the normal arrival-confirmation flow and advances local progress like a real location check.


## Safety and GPS confirmation update

This edition includes a first-run safety disclaimer and accuracy-aware location checks. Poor GPS accuracy does not automatically reject a player. Instead, the app allows a capped amount of extra tolerance and asks the player to visually confirm that they can genuinely see the target landmark before submitting.
