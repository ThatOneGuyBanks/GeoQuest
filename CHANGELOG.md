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

Route-pack content and route validation are intentionally outside this release-hardening change.
