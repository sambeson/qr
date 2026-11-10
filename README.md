# Townie

Guess the New Jersey town from its outline. One town a day, the same for everyone, six guesses.
Styled after a Greek diner: blue and white, Greek key borders, Ionic columns.

**Play:** open `index.html` or serve the repo root as a static site (GitHub Pages, Netlify, `npx serve`).

## How it plays
- **The plate** shows the outline of one of New Jersey's 564 municipalities, with north up and a scale bar underneath.
- **Every guess** shows the distance in miles from your guess to the answer (centroid to centroid), an arrow pointing toward the answer, and a closeness percentage.
- **Hints:** after 3 misses you're told the county. After 5 misses you also get the town type and its approximate population. Turn hints off in Settings for hard mode, which adds `*` to your share.
- **The reveal** at the end shows the town on a statewide map with your guesses plotted, plus a short fact sheet.

## Daily-game features
| | |
|---|---|
| Daily puzzle | The same town worldwide. Rolls over at midnight **America/New_York**. No. 1 = 10 Nov 2026. |
| Rotation | Deterministic seeded shuffle of all 564 towns: no repeats until every town has been served, then a new shuffle. |
| Persistence | An in-progress game survives reloads (`localStorage`). |
| Stats | Played, win %, current and best streak, guess distribution (including losses). A skipped day breaks the streak. |
| Share | Spoiler-free emoji grid (🟦⬜ closeness plus a direction arrow per guess). Uses the native share sheet on mobile, the clipboard on desktop. |
| Countdown | Live timer to the next town. The game rolls over automatically if the tab stays open. |
| Practice | Unlimited practice rounds with random towns. They don't touch your stats. |
| Onboarding | How-to sheet on first visit, available any time from the **?** button. |
| Settings | Light / dark / auto theme; hints on or off. |
| Accessibility | Combobox with keyboard navigation, live-region results, focus states, honours `prefers-reduced-motion`. |

## Data
`data/towns.js` is generated from the official **NJOGIS Municipal Boundaries of NJ**
(distributed in the [`@njam-data/new-jersey-municipalities`](https://www.npmjs.com/package/@njam-data/new-jersey-municipalities) npm package).
Pine Valley is merged into Pine Hill (consolidated in 2022) to reach the current count of 564. Populations are from the 2010 Census, as carried in the source.

Regenerate:
```sh
npm pack @njam-data/new-jersey-municipalities && tar xzf njam-data-new-jersey-municipalities-*.tgz
node scripts/build-towns.mjs package/data/new-jersey-municipalities.geojson
```
The script has no dependencies. It projects the boundaries, simplifies each one relative to the town's size, and writes about 275 KB (113 KB gzipped).

## Files
```
index.html            markup + dialogs
assets/styles.css     styles (light + dark)
assets/game.js        game logic
data/towns.js         generated outlines + metadata
scripts/build-towns.mjs
```
