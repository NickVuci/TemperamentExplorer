# Temperament Lab project state

This is the canonical description of the current implementation. Code and tests
remain the strongest evidence when this document becomes stale.

## Product and runtime architecture

Temperament Lab is a rank-2 regular-temperament discovery, tuning, generated-scale,
interval/JI, chord, and HexBoard-layout application.

- The application is a browser ES-module interface served by a Cloudflare Worker.
- Top-level `dist/*.mjs`, `dist/index.html`, and `dist/style.css` are authored
  source. `scripts/build.mjs` bundles `dist/app.mjs` in memory and writes the Worker
  to `dist/server/index.js`.
- `dist/app.mjs` is the main controller and owns navigation, primary temperament
  state, shared JI controls, session import/export, matrix rendering, and workspace
  integration.
- `npm run dev` serves the browser interface through Vite for interaction QA;
  saved preset APIs still require the Worker runtime.
- Calculation modules are UI-independent where practical; `*-ui.mjs` modules own
  rendering and event adapters.
- `server/index.mjs` serves embedded assets and site-scoped preset APIs backed
  by the `DB` D1 binding.

## Main user workflow

The top-level tabs are **Discover**, **Play**, and **Create**.

- **Discover** presents Temperament, Tuning, and Scale/Mode controls in one setup
  row. Advanced temperament controls contain comma search and direct mapping input.
  Analysis opens on Interval Matrix and also provides JI-target tonality diamonds
  and generated-scale details. A manual chord-inspection view remains reachable
  from interval workflows but is not a primary tab.
- **Play** owns the HexBoard target scale/mode, layout settings, the v2 Scale
  Chords catalogue, chord realizations/fingerings, temporary scale/chord highlights,
  playback, and HexBoard export.
- **Create** is the reserved home for the planned composition suite. The existing
  material collection is available there; the progression and melody/phrase editor
  is not implemented yet.

The primary Discover temperament/tuning is shared with Play. Play preserves an
independent target scale size and mode while refreshing its temperament and tuning
when the primary tuning identity changes. Collected material retains its source
tuning and voiced coordinates.

## Temperament representation and mappings

A validated temperament state contains:

- `basis`: 2–10 distinct prime basis elements, each at most 97; comma-entry UI
  requires ascending order, while validated states preserve their explicit order;
- `rows`: two integer mapping rows, ordered period then generator;
- `p`, `g`: tuned period and reduced positive generator cents with `0 < g < p`;
- `n`, `mode`: 2–256 notes per period and a zero-based pitch-order mode rotation;
- optional tuning, comma, assignment, exploration, and persistence metadata.

Coordinates are integer `[period, generator]` pairs. The first basis prime defines
the reference interval. `rows[0][0] = q > 0` means `q` periods span that reference;
`rows[1][0] = 0`, and the generator row is primitive. The pure reference period is
`1200 * log2(basis[0]) / q`. Octave expansion is available only when prime 2 is in
the basis and maps to an integer number of generator-free periods.

`tuning.mjs#fromCommas` parses comma monzos, performs exact rational elimination,
requires the kernel to leave rank 2, constructs the saturated integer annihilator,
derives the required period subdivision, and reduces the generator by whole
periods. Known kernels may select a familiar preset generator basis; tuning is then
applied separately. Direct mappings are validated by `state.mjs`.

The application currently supports prime-basis rank-2 mappings. Arbitrary composite
or fractional basis elements and higher-rank scale enumeration are not supported.

## Tuning

`tuning-methods.mjs` is the UI-facing tuning orchestrator. The visible methods are:

- Weil–Euclidean
- Minimax
- Least Squares
- EDO
- JI Target

Mappings do not change when a tuning changes. Fixed-period tuning is the default;
the visible **Optimize period** checkbox sets `fixed = false`. Fixed tuning restores
the pure mapping-derived reference period rather than preserving a manually typed
period. Minimax and Least Squares default to equally weighted basis-prime targets,
with mapped odd-limit and custom targets available. WE uses the dual
Weil–Euclidean metric in `weil-tuning.mjs`.

EDO search returns patent or optional nearby induced vals that factor through the
temperament mapping and temper its comma kernel; divided-octave mappings require an
integer number of EDO steps per period. JI Target can make an assigned coordinate
pure. With an optimized period and one independent pure constraint, WE selects the
remaining degree of freedom. Multiple incompatible pure assignments are rejected.

