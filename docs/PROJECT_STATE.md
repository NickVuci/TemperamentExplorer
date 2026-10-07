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

A compact Temperament, Tuning, and Scale/Mode setup row sits outside the tab
panels and remains available on Discover, Play, and Create. Advanced temperament
controls contain comma search and direct mapping input.

- **Discover** owns the analysis workspace.
  Analysis opens on Interval Matrix and also provides JI-target tonality diamonds
  and generated-scale details. A manual chord-inspection view remains reachable
  from interval workflows but is not a primary tab.
- **Play** owns the HexBoard target scale/mode, layout settings, the v2 Scale
  Chords catalogue, chord realizations/fingerings, temporary scale/chord highlights,
  playback, and HexBoard export.
- **Create** hosts the composition suite MVP (see "Composition suite" below). The
  material collection is also available there. Arrangement, recording, tuning
  conversion, account saving and WAV/MIDI export are not implemented.

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

`ji-monzo.mjs` owns bounded exact ratio factorization and integer matrix mapping.
`harmonic-context.mjs` builds immutable mapping-only records and versioned keys
from the basis/matrix, canonicalizing basis-column permutations only in the key;
its kernel witnesses use exact matrix multiplication, never tuned cents or comma
labels. The B harmonic interface uses these records for catalogue, selection and session
handoffs; A compatibility consumers retain their earlier local key formats.
`harmonic-equivalence.mjs` now exposes exact, period and mapped-octave policies
with exact removed-lift certificates and translation/permutation-invariant set
keys. The v2 chord projection retains its older period-class compatibility path
until a later catalogue migration.
The same shared module offers explicit exact-JI and octave-family identities,
with input-member links and reciprocal duals. Existing `ji2:` fingerprints remain stable. B live recognition adds complete
octave-family matches while retaining every played full coordinate.
`harmonic-types.mjs` now defines JSON-safe validation boundaries for mapping,
tempered shape, selection and ET assessment records, and dependency-specific
keys for tuning, target set, scale/mode and layout. B Discover/Play, diamond handoffs and optional material/session provenance use
these boundaries. Invalid optional provenance cannot invalidate valid sounding material.
Target-set IDs encode the exact sorted prime subgroup alongside odd limit,
prime filter and representation policy; they are independent of the tuning
matrix.
`ji-limit-engine.mjs#targetSet` now produces immutable octave-folded or native
exact JI target sets with source-pair and register-lift provenance. Existing
diamond APIs remain on their octave display behavior. `targetId` reduces the
final octave-folded ratio after applying powers of two, so reciprocal aliases
such as 5/8 and 5/4 resolve to the same canonical target record.
`harmonic-intervals.mjs` projects those targets through the exact integer map,
retaining enharmonic identities per coordinate and keeping actual-tuning error
as a separate derived view. `engine.mjs#createTargetClassifier` and
`assignments.mjs` now use the shared projection/error path; the legacy response
shape and tolerance precedence remain.
`harmonic-mappings.mjs` classifies validated alternative contexts by exact
mapping identity, unimodular coordinate rebase, preserved-column extension, or
changed mapping. It adapts `assignments.mjs#checkAssignments`, keeps incomplete
extensions unresolved, and can preview a whole chord under one candidate
context without changing active state. It also enumerates bounded one-prime
extensions from generator coefficients −16 through +16 by default (with
explicit 32/64 bounds), ranks them using target tuning error, and returns at
most 20 fully validated contexts. B Discover → Chords previews these contexts and requires explicit adoption.
Adoption preserves every existing mapping column and the current period/generator tuning.
`harmonic-approximations.mjs` searches a bounded temperament lattice for
incidental interval approximations without changing canonical mappings. It
retains canonical tuning error as a separate baseline, reports optional exact
target-set collisions, and caps searches at generator coefficient ±256 (±32 by
default). It also supplies shared exact-coordinate error records and ranking
policies. `assignments.mjs#approximationDomain` exposes the unbounded search
descriptor, finite ordered scale-dyad coordinates, and tonic-relative mode-note
coordinates (respecting the displayed matrix span). The existing assignment
and diamond approximation functions now adapt through this shared engine with
their output ordering and mapped-secondary behavior preserved; unified
catalogue UI migration remains future work. The same module exposes
`searchChordApproximations`, which selects bounded root-relative member
coordinates and derives each dyad from vertex differences. A fully mapped JI
chord is kept as a separate comparison; an incomplete canonical projection has
no aggregate improvement score. Candidate shapes preserve exact interpretation
and dual-family links, tuning errors, and optional exact target-set collision
records. The default search uses generator bound ±32, eight candidates per
member, a 10,000-combination cap, a 250,000-dyad-derivation cap, and returns at
most 12 shapes. Shortlist/cap exhaustion is reported as partial. B Discover → Chords compares both interval and whole-chord alternatives
against the canonical mapping without adopting incidental coordinates into that map.

