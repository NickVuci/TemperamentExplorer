# Temperament Lab architectural decisions

Record only decisions whose rationale prevents likely regressions. Current code and
tests remain authoritative for implementation details.

## D-001 — Separate mapping, tuning, finite scale, and layout

**Decision.** A temperament mapping is an integer rank-2 lattice; period/generator
cents tune it; `n` and `mode` select a finite generated scale; HexBoard placement is
a later physical layer.

**Rationale.** These objects answer different mathematical and musical questions.
A tuning or layout change must not silently change which commas vanish or which JI
coordinates the temperament maps.

**Rejected alternatives.** Deriving the mapping from cent proximity, treating an
EDO realization as a new abstract mapping, or allowing board placement to define
scale/chord membership.

**Consequences.** Coordinate identity is exact. Tolerance affects quality and
approximation display, not mapping or occurrence truth. Tests should isolate each
layer.

## D-002 — The first basis prime defines the reference period

**Decision.** `rows[0][0]` stores the integer number of periods per first-basis-prime
reference interval, while the generator maps that prime to zero generators.

**Rationale.** This supports octave, divided-octave, and non-octave references with
one representation. The actual period is derived from the mapping and tuning.

**Rejected alternatives.** Hard-coding 1200 cents, assuming every period is an
octave, or inferring period subdivision from the selected scale.

**Consequences.** All pitch, matrix-span, wrapping, export, and audio code must use
`s.p` and the mapping-derived reference. Whole-octave matrix expansion is available
only when 2/1 maps to an integer number of generator-free periods.

## D-003 — Comma input constructs a saturated integer rank-2 mapping

**Decision.** Comma monzos are solved with exact rational elimination; input must
leave rank 2 and preserve the reference. The resulting two rows span the saturated
integer annihilator, with a primitive generator row.

**Rationale.** A merely rational or nonprimitive basis can produce wrong period
counts, misleading generators, and missing lattice points even when it annihilates
the entered commas numerically.

**Rejected alternatives.** Floating-point nullspaces, selecting the largest-looking
generator, or retaining redundant integer factors in the mapping basis.

**Consequences.** Familiar named kernels may change to a conventional generator
basis, but tuning remains separate. Non-octave, nonprimitive, and redundant-comma
cases require regression coverage.

## D-004 — Period optimization is opt-in

**Decision.** Tuning methods fix the pure mapping-derived reference period by
default. **Optimize period** allows methods that support it to fit period and
generator together.

**Rationale.** A stable pure reference is the least surprising default and makes
the displayed period a consequence of the mapping. Free-period optimization remains
available when its theoretical benefit is desired.

**Rejected alternatives.** A manual period input, preserving arbitrary stale period
values across mappings, or defaulting every method to a free period.

**Consequences.** The checkbox is the inverse of `tuneConfig.fixed`. Retuning with
optimization disabled restores `purePeriod(s)`. WE, Minimax, Least Squares, and JI
Target must preserve their distinct objectives.

## D-005 — Mapped JI identity is coordinate identity

**Decision.** A JI interval is mapped at a displayed interval only when their exact
integer `[period, generator]` coordinates agree. Cent-close intervals at different
coordinates are alternatives or incidental approximations.

**Rationale.** Regular-temperament mapping is algebraic; tuning accuracy is a
separate numerical property. Equal pitches in an EDO realization do not erase that
distinction.

**Rejected alternatives.** Tolerance-based identity, choosing only the nearest cent
target, or treating EDO coincidences as abstract mapped occurrences.

**Consequences.** Mapping, availability in the finite scale/mode, and tuning error
are reported separately. An outside-subgroup hit is suppressed by a mapped hit
within tolerance, but not by a mapped target that is itself outside tolerance.

## D-006 — Chord engine v2 is the sole catalogue engine

**Decision.** Exact chord identity, temperament projection, finite-scale occurrence,
voicing, and physical placement are separate canonical stages. The prior catalogue
engine and runtime selector were removed; only a narrow session adapter remains.

**Rationale.** The previous path conflated mapping quality, scale membership, and
playability, which produced false “no chord” conclusions and duplicate identities.

**Rejected alternatives.** Keeping both engines behind a switch, using cent matches
as occurrences, or defining a chord by one board fingering.

**Consequences.** Otonal/utonal reciprocals can be paired for browsing while keeping
exact identities. A chord may be mapped and well tuned yet absent from the selected
scale; an occurrence may exist with no available fingering. Legacy compatibility
must never reactivate the retired engine.

## D-013 — Live chord labels preserve played register

**Decision.** HexBoard live recognition observes the shared player's held and
Shift-sustained voices and compares their complete exact coordinate sets with
cached, eligible chord-v2 projections. It subtracts one common lattice transposition
from the whole set but retains each note's full `[period, generator]` displacement.
It displays the best-ranked identity and keeps other exact identities available as
alternatives. The readout does not change persistent chord selection.