Legacy tuning names are normalized when loading saved data; they are compatibility
aliases, not additional current methods.

## Generated scales and modes

`engine.mjs#scale` generates `n` consecutive generator powers modulo the actual
period, sorts them by pitch, rotates by the selected pitch-order mode, and moves the
mode tonic to zero. It returns immutable cached notes, steps, distinct step sizes,
collision state, signature, and MOS/equal-step classification.

`generatedSizes` enumerates collision-free sizes through 256. The default UI filter
shows two-step scales (MOS-oriented); Advanced options expose three-step and all
generated scales. The current size remains selectable even when outside the filter.
`scale-milestones.mjs` is the central scale-coverage engine. For the active mapping,
tuning, and selected shared odd/prime limits it returns the first interval-complete
generated scale, first interval-complete strict MOS, first generated scale with a
diamond-complete mode, and first strict MOS with a diamond-complete mode. Both
mode results retain every completing mode and select the first one in pitch order.
The default target is 15-odd-limit filtered by the exact temperament basis.
Unmapped ratios are counted and excluded; exact integer generator differences
modulo the actual period determine coverage, independently of cent tolerance,
display filters, current mode, and period/octave display span. A consecutive chain
contains differences -(n-1) through n-1; tonic generator r covers a required range
[min,max] precisely when r+min >= 0 and r+max < n. This computes all four properties
in a single pass through generated sizes without constructing four UI searches.

`default-scale.mjs` projects the first diamond-complete scale and completing mode
from that analysis. Startup/reset, built-in/saved preset selection, new comma
mapping, and changes to tuning or shared JI limits use that default. The layout
initializes its independent target scale/mode from the same result; its base subset
defaults to the first interval-complete MOS when that MOS fits the target. Manual
scale/mode/base edits survive ordinary redraws; a changed analysis context applies
new defaults. Saved sessions and explicit material/chord loads retain their chosen
scale/mode, and saved HexBoard base settings are retained on restoration. If no
qualifying scale exists through 256 notes before pitch collisions, retain the
existing selection and report no result. A base MOS must still fit the target and
existing layout constraints; ordinary fallback handles absent/unusable results.

Discover presents all four results as selectable buttons and appends IC/DC markers
to relevant scale/mode menus. Results show their active limits and outside-basis
exclusions. Milestone sizes remain available when hidden by the scale filter.

Two-step, three-step, equal-step, and larger-step generator stacks all use the same
scale representation. HexBoard base subsets require a two-step MOS whose interval
axes form a unimodular basis.

## Interval matrices and JI approximations

`matrix.mjs` owns matrix spans, interval lookup, and large-matrix pagination.
Scale-Workshop-style ascending rows are the default; cents, JI targets, and
generator labels share one geometry. Divided-octave temperaments can display one
period or a repeated whole-octave span without changing the underlying scale. The
same stored span choice controls finite-scale availability in the JI-target
tonality diamond, including its current-scale-and-mode view.

`ji-limit-engine.mjs` is the single owner for odd-limit and prime-limit option
lists, validation, exact ratio filtering, diamond cells, and unique JI target
generation. `engine.mjs#targets` delegates to it, so matrix targets, the tonality
diamond, manual and catalogue chord discovery, HexBoard chord search, and explicit
odd-limit tuning targets share the same ratio rules. The mandatory odd limit is
selected from odd integers 3–97 and defaults to **15**; **Temperament basis**
remains available as an explicit choice. The optional prime filter defaults to
**Temperament basis**. A complete basis prefix from 2 through its highest prime
uses prime-limit shorthand; an incomplete basis resolves to its exact subgroup,
shown with dotted notation such as `2.3.5.11-prime subgroup`. This excludes primes
missing from the basis even when they are below its highest prime. Manual
prime-limit choices are 3, 5, 7, 11, and 13, plus **No prime limit**. The basis
choice may resolve above 13 for higher-limit temperaments. The engine accepts
primes 2–97 and explicit prime-subgroup lists so it can represent those bases and
preserve saved settings. When selected, every ratio must satisfy both bounds: its
odd components fit the odd limit, and every prime factor fits the complete limit
or exact subgroup. The native selectors only expose those valid values and support
keyboard type selection and scrolling. One shared `{oddLimit, primeLimit,
tolerance}` state is moved into the relevant Discover view. The diamond legend
owns the editable tolerance; it starts at the calculated maximum error, and its
Auto control restores recalculation. Manual overrides are shared with the matrix,
chord analysis, and HexBoard, and persist in version-7 sessions. Play's
chord-search options read and can update the same state.