`harmonic-dyad-graph.mjs#buildDyadIndex` indexes every mapped target
interpretation by exact octave class for octave-folded target sets, or by full
coordinate for native-exact target sets. It keeps enharmonic JI identities as
parallel interpretations of one graph vertex, retains non-unison targets that
collapse to unison, links reciprocal target IDs, and reports targets outside
the active mapping subgroup separately. `domainsForShape` returns all directed
dyad domains for a supplied coordinate shape and distinguishes empty-edge
non-dyadic shapes from degenerate repeated vertices. This layer is tuning
independent and applies no cent threshold. `enumerateDyadicShapes` now emits
deduplicated rooted compatible cliques from that finite vertex graph, defaulting
to triangles and tetrads. It reports per-query neighbor, domain-check,
candidate-shape and search-node bounds through its live progress envelope;
neighbor truncation or any early stop is marked partial. Candidate generation
does not run JI lifting or ET assessment and does not depend on a selected
scale.

`harmonic-ji-lift.mjs#findCoherentJILift` searches the finite root-vertex
interpretation domains with pairwise domain consistency and deterministic
smallest-domain branching. Octave-policy JI labels compare exponent vectors
modulo only the prime-2 generator; native-exact labels compare the full
monzo. Successful witnesses restore the exact mapped octave lift (including
divided-octave period vectors) for every vertex and dyad. Exhaustive failure,
cancellation, state exhaustion and compatibility-check exhaustion are
separate outcomes; the latter three return `unknown`, never a negative proof.
`harmonic-et.mjs#assessET` converts complete solver results into target-set-relative assessments: `not-dyadic`, `ji-liftable`, `essentially-tempered`, or `unknown`. ET records include per-edge domain counts, a replayable bounded-search certificate, and representative cycle conflicts. `cycleWitness` restores exact interval lifts before summing monzos; a raw cycle that maps to an octave is corrected by the recorded prime-2 lift before kernel validation. `verifyETEvidence` recomputes kernel cycles and replays complete negative searches under the recorded context and bounds. Changing JI limits rebuilds the assessment context while leaving the shape identity alone.
`harmonic-et.mjs#discoverDyadicHarmony` now joins bounded shape enumeration and
assessment in an async, immutable batch stream. A JI-liftable shape carries a
generic exact interpretation with its existing `harmonicIdentity` family ID,
basis-order monzos, root-relative dyads and register lifts; shape identity stays
separate from JI identity. ET and solver-unknown rows remain separate. Search
totals, candidate counts, enumeration coverage, cancellation and incompleteness
are reported in each progress snapshot and the final envelope; only a fully
searched empty result is `complete-empty`. Defaults cap per-shape work at
100,000 states / 1,000,000 compatibility checks and total work at 500,000 /
2,000,000, in addition to the enumerator's finite bounds. The job checks
cancellation at shape and batch boundaries, polls the synchronous solver's
cancellation callback, and yields to the event loop between batches and during
8 ms time slices. It does not cache streamed results. This producer feeds the shared Worker adapter and the explicit B ET search. One
deterministic coherent lift is retained per candidate shape, not every possible
JI labeling; the catalogue query preserves other JI chord identities
from their existing producer.

