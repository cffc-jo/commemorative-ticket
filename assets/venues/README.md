# Venue photos

A venue's photo is the ticket's **default photo**: it fills the photo area when a fan skips the
photo step. A photo the fan uploads always wins.

**How a match finds its photo (default template only):**

1. If `match.venue.backgroundImageUrl` is set in `matches.json`, that file is used.
2. Otherwise the app looks for `assets/venues/<venue name>.jpg`, where the name is lowercased and
   hyphenated: "SeatGeek Stadium" → `seatgeek-stadium.jpg`, "Soldier Field" → `soldier-field.jpg`.
3. If no file exists, the ticket shows the navy star-field placeholder.

So to give another venue a default photo, just drop a correctly named JPEG in this folder. No code or
`matches.json` change is needed. The legacy `wireframe` variant doesn't use venue photos.

**Image tips:** landscape works best (the photo area is roughly 1080 × 895 and the image is cropped to
fill it, centered). Around 1600 px wide at JPEG quality ~85 keeps the file near 250 KB, which is
fast enough for a mobile WebView.

| File | Venue |
|---|---|
| `seatgeek-stadium.jpg` | SeatGeek Stadium (Bridgeview, IL) |