Mapped identity requires exact equality of integer period/generator coordinates.
Cent proximity never creates a mapped interval. `createTargetClassifier` separates
mapped coordinates from alternative or outside-basis approximations. Matrix display
priority suppresses an outside-subgroup hit when the cell has a mapped hit within
tolerance; a mapped target outside tolerance (`M×`) does not suppress it.
`assignments.mjs` owns finite-scale alternatives, exact target assignments, and
exact consistency/extension checks.

The JI-target view is an interactive odd-limit tonality diamond, optionally narrowed
by the prime limit. Its display compacts the allowed harmonic axes into a complete
diamond; canonical analytical targets retain their original identities. Its approximation
source can use the full temperament mapping, every pairwise interval in the current
scale matrix, or tonic-relative notes in the selected mode. Scale-matrix coverage
shows an exact mapped interval whenever the matrix contains it, even if another
matrix interval is closer in cents. Pre-version-4 sessions migrate the old
scale-and-mode source to Mode when restored. Mapped cells are colored by tuning
error; when another scale interval is closer, the mapped target remains available
as a secondary approximation.

`diamond-layout.mjs` owns compact display geometry and ordered custom harmonic
lists (2–16 distinct integers from 1–256). The default folds ratios into one octave;
custom layouts preserve the entered harmonic/reciprocal register unless the user
explicitly enables octave folding. Custom layout ratios are independent of the
analytical odd/prime filters, but use the same mapping/scale/mode approximation
semantics and shared error scale. Missing approximations remain visible and silent.
`diamond-workspace.mjs` owns persistent cell selections, line selection, layout
controls and transfer adapters. The shared pointer player supports click/hold/drag,
Shift pedal and keyboard activation without replacing the SVG; voice lifecycle
remains in `audio.mjs`. Cell fills indicate selection and playback without geometry
changes. Layout and selection are included in session files and old sessions use
the default layout. Changes to tuning, scale, source or filters invalidate selections.
Transfers retain the sounding integer coordinates: collections accept 2–256 unique
notes (up to 8 as a chord), Chords requires 2–8 distinct scale degrees and fits a
contiguous generator scale when needed, and HexBoard uses existing placement checks.
No-fit and unavailable-note states remain explicit; handoff does not imply a
physical fingering exists.
Selecting or simultaneously playing 2–8 distinct diamond pitches displays their
exact JI chord in the detail panel. Fixed-denominator lines use otonal spelling
(such as `4:5:6`), fixed-numerator lines use the reciprocal utonal spelling
(`1/6:5:4`), and mixed selections show both forms. Larger selections remain
available for transfers and report their distinct-pitch count instead.

## Chord system

Chord engine v2 is the sole Scale Chords catalogue engine. The former catalogue
engine and runtime selector were removed; `chord-session-v2-adapter.mjs` is retained
only to migrate compatible saved sessions.

The canonical pipeline is:

`exact JI identity → temperament projection → finite-scale occurrence → voicing → HexBoard placement`

- `chord-identity-v2.mjs` parses exact 2–8-tone rational chords. Identity is an
  unordered proportional set; original spelling/order and repeated members are
  metadata. Identity is not reduced by octave or temperament period.
- `chord-projection-v2.mjs` maps members and reports basis, tuning-quality,
  cardinality/collision, and generator-span results independently.
- `live-chord-recognition.mjs` maps the HexBoard player's held/sustained notes to
  complete chord-catalogue shapes using the full `[period, generator]` offsets
  from the lowest sounding note. Register is retained, so an octave is a two-note
  `1:2` match and `4:5:6` differs from `2:5:6`. The readout shows the best-ranked
  JI identity and alternate matches; it does not select a chord or claim the played
  tuning is acoustically pure. Candidates are cached by mapping, tuning, JI limits,
  and tolerance.
- `chord-occurrence-v2.mjs` finds exact occurrences in the selected scale and mode.
  Occurrence uses mapped coordinates, never cent tolerance or board availability.
- `chord-discovery-v2.mjs` searches a bounded catalogue of curated chords, harmonic
  segments, and reciprocals, with shared odd/prime-limit filters and worker-backed
  progress/cancellation.
