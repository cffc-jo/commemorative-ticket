# Opponent logos

One transparent PNG per MLS club, named by lowercase club code. To feature a match, point
`matches.json` → `match.opponent.logoUrl` at the file, e.g. `"logoUrl": "assets/logos/nyc.png"`.
No code changes are needed.

If a file is missing, unreadable, or 404s, the ticket falls back to a clearly-labeled
"OPPONENT LOGO" placeholder box instead of breaking the page.

| File | Club | File | Club |
|---|---|---|---|
| `atl.png` | Atlanta United | `nsh.png` | Nashville SC |
| `atx.png` | Austin FC | `nyc.png` | New York City FC |
| `cin.png` | FC Cincinnati | `nyr.png` | New York Red Bulls |
| `clb.png` | Columbus Crew (with wordmark) | `orl.png` | Orlando City |
| `clb-2.png` | Columbus Crew (crest only) | `phi.png` | Philadelphia Union |
| `clt.png` | Charlotte FC | `por.png` | Portland Timbers |
| `col.png` | Colorado Rapids | `rsl.png` | Real Salt Lake |
| `dal.png` | FC Dallas | `sdfc.png` | San Diego FC |
| `dc.png` | D.C. United | `sea.png` | Seattle Sounders |
| `hou.png` | Houston Dynamo | `sj.png` | San Jose Earthquakes |
| `lafc.png` | LAFC | `skc.png` | Sporting Kansas City |
| `lag.png` | LA Galaxy | `stl.png` | St. Louis City SC |
| `mia.png` | Inter Miami | `tor.png` | Toronto FC |
| `mnufc.png` | Minnesota United | `van.png` | Vancouver Whitecaps |
| `mtl.png` | CF Montréal | | |
| `ne.png` | New England Revolution | | |

## Notes

- Source files were ~2000–3000px (`@3x`) PNGs. They're downscaled here to 600px on the longest
  side so the page loads fast inside the app WebView. The ticket draws logos at ~220px (1080px
  wide output), so 600px leaves plenty of headroom. If you add new logos, keep them around that
  size (roughly square crop, transparent background).
- `clb.png` vs. `clb-2.png`: the crest-only version has built-in transparent padding, so it
  renders smaller on the ticket than the wordmark version. Use whichever the design team prefers.
- `CHI` (the Fire's own crest) is intentionally not included; it lives at `assets/fire-crest.svg`.
