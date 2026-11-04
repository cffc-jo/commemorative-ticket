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
| `clb.png` | Columbus Crew (crest only) | `orl.png` | Orlando City |
| `clt.png` | Charlotte FC | `phi.png` | Philadelphia Union |
| `col.png` | Colorado Rapids | `por.png` | Portland Timbers |
| `dal.png` | FC Dallas | `rsl.png` | Real Salt Lake |
| `dc.png` | D.C. United | `sdfc.png` | San Diego FC |
| `hou.png` | Houston Dynamo | `sea.png` | Seattle Sounders |
| `lafc.png` | LAFC | `sj.png` | San Jose Earthquakes |
| `lag.png` | LA Galaxy | `skc.png` | Sporting Kansas City |
| `mia.png` | Inter Miami | `stl.png` | St. Louis City SC |
| `mnufc.png` | Minnesota United | `tor.png` | Toronto FC |
| `mtl.png` | CF Montréal | `van.png` | Vancouver Whitecaps |
| `ne.png` | New England Revolution | | |

## Notes

- Source files were ~2000–3000px (`@3x`) PNGs. They're downscaled here to 600px on the longest
  side so the page loads fast inside the app WebView. The ticket draws logos at ~220px (1080px
  wide output), so 600px leaves plenty of headroom. If you add new logos, keep them around that
  size (roughly square crop, transparent background).
- `clb.png` is the crest-only Columbus logo (no wordmark), per the club's choice. The source
  file had a large transparent margin, which was trimmed so it renders at the same visual scale
  as the other crests.
- `CHI` (the Fire's own crest) is intentionally not included; it lives at `assets/fire-crest.svg`.