- Otonal and exact reciprocal utonal forms are displayed as one family while
  retaining distinct exact identities. Compact utonal spelling uses forms such as
  `1/6:5:4`.
- `chord-realization-v2.mjs` applies root, inversion, harmonic-spelling (default),
  compact/open spacing, ordering, period shifts, and register bounds, then finds
  alternate physical fingerings without changing occurrence truth.

No scale occurrence, no playable fingering, outside-basis projection, tempered
cardinality collapse, and poor tuning are distinct states. The main Play panel
shows search, chord families, real occurrences, inversions, and fingerings; filters,
diagnostics, partial matches, and relationships are collapsed below.
The live readout above the HexBoard follows the shared player's held and Shift-latched
voices. It matches complete register-sensitive note sets from the finite 2–8-tone
catalogue; extra distinct notes do not receive a partial chord label. Transposing
the entire set preserves its label, while moving an individual note by a period
changes its voicing identity.

## HexBoard layout and period wrapping

`hexboard.mjs` owns the 140-button physical grid (seven command positions and 133
note buttons), musical axes, layout reflections, board construction, filling,
alternatives, interval overlays, and export. Physical staggered geometry is fixed as
`x = 2 * column + rowParity`, `y = row`. Musical axes are integer coordinates with
determinant ±1 so the unwrapped layout covers the full rank-2 lattice.

With Period Wrapping **Off**, keys retain the true globally isomorphic rank-2
lattice. With wrapping **On**, `hexboard-wrapping.mjs` places a canonical copy of
the selected scale and translates copies by an integer physical placement vector.
Native period continuation still extends in both directions, so one scale degree
may appear on multiple buttons.

Wrapped keys preserve `baseM`, `basePitch`, degree, base subset, MOS layer, color,
and chord identity. `copyRegister` is a placement coordinate. The sounding register
is `copyPeriods + extensionRegister + globalRegister`, and sounding cents are
`basePitch + register * p`; the derived existing coordinate is
`[baseM[0] + register, baseM[1]]`. No third temperament rank is introduced.

HexBoard colors support MOS layer colors plus per-button and per-scale-degree
overrides. A button override takes precedence over its degree override, which takes
precedence over the MOS layer color. Degree overrides color every physical copy of
that scale degree; all three color layers persist in session files and HexBoard
exports.
Per-button and per-degree overrides clear when the temperament mapping, target
scale/mode, or board geometry changes. Loading a named saved layout restores that
layout's own overrides; MOS palette and layer colors remain independent.

Automatic placement prefers collision-free vectors and, when the scale admits one
linear degree order, aligns register changes with the scale wrap from the last
degree to degree zero. Manual column/row vectors and signed period shifts are
available. Overlaps are shown explicitly, disabled, and block export. Period labels
are optional and off by default. Horizontal and vertical physical-axis flips are
independent and transform saved manual placement vectors consistently. Wrapped
layouts are locally, not globally, isomorphic.

## Ranked layouts and saved layout presets

Play opens with one Layout dropdown. Saved named layouts appear first. Ranked
recommendations are searched only after the user opens the collapsed Search
recommended layouts section and starts a search; results then appear in the same
dropdown in descending score order. Changes to scale, harmony or board mapping
clear stale results and require another explicit search. Each ranked option
shows its rank, integer score, base size, family, orientation/reflection, and a
chromatic direction when fully supported. Score details explain the current
board's individual metrics. All manual geometry controls remain in collapsed
Advanced Layout Options. Choosing a candidate retains chord targets and MOS
palette/layer colors, while clearing per-button and per-degree overrides. Loading
a saved preset restores its own button/degree colors.

`layout-targets.mjs` adapts canonical realizations, imported finder materials,
and selected keys, plus the filtered v2 chord catalogue after discovery finishes.
Catalogue types use canonical compact inversions at all available roots; equivalent
tempered types remain grouped by the catalogue. `layout-candidates.mjs` searches up to five usable MOS bases,
six rotations, reflections, and automatic placement in the existing Bosanquet,
compressed, and period/generator families (at most 133 before deduplication).
`layout-direction.mjs` defines true chromatic motion: adjacent degrees along one
physical hex axis with the correct ascending tuned scale step, including the
period boundary. It reports the longest run, run from degree zero, transition
coverage, and edge consistency. A generator axis alone does not count. MOS base
quality favors 5–9 notes and a step-size ratio near basic L:s = 2:1.

