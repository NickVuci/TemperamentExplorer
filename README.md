# Temperament Lab

Rank-2 regular-temperament discovery, tuning, scale/interval analysis, and
HexBoard play and layout creation.

Ready-to-open [sample compositions](examples/compositions/README.md) cover 12 EDO,
Meantone, Porcupine, Magic and Pajara, with contrasting layouts and rhythms for
testing the Compose piano roll and Play mode.

## Source and build

Source lives in `src/`. The build writes a static site to `site/`.

The app runs entirely in the browser and needs no server code. Any static file
host (GitHub Pages, Netlify, Cloudflare Pages) can serve `site/`, including from
a subpath. Saved temperaments, layouts and chord shapes live in each browser's local storage;
Settings → Export/Import saved presets moves them between browsers or devices.

- `npm run build` writes `site/`, which holds only the app shell: the page, the
  app and both module workers as minified bundles, minified CSS, the manifest and
  icons, and the service worker stamped with a hash of the shell.
- `npm run preview` serves `site/` locally for checking offline and install
  behavior; service workers need `localhost` or HTTPS.
- `npm run dev` serves `src/` through Vite for interaction QA.
- `npm test` runs every top-level `tests/*.mjs` suite in parallel; set
  `TEST_CONCURRENCY` to cap the number running at once. The static-site suite
  rebuilds `site/`.
- `node scripts/benchmark.mjs [path/to/other/src]` runs identical local
  calculation workloads against current or previous sources, including older
  checkouts whose modules sit flat in `dist/`.

The browser receives one bundled ES module instead of fetching its dependency
tree. Workers are created through `src/workers.mjs`, which sits beside the worker
scripts so their URLs resolve in development and in the built site.
`manifest.webmanifest` makes the app installable. `sw.js` precaches the shell
and prefers the network, so online visits run the deployed files and offline
visits use the cache.

## Where things belong

The root of `src/` holds the page, `app.mjs`, the worker entry points and
`workers.mjs`, `style.css`, `sw.js` and the install metadata. Modules live in
subsystem folders:

| Folder | Contents |
| --- | --- |
| `core/` | Temperament, tuning, scale, matrix and JI calculations |
| `chords/` | Exact chord identity, projection, occurrences, realization, voicings and live recognition |
| `harmonic/` | Harmony directory and catalogue, intervals, ET/JI interpretation, and their workspaces |
| `shapes/` | Physical chord shapes and the Shapes view |
| `diamond/` | Tonality diamond and its workspace |
| `hexboard/` | Board geometry, layouts, colors, playing and device sync |
| `composition/` | Composition model, transport, editor, practice game and fingering game |
| `presets/` | Browser-local saved presets |
| `ui/` | Shared UI helpers, audio, and the Discover workspaces |

| Concern | Modules |
| --- | --- |
| Pitch/coordinate conventions, period references | `core/pitch.mjs` |
| Exact rational arithmetic | `core/rational.mjs` |
| Bounded memoization and immutable cached values | `core/cache.mjs` |
| Built-in temperament definitions and published tuning data | `core/catalog.mjs` |
| Generated scales, odd-limit targets, interval classification | `core/engine.mjs` |
| Comma kernels, EDO targets, fitting and tuning-method orchestration | `core/tuning.mjs`, `core/weil-tuning.mjs`, `core/tuning-methods.mjs` |
| Finite diamond approximation compatibility views | `core/approximation-compat.mjs` |
| JI assignment validation and mapping extensions | `core/assignments.mjs` |
| Matrix spans, modes and pagination | `core/matrix.mjs` |
| Chord inspection and scale discovery | `harmonic/harmonic-inspection.mjs`, `chords/` |
| Board geometry, export, chord placement and layer colors | `hexboard/hexboard*.mjs` calculation modules |
| Physical chord shapes: geometry, forward/reverse search, sources, jobs, saved shapes | `shapes/` |
| Rejecting retunes that would change the scale or key assignments | `core/retuning-guard.mjs` |
| Web Audio context, scheduling, held voices and cleanup | `ui/audio.mjs` |
| Pointer/keyboard/Shift-sustain interaction (no oscillator creation) | `hexboard/hexboard-player.mjs` |
| Shared HTML escaping and select options | `ui/ui.mjs` |
| Workspace rendering/event adapters | `*-ui.mjs`, `diamond/tonality-diamond.mjs` |
| App orchestration, navigation and session restoration | `app.mjs` |
| Theme tokens, shared components and responsive refinements | `style.css` |
| Browser-local saved presets, backups and revisions | `presets/`, `core/state.mjs` |
| Offline shell and install metadata | `sw.js`, `manifest.webmanifest`, `icon*` |

Import each name from the module that owns it; modules do not re-export other
modules' names.

## Calculation rules

### HexBoard period wrapping