**Rationale.** Playback activity, clicked chord selection, and a JI identity are
different states. A chord label is a temperament-based interpretation of mapped
notes; it does not prove the sounded frequencies are exactly pure JI. Full-set
matching avoids calling a larger voicing a chord merely because it contains a
matching subset. Retaining register distinguishes `4:5:6` from `2:5:6` and permits
octaves to match as `1:2`.

**Consequences.** Distinct period registers remain distinct notes in divided and
non-octave temperaments. Matching uses exact full coordinates, shared JI limits,
full-coordinate candidate cardinality, and the current shared tolerance. A common
transposition preserves the shape; shifting only one note changes it. Do not replace
this with cent-only matching, period-class folding, catalogue UI filters, or a
second held-note state owner.

## D-007 — Period wrapping is a HexBoard placement layer

**Decision.** Wrapped mode repeats canonical scale-degree positions through a
physical copy vector and a display register. Sounding pitch is
`basePitch + register * temperamentPeriod`; the temperament remains rank 2.

**Rationale.** Musicians need repeated period registers on a finite controller, but
adding a tuning rank or mutating generator coordinates would corrupt the abstract
temperament.

**Rejected alternatives.** Hard-coded octave wrapping, clipping the infinite lattice
to one copy, or inserting a third temperament coordinate.

**Consequences.** Off preserves the global rank-2 lattice. On is locally isomorphic
inside copies; seams may change intervals. Degree, color, chord, and pitch-class
identity follow the base degree. Manual placement changes physical positions only;
overlaps are explicit and disabled rather than silently retuned.

## D-008 — Shared JI limits and centralized audio have single owners

**Decision.** A mandatory odd limit, an optional prime limit, and tolerance are one
shared JI state rendered in the relevant workflow. One pure limit engine validates
the values and supplies the exact target set to every JI interval and chord search.
All sound routes through `audio.mjs`.

**Rationale.** Odd and prime limits are distinct constraints: every target must fit
the selected odd-component bound, while the optional prime limit also bounds every
factor in its ratio. Local implementations risk different results, and duplicate
controls drift out of sync. UI-created oscillators make voice lifecycle, Stop,
Shift sustain, and frequency limits inconsistent.

**Rejected alternatives.** Per-view limit calculations, duplicate independent
filter state, a separate Play-page global JI panel, or workspace-specific Web Audio
code.

**Consequences.** `ji-limit-engine.mjs` owns odd and prime value lists, validation,
ratio filtering, and target generation. `engine.mjs#targets` is the shared entry
point. Workspaces receive limit settings and playback callbacks. The default odd
limit is 15; Temperament basis remains an explicit odd-limit choice. The optional
prime filter defaults to a dynamic Temperament basis choice. A complete prime
prefix resolves to its highest-prime shorthand (for example, a basis of
`2.3.5.7.11` uses 11-prime-limit); an incomplete basis remains an exact subgroup
(for example, `2.3.5.11` excludes 7). Manual prime-limit choices are 3, 5, 7, 11,
and 13, with No prime limit still available; the basis choice can resolve above
13. The shared engine validates primes through 97 and canonicalizes explicit
subgroup lists for higher or incomplete bases and saved settings.
The default-scale and coverage-milestone calculations use the same selected odd
limit and exact prime filter as the shared JI target engine. UI modules own
interaction/highlighting; the audio engine owns contexts, voices, envelopes,
frequency conversion, cancellation, and cleanup.

## D-010 — Saved temperament presets use the private site workspace

**Decision.** Saved preset records share one stable site workspace scope in D1;
the preset API does not require a sign-in identity. Same-origin and optimistic
revision checks remain in place.

**Rationale.** The app has no sign-in flow, and saved presets are an owner-only
workspace feature. Requiring an injected account header made the controls report
that users needed to sign in even though the product offers no such action.

**Consequences.** Any session that can open this private Site shares its saved
preset catalog. If the app's access policy becomes public or adds user accounts,
the storage scope must be reconsidered before changing that policy.

## D-011 — Keep one active temperament and remove the retired comparison flow

**Decision.** The application exposes Discover, Play, and Create around one
active temperament. The former two-temperament Compare workspace and its
matrix-difference, A/B playback, comma-routing, and HexBoard panel paths are
removed. New sessions save one temperament and no comparison workspace state.

**Rationale.** The two-temperament workflow is deprecated, and its unused branches
were keeping stale navigation, rendering, and session paths alive across the app.

**Consequences.** Session files keep the existing `temperament-lab-v1` format.
When importing older files with two temperament states, load the first state and
ignore the retired comparison snapshot and view names. Chord pins, material,
comma search, and the first HexBoard layout still migrate normally.

## Diamond coverage determines scale, mode, and layout defaults

**Decision.** The central `scale-milestones.mjs` analysis supplies all four coverage
properties and every default. Use the first generated scale with a completing mode
as the Discover and layout target, and its first completing mode in pitch order.
Use the first interval-complete strict MOS as the default layout base subset when
it fits. This supersedes the earlier basis-odd-limit interval-MOS default.

