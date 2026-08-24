# Chicago Fire FC — Commemorative Ticket

A fully static, client-side "make your own match ticket" page. A fan uploads a photo,
types in their section/row/seat, and gets a downloadable/shareable PNG styled like a
match ticket, combining their photo + seat info with match details the club controls.

Built to be embedded in the Fire FC mobile app via a native WebView, and hosted on
GitHub Pages so match info can be updated by editing a JSON file — no app release needed.

## How it works (architecture)

- **Plain HTML/CSS/JS, no framework, no build step.** This is a single-purpose page;
  a bundler/framework would add complexity with no real benefit here.
- **100% client-side.** The uploaded photo, section/row/seat text, and the generated
  ticket image never leave the browser. There is no backend, no API calls with user
  data, nothing sent anywhere.
- **No persistence, ever.** No `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
  All state lives in plain JS variables in [`js/app.js`](js/app.js) for the life of the
  page. Reloading the page — at any step — wipes everything and starts clean. This is
  intentional, not an oversight.
- **No analytics.** None are wired up by default. If privacy-safe usage analytics are
  wanted later, treat that as its own follow-up decision.

## Editing match info

Match details (opponent, venue, date/time) live in [`matches.json`](matches.json) at
the repo root, validated against [`matches.schema.json`](matches.schema.json). Club
staff edit this file directly via the GitHub web UI (or a PR) — no admin UI exists for
v1. The page fetches and validates it on load; a missing field, bad type, or typo shows
a friendly on-page error instead of a broken page (see `validateMatchConfig` in
[`js/config.js`](js/config.js)).

Key fields:
- `isHome` — controls "VS" vs. "@", and which crest sits on which side. **Decision made
  here:** home matches show the Fire crest on the left ("Fire VS Opponent"); away
  matches show the opponent's crest on the left ("Opponent @ ..." reads as the hosting
  club). Flip the `fireSlot`/`oppSlot` logic in [`js/ticket-canvas.js`](js/ticket-canvas.js)
  if club design wants the opposite convention.
- `opponent.logoUrl` — relative path to a logo file (see `assets/logos/`). No real
  opponent logos are checked in yet; until they are, the ticket automatically falls
  back to a clearly-labeled "OPPONENT LOGO" placeholder box rather than breaking.
- `date` / `kickoffTime` / `timezone` — always entered **local to the venue**. The app
  converts to Central time for display (see "Time zone" below), so venue timezone must
  be accurate for the conversion to be correct.

## Time zone

Match date/time is always displayed in Central time (`America/Chicago`), regardless of
the venue's actual time zone — Fire fans should always see the time they'd experience
it in. Since the config's `date`/`kickoffTime` are local to the *venue's* zone, the app
first resolves them to a real UTC instant (`zonedWallClockToUtc` in `js/config.js`),
then formats that instant into Central time with `Intl.DateTimeFormat`. This deliberately
does not use the browser/device's own time zone at any point.

## User flow

Welcome → (optional) photo upload → (optional) section/row/seat → generate/loading →
preview with Save / Share / Make another. Each step's Skip button is honored — an
unset photo renders as a placeholder graphic; unset section/row/seat render as "—".

## WebView considerations

- Feature-detects `navigator.share` / `navigator.canShare({ files })` before showing
  the Share button — if the WebView doesn't support sharing files, the button is
  simply hidden and "Save image" is the only action offered. No error is shown for a
  missing Share button.
- Layout is mobile-viewport-only (`max-width: 480px`, no desktop/tablet breakpoints) —
  this page is never expected to render in a desktop browser tab.
- **Built against the "live URL" assumption**: the page expects to be loaded by the
  WebView from its GitHub Pages URL (so `fetch('./matches.json')` always gets the
  latest committed config). **If the app instead bundles this page into the binary**,
  `matches.json` would be frozen at build time and the "update anytime without a
  release" benefit is lost — that's the one thing that would need to change if the
  loading strategy changes.
- **Open item (confirm with app engineering):** whether the embedding WebView is
  configured to support `navigator.share`/`canShare` with files at all, on both iOS and
  Android. The code feature-detects and falls back gracefully either way, but it's
  worth confirming so "Share" isn't silently unavailable to everyone.

## Known risk: HEIC/HEIF photos

iOS's default camera format (HEIC/HEIF) has inconsistent `<canvas>`/`<img>` decode
support across browsers and WebViews. This app does **not** ship a HEIC→JPEG
client-side conversion step. Today, if decoding fails, the upload step shows a clear
"please choose a JPEG/PNG or take a new photo" message rather than breaking — the user
can always retry with a different photo (or the WebView's camera capture, which
typically returns a directly-usable format). If HEIC turns out to be common in practice,
the fix is to add a decode step (e.g. the `heic2any` library) in `onFileSelected` in
`js/app.js` before attempting `<img>` decode.

## Open items / follow-ups

- **Opponent logo library** — no real opponent crests are checked in. Drop files into
  `assets/logos/` and point `matches.json` → `opponent.logoUrl` at them; no code
  changes needed. Until then, the ticket shows a placeholder box.
- **Section/seat validation** — currently free-text, 0–10 alphanumeric characters,
  optional. No fixed section list exists yet; tightening this to a real allow-list
  later is a small, isolated change (`SEAT_FIELD_PATTERN` in `js/app.js`).
- **WebView share support** — see "Open item" above.

## Local preview

No build step — just serve the folder statically, e.g.:

```bash
npx serve .
```

Then open the printed `localhost` URL on a mobile-sized viewport (or your phone on the
same network) — this page assumes a mobile viewport and won't look right at desktop width.

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which publishes the repo root straight to GitHub Pages (Settings → Pages → Source:
GitHub Actions must be selected once, the first time).