`harmonic-catalogue.mjs` now joins interval, curated/line/subset JI, bounded ET,
mapping-extension and approximation producers through `queryCatalogue`,
`getHarmonicEntry` and `resolveSelection`. Exact JI labels remain separate rows
within shared shape/family groups. Custom lookup precedes browse caps. Catalogue
records have no scale-occurrence or board-placement dependency; target eligibility,
mapping and tuning quality remain separate fields. Pagination binds to the full
query context, and bounds/unknown/cancellation remain visible.
`harmonic-catalogue-jobs.mjs` owns query/ET/approximation request envelopes,
latest-request rejection, Worker/fallback dispatch and a per-workspace bounded
LRU. Only complete results within the byte cap are cached. Tuning, target sets,
equivalence and producer bounds enter the context; scale/mode/layout do not.
`harmonic-cooperative.mjs` drives the same generator algorithms synchronously
for compatibility or asynchronously for jobs. Graph traversal, CSP states/
compatibility checks and chord-approximation combinations yield every 256 work
items. The existing `chord-v2-worker.mjs` supports these jobs beside the unchanged
legacy Play discovery envelope. B uses these envelopes; A retains the legacy Play envelope for comparison.

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
mapping, and changes to shared JI limits use that default. Retuning preserves
both Discover and Play scale sizes and modes while refreshing analysis. The layout
initializes its independent target scale/mode from the same result; its base subset
defaults to the first interval-complete MOS when that MOS fits the target. Manual
scale/mode/base edits survive ordinary redraws; a changed mapping/target context applies
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

Its `approximationDomain` adapter distinguishes bounded temperament-lattice
search, all ordered scale-matrix dyads, and tonic-relative notes of the selected
mode. Finite domains use `matrixScale`, so the optional whole-octave span for
divided-period temperaments applies consistently. Legacy best-approximation
functions are compatibility adapters over the shared error and ranking code.

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

`tonality-diamond.mjs` draws exact shared-edge cell fills and clips highlights to
their rhombi. A single noninteractive grid layer paints each axis boundary and
ratio-bar row once after all cells. Crisp tile fills avoid antialias blending
between neighbours; the shared grid supplies smooth borders. Cell
styles have one canonical block; per-cell outlines and divider strokes are removed.
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
Transfers retain sounding integer coordinates. A retains its distinct-degree
scale-fit handoff. B Chords accepts 2–8 source cell voices, including repeated
or coincident coordinates, without changing the Discover scale. Larger B
selections can be collected as scales. `diamond-harmonic-selection.mjs` records
exact cell IDs, ratios, source coordinates and whether the sound is canonical
or an alternative approximation. Reverse links require exact sounded ratios
and coordinates; an unavailable current display is reported explicitly.
No-fit and unavailable-note states remain explicit; handoff does not imply a
physical fingering exists.
Selecting or simultaneously playing distinct diamond pitches replaces the single
interval details with the JI chord label and one column per distinct cell interval.
The readout uses the current playing cells or selection and clears when both are
empty. Single intervals and chords share the same compact table renderer and row spacing,
with mapping metadata retained only for accessibility. The table stacks each cell's
JI ratio, JI cents, sounding tempered cents,
and signed deviation, preserving the cell's reference and sounding register. JI rows
share one continuous divider. The readout has a transparent background and occupies
normal flow outside the SVG, so growing selections cannot obscure playable cells.
On desktop, a fixed-height band keeps live chord changes from moving the SVG under
a held pointer; oversized data scrolls within that band.
Its columns use their intrinsic value widths, with contained horizontal scrolling
for large chords. A fixed heading row reserves space for chord notation in both
single-interval and chord readouts. JI rows are white; each tempered value and
signed deviation uses its own diamond cell’s shared error colour. Total error
remains the sum of absolute errors across all note pairs in the tooltip;
unavailable members never receive an aggregate score. A single held
pitch restores interval details, and a persistent selection returns after release.
Fixed-denominator lines use otonal spelling
(such as `4:5:6`), fixed-numerator lines use the reciprocal utonal spelling
(`1/6:5:4`), and mixed selections use their exact otonal spelling. Chord labels
support 2–8 distinct JI pitches; larger selections remain available for transfers
and show every distinct interval column. Aggregate error remains in the colour
tooltip, while visible deviations contain only signed cents.

## Chord system

