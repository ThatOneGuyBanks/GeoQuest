# Day Tripping Quiz

A GitHub Pages-ready static GPS adventure game with modular JSON route packs.

**[Play Day Tripping Quiz](https://thatoneguybanks.github.io/GeoQuest/)**

The current release candidate is local-first: no account, analytics or application server is required. See [Privacy and offline use](PRIVACY.md), [Support](SUPPORT.md), [Security](SECURITY.md) and the [changelog](CHANGELOG.md).

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

## Offline behaviour

The app shell is cached after a successful online visit. A player can save an individual adventure from its detail page so its clues, scoring and progress continue to work without a connection.

Live map tiles, external directions, venue websites and other external links still require internet access. Recently viewed map tiles use a small bounded cache, but complete offline maps are not promised. Saved adventures use a cache-first strategy and refresh quietly when a connection returns; other app data falls back to cache after a short network timeout so patchy signal does not leave the app hanging indefinitely.

## Release checks

The automated checks deliberately avoid judging or changing route-pack content. They cover the application shell, keyboard access, modal behaviour, responsive layout, history/refresh recovery and saved-adventure offline replay.

```bash
npm ci
npx playwright install chromium
npm test
```

GitHub Actions runs the same checks for pull requests and pushes to `main`.

## Player record and scoring

Scores, achievement awards, daily completions, route progress, distance-unit preference, passport stamps and personal bests are stored locally in the browser. No account or server is required.

A discovered stop awards 1,000 points. Solving without hints adds 250 points; the first hint deducts 100 points and both hints deduct 250 points in total. After each real-world discovery, an optional **Fieldwork** activity adds another 250 points. The player must either capture a discovery photo or write an observation of at least 12 characters. Skipped stops award no points.

Discovery photos and field-note text are never uploaded or written to browser storage. Photo object URLs, decoded images and note text exist only in memory for the current adventure. In the postcard editor, up to six photos and six notes appear in a collapsible Extras list. Each extra starts unchecked, can be added or removed independently, and can be dragged anywhere on the fixed 1080 × 1350 postcard. Dragging uses a lightweight live preview; the full-quality share or download is regenerated once the player releases the item, preserving its exact final position. Leaving the adventure or refreshing the page discards these temporary memories. Only the completed bonus type and point totals are saved.

Completing a route awards 1,000 points, plus 500 for skipping no stops, 750 for a hint-free route and 500 for a route's first completion. Adventures chosen through **Surprise Me** receive a 20% completion bonus. The daily adventure is a **Daily Double** and receives a 100% completion bonus once per calendar day.

Achievements award one-time Explorer Points in 500, 1,500, 3,000 and 5,000-point tiers. The Explorer total combines route personal bests with unlocked achievement awards, while the completion postcard shows the score from that particular outing. Existing saved scores are upgraded automatically to the larger scoring scale.

## Live guidance

On supported phones, the guidance arrow uses the device compass and points relative to the top of the phone. If compass data is unavailable, it falls back to a north-relative bearing. The in-game GPS scanner supports kilometres or miles, remembers the player's choice, and turns raw distance readings into visual comparisons.

Distance comparisons are loaded from `data/distance-comparisons.json`, so new objects, animals, landmarks and journeys can be added without changing the game code. The catalogue includes both near-match and scaled comparisons, with a light-speed fact as a bonus.

## Final venue opening check

Before a route starts, its detail page shows a compact, spoiler-safe finish-availability check. The initial message never names the final pub or restaurant; exact venue details and weekly hours stay blurred behind a deliberate two-step reveal. It does not display or promise an arrival time. After the player checks their location, the app only compares the advertised walking duration with the venue schedule when they are within 500 metres of the route start (or the next stop on a continued route). If they are farther away, it shows the straight-line distance and refuses to guess the unknown travel time.

Opening times live inside each route pack's `final_venue` object, so the feature remains fully static and works on GitHub Pages with no server or account. See `packs/README.md` and `packs/PACK_TEMPLATE.json` when adding or updating routes.

## Hidden test mode

Tap **I'm stuck** five times within roughly two seconds to unlock the location simulator. Its logarithmic slider covers 0 metres to 5,000 kilometres and includes useful presets. A simulated reading inside the current stop's discovery radius opens the normal arrival-confirmation flow and advances local progress like a real location check.


## Safety and GPS confirmation update

This edition includes a first-run safety disclaimer and accuracy-aware location checks. Poor GPS accuracy does not automatically reject a player. Instead, the app allows a capped amount of extra tolerance and asks the player to visually confirm that they can genuinely see the target landmark before submitting.
