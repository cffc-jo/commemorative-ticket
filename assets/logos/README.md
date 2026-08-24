# Opponent logos

Drop opponent crest files here (transparent PNG or SVG, roughly square) and point `matches.json` →
`match.opponent.logoUrl` at the relative path, e.g. `assets/logos/nycfc.png`.

Nothing needs to change in the app code — the ticket canvas loads whatever URL is configured. If a
file is missing, unreadable, or 404s, the ticket automatically falls back to a clearly-labeled
"OPPONENT LOGO" placeholder box instead of breaking the page.

No real opponent logos are checked in yet (see the project README's "Open items" section).