Discover → Chords always opens B · Harmonic discovery. The former classic-view
selector and local preference are removed; legacy A/B session values are ignored
when loading. The manual inspector remains available for direct coordinate
inspection, and `chord-session-v2-adapter.mjs` continues migrating compatible
saved sessions.

`harmonic-catalogue-ui.mjs` owns B Discover → Chords, independently of the board.
It browses mapped JI chords, intervals, target-relative ET assessments, compatible
mapping extensions and better approximations. Shared JI limits remain one state
owner. Search can inspect exact 2–8-voice spellings outside browse limits.
Scope filters compare whole-temperament availability, Discover/Play anywhere
occurrence and tonic anchoring. Occurrences/voicings are resolved lazily through
the Stage 8 engine; tuning tolerance never removes a mapped B identity. ET
requires Start and retains explicit bounds, completeness and unknown evidence.
Changed contexts disable stale actions immediately.

`harmonic-selection.mjs` adapts these records into validated selections containing
full voice coordinates and optional JI metadata. `harmonic-play-ui.mjs` preserves
the sent voicing and independent Play scale. Scale fit is explicit and affects
Play only. Roots are selectable; exact board placements are computed only for
selected harmonies, with the top three shown first and no implicit fingering choice.
A and the manual inspector remain as compatibility views over shared services.
`harmonic-inspection.mjs` owns coordinate-chord inspection for manual and board
consumers: the shared target classifier supplies tuning-quality overlays;
`buildDyadIndex` and `assessET` supply mapping domains and coherent-lift truth.
Repeated harmonic classes preserve sounding voices without a false ET claim.
Manual period-placement changes feed full voiced coordinates to assessment.
The same bounded finite-coordinate candidate search powers degree and board
adapters, with reach as a physical predicate. Its defaults are 250,000 visited
nodes, 20,000 occurrences and 1,000 groups, and truncation is displayed explicitly.
`chords.mjs` contains only degree/session wrappers; `bestChordTarget`, the old
independent occurrence loop and manual search cache are removed. Historical
search JSON remains stable while nonenumerable bounds are available to the UI.
Legacy pins remain usable from the manual inspector. The classic catalogue
presentation and historical session adapter are retained intentionally; no retired
pre-v2 analytical engine is reactivated.

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
  JI identity and alternate matches. B also indexes complete octave families
  (native exact families without prime 2), permitting arbitrary played registers
  while retaining those full sounding coordinates. Extra notes cannot get a
  triad-subset label. B mapping matches remain eligible above tolerance; the
  canonical spelling error is disclosed separately. The readout does not select
  a harmony or claim acoustic purity. A keeps register-sensitive tolerance gating.
- `chord-occurrence-v2.mjs` finds exact occurrences in the selected scale and mode.
  Occurrence uses mapped coordinates, never cent tolerance or board availability.
  `searchShapeOccurrences` is the shared JI/coordinate-only engine. It searches
  period-repeated membership and retains every source member, octave residue,
  degree and explicit period lift. Shape/scale context owns occurrence IDs;
  `tonicAnchored` and the tonic subset are separate from anywhere-in-scale counts.
  `searchOccurrences` preserves legacy JI IDs/order/counts as a compatibility
  adapter. `analyzeShape` supplies shape analysis without requiring a ratio root.
- `chord-discovery-v2.mjs` searches a bounded catalogue of curated chords, harmonic
  segments, and reciprocals, with shared odd/prime-limit filters and worker-backed
  progress/cancellation.
- Otonal and exact reciprocal utonal forms are displayed as one family while
  retaining distinct exact identities. Compact utonal spelling uses forms such as
  `1/6:5:4`.
- `chord-realization-v2.mjs` applies root, inversion, harmonic-spelling (default),
  compact/open spacing, ordering, period shifts, and register bounds, then finds
  alternate physical fingerings without changing occurrence truth.
  `realizeShape` and the `realizeChord` adapter use `chord-voicings.mjs#shapeVoicings`.
  Realizations preserve all voices by default, including repeats, octave copies
  and coincident mapped coordinates; optional `memberPolicy: 'exact-unique'`
  explicitly removes full-coordinate duplicates. `voices[]` retains source/member
  correspondence and complete reference-coordinate lifts. Octave moves use actual
  M(2), including a generator component; native references such as 3/1 are labelled
  as reference moves. JI labels/errors are optional overlays and use the actual
  sounding differences against ideal reference cents. Coordinate-only results
  have null JI quality fields. Board placement remains a separate step.