`layout-evaluation.mjs` also measures melodic step distance, chord coverage,
complete voiced fingerings, best hex diameter, count of fingerings within four
hex steps, pitch-direction consistency (prefer rising right/up), and repeated
access. `layout-profiles.mjs` now owns one weighted ranking configuration; the
old four-profile winner interface is removed. `layout-recommendations.mjs`
returns the full ranked list. Worker/UI adapters preserve cached geometry across
chord changes and reject stale results. Search preserves current orientation,
wrapping mode, tuning and scale. Catalogue harmony scores average the desired
chord types; when a chord is selected, its preserved voicing receives half the
harmony/playability vote and the catalogue receives half. The details show how
many desired types have complete and easy fingerings. Physical reach remains a heuristic.

`layout-preset-data.mjs` validates named configurations and source context;
`layout-presets.mjs` manages async save/update/rename/delete. `/api/layout-presets`
reuses the existing revision-protected preset store under a separate layout scope.
No schema migration is required. Presets are site-persistent across devices and
separate from temperament presets. They capture geometry, MOS palette and growth,
custom layer/button/degree colors, plus target scale/mode; loading preserves the
active tuning. One saved layout can be set as each mapping's default; it is selected
when entering that temperament, and shown first in its saved-layout list. Default
selections use a separate revision-protected site-persistent settings record, so
they do not rewrite layout presets or need a schema migration. Incompatible
mappings or invalid retunings are shown disabled. Saved preset IDs survive session
save/restore, while sessions retain the complete current board configuration
independently of backend access.

## Audio, persistence, and shared state

`audio.mjs` is the only audio engine. It owns one lazy Web Audio context, frequency
conversion, range checks, envelopes, chord/sequence scheduling, held
voices, cancellation, Stop behavior, and cleanup. UI and HexBoard player modules
own selection/highlighting and Shift sustain, but do not create oscillators.

Built-in and saved temperaments appear in the same Discover selector. Built-ins
come from `catalog.mjs`; saved snapshots use site-scoped D1 records with
optimistic revisions and do not require sign-in. Session files remain
`temperament-lab-v1` and preserve the primary temperament, views, linked JI
settings (odd limit, optional prime limit or prime subgroup, and tolerance),
material, comma search, chord state, and HexBoard settings. Older two-temperament
sessions restore their primary temperament and ignore retired comparison data.
Pre-v5 sessions with an unset prime limit migrate to the new
Temperament basis default; newer sessions preserve an explicitly unset filter.
Compatibility aliases and narrow session migrations are intentional.

## Completed migrations and removed systems

- Shared pitch/rational/cache/theory helpers, audio, and styling replaced duplicate
  calculations and playback paths.
- Generated scales were generalized beyond MOS to two-step, three-step, and all
  collision-free generator stacks.
- Period wrapping became a HexBoard placement layer with automatic/manual
  displacement, ordered registers, duplicate physical copies, and actual-period
  pitch output.
- Chord engine v2 replaced and removed the old catalogue engine and runtime switch.
- The deprecated two-temperament Compare flow and its A/B workspace paths were
  removed; older sessions continue to load their primary temperament.
- JI odd/prime-limit and tolerance ownership was centralized; one exact filter
  engine powers all JI target and candidate searches, and duplicate Play controls
  were removed. Basis-diamond default-scale and milestone searches deliberately
  remain independent of the optional prime-limit filter.

## Current boundaries and architectural issues

- `app.mjs` still contains matrix/target renderers and substantial session/event
  orchestration. Extraction should precede any broad controller rewrite.
- Several controller tests use source extraction and mocked DOM contexts. Core
  calculations have strong regression coverage, but full browser, keyboard,
  screen-reader, and acoustic acceptance remain manual.
- The material collection can save, play, inspect, and place scales/chords. A chord
  progression and melody/phrase composition sequencer is not implemented.
- Product limits include 256 scale notes, bounded chord discovery, 2–8-tone exact
  chord input, 20,000 retained physical placements, and 133 playable HexBoard
  buttons.

## Verification map

`npm test` runs every top-level `tests/*.mjs` suite. Important coverage includes
tuning methods and non-octave periods, frozen refactor outputs, shared JI controls,
matrix spans, generated scales, chord identity/projection/occurrence/discovery/
realization/session compatibility, HexBoard geometry/flips/colors/player/export,
period order/wrapping, audio lifecycle, presets, legacy-session migration, and
workflow structure.
