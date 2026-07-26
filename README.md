# GeoQuest HTML prototype

A static, mobile-friendly location quiz. No server or database is required.

## Publish with GitHub Pages

1. Create a new GitHub repository, for example `geoquest`.
2. Upload **the contents of this folder** to the repository root. `index.html` should be visible at the top level, not inside another folder.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. Open the HTTPS address GitHub gives you, usually `https://YOURNAME.github.io/geoquest/`.
7. On your phone, open that HTTPS address and allow location access when prompted.

GitHub Pages supports HTTPS. Browser geolocation requires a secure HTTPS context, except for special local-development addresses such as `localhost`.

## New playtest controls

- **I'm stuck → Reveal the next hint**: reveals the next available hint and reduces the available star score.
- **I'm stuck → Guide me toward it**: continuously checks GPS, shows distance, and gives a north-relative compass direction.
- **I'm stuck → Skip this stop**: reveals the location and fact, but awards zero stars and records the skip.
- **Desktop test mode**: simulates distance without GPS.

## Important guidance limitation

The arrow points relative to geographic north. It is not a phone-orientation compass, so the player should use the written direction, such as “north-east”, together with their phone compass or surroundings.

## Editing game content

Edit `data.json`. Keep the existing property names because the game code expects them.

## Local testing

Windows: double-click `START_GAME_WINDOWS.bat`.

macOS/Linux: run `START_GAME_MAC_LINUX.command`.

Local GPS generally works only at `localhost`; opening the site from another phone using a computer's `http://192.168...` address is insecure and will normally block geolocation. Use the GitHub Pages HTTPS link for real outdoor testing.