No scale occurrence, no playable fingering, outside-basis projection, tempered
cardinality collapse, and poor tuning are distinct states. A Play retains its
search/family/voicing catalogue. B Play presents the selection sent from Discover
and explicit occurrence/fingering choices. The live readout follows held and
Shift-latched voices in both modes; label interpretation never changes playback
or persistent selection.

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
and selected keys, plus the filtered catalogue after discovery finishes. In B,
`layout-targets.mjs#harmonicCatalogueLayoutTargets` consumes shared JI/coordinate
shapes and gives each abstract shape one type vote; aliases and compact inversions
remain variants, so they cannot inflate desirability weight.
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
Each voice routes oscillator → attack/decay gain → independent release gate →
shared output protection. Release uses a 60 ms cosine fade to exact zero; it never
cancels active attack/decay automation. Stop can override a future release and
cancels future sequence notes before onset. The output shaper is linear below
0.6 peak and smoothly bounds excessive polyphony below 0.95. Held onsets have a
5 ms scheduling lead. `scripts/audio-render-audit.mjs` supports optional PCM
verification with an external software Web Audio renderer; `tests/audio.mjs`
covers the lifecycle and pointer integration without that dependency.

Built-in and saved temperaments appear in the same Discover selector. Built-ins
come from `catalog.mjs`; saved snapshots use site-scoped D1 records with
optimistic revisions and do not require sign-in. Session files remain
`temperament-lab-v1` and preserve the primary temperament, views, linked JI
settings (odd limit, optional prime limit or prime subgroup, and tolerance),
material, comma search, chord state, and HexBoard settings. Workflow version 8
adds optional B catalogue/Play selections, A/B mode and harmonic material
provenance. Custom spellings, repeated voices and selected voicing controls
round-trip. Historical ET metadata is not shown as a current proof after restore;
ET reassessment requires a fresh explicit search. Older two-temperament
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
- The classic catalogue presentation remains for the requested A/B comparison.
  Manual/board analytical rules are fully migrated to shared services; older
  session and degree APIs remain intentional compatibility adapters.
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

## Composition suite (MVP)

The Compose tab uses the approved **Compose and practise** layout: one four-bar
chord/melody time ruler above three responsive panels (saved HexBoard, selected
chord and compact exact fingerings, practice). Melody bars can be selected, moved
between degrees or resized on a sixteenth-note grid; each drag is one undoable
command. Chord inversion raises the lowest sounding voice by the actual
temperament period and preserves its tone identity. Missing exact fingerings are
shown explicitly. The note list keeps outside-scale notes editable.

Practice supports phrase stepping, visible-bar / selected-chord / whole-project
loops and 25–100% playback speed. Speed is runtime UI state: it does not rewrite
the saved tempo or context. Playback paints the playhead and sounding notes in
place. The composition board and the physical HexBoard read the composition's
saved geometry and tuning while Compose is active; mouse/device auditions use
the app's central tonic and sound through the shared audio engine. The header Audio menu controls all tabs; legacy project sound fields remain readable but do not override playback. Follow lights highlights
exact-coordinate matches. This remains guided playback without performance
judging. `composition-board.mjs` reuses `buildBoard`, `chordPlacements` and the
existing colour engine; it does not define another pitch or fingering engine.


Create opens one composition at a time: a chord progression built from collected
chords, a scale-degree melody grid, a looping tuned transport, and a game-ready cue
timeline. The authoritative plan, frozen limits and action log are in
`docs/COMPOSITION_SUITE_PLAN.md`; the format and ownership decision is D-032.

