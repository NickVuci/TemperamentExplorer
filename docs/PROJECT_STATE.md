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

Temperament and Tuning controls sit in the app header on every tab; their advanced
options (comma search and direct mapping input; tuning-method settings and Optimize
period) open as panels below the header and close when the page is clicked elsewhere.
There is no separate Scale/Mode row: Discover's scale module owns those controls.
The header floats at the top of the window while the page scrolls (above phone width; on
phones it scrolls away). All Discover panes scroll with the page. The directory and analysis match the centre panel’s measured height and scroll their content internally; they are not sticky.

- **Discover** is one screen with no sub-tabs (`discover-unified.mjs`, layout only):
  the harmony catalogue's directory on the left, the tonality diamond or interval
  matrix (toggle) in the centre, chord analysis on the right, and the scale module
  (Scale/Mode, advanced scale options, coverage milestones and scale details) along
  the bottom. Approximation settings (odd limit, prime limit/basis, approximation
  source, maximum error) sit in a collapsible section below the workspace; Play
  shows the same controls in its header. The catalogue's `renderParts` supplies
  the directory and analysis, and a catalogue refresh replaces only those two panes.
  The analysis pane shows the selected catalogue harmony, or the manual note
  inspector when it is opened from the directory, a matrix interval or collected
  material; choosing a harmony or "Back to harmonic catalogue" returns to the
  catalogue analysis. The centre borrows the diamond or matrix view's controls.
  Every handoff that used to open a Discover sub-view (diamond
  chord transfer, coverage milestones, tuning-target exploration, Browse harmony
  from Play) opens this screen. Saved sessions with any older Discover view restore
  into it, an old matrix view with the matrix centre; the centre choice is saved in
  session settings.