`hexboard-wrapping.mjs` is a placement layer fed by the existing selected scale
and musical layout axes. Off preserves the original rank-2 board exactly.
On takes one canonical period of degree positions and translates it by an
integer hex-grid vector for each positive or negative copy register. Each copy
also extends indefinitely along the native period direction, allowing identical
sounding notes on multiple physical buttons.

- Column/row placement uses axial hex coordinates. In the existing doubled
  board coordinates the displacement is `(2 * column + row, row)`. This
  preserves the stagger without altering physical key geometry.
- Automatic placement searches collision-free vectors, preferring degree
  coverage, enabled keys, then smaller register excursions. Its native-period
  displacement is a fallback. It does not guarantee every key can be filled.
- Manual placement changes the copy positions only. `baseM` and `basePitch`
  identify the original degree, `copyRegister` identifies its copy, and
  `extensionRegister` tracks native period continuation. `register` is their sum
  plus the existing global layout register. Placement solves
  `position = basePosition + copyRegister * copyVector + extensionRegister * nativePeriodVector`
  directly, with no artificial register bounds.
- Sound is `basePitch + register * s.p`. Existing two-coordinate consumers use
  the derived `m = [baseM[0] + register, baseM[1]]`; no third temperament axis
  is introduced. Degree, base subset and layer colors follow the base degree.
- Collisions retain all claims, mark the physical key with ×, and disable it.
  Export requires resolving overlaps. The zero displacement is rejected.
- Wrapped JI overlays and board chord discovery compare pitch classes modulo
  the actual period. Voiced chord placement continues to use sounding integer
  coordinates, including alternate buttons with identical coordinates (up to
  20,000 placements, explicitly reported when limited). Scale highlights cover
  matching degrees across copies.
- Wrapping is locally isomorphic within each copy; seams need not preserve
  the musical intervals of the original infinite lattice.
- `periodWrapping` and optional `periodPlacement: {column, row}` persist with
  the existing HexBoard session/layout settings. Null placement means automatic.
  Older settings default to Off. Exports include explicit displaced pitches
  and per-key base coordinates/copy registers.

The period-wrapping suite covers 31edo, meantone, MV3, 3/1 and divided-octave
periods, automatic/manual/reversed placement, positive/negative registers,
rotation/mirroring, audio routing, colors, chord placement, overlaps and exports.

### Shared temperament calculations

- Coordinates are always integer `[period, generator]` pairs. A pitch match at
  another coordinate is not a mapped JI interval, including at EDO boundaries.
- Periods follow the first basis prime and its mapped subdivision. Octave spans
  are expanded only when 2/1 maps to an integer number of periods.
- `scale(s)` returns an immutable, cached result keyed by numerical period,
  generator, size and normalized mode. Copy before changing it. The cache is
  bounded, and names/preset IDs do not affect pitch calculations.
- `targets(limit)` also returns immutable cached data.
- For repeated interval classification, create a
  `createTargetClassifier(s, targets, tolerance)` once per matrix or search.
  It snapshots pitch parameters, maps the target ratios once, and memoizes
  repeated intervals with a bounded cache. Recreate it when tuning, mapping,
  target set or tolerance changes. `classifyTargets` remains the one-off API.
- Current-scale-and-mode JI approximations use tonic-relative mode notes.
  Do not replace them with all transpositions/pairs of the scale.
- Numerical comparison tolerances and tie-breaking rules were intentionally
  preserved. Frozen snapshot tests cover twenty built-in presets plus a non-octave
  example; `tests/catalog.mjs` checks every preset's comma kernel, generator basis
  and published CWE tuning.

## UI and audio rules

- Keep one shared set of JI controls. Park them before replacing workspace HTML,
  then move them into the relevant view. Recreating them separately desynchronizes
  tolerance and odd-limit settings.
- Escape dynamic HTML through `ui.mjs`; do not duplicate escaping in workspaces.
- Use `audio.mjs` for every playback path. Do not create oscillators in UI code.
  It owns one lazily created audio context, voice envelopes, frequency limits,
  pending-resume cancellation, Stop behavior and node disconnection.
- The playback interaction controller owns note highlights and Shift latching.
  The audio engine owns sound, so the two can be tested independently.
- Theme constants live in `:root`. CSS is readable and section-labelled.
  Responsive and component overrides retain their order deliberately; do not
  merge nonadjacent selectors without checking specificity and breakpoints.
- Matrix columns still fill their container, keep a fixed starting-note width,
  and scroll below the existing minimum cell width. Label modes share geometry.

## Compatibility and limits

Legacy session field migrations and tuning-name aliases remain: they are
compatibility code, not dead code. Existing safety caps also remain (256 generated
scale notes; automatic finite-scale chord discovery up to 96 notes; separate
board-based chord discovery; chord-shape searches up to 1,000,000 nodes and
20,000 places). Saved sessions are read through the current
compatibility paths without rewriting their stored formats.