| Concern | Owner |
| --- | --- |
| Project schema, validation, limits, commands, bounded undo | `composition-project.mjs` |
| Musical context snapshot, pitch resolver, degree annotation, guarded chord import | `composition-context.mjs` |
| Clip expansion, integer-tick timing, loop/seek/pause pump | `composition-transport.mjs` |
| Voice groups, scoped scheduling/cancellation, clock snapshot | `audio.mjs` (additive; legacy preview methods unchanged) |
| Cue timeline, board-cell lookup, practice-target export | `composition-cues.mjs` |
| Logical key down/up events with hold ids | `hexboard-player.mjs` (`onInput`, optional) |
| Workspace markup / controller | `composition-view.mjs` / `composition-ui.mjs` |
| `temperament-lab-v1` / `-v2` session envelope rules | `composition-session.mjs` |

Invariants. A note is stored once as an exact integer coordinate `[period,
generator]` (signed zero canonicalised); cents are `a*p + b*g` and Hz are
`tonicHz * 2^(cents/1200)` through `pitch.mjs`/`audio.mjs`. Degrees, board cells and
button numbers are annotations, never identity. A project freezes its own context
(complete temperament state, resolved tuning, tonic, Create scale, layout); the app
selection changing never mutates it, and "Load the composition's setup" is an
explicit action through the app's own state loader. Collected chords from a
different tuning are refused, never retuned. Timing is 960 ticks per quarter; seconds
are computed from integer ticks so loops do not drift. Project edits pause
playback, keep the position and use the edited project on the next Play. Auditions in
Create use the scoped `preview` voice group and never cancel the transport; global
Stop/Escape cancels every group.

Cue seam. `buildCueTimeline` yields one cue per sounding tone with its coordinate,
cents, Hz, degree/register, onset/release (ticks and seconds) and every enabled
layout key whose `buildBoard` coordinate matches exactly. A pitch with no key stays
audible and carries a stated reason. `toPracticeTargets` exports a versioned
`temperament-lab-practice-targets-v1` file with an explicit match mode
(`exact-coordinate`, `any-degree`, `button`). Judging, latency calibration and the
physical HexBoard transport belong to the separate HexBoard integration plan; nothing
here scores a performance.

Sessions. A whole-app save with an open composition is `temperament-lab-v2` with a
`composition` field; saves without one remain `temperament-lab-v1`. The loader
accepts both and validates the composition as a candidate before restoring any other
session part. Standalone files use `temperament-lab-composition-v1`.

Known limits. One chord track and one melody track with one clip each (the schema
allows more); same-key presses from two sources share one voice; the melody grid is
fixed at sixteenth-note resolution; no recording, arrangement, mixing, conversion,
account storage or export. Browser behaviour was exercised in headless Chrome only
(see the plan log); listening, Edge/Safari, screen readers, physical HexBoard and DAW
use are unverified.

## Physical HexBoard connection

The header's **Connect HexBoard** button opens Web MIDI (Chrome/Edge, SysEx permission), finds the
port named "HexBoard", puts the board in delegated-control mode and takes over its keys and LEDs;
Disconnect (or closing the page) blanks the LEDs and returns the board to normal. Holding the
board's encoder for 5 seconds also returns it to normal; the app then shows it as disconnected and
stops reading its notes. Nothing is persisted and the board always starts disconnected.

| Concern | Owner |
| --- | --- |
| Delegated-control bytes, key/encoder decoding, colour to LED conversion | `hexboard-protocol.mjs` |
| Web MIDI port, enter/exit, changed-LED sending, unplug detection | `hexboard-device.mjs` |
| Key routing, the LED picture, the 100 ms follow and 1.5 s refresh timers | `hexboard-sync.mjs` |
| What the board should show (colours, highlights, dimming) | `hexboard-ui.mjs#deviceSnapshot` |
| Wiring and header status | `app.mjs` |

Keys. Button index equals the layout's key index (`0..139`); after entering host mode the app
resets the board's delegated note map so another host's mapping cannot change that encoding. The
board's 5-second encoder hold, reported only as a release, is recognised by an encoder release at
least 4.8 s after its press and ends the connection. On the Play view a board press is
dispatched as a pointer press on that key's SVG node with its own pointer id, so sound, selection,
chord picking, the live chord readout and Shift-free release behave exactly as for a mouse. When the
Play board is not on screen the key sounds directly at its layout pitch. Command keys and disabled
keys are silent. A board encoder press acts like Escape (stop and clear highlights).