**Rationale.** One rule must serve the coverage cards, scale/mode menus, and layout.
A matrix containing every interval does not imply that one tonic has all the
notes. Defaults should provide the latter, including when the first such scale is
not a MOS. Selected odd/prime limits are part of the analysis identity; changes to
tuning, mapping, or target limits recompute defaults. Manual edits remain stable
within an unchanged context, and saved session/material/chord selections survive
restoration.

**Consequences.** Search collision-free consecutive-generator scales through 256
notes. No result is explicit; preserve the current selection instead of claiming
coverage via coincident pitches. Existing base-subset constraints still apply if
there is no usable MOS fitting the selected target.

## D-009 — Coverage milestones distinguish interval matrices from modes

**Decision.** Interval completeness means every mapped diamond interval class is
present somewhere in the matrix. Diamond completeness means all those classes
are available from one tonic. Both use exact integer period/generator coordinates
modulo the actual period, including non-octave periods, and ignore display-span
choices and error tolerance. Ratios outside the mapping subgroup are counted and
excluded. MOS means exactly two distinct step sizes; equal-step scales remain
eligible for the general searches. Both diamond suggestions open in a completing
mode and report every completing mode.

**Implementation.** For a chain of n generator powers, matrix differences range
from -(n-1) to n-1. With required generator bounds [min,max], tonic r completes the
diamond iff r+min >= 0 and r+max < n. Period reduction uniquely determines the
period coefficient for each generator coefficient. The engine uses these bounds
in a single size pass; independent coordinate-enumeration regression tests verify
all four results and their minimality. The immutable cache includes mapping,
tuning, selected odd limit, and canonical prime limit/subgroup.


## Compact and playable diamond layouts

**Decision.** Keep canonical JI target generation unchanged. Compact the displayed
harmonic axes before taking their Cartesian product; do not delete individual
rhombi and leave holes. Ordered custom harmonic lists form n/d cells directly,
with optional octave folding. Rows and columns remain interlaced otonal/utonal
lines. Default subgroup compaction preserves the unique analytical target set
for octave-containing subgroups; octave-normalized cells outside a non-octave
basis remain visible but unavailable in mapped-only mode.

**Rationale.** Musical layout choices should not alter matrix targets, scale
milestones or chord-discovery filters. Natural harmonic registers preserve the
user's requested chord voicing, whereas automatic period folding could alter it
in divided-period or non-octave temperaments.

**Consequences.** Selection uses cell identity, not ratio text (unisons and other
ratios recur in different cells). Transfers deduplicate exact sounding coordinates
and preserve period lifts. Chords retains its distinct-scale-degree requirement;
register duplicates remain collectable. HexBoard transfer reports physical fit
through its existing engine. The existing pointer player is parameterized for
both surfaces rather than introducing a second audio or sustain implementation.

## Ranked layouts preserve canonical board and chord semantics

**Decision.** Generate a bounded set (at most 133 before deduplication) using up to
five valid MOS bases, existing layout families, rotations and reflections. Reuse
`buildBoard`, `hexDistance`, `chordPlacements` and `placeRealization`. Present every
candidate in one ranked dropdown, with saved presets grouped before recommendations.
This supersedes the four fixed category buttons at the user's request.
The initial page does not compute the candidate list: the user starts search from
a collapsed disclosure, keeping the saved-layout selector responsive. A changed
scale, harmony or board mapping invalidates the results and asks for a new search.

Chromatic direction means consecutive scale degrees and ascending sounding pitch
along one hex axis, not any generator-derived motion. The basic-hardness target
is L:s = 2:1; proximity and the 5–9-note preference are smooth product heuristics,
not claims of universal melodic quality. Coverage, compactness, and counts of
fingerings within four hex steps stay independently inspectable. Pitch scoring
rewards consistency and gives an explicit preference for rising right/up.

**Persistence.** Layout presets use the existing JSON preset table and optimistic
revision mechanism with a distinct scope. This avoids a second persistence engine
or migration while keeping layout and temperament records isolated. Presets store
mapping context, target size/mode, and canonical geometry; they never silently
retune the active temperament. Source mappings must match, and configurations are
revalidated at the active tuning before use. Backend saves survive across devices;
session files independently retain the current board even without backend access.
Per-button and per-degree overrides clear when the temperament mapping, target
scale/mode, or geometry changes. Loading a saved layout restores its own stored
overrides; ranked and manual layout changes do not carry those overrides forward.

**Harmony.** Desired types are the ready/cancelled filtered v2 catalogue, reusing
its temperament equivalence groups. Score canonical compact inversions across
available roots; use original coordinates when no mapped voicing reference exists.
Average types so a chord with many inversions does not get extra voting weight.
An explicitly selected harmony retains its exact voicing and receives half the
harmony/playability vote, with the other half assigned to the desired catalogue.
This prevents either a large catalogue or one selection from hiding the other.

**Boundary.** The catalogue and layout searches are bounded. The existing
20,000-placement limit is disclosed. Worker generation IDs reject obsolete results,
and caches separate geometry/scale work from chord scoring.
