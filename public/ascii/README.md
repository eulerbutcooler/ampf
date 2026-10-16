# Vendored ascii.rest runtime

Self-hosted copy of the [ascii.rest](https://ascii.rest) runtime and the two
pieces this site uses. Nothing here is fetched from ascii.rest at runtime.

- Upstream: <https://github.com/bas3line/ascii> (MIT, see `LICENSE.txt`)
- Files: `ascii.js`, `banner.js`, `library.js`, `mount.js` — the runtime that
  defines `<ascii-art>`. `library.js` resolves pieces with relative imports, so
  this folder works as-is from any path.
- Pieces: `pieces/cloud-sea.js` (home hero) and `pieces/night-highway.js`
  (footer). Only these two are vendored; any other `piece` attribute value
  would 404.
- `fonts/ascii-rest-mono.woff2`: 3 KB glyph fallback (a cut of JetBrains Mono,
  OFL) for block/box characters on systems that lack them.
- Local change vs upstream: the `@font-face` URL inside `ascii.js` was made
  relative (`/ascii/fonts/ascii-rest-mono.woff2`) so no request leaves the
  origin. This is the only patch.

To update: re-download the files listed above from ascii.rest and re-apply the
font URL change.
