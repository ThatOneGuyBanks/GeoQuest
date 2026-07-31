# Route packs

Each playable route is one JSON file in this folder.

## Add a route

1. Copy `PACK_TEMPLATE.json` and rename it with lowercase letters and hyphens, for example `kettering-ghost-walk.json`.
2. Give it a permanent, unique `pack_id`.
3. Replace all example content with accurate route details and stops.
4. Add its filename to `index.json`:

```json
{
  "file": "kettering-ghost-walk.json",
  "enabled": true
}
```

5. Test the complete route and commit both files to GitHub.

A static website cannot automatically enumerate files in a folder, so `index.json` is the route catalogue. Set `enabled` to `false` to hide a pack without deleting it.

## Required pack fields

- `pack_format`
- `pack_id` — permanent, unique ID used for saved progress; never change it after publishing
- `version`
- `town`
- `display_name`
- `route_name`
- `description`
- `short_description`
- `centre.lat` and `centre.long`
- `route_distance_km`
- `estimated_minutes`
- `difficulty_label`
- `tags`
- `collections`
- `before_you_go`
- `final_venue`
- `stops`

`difficulty_label` must be one of `Relaxed`, `Explorer`, `Detective` or `Challenging` so the homepage filter can find it correctly.

## Collections

Give every route one or more of these exact collection names:

- `Historic Places`
- `Rivers & Harbours`
- `Legends & Literature`
- `Makers & Industry`
- `University Cities`

Do not invent a new collection for an individual route. Use `tags` for more specific themes such as castles, canals, architecture, ghosts or family activities.

## Cover themes

Use one of the supported `cover_theme` values:

- `cathedral` — purple
- `fenland` — cyan
- `river` — teal
- `bridge` — orange
- `meadow` — lime

## Stops

Every stop requires:

- A unique `Stop_ID`
- `Stop_Order`, beginning at 1
- `Stop_Name`
- Full-precision `Target_Lat` and `Target_Long` coordinates
- A sensible `Win_Radius_m`, normally between 35 and 60 metres
- `Cryptic_Clue`
- `Hint_1` and `Hint_2`
- A specific, accurately checked `Unlock_Fact`
- Numeric `Difficulty`

Stops may also include an optional `Explorer_Prompt`. This powers the 250-point **Fieldwork** activity after a discovery. Write a short prompt that makes the player look away from the screen and notice a safe, publicly visible detail: a date, carving, symbol, material, old sign or relationship to the surrounding street. The player can respond by taking a discovery photo or writing a short field note. Never require entry, a purchase, touching property, climbing or crossing an unsafe road. If this field is omitted, the game uses a general observation prompt.

Keep the `Town` and `Route` values consistent with the pack metadata. Coordinates must point to safe, publicly accessible locations and clues must not require trespassing, crossing unsafe areas or entering a building.

The final stop must be a real pub, restaurant or café where players can end their day. Its unlock text should begin with “Route complete!”, contain an interesting checked fact and avoid promising that the venue will be open.

## Final venue opening hours

Every route needs a `final_venue` object so the game can show its current status and, when the player is near the route start, compare the route's walking duration with its opening schedule:

- `name` must exactly match the final stop's `Stop_Name`.
- `timezone` must be an IANA time-zone name, such as `Europe/London`.
- `minimum_visit_minutes` is the useful time players should have left for a drink; use `30` unless the venue needs longer.
- `hours_verified` is the date the hours were last checked, in `YYYY-MM-DD` format.
- `hours_url` must link directly to the venue's current hours or the most reliable current listing available.
- `hours` must contain all seven lowercase day keys from `mon` to `sun`.

Each day contains one or more `[opening, closing]` periods in 24-hour `HH:MM` format. Use an empty array when the venue is closed. Split sessions are supported, for example `[["12:00", "15:00"], ["17:00", "23:00"]]`. Use `24:00` for midnight, or an earlier closing time to describe an overnight session, for example `[["12:00", "01:00"]]`.

Record the venue or bar opening hours rather than only the kitchen serving hours: the route promise is that players can sit down and get a drink. Holiday hours and private events can still change, so use the source link in the app and recheck every pack periodically.

## Before you go

Every `before_you_go` object must include honest notes for terrain, hills, steps, `accessibility_score`, accessibility, toilets, footwear, dogs and pushchairs. These are shown before the player starts, so they must not name any checkpoint, pub, restaurant or finishing venue. Street names and alternative-route streets are acceptable when they help someone plan a safer route. Check these notes on the ground and avoid absolute accessibility promises because temporary works and closures can change conditions.

Use the accessibility score conservatively:

- `3` — the intended route is step-free, generally level and uses suitable surfaced public pavements or paths.
- `2` — a step-free route or alternative exists, but gradients, uneven surfaces, narrow sections or busy crossings require caution.
- `1` — the route has a significant barrier such as a steep gradient, difficult historic surface or impractical step-free alternative and is not generally accessible.

The score describes the outdoor clue route, not guaranteed access inside the finishing venue. Temporary works, weather and local conditions can still change accessibility.

## Quality checklist

Before publishing a pack:

1. Confirm every coordinate on a map and, where possible, at the physical location.
2. Check that stops follow a sensible walking order.
3. Check the route distance and estimated time.
4. Verify historical claims against reliable sources.
5. Confirm all `pack_id` and `Stop_ID` values are unique.
6. Make sure the final venue is still operating, verify its weekly hours and update `hours_verified` and `hours_url`.
7. Test the complete route using the hidden location simulator before enabling it in `index.json`.
8. Recheck every `before_you_go` note on the ground and confirm it does not reveal the final venue.
