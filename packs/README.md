# Route packs

Each playable route is one JSON file in this folder.

## Add a route

1. Copy `PACK_TEMPLATE.json` and rename it with lowercase letters and hyphens, for example `kettering-ghost-walk.json`.
2. Give it a unique `pack_id`.
3. Fill in its route details and stops.
4. Add its filename to `index.json`:

```json
{
  "file": "kettering-ghost-walk.json",
  "enabled": true
}
```

5. Commit both files to GitHub.

A static website cannot automatically enumerate files in a folder, so `index.json` is the route catalogue. Set `enabled` to `false` to hide a pack without deleting it.

## Required pack fields

- `pack_format`
- `pack_id` — permanent, unique ID used for saved progress
- `version`
- `town`
- `display_name`
- `route_name`
- `description`
- `centre.lat` and `centre.long`
- `stops`

Every stop needs a unique `Stop_ID`, its order, target coordinates, clue, name and unlock fact. Keep full-precision coordinates in the JSON.
