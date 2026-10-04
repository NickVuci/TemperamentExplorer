# Temperament Lab

Rank-2 regular-temperament discovery, tuning, scale/interval analysis, and
HexBoard play and layout creation.

## Source and build

**The top-level files in `dist/` are authored source, not disposable output.**
Do not clean that directory. The generated Worker is `dist/server/index.js`;
the generated hosting manifest is `dist/.openai/hosting.json`.

- `npm run build` builds the browser entry in memory, minifies the served CSS,
  and embeds assets into the Worker. Authored modules and CSS are not overwritten.
- `npm test` runs every top-level `tests/*.mjs` suite. Build first: preset
  integration tests exercise the generated Worker with an in-memory database.
- `node scripts/benchmark.mjs [path/to/previous/dist]` runs identical local
  calculation workloads against current or previous sources.

The browser receives one bundled ES module instead of fetching its dependency
tree. Individual module URLs remain available for compatibility. No new runtime
or development dependency was added by the refactor.

## Where things belong

| Concern | Modules |
| --- | --- |
| Pitch/coordinate conventions, period references | `pitch.mjs` |
| Exact rational arithmetic | `rational.mjs` |
| Bounded memoization and immutable cached values | `cache.mjs` |
| Built-in temperament definitions and published tuning data | `catalog.mjs` |
| Generated scales, odd-limit targets, interval classification | `engine.mjs` |
| Comma kernels, EDO targets, fitting and tuning-method orchestration | `tuning.mjs`, `weil-tuning.mjs`, `tuning-methods.mjs` |
| JI assignment compatibility and finite-scale approximations | `assignments.mjs` |
| Matrix spans, modes and pagination | `matrix.mjs` |
| Chord analysis and discovery | `chords.mjs` |
| Board geometry, export, chord placement and layer colors | `hexboard*.mjs` calculation modules |
| Web Audio context, scheduling, held voices and cleanup | `audio.mjs` |
| Pointer/keyboard/Shift-sustain interaction (no oscillator creation) | `hexboard-player.mjs` |
| Shared HTML escaping and select options | `ui.mjs` |
| Workspace rendering/event adapters | `*-ui.mjs`, `tonality-diamond.mjs` |
| App orchestration, navigation and session restoration | `app.mjs` |
| Theme tokens, shared components and responsive refinements | `style.css` |
| Account-scoped persistence, authorization and revisions | `server/`, `preset-data.mjs`, `state.mjs` |

`engine.mjs` retains its previous public exports by re-exporting the moved
helpers and catalog. Likewise, `matrix.mjs`, `hexboard.mjs` and
`assignments.mjs` preserve their existing shared-helper exports.

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
  preserved. Snapshot tests cover every built-in preset plus a non-octave example.

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

## Refactor verification

This pass removed 69 selectors tied to retired UI, the old generator-slider
handler, unused matrix-color/coverage helpers and unused controller imports.
It did not change database schema, persisted preset/session formats, tuning
methods, built-in definitions, supported scale filters or export formats.

The baseline contained four failing tests: an implicit all-scales/MOS assumption,
two references to retired UI text, and a DOM mock missing `hasAttribute`.
These were corrected to test current behavior (including actual SVG highlighting),
not by changing product behavior to satisfy obsolete expectations.

Additional checks protect:

- exact pre-refactor scales, JI classifications, mode approximations, chords and
  HexBoard export data;
- cache invalidation, immutability, rational arithmetic and HTML escaping;
- audio envelopes, frequency bounds, held-note release, node disconnection,
  latest-request cancellation and Stop during pending audio resume;
- the retained CSS cascade after expanding extracted theme constants;
- existing tuning, session/material, preset CRUD, private-site preset scope,
  non-octave, large-scale, board color and pointer/sustain behavior.

Example local benchmark, median of five rounds, same harness and matching result
counts against the pre-refactor revision:

| Workload | Before | After |
| --- | ---: | ---: |
| Ten complete 19-note matrix classifications | 13.14 ms | 5.66 ms |
| Ten complete 81-note matrix classifications | 200.85 ms | 75.96 ms |
| Five cold 81-note tetrad searches, 13-odd-limit, 18¢ | 369.03 ms | 34.03 ms |

These are JavaScript calculation benchmarks, not end-to-end browser timings.
Automated audio tests use a mock context, not an acoustic/listening test.

## Deliberately retained / follow-up boundaries

Legacy session field migrations and tuning-name aliases remain: they are
compatibility code, not dead code. Existing safety caps also remain (256 generated
scale notes; automatic finite-scale chord discovery up to 96 notes; separate
board-based chord discovery). Saved user data was not rewritten.

The next useful structural step is extracting the remaining matrix/target view
renderers and session orchestration from `app.mjs`. Some existing tests extract
controller source into mocked DOM contexts; replace those with fuller DOM tests
before a broad controller rewrite. This pass deliberately avoids a simultaneous
UI redesign or state-format migration.
