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

Keep the `Town` and `Route` values consistent with the pack metadata. Coordinates must point to safe, publicly accessible locations and clues must not require trespassing, crossing unsafe areas or entering a building.

The final stop must be a real pub, restaurant or café where players can end their day. Its unlock text should begin with “Route complete!”, contain an interesting checked fact and avoid promising that the venue will be open.

## Quality checklist

Before publishing a pack:

1. Confirm every coordinate on a map and, where possible, at the physical location.
2. Check that stops follow a sensible walking order.
3. Check the route distance and estimated time.
4. Verify historical claims against reliable sources.
5. Confirm all `pack_id` and `Stop_ID` values are unique.
6. Make sure the final venue is still operating and provide no guarantee about opening hours.
7. Test the complete route using the hidden location simulator before enabling it in `index.json`.