- **Play** owns the HexBoard target scale/mode, layout settings, temporary scale/chord
  highlights, playback and HexBoard export. Its page (D-041): a toolbar (layout, Export for
  HexBoard, Advanced Layout Options), the board with a collapsible Key data box (selected-button
  colours, inspector, axes and coverage), and a side panel with Now playing (live readout and
  keys selected as a chord, with Find places), one Chords panel and Fingering practice. The Chords
  panel has two modes. Chord → places: a directory search (Discover's lookup, `openInput`), the
  harmony sent from Discover with its occurrences and fingerings, and the places of the chord being
  placed (selected keys or a Note → chords pick). Note → chords: the chords on the selected key,
  below. The app mounts the Note → chords and Practice panels into their slots after each redraw.
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
labels. The harmonic interface uses these records for catalogue, selection and session
handoffs.
`harmonic-equivalence.mjs` now exposes exact, period and mapped-octave policies
with exact removed-lift certificates and translation/permutation-invariant set
keys. The v2 chord projection retains its older period-class compatibility path
until a later catalogue migration.
The same shared module offers explicit exact-JI and octave-family identities,
with input-member links and reciprocal duals. Existing `ji2:` fingerprints remain stable. B live recognition adds complete
octave-family matches while retaining every played full coordinate.
`harmonic-types.mjs` now defines JSON-safe validation boundaries for mapping,
tempered shape, selection and ET assessment records, and dependency-specific
keys for tuning, target set, scale/mode and layout. Discover/Play, diamond handoffs and optional material/session provenance use
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
most 20 fully validated contexts. The Discover harmony directory previews these contexts and requires explicit adoption.
Adoption preserves every existing mapping column and the current period/generator tuning.
`harmonic-approximations.mjs` searches a bounded temperament lattice for
incidental interval approximations without changing canonical mappings. It
retains canonical tuning error as a separate baseline, reports optional exact
target-set collisions, and caps searches at generator coefficient ±256 (±32 by
default). It also supplies shared exact-coordinate error records and ranking
policies. `approximation-compat.mjs#approximationDomain` exposes the unbounded search
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
most 12 shapes. Shortlist/cap exhaustion is reported as partial. The Discover harmony directory compares both interval and whole-chord alternatives
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
to triangles and tetrads. Each transposition class is yielded once, from the
rooting whose vertex-difference class list is least; a truncated neighbourhood,
which can omit that rooting, deduplicates by shape identity instead. It reports per-query neighbor, domain-check,
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
`harmonic-chord-space.mjs` classifies harmony by combinatorics instead of per-shape
search. Rooted on any member, a JI chord whose dyads all lie in the target set is the
unison plus a subset of the target classes, so `enumerateJIChordSpace` lists every
such chord (2–8 members, one per transposition class) as a clique enumeration over
the finite target set. It reads only the target set, subgroup basis and equivalence,
so temperaments sharing them share one cached enumeration, and a complete enumeration
up to a larger size serves every smaller size range. `classifyChordSpace`
maps each JI chord through the mapping (`temperedImage`; chords whose members merge
are degenerate and have no image), takes every tempered dyadic shape from the shared
rooted-shape enumerator, and labels a shape `ji` when some JI chord maps onto it
(all such chords attached) or `essentially-tempered` otherwise. This is the same
predicate as a coherent JI lift, verified shape-by-shape against `assessET` in
`tests/harmonic-chord-space.mjs`. If the JI enumeration reaches its node bound,
unmatched shapes are `unknown`, never ET; tempered-enumeration bounds make the list
incomplete without changing any listed status. `chordDyads` gives each member pair's
tempered class and every JI interval mapped to it. `assessET` remains the per-shape
proof used by the manual note inspector.

`harmonic-catalogue.mjs` now joins interval, curated/line/subset JI, chord-space JI/ET,
mapping-extension and approximation producers through `queryCatalogue`,
`getHarmonicEntry` and `resolveSelection`. Exact JI labels remain separate rows
within shared shape/family groups. Custom lookup precedes browse caps. The temperament-independent
part of JI rows (family, labels, dyadic status and chord-space orientation) is cached
per target set and subgroup basis, so a temperament change that keeps both only
projects existing JI chords into the new mapping; `mappedIntervals` likewise reuses
each target set's factorization per basis and each projection per mapping. Rows carry
only the dyadic status, not full dyad analyses, a slim interpretation (exact identity,
exact-dual input, presentation and provenance) and a slim shape; shape and family
groups list only shared shapes and families. The JI-row cache is keyed by spelling and
presentation as well as fingerprint, because repeated-member or reordered spellings
share a fingerprint. `projectChord` accepts `shapeKinds` so the catalogue projects
only the active equivalence. Catalogue
records have no scale-occurrence or board-placement dependency; target eligibility,
mapping and tuning quality remain separate fields. Pagination binds to the full
query context, and bounds/unknown/cancellation remain visible.
`harmonic-catalogue-jobs.mjs` owns query/approximation request envelopes,
latest-request rejection, Worker/fallback dispatch and a per-workspace bounded
LRU. Only complete results within the row cap (5,000) are cached. Tuning, target sets,
equivalence and producer bounds enter the context; scale/mode/layout do not.
`harmonic-cooperative.mjs` drives the same generator algorithms synchronously
for compatibility or asynchronously for jobs. Graph traversal, CSP states/
compatibility checks and chord-approximation combinations yield every 256 work
items. `chord-v2-worker.mjs` runs these jobs.

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

`default-scale.mjs` projects the first interval-complete MOS from that analysis, on
mode 1 (interval completeness is mode independent). A temperament with no such MOS
through 256 notes opens on the first 7–9-note MOS with a warning that it approximates
the selected limit poorly, or keeps its scale if it has none. Startup/reset, built-in/saved preset selection, new comma
mapping, and changes to shared JI limits use that default. Retuning preserves
both Discover and Play scale sizes and modes while refreshing analysis. The layout
initializes its independent target scale/mode from the same result; its base subset
defaults to the first interval-complete MOS when that MOS fits the target. Manual
scale/mode/base edits survive ordinary redraws; a changed mapping/target context applies
new defaults. Saved sessions and explicit material/chord loads retain their chosen
scale/mode, and saved HexBoard base settings are retained on restoration. A base MOS must still fit the target and
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
A Just intonation / Temperament switch above the diamond (saved with it) plays cells at
their exact ratios or at their displayed approximations. Switching retunes held and
sustained notes in place (`startVoice(...).retune`, `createHexboardPlayer().retune`)
without redrawing; the Play selection audition follows it, while collecting, placing
and chord handoffs always use the tempered coordinates.
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

The harmony directory is the only chord catalogue (D-039). The A/B mode flag and the
classic Play catalogue are removed; saved A/B values and old Play catalogue state are
ignored when loading. The manual inspector remains available for direct coordinate
inspection.

`harmonic-catalogue-ui.mjs` owns Discover's harmony directory and analysis,
independently of the board.
It lists one directory of JI and essentially tempered (ET) chords, relisted
automatically whenever the temperament, JI limits or size range change. A JI chord
is its octave-reduced pitch-class set: octave doublings and rotations (inversions)
merge into one row (`simplestRotation`). A rotation whose integer form starts on a power
of two (2^k:…, rooted on the harmonic fundamental) is preferred, so major is `4:5:6`
and `4:6:7` beats `6:7:8`; otherwise the smallest integer terms win. Both rules read the
otonal side of the rotation's exact otonal/utonal pair, so minor is `1/6:5:4`, and size counts distinct pitch classes. The row lists every merged spelling
as an alias and in `mergedInterpretationIds` (matched by `hasInterpretation`), so a
lookup, favourite or saved selection of any spelling opens or stars the merged chord;
chords outside the mapping subgroup, or whose rotation exceeds the exact-chord bound,
keep their typed spelling. Inversion and voicing belong to the chord panel. Because a
merged chord has no fixed root, the tonic scope lists occurrences that use the tonic as
any member (`tonicMemberOccurrences`), and sending a chord to Play whose source notes
fall outside the Play scale starts from its first occurrence there. JI
rows come from the curated/line producers plus chord-space chords, oriented otonal/utonal as the curated seeds are; ET rows are
the chord-space shapes no JI chord maps onto. A notes-from/to range (3–8, default
3–6) sets which sizes are listed. Size and type groups start collapsed; type
filters select JI, otonal, utonal, ambitonal (self-reciprocal chords that read the
same otonally and utonally), ET or custom lookups. Otherwise a chord is otonal when its
reduced harmonic form has the lower maximum odd harmonic than its reduced subharmonic
form (`4:5:6`: 5 < 15), and utonal when higher; equal maxima fall back to smaller term
sums. Favourites and recents store exact spellings; an ET row stores the
simplest root-relative JI spelling that maps onto its shape, so recalling it
returns that shape in the active temperament. The analysis shows a form badge (otonal, utonal, ambitonal, other JI,
essentially tempered, unresolved), the otonal and utonal spellings, pitch classes and
merged spellings, and the chord's rotations, each labelled in the chord's form
(a utonal chord's as `1/a:b:c`, otonal and ambitonal ones as `a:b:c`). The directory chord stays in the
heading with the selected rotation beneath it; choosing a rotation puts that note in the bass of the
focus and sounds it bass-first within an octave. It lists, for every member pair, the tempered
interval and each JI interval mapped to it with its tempering error, marking the readings a
JI chord uses, the commas closing an ET chord's conflicting cycles (`assessET`), and other
JI chords on the same shape.

Root and bass (D-042). A chord's root is the lowest note of its default rotation, the directory
spelling's member 0; its bass is its lowest sounding note. Wherever a placement fixes the root's scale
degree, the chord is written `root - chord` (`harmonic-bass.mjs#rootedChordName`): `0 - 4:5:6` is major on
degree 0 in any inversion. Bass entries, Discover occurrences, the analysis rotation line (with a chosen
occurrence or bass entry), Play's Note → chords and occurrence lists, the Play readout of held keys
(`played-chord.mjs` reports the played `rootNote`) and Compose all use it.

Chords on a bass note. One shared bass filter, `{scale:'discover'|'play', degree}`, owned by the
harmony workspace and saved in sessions, lists the directory's chords that can be built with that scale
degree as the bass (`bassEntries`). Each entry is one chord in one inversion: root position is the
directory spelling (member 0 lowest), and inversion k puts the k-th note of that spelling's close-position
order in the bass, so 5:6:8 is the 1st inversion of 4:5:6 and 1/6:5:4 (10:12:15) is minor in root
position. `harmonic-bass.mjs` owns the math: classes and order use JI pitches for JI chords (tempering
never renumbers inversions) and tuned pitches for ET shapes; voicings keep every other note within the
octave above the bass (not the period, so divided-octave temperaments keep their JI meaning); chords
without 2 in the basis are exact and only their lowest note can be the bass. Entries come from the
existing occurrence search, respect the directory's size, type and search filters, and list root
positions first. Each entry is written root - chord with its inversion and rotation
(`5 - 4:5:6`, `1st inversion (5:6:8)`) and carries `bassDegree`, `rootDegree`, `root` and `rootVoice`.
The directory shows them in place of the tree when a bass is set (Bass note control, or a click on a
Discover scale-line degree). Choosing one opens the chord on that rotation, with the voicing bass,
occurrence and analysis heading ("1st inversion of 5 - 4:5:6 · bass on … degree d") to match. The
analysis names every rotation as root position or an inversion of the directory chord.
`rootInversions` lists the other direction, every inversion with its root on a degree
(`rootEntriesFor`): root position is voiced close above the root, and inversion k raises the k lowest
notes of that voicing by an octave.

The harmony workspace owns the focused harmony: its selected row, rotation and scale
occurrence (`focus()`). `harmonic-focus.mjs` projects it without changing other selections:
`diamondFocus` highlights a JI chord's chosen rotation, written from 1/1, on every diamond
row (otonal), column (utonal) or both (ambitonal and other) that holds it, or the line
holding most of it as a partial placement, and highlights every cell whose approximation
sounds a note of a tempered chord; `matrixFocusDegrees` marks interval-matrix cells
between the focused occurrence's scale degrees. The app reapplies both after every redraw
and directory refresh.

Other views set the focus through `focusExternal`: a JI chord by family (any rotation or
doubling, keeping the picked rotation), otherwise a tempered shape (preferring a JI row that
maps onto it). The row is revealed: its size and type become visible, its groups open, and
the directory list scrolls to it. Selecting three or more diamond pitch classes focuses
them at once; a held chord does so after 250 ms while "Follow what I play" (saved, on by
default) is on. Shift-clicking interval-matrix cells collects their scale degrees, and
three or more focus that chord; a plain click clears them and inspects the interval.

The focus is shared with Play and Compose. Without a chosen voicing the selection sounds the
focused rotation (its first note in the bass, the rest within the octave above). Entering Play with a newly
focused chord hands it to Play's harmony panel once; Send to Play does the same at once.
Held Play notes (screen or HexBoard), three or more and held 250 ms, focus their chord in
Discover while following is on, and a chord focused from Play is not handed back. Compose
offers "Add focused chord" beside the collected chords, and selecting a composition chord
focuses it in Discover. Shared JI limits remain one
state owner. Search can inspect exact 2–8-voice spellings outside browse limits.
Scope filters compare whole-temperament availability, Discover/Play anywhere
occurrence and tonic anchoring. Occurrences/voicings are resolved lazily through
the Stage 8 engine; tuning tolerance never removes a mapped B identity. Bounds,
completeness and unresolved shapes stay visible. Changed contexts disable stale
actions immediately.

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
`harmonic-inspection.mjs` owns coordinate-chord inspection and scale discovery;
the manual workspace consumes those shared services directly. `bestChordTarget`,
the old independent occurrence loop and manual search cache are removed.
Historical search JSON remains stable while nonenumerable bounds are available
to the UI.
Legacy pins remain usable from the manual inspector. No retired pre-v2 analytical
engine is reactivated.

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
cardinality collapse, and poor tuning are distinct states. Play presents the
selection sent from Discover and explicit occurrence/fingering choices. The live
readout follows held and Shift-latched voices; label interpretation never changes playback
or persistent selection.

In B mode the live readout reads held keys (screen or HexBoard) against the harmony directory
(`played-chord.mjs#matchPlayedChord`, via the harmony workspace's `matchPlayed`). Keys reduce to
pitch classes through the mapping, so register, doublings and spacing never change the match; the
lowest key sets the bass. A listed chord shows its directory name, form badge and the rotation
played (for example `4:5:6` played as `5:6:8`), with every key labelled by its ratio from the bass;
when several JI chords share the tempered shape the simplest integer form is named and the others
listed. A dyadic shape the directory does not list (for example outside its size range) is
classified on the spot (`assessET`). Two pitch classes show the interval's JI readings. Anything
else names the pair outside the limit and the largest directory chords it contains. A mode keeps
the curated recognizer.

## HexBoard layout and period wrapping

`hexboard.mjs` owns the 140-button physical grid (seven command positions and 133
note buttons), musical axes, layout reflections, board construction, filling
(`layoutCandidates` is its internal search), interval overlays, and export. Physical staggered geometry is fixed as
`x = 2 * column + rowParity`, `y = row`. Musical axes are integer coordinates with
determinant ±1 so the unwrapped layout covers the full rank-2 lattice.

`hexboard-view.mjs` is the one board picture (D-040). `boardPicture` gives every key its layout
colour, outline (selected chord, interval root, mapped or alternative JI match from the root),
label, chord-tone number and highlight state through `keyAppearance`; `boardSvg` draws it for Play
and for Compose's miniature; `deviceFrame` sends it to the physical board. Sounding keys are marked
by `hexboard-player.mjs`, which plays both boards. `tests/hexboard-parity.mjs` pins Play's board
key by key against a recorded fixture.

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

## Built-in and saved layouts

Play opens with one Layout dropdown listing the current mapping's saved layouts
first, then its built-in layouts. Entering a temperament applies its saved default
if it has one, otherwise its Recommended built-in layout, which is marked Default;
built-ins also apply when saved layouts cannot be loaded. All manual geometry
controls remain in collapsed Advanced Layout Options.

`builtin-layouts.mjs` holds fixed, read-only layouts for each built-in temperament
preset, stored as ordinary layout records (mapping context, target size/mode and
geometry, no custom colours):

- Recommended (`builtin:<preset>`): mostly compressed or Bosanquet boards at the
  preset's default interval-complete MOS, pitch rising to the right and upward.
- Bosanquet (`builtin:<preset>:bosanquet`), every preset: key columns upright, the
  base MOS's large step up-right, small step down-right, chroma straight up.
- Wicki-Hayden (`builtin:<preset>:wicki-hayden`): rows level, a whole-tone-sized
  step right, the fifth up-right, the fourth up-left. Only where that step and the
  fifth reach every note: the meantone, dreamtone, porcupine, schismic and garibaldi
  presets.

Conventional layouts target the smallest MOS of at most 41 notes per octave that
covers most of the board, let keys outside it play, and put the root where every
degree is on the board. A built-in cannot be updated, renamed, deleted or made the default; saving it creates the
user's own copy. There is no layout search or scoring. `layout-chooser.mjs` renders
the dropdown and the save/name controls; `layout-preset-data.mjs` owns
`layoutFields`, `layoutConfig` and `layoutKey`.

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
adds optional catalogue/Play selections and harmonic material provenance. The A/B
mode value and Play catalogue state are no longer written and are ignored on load;
HexBoard settings hold one layout, and the second layout of older sessions is ignored. Custom spellings, repeated voices and selected voicing controls
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
- Play's whole-board chord search (Find chords on this layout) and the Manual selection & pairwise
  search panel were folded into the Chords panel (D-041).
- The A/B harmony mode flag, the classic Play chord catalogue (`chord-catalog-ui.mjs`
  with its v2 views, relationships engine and session adapter), Find layout
  alternatives and the Discover diamond focus note were removed (D-039).
- JI odd/prime-limit and tolerance ownership was centralized; one exact filter
  engine powers all JI target and candidate searches, and duplicate Play controls
  were removed. Basis-diamond default-scale and milestone searches deliberately
  remain independent of the optional prime-limit filter.
- Chord-space classification replaced streamed per-shape ET discovery
  (`discoverDyadicHarmony`) and the manual, bounded ET search in the directory.

## Current boundaries and architectural issues

- `app.mjs` still contains matrix/target renderers and substantial session/event
  orchestration. Extraction should precede any broad controller rewrite.
- Several controller tests use source extraction and mocked DOM contexts. Core
  calculations have strong regression coverage, but full browser, keyboard,
  screen-reader, and acoustic acceptance remain manual.
- Manual/board analytical rules are fully migrated to shared services; older
  session and degree APIs remain intentional compatibility adapters.
- `chord-discovery-v2.mjs#discoverChords` has no app consumer since D-039; only its
  tests and `scripts/profile-chord-v2.mjs` use it.
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

The composition workspace has two views: **Compose** and **Play**. Compose shows a piano roll
(bar ruler, chord lane, melody rows, velocity lane, root lane) above two responsive panels: the saved
HexBoard and the selection. Play owns guided learning and timed runs.

Piano roll. Notes are placed on a time grid (`composition-grid.mjs`): a base division from 1/1 to 1/64,
straight, dotted, triplet (3:2), quintuplet (5:4), septuplet (7:4) or any custom n:m tuplet, with
optional swing (54–75%) on straight grids. Grid lines restart at every bar and round to whole ticks
(exact for 3s and 5s, within half a tick for 7s). The meter's beat groups (`meter.groups`, set as
"3+2+2" in Project; compound and odd eighth meters have defaults) are drawn and shaded. Snap can be
turned off, and Alt places freely during a drag. The grid, tool, zoom and selection are editing
state; none is saved. The Draw tool adds a note on press and sets its length by dragging (a click
uses the grid step or the chosen new-note length); the Select tool drags a selection box, Shift
adds to a selection. Dragging moves every selected note in time and by the same number of rows
(stopping at the edge rows), Ctrl/⌘-drag copies, either edge resizes, and double-clicking a note
deletes it. The velocity lane drags one bar or a selection, or draws across notes. The ruler seeks
on click and sets the loop on drag. The Edit and Rhythm menus act on the selection
(`composition-edit.mjs`): copy, cut, paste at the playhead, duplicate, delete, quantize starts or
starts and ends with a strength, legato, retrograde, scale-step and period transposition, split each
note into n equal notes, fit n in the time of m (time scaled by m/n from the first note), and a
Euclidean fill (k hits over n equal steps, across the selection, the loop or the bar at the
playhead, on the selection's or the last used row). Keyboard shortcuts work while focus is in the
roll or nowhere in particular, never in a field; the roll's ? menu lists them. Zoom sets pixels per
quarter note and row height, Fit shows the whole piece, and the view follows the playhead while
playing. Each gesture or action is one undoable edit (`editEvents`). Rows default to the HexBoard
layout range: one row per in-scale pitch on the composition's saved layout (`boardRows`), with
period ranges still selectable; any other pitch a note uses gets its own marked row (× outside the
scale), so no note is hidden (`rollRows`). Chord blocks drag along the chord lane and resize from
their right edge on the same grid (overlaps are allowed), and are written root - chord (`chordName`), with the bass degree
when it is not the root (`chordBass`). The root is the tone `source.rootTone` names, recorded from the
directory entry or the collected chord's harmonic selection; chords without it are rooted on their first
tone (`chordRoot`). Voicing edits keep tone order, so the root survives inversion. Below the chord lane,
every melody row that sounds a note of a chord is tinted for that chord's span, and the root more strongly
(`chordGuides`); notes match by octave class (exact without 2 in the basis), never by period. A Root
lane under the melody rows shows each chord's root degree over its span. Clicking an empty spot picks a
time on the grid; clicking a chord's root picks that chord. Either opens a picker: choose a root
(scale degree), then one of the directory's chords on that root, in root position or an inversion (the
Play scale's root entries), with the root on that degree's home coordinate. The harmony is added at the time with the
chosen add length, or replaces the picked chord at its time and length, as one undoable edit. Because the
directory follows the app, the picker only lists harmonies while the app matches the composition's setup. Chord inversion raises the lowest sounding voice by the actual
temperament period and preserves its tone identity. Chord notes no key plays are
shown explicitly. Outside-scale notes sit in marked rows and stay editable in the note list.

Compose playback uses the saved tempo and loop region. Playback paints the playhead and sounding notes in
place. The composition board and the physical HexBoard read the composition's
saved geometry and tuning while Compose is active; mouse/device auditions use
the app's central tonic and sound through the shared audio engine. The header Audio menu controls all tabs; legacy project sound fields remain readable but do not override playback. The board lights
the composition's fingering, the one button per pitch that Play suggests (D-045, D-046): Follow lights
shows the sounding notes' buttons, and otherwise the selected chord's and melody notes' buttons light,
with the chord panel naming the chord's buttons and their reach. The board's Chords / Melody / Both
toggle filters what it lights (sounding notes by track, and the selection); it is display-only and
never changes playback. `composition-board.mjs` reuses `buildBoard` and the existing colour engine,
and the buttons come from the shared route; it defines no other pitch or fingering engine. Its board is a
miniature of Play's, drawn by the same `hexboard-view.mjs` picture and renderer from the saved
layout, and its keys play through the shared `hexboard-player.mjs` (hold, glide, Shift sustain;
physical keys press it while a composition is open) (D-040).

Choose buttons (a board setting) also outlines every other key of the selected chord's and melody
notes' exact pitches; the physical HexBoard keeps those keys' colour and dims the rest. Pressing an
outlined or lit key of a selected pitch makes it that pitch's button throughout the composition, in
Compose and in every Play hint, as one undoable edit saved with the composition. The other buttons
adapt around chosen ones. Use automatic buttons returns the selected pitches to automatic choice, and
Reset all buttons every chosen pitch. Step entry and recording keep their presses, and other keys only play.

HexBoard input. Keys held on the composition board (mouse, Enter on a focused key, or a connected
HexBoard) light their roll rows, and the roll status names the held pitches and the chord they make,
read against the chord directory while the app matches the composition (`root - chord`, D-042). Row
labels carry their layout key colour; during playback the rows of sounding notes glow, filtered by
the board's Chords / Melody / Both choice. Selected melody notes light their buttons. The roll's HexBoard group chooses where entries go, Melody or Chords. Step entry enters
the held keys when the last one comes up, at the playhead and one step long (the new-note length, or
the chord length in Chords), then moves the playhead on; Rest, Tie and Back (→, ←, Backspace) move
and correct. Rec arms recording: Play counts in (off, 1 or 2 bars) and every hold heard after the
downbeat is recorded with its played timing, from the tick heard when the key went down for as long
as it sounded (Shift sustain included), cut where playback wraps. A press just before the downbeat
starts on it. A take is one undoable edit added to the existing clip: a melody take becomes the
selection, ready to quantize; in Chords, keys pressed together (within 0.12 s) form one chord, named
and rooted from the directory and snapped to the grid while Snap is on, its played timing kept in
`source.played`. The Click switch adds a metronome to any playback, accenting bars and beat groups
(D-044).

Play (D-045). Setup chooses Timed or Wait; the part (melody, chords or both); whether the exact pitch
or the degree in any octave counts; integer speed from 10–200%, with the resulting BPM; the backing
level of your part (muted, quiet guide or full); note lead time; count-in; metronome; Note hints
(keys to play lit on a dark HexBoard, lit over the layout, or off for the layout alone); repeat; and the section (whole piece, loop region, bars or selected chord). Speed, backing,
count-in, metronome and the speed trainer apply to Timed and are disabled for Wait. A missing loop or selected
chord is unavailable, and notes with no playable key under the chosen match rule prevent starting.
First, Previous, Next and Hear preview each onset on the saved board without starting a run.
Advanced exports the existing practice-target format with its independent exact-coordinate,
any-degree or button match rule. Speed is browser runtime state and never changes the saved tempo
or musical context. Defaults are Timed, 100% speed, repeat off, hints lit on a dark board, trainer off
and a 100% trainer target; existing browser preferences remain in effect (a saved hints-off switch reads as Off). Musical editing, recording and
step entry are available only in Compose; Play auditions never enter composition notes.

The stage shows a note highway beside the board, at its height: one lane per pitch in its key colour,
each note a solid head where it starts and a lighter tail for its length, and a hit line that in Timed
carries the Good and Perfect windows at the current speed.
With hints on, keys light only for the notes to play now, never beside later ones (D-047): in Timed a
suggested key lights from its note's onset until it is played or missed, while on screen its ring
closes onto it over the lead time; in Wait only the next onset's keys are lit and ringed, from the
moment they become next until they are completed. Each pitch (each degree when any
octave counts) keeps one suggested button for the whole composition, in melody and chords alike, so
repeated notes and common chord tones stay put and every section and part shows the same buttons as
Compose. Buttons chosen in Compose fix their pitches; next, a button the player has used for a
matching note takes priority for every note of that pitch; the others are chosen over the whole piece, weighing
bent chord shapes and melody lines, chord reach and travel together, with proximity to the centre
as the tie-breaker (D-045). The most recently played matching button takes
priority across setup previews, restarts and repeat passes of the open piece; notes already judged
keep their buttons when another is chosen during a run. These choices remain runtime state and
reset for a different piece or physical pitch layout.
Every key matching the chosen rule still counts. Wait steps through the notes in order at the
player's pace (D-048): it plays no backing, count-in or metronome and runs no clock. The first onset is
due as soon as the run starts and each next onset as soon as the one before it is complete, so a
press is never early. An onset completes when all its distinct matching pitches are held together.
Released taps do not accumulate, and stray notes must be released; notes already played may stay held
into later onsets but never count for them, so a repeated pitch needs a new press. Pressing a note of
the onset just completed again (a bouncing key or a double tap) is a repeat, as in Timed: never a
wrong note or a stray. The highway glides
to each next onset, and the results follow a second after the last one. Wait shows the required
notes, missing tones and notes to release, with completed-note progress and Hear current notes. Its
results show completed notes and wrong notes; it has no timing score, accuracy, combo or grade. Both
modes support Pause, Restart and Quit.

Timed judges presses at the time heard: Perfect within 40 ms, Great 80, Good 130. A press takes the
earliest unplayed note of its pitch in the window, so a late press never takes the next note of that
pitch, and it also plays every other note of that pitch starting with it (a melody note doubling a
chord tone), timed once. A note not played is missed 50 ms after its window, so a press made inside the
window but handled a frame or two later still counts. The right pitch outside its window, a note
already missed included, shows as early or late, and pressing a note just played again shows as a
repeat, both without penalty; any other press is a wrong note and breaks the combo. Notes a quarter or longer add a hold bonus when kept down to their end. The multiplier
rises every ten in a row, to ×2.5. Results give the grade (S, A, B, C, D by accuracy), counts, best combo,
average timing and spread with a histogram, and the three weakest bars with buttons opening those
bars in Wait setup. Timed repeat keeps the completed pass's results visible during a three-second
intermission, with Pause repeat and Stop repeating. Wait repeat restarts at once on its first notes.
The pass number is shown during runs and in results. In Timed, the speed trainer offers 5%
more after a pass at 90% or better, capped at its target speed; it is disabled in Wait. A connected
HexBoard shows the lit keys and flashes hits and misses: on a dark board every other key is off; over
the layout the lit keys shine a level brighter than the rest; Off shows the layout alone and removes
suggested-key cues from the screen and device. Setup lights its previewed notes over the layout, and
results show the layout. Calibration plays twelve clicks and stores
the median lag of taps on the last eight; it is taken off every Timed press. Settings, that offset and
the best score per composition, part, match, speed and section stay in this browser only.

Create opens one composition at a time: a chord progression built from collected
chords, a scale-degree piano roll, a looping tuned transport, and a game-ready cue
timeline. The authoritative plan, frozen limits and action log are in
`docs/COMPOSITION_SUITE_PLAN.md`; the format and ownership decision is D-032.

| Concern | Owner |
| --- | --- |
| Project schema, validation, limits, commands, bounded undo | `composition-project.mjs` |
| Musical context snapshot, pitch resolver, degree annotation, guarded chord import | `composition-context.mjs` |
| Clip expansion, integer-tick timing, loop/seek/pause pump, live replanning after edits, count-in, metronome, heard position (`timeAt`) | `composition-transport.mjs` |
| Recording takes, step-entry hold groups, recorded chords | `composition-record.mjs` |
| Play chart, Timed judging/scoring, Wait completion and results | `composition-game.mjs` |
| Display-only composition fingering, one button per pitch over the whole piece, from chart matching keys, chosen buttons and played-button preferences | `composition-game-route.mjs` |
| Play setup, section preview, runs, repeat/trainer, input, drawing, calibration, stored scores, LED cues / markup | `composition-game-ui.mjs` / `composition-game-view.mjs` |
| Time grid (divisions, tuplets, swing), beat groups, snapping, length and position names, Euclidean patterns | `composition-grid.mjs` |
| Note transforms: quantize, split, fit, legato, retrograde, transpose, Euclidean fill, copy/paste, velocity | `composition-edit.mjs` |
| Piano-roll pointer gestures, hover readout and ghost note, wheel zoom | `composition-roll-input.mjs` |
| Voice groups, scoped scheduling/cancellation, clock snapshot | `audio.mjs` (additive; legacy preview methods unchanged) |
| Cue timeline, board-cell lookup, practice-target export | `composition-cues.mjs` |

Play freezes settings and absolute section bounds for each pass. The shared transport accepts
`play({countIn, untilTick, graceMs})`; bounded scheduling caps onsets and releases at `untilTick`,
and the judging clock runs on through `graceMs` after the backing ends. Only Timed uses the
transport; Wait advances on input alone. Stop, project changes and navigation cancel deferred starts,
auditions, calibration, repeat and Wait's end timers; navigation pauses an active pass or repeat countdown.
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
are computed from integer ticks so loops do not drift. A project edit during playback
carries on from the playhead: voices that have not started are replaced with the edited
project, sounding notes finish as scheduled, and an edited note crossing the playhead is
heard from its next start. Stopped or paused, the next Play uses the edited project. Auditions in
Create use the scoped `preview` voice group and never cancel the transport; global
Stop/Escape cancels every group.

Cue seam. `buildCueTimeline` yields one cue per sounding tone with its coordinate,
cents, Hz, degree/register, onset/release (ticks and seconds) and every enabled
layout key whose `buildBoard` coordinate matches exactly. Its any-degree keys are those
whose own coordinate has the tone's degree, as presses are judged; an equal-step key that
only sounds that pitch class (G♯ for A♭ in 12 EDO) is not one. A pitch with no key stays
audible and carries a stated reason. `toPracticeTargets` exports a versioned
`temperament-lab-practice-targets-v1` file with an explicit match mode
(`exact-coordinate`, `any-degree`, `button`) for other consumers. The Play controller
builds its chart from the same timeline.

Sessions. A whole-app save with an open composition is `temperament-lab-v2` with a
`composition` field; saves without one remain `temperament-lab-v1`. The loader
accepts both and validates the composition as a candidate before restoring any other
session part. Standalone files use `temperament-lab-composition-v1`; a composition's chosen buttons are
its optional `fingering` map (exact coordinate → button on the saved layout).

Known limits. One chord track and one melody track with one clip each (the schema
allows more); same-key presses from two sources share one voice; one meter for the
whole project (no meter changes); recording and step entry add to the existing melody
and chord clips (no separate takes); no arrangement, mixing, conversion, account storage
or export; game scores and calibration stay in the browser. Browser behaviour was exercised in headless Chrome only
(see the plan log); listening, Edge/Safari, screen readers, physical HexBoard and DAW
use are unverified.

## Physical HexBoard connection

The header's **Connect HexBoard** button opens Web MIDI (Chrome/Edge, SysEx permission), finds the
port named "HexBoard", puts the board in delegated-control mode and takes over its keys and LEDs;
Disconnect (or closing the page) blanks the LEDs and returns the board to normal. Nothing is
persisted and the board always starts disconnected.

| Concern | Owner |
| --- | --- |
| Delegated-control bytes, key/encoder decoding, colour to LED conversion | `hexboard-protocol.mjs` |
| Web MIDI port, enter/exit, changed-LED sending, unplug detection | `hexboard-device.mjs` |
| Key routing, the LED picture, the 100 ms follow and 1.5 s refresh timers | `hexboard-sync.mjs` |
| What the board should show (colours, outlines, labels, highlights) | `hexboard-view.mjs#boardPicture` over `hexboard-colors.mjs#keyAppearance`; drawn by `boardSvg`, sent by `deviceFrame` |
| Wiring and header status | `app.mjs` |

Keys. Button index equals the layout's key index (`0..139`). On the Play view a board press goes
straight to the board player (`pressKey`/`releaseKey`, no synthetic DOM event), so sound, selection,
chord picking and the live chord readout behave as for a mouse, and Shift sustain applies.
Latency: the voice starts within the MIDI event (a running audio context schedules it at once, with a
4 ms attack); the Play board's key classes, inspector and colour editor follow in the
next frame; LEDs update once per input event, after the sound. The HexBoard status shows the median
MIDI-arrival-to-sound time in the app and the audio device's own output latency. When the
Play board is not on screen the key sounds directly at its layout pitch. Command keys and disabled
keys are silent. A board encoder press acts like Escape (stop and clear highlights).

Lights. The screen board and the LEDs share one rule (`keyAppearance`): every enabled key always shows its
own layout colour and outline. A chord placement, selected chord keys or a scale highlight changes no colour
and leaves the other keys as they were; only its keys shine a level brighter (on screen a brightness filter,
`.is-lit`; on the board full brightness instead of half). A highlighted key's number shows its place in the
chord, 1 being the root. Keys being played, by the board or the mouse, are white on the board.
Disabled and command keys are dark. On screen only, a highlighted chord (`.has-chord`) also darkens every
key outside it (`.is-marked`); the LEDs keep the other keys unchanged. While connected, Settings shows a
HexBoard brightness slider (5–100%, remembered in the browser). The firmware has no brightness command,
so `ledFrame` scales every LED value it sends.

Keeping the board current. After entering host mode the app waits 300 ms for the board to settle,
then paints. LEDs travel in paced messages of at most 32 LEDs. While connected, the app is sampled every
100 ms and changed LEDs are sent immediately; a Play run's lit keys are also sent as soon as they change
(`hexboard-sync.mjs#schedule`); the whole picture is resent every 1.5 s, so a message the
board missed repairs itself and nothing depends on delivery being acknowledged (the protocol has no
acknowledgement). Disconnecting blanks the LEDs in the same small messages, then exits host mode.

Limits. One board; port chosen by name only; no manual port picker; LED colours are the layout's own
(the firmware applies its own brightness limit and gamma); not tested on a physical board (see D-033).

## Fingering practice

A panel at the foot of Play's side panel turns the chord on the board into a short game: pick how many of
its fingerings to practise (3, 5, 10 or all), press Start, and the first fingering lights up; play
all its keys together and the next lights up, until the set is finished (time, wrong keys and skips are
shown; Skip and Stop are available). The panel is hidden and any running game ends when the player leaves
the Play view, changes the chord, changes the layout so that the game's fingerings move, or clears the
highlight (Escape).

| Concern | Owner |
| --- | --- |
| Rules: exact-set completion, lifting keys between fingerings, wrong keys, skip, restore | `fingering-game.mjs` |
| Panel markup and events (polls every 250 ms, redraws only on visible change) | `fingering-game-ui.mjs` |
| The chord's fingerings and lighting one | `hexboard-ui.mjs#fingerings` / `#showFingering` (harmonic selection or finder) |

Lighting reuses the Play board's normal highlight, so the screen and a connected HexBoard both follow
without any extra code. Lighting the next fingering is a highlight-only redraw (`refresh('highlight')`,
`renderWorkspace({keepNotes:true})` in `app.mjs`): held keys keep sounding and stay marked, and the Now
playing readout is redrawn. Held keys come from the board player's callback, so mouse and HexBoard play
are treated the same. A fingering counts only when exactly its keys are held; extra keys block it, and
keys held from the previous fingering must be lifted before the next one counts. The game plays the first
fingerings in the order the Chords panel lists them. The game's chord is identified by its name and the
keys of each of its fingerings; when either changes the game ends without moving the new chord's
highlight, and otherwise stopping or finishing puts back the fingering lit before the game. Not covered:
scoring or timing targets, a saved history, and fingering practice away from the Play view.

## Note → chords (Play)

The Note → chords mode of Play's Chords panel lists, for the key selected on the board (a mouse click or
a HexBoard press), the chords that can be built on it with that key as the bass. Directory chords come
first: the shared bass entries for the key's Play-scale degree, each voiced close above the key's own
register and placed exactly on the layout with the key as the lowest note, within the chosen reach (3–10
keys) and size (3–6 notes). "More on this layout" then lists 3- and 4-note shapes the board-local search
finds with the key lowest that no directory entry voices, as an open voicing of a directory chord or as
not in the directory. Choosing a row lights one place on the screen and on a connected HexBoard;
Previous/Next step through the places and Hear sounds them. The chosen chord becomes the Fingering
practice chord, and a directory chord also opens in Discover's analysis. A newly selected key becomes the
shared bass while "Follow what I play" is on, so Discover lists the same chords.

| Concern | Owner |
| --- | --- |
| Bass/inversion math (classes, close voicings, inversions on a degree) | `harmonic-bass.mjs` |
| Shared bass filter and entries over the directory | `harmonic-catalogue-ui.mjs#bassEntriesFor` / `#setBass` / `#chooseBass` |
| Exhaustive key-centred chord search, same pair rules as the board chord search | `hexboard-chords.mjs#chordsWithKey` |
| The chords-on-key query, lighting one, hearing one | `hexboard-ui.mjs#harmoniesAt` / `#showHarmony` / `#hearKeys` |
| Panel markup and events (polls every 250 ms, redraws on visible change; while its tab is closed it only reports the selected key) | `key-harmonies-ui.mjs` |

While the directory is still listing, only the layout shapes show. A key outside the Play scale has no
directory chords. Compose's Root lane picks from the same entries. Not covered yet: marking the bass
degree's keys on the board.

## Responsiveness

Switching between Discover and Play must render once, completely. The practice panels (Fingering practice,
Harmonies with a key) therefore update in the same event as the tab switch (a document-level listener registered
after the app's own handlers), with a 250 ms poll only as a fallback for changes that do not come from a click or
key press. The read-only polls (LED sync, fingering game, harmonies panel) share one cached board
(`hexboard-ui.mjs#boardFor`, rebuilt only when the layout signature changes), so idle cost stays near zero.

The harmony directory renders no chords inside collapsed groups and at most 100 per
open group until "Show all" is chosen, and memoizes its whole-temperament filtering
per result, so redraws stay small at high odd limits.
