# Changelog

## 1.0.0-rc.1 — 2026-07-31

- Made every adventure card keyboard operable with a visible focus state.
- Added focus trapping, focus return and Escape handling to dismissible dialogs.
- Added explicit online/offline status and clarified which features require a connection.
- Changed offline fetching to fast cache fallbacks on weak connections.
- Bounded the runtime map-tile cache and stopped caching unrelated requests.
- Added graceful map messaging when the map library is unavailable.
- Added player-facing privacy, offline-use and support information.
- Added automated non-pack smoke checks for navigation, accessibility, responsive layout and offline replay.

- Repaired advertised walking distances across all 45 routes using pedestrian routing between their stops.
- Reworked the Peterborough main route to finish beside Town Bridge instead of requiring a long walk to Werrington.
- Corrected displaced Peterborough and Huntingdon stop coordinates and outdated St Neots bridge copy.
- Rewrote the five original packs' clues, hints, facts, fieldwork prompts and completion messages.
- Replaced duplicated practical guidance with route-specific terrain and accessibility notes.
- Added age guidance that accounts for clue difficulty and final-venue policies.