Lights. Every enabled key always shows its own layout colour, so the layout stays visible whatever is
highlighted. Ordinary keys are at half brightness; while a chord placement, selected chord keys or a scale
highlight is active, its keys go to full brightness and the rest drop to 30% (still clearly lit). The
screen's gold/purple/mint highlight colours are not used on the board. Keys being played, by the board or
the mouse, are white. Disabled and command keys are dark.

Keeping the board current. After entering host mode the app waits 300 ms for the board to settle,
then paints. LEDs travel in paced messages of at most 32 LEDs. While connected, the app is sampled every
100 ms and changed LEDs are sent immediately; the whole picture is resent every 1.5 s, so a message the
board missed repairs itself and nothing depends on delivery being acknowledged (the protocol has no
acknowledgement). Disconnecting blanks the LEDs in the same small messages, then exits host mode.

Limits. One board; port chosen by name only; no manual port picker; LED colours are the layout's own
(the firmware applies its own brightness limit and gamma); not tested on a physical board (see D-033).

## Fingering practice

A panel at the top of the Play view turns the chord on the board into a short game: pick how many of
its fingerings to practise (3, 5, 10 or all), press Start, and the first fingering lights up; play
all its keys together and the next lights up, until the set is finished (time, wrong keys and skips are
shown; Skip and Stop are available). The panel is hidden and any running game ends when the player leaves
the Play view, changes the chord, or clears the highlight (Escape).

| Concern | Owner |
| --- | --- |
| Rules: exact-set completion, lifting keys between fingerings, wrong keys, skip, restore | `fingering-game.mjs` |
| Panel markup and events (polls every 250 ms, redraws only on visible change) | `fingering-game-ui.mjs` |
| The chord's fingerings and lighting one | `hexboard-ui.mjs#fingerings` / `#showFingering` (harmonic selection or finder) |

Lighting reuses the Play board's normal highlight, so the screen and a connected HexBoard both follow
without any extra code. Held keys come from the board player's callback, so mouse and HexBoard play are
treated the same. A fingering counts only when exactly its keys are held; extra keys block it, and keys
held from the previous fingering must be lifted before the next one counts. The game's order is the
board's own (nearest the tonic first). Not covered: scoring or timing targets, a saved history, and
fingering practice away from the Play view.

## Harmonies with a key

A collapsible panel at the top of the Play view lists, for the key selected on the board (a mouse click or a
HexBoard press), every chord of 3 or 4 notes that includes that key within a chosen reach (3-10 keys). Each
row gives the chord's JI ratios, the role the key plays (root or another note), how many places on the layout
it can be played with that key, its worst tuning error and how many of its intervals map. Choosing a row lights
one place on the screen and on a connected HexBoard; Previous/Next step through the places and Hear sounds them.
The chosen chord also becomes the Fingering practice chord, so its fingerings can be practised as a game.

| Concern | Owner |
| --- | --- |
| Exhaustive key-centred chord search, same pair rules as the board chord search | `hexboard-chords.mjs#chordsWithKey` |
| The harmonies query, lighting one, hearing one | `hexboard-ui.mjs#harmoniesAt` / `#showHarmony` / `#hearKeys` |
| Panel markup and events (polls every 250 ms, redraws on visible change) | `key-harmonies-ui.mjs` |

The search starts from the key, so it is small and complete; the whole-board chord search stops at result caps
(20,000 places) when the tolerance or reach is wide and can then list fewer chords. Chord quality uses the app's
odd limit and tolerance. A key that is disabled, or a setting the search rejects, shows a message instead of a
list. Not covered: chords of other sizes, "other approximations" targets, or saving a harmony list.

## Responsiveness

Switching between Discover and Play must render once, completely. The practice panels (Fingering practice,
Harmonies with a key) therefore update in the same event as the tab switch (a document-level listener registered
after the app's own handlers), with a 250 ms poll only as a fallback for changes that do not come from a click or
key press. The read-only polls (LED sync, fingering game, harmonies panel) share one cached board
(`hexboard-ui.mjs#boardFor`, rebuilt only when the layout signature changes), so idle cost stays near zero.

