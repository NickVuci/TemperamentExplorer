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
must never reactivate the retired engine. Manual and board discovery now use
`harmonic-inspection.mjs` adapters over the same target and coherent-lift services.
A/B selects compatible presentations, not a retired engine.

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
mapping or target limits recompute scale defaults. Retuning refreshes analysis
without replacing Discover or Play scale/mode selections. Analysis cache keys
include tuning; automatic scale-default keys exclude it. Manual edits remain stable
within an unchanged mapping/target context, and saved session/material/chord selections survive
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

## D-014 — Mapping identity is a canonical basis/matrix pair

**Decision.** Harmonic mapping keys contain the exact prime basis and both
integer `[period, generator]` rows. Sort basis columns, and reorder both rows
in the same way, only while forming the key; retain each context's original
working order for monzos and coordinates. Do not include tuning, scale, labels,
comma strings, or floating-point pitch coincidence in mapping identity. Kernel
witnesses require exact `Mv = 0`.

**Rationale.** Paired basis-column permutations describe the same
homomorphism, while tuning or incomplete comma metadata cannot change what the
matrix annihilates. Existing state constraints define valid rank-2 matrices;
the context validates those fields with a derived pure reference tuning.

**Rejected alternatives.** Raw ordered JSON keys that change under column
permutation; row reduction that changes coordinate semantics; cent-based kernel
tests; inferring that displayed comma strings enumerate the complete kernel.

**Consequences.** `harmonic-context.mjs` owns the new key and exact witnesses.
Existing key consumers migrate only in their dedicated tasks; versioned cache
identities must preserve the mapping-key schema.

## D-015 — Harmonic quotients keep the mapped octave distinct from the period

**Decision.** Full coordinates, period classes, and mapped-octave classes are
separate policies. The period vector is `[1,0]`; the octave vector is the exact
image of 2/1 when prime 2 belongs to the mapping subgroup. A mapped zero
octave and a missing prime 2 cannot define octave equivalence. For any nonzero
octave vector, an exact unimodular Bézout transform yields a canonical residue,
representative, and removed integer lift. Set keys normalize common translation
and note permutation under the stated policy only.

**Rationale.** Pajara and augmented divide the octave into two and three
temperament periods. Reducing both to a generator number erases distinct octave
classes. A mapped octave may also have a generator component, so period-count
modulus alone is insufficient. The lift certificate reconstructs every input
coordinate without floating-point pitch calculations.

**Consequences.** `harmonic-equivalence.mjs` owns these new quotients. The
existing `chord-projection-v2.mjs#periodClass` is a compatibility path until
its consumers migrate; exact live recognition keeps its current full-coordinate
semantics. Non-octave mappings without 2 still support exact and period classes.

## D-016 — Exact JI spelling and octave family are separate identities

**Decision.** Preserve `chordIdentity()` and its `ji2:` fingerprint. A second,
explicitly selected JI policy groups octave-related members by exact rational
division, octave reduction, and every anchor. Member links retain input order,
exact ratio, family class, octave lift, and doublings. Reciprocal otonal/utonal
families are linked by a dual ID, not merged.

**Rationale.** `4:5:6`, `5:6:8`, and `2:5:6` share harmonic classes but differ
in exact spelling and played register. `1:2` has one class but remains two
voices. Exact family policy allows native non-octave analysis without assuming
mapped octave moves.

**Consequences.** The catalogue can group families; existing full-coordinate
live labels and `ji2:` session identities remain. A later target-set policy
selects exact or octave family semantics; no cent inference is involved.

## D-017 — Harmonic records cross boundaries as validated JSON values

**Decision.** Keep exact arithmetic internal and validate plain JSON-safe
records at future worker/session boundaries. Keys for tuning, target set,
scale/mode and layout include only their explicit upstream dependencies.
Target-set identity depends on odd limit, prime filter, exact mapping subgroup
and representation policy, not the temperament's matrix. Mapping identity
continues to use the exact basis/matrix key. ET status
requires structurally consistent evidence: an empty dyad edge, coherent lift,
or complete nonempty dyads and exhaustive obstruction. The validator checks
the evidence envelope; only the later solver can prove its mathematical truth.

**Rationale.** BigInt, mutable objects and tuned or display text would make
cache identity and cross-boundary records unstable. An incomplete ET search
must remain `unknown`, and a new tuning or mode must not rename a mapped shape.

**Consequences.** `harmonic-types.mjs` owns the new DTO boundaries and key
builders. Existing cache keys, UI consumers and session schema stay active
until their dedicated migration tasks.

## D-018 — JI target sets retain representation policy and source axes

**Decision.** Build finite target sets from every ordered pair of odd
harmonics up to the selected odd limit. Keep each source pair and its exact
octave lift when folding to octave representatives; preserve the diagonal
cells as one explicit unison target. Native exact sets keep reduced odd ratios
unfolded and use no inferred power of 2. Target-set IDs include the actual
sorted mapping subgroup, selected prime filter, odd limit and representation
policy, but not the temperament matrix.

**Rationale.** Several Tonality Diamond cells can represent one ratio target,
and ratios outside the active subgroup may still be useful display targets.
Source provenance lets the diamond and catalogue share identity without
discarding those cells. Non-octave analysis cannot silently octave-fold.

**Consequences.** `ji-limit-engine.mjs` owns enumeration and compatibility
wrappers. Existing diamond display remains octave-based; consumers opt into
native exact analysis explicitly.

## D-019 — Mapped intervals retain aliases and tuning assessments separately

**Decision.** Project a JI target to integer temperament coordinates only when
its entire monzo belongs to the mapping subgroup. Keep every target record,
including distinct JI identities sharing an exact or quotient coordinate.
Compute tuning error as a separate view from the stored exact coordinate and
the actual tuned period/generator. A non-octave mapping without 2 exposes no
octave quotient index.

**Rationale.** Zero-filling a missing prime invents a mapping. Selecting one
enharmonic label loses other JI interpretations. Floating-point cents can
coincide in EDO tunings without creating an algebraic identity.

**Consequences.** `harmonic-intervals.mjs` owns projection and reverse lookup;
legacy classifiers migrate through an adapter and retain their display rules.

## D-020 — Target classification preserves mapped and nearby hit channels

**Decision.** The compatibility classifier obtains canonical mapped
identities from the shared exact coordinate index. It returns mapped matches
independently of tolerance and retains nearby `hits` for other target ratios,
including outside-subgroup targets. Signed interval error is the inspected
interval cents minus the exact JI target cents.

**Rationale.** A mapped target can be inaccurate under the chosen tuning while
an unmapped JI target is a useful closer hit. Hiding either channel would
conflate algebraic representation with tuning quality.

**Consequences.** `createTargetClassifier` keeps its existing response contract
through an adapter; `assignments.mjs` uses the same signed-error helper without
changing its finite search domain.

## D-021 — Alternative mappings are complete validated contexts

**Decision.** A proposed alternative mapping is a whole exact rank-2 context.
An assignment to a target already inside the active subgroup must equal its
unique image. A one-prime extension preserves every existing prime column;
insufficient equations remain unresolved. Basis-column reordering and
unimodular output-coordinate rebases are equivalent representations, while a
changed matrix is reported as a separate mapping context. Chord previews apply
one candidate matrix consistently to every member and dyad.

**Rationale.** Choosing a different coordinate independently for each chord
interval can violate comma/kernel relations and does not define a temperament
mapping. Cent proximity also cannot distinguish a valid mapping from an
incidental approximation.

**Consequences.** `harmonic-mappings.mjs` adapts the exact assignment solver and
returns mapping IDs plus validation evidence. Preview is read-only and carries
no tuning claim unless a separate candidate tuning is later provided. Bounded
prime-column search ranks only within its declared finite domain and reports its
inherited tuning comparison separately from mapping identity.

## D-022 — Incidental approximations do not alter JI mappings

**Decision.** A bounded temperament-lattice candidate is an approximation of a
requested JI target, not another mapping of that target. The exact canonical
coordinate and its tuning error remain an independent baseline when the target
is in the mapping subgroup. Outside-basis targets have no canonical baseline.
Exact coordinate identity remains separate from floating-point error and from
collisions with other JI identities in a supplied target set. Search reports
its finite generator bound and checks both period coefficients at an exact
nearest-period tie.

**Rationale.** An incidental interval can tune closer than the canonical image
without preserving the temperament's integer mapping or comma kernel. Treating
it as a mapping would conflate approximation quality with algebraic identity.

**Consequences.** `harmonic-approximations.mjs` owns bounded lattice search and
shared tuning-error records. The default generator bound is ±32, hard cap is
±256, and at most three strict improvements are returned. Scale and chord
approximation searches adapt this engine while preserving the same identity
boundary. Existing finite scale and tonic-mode approximation adapters now use
its common error and ranking policies; their compatibility outputs remain
unchanged.

## D-023 — Chord approximations are root-relative coordinate assignments

**Decision.** A chord-level approximation chooses one bounded coordinate for
each exact JI member relative to a fixed `[0,0]` root. Every dyad is derived by
subtracting the two member coordinates. Independent dyad approximations are
never combined into a chord. The exact canonical chord projection remains a
separate comparison; aggregate improvement is defined only when every member
has a canonical coordinate, using the sum of absolute dyad errors.

**Rationale.** Pairwise best approximations can fail cycle cancellation and may
not correspond to any pitch collection. Root-relative vertices guarantee that
all displayed dyads belong to one realizable tempered shape. The comparison
also retains whether the selected mapping subgroup supplies a conventional JI
interpretation.

**Consequences.** `searchChordApproximations` returns an approximate shape
linked to its source JI identity and interpretation, with all edge errors and
optional exact target-set collisions. Member shortlists, combination count and
dyad-derivation count are explicitly bounded and report partial coverage. An
approximate shape never becomes a new mapping variant or a physical fingering.

## D-024 — ET eligibility uses coherent exact JI-class lifts

**Decision.** A JI-lift test anchors one tempered vertex at unison and assigns
each other vertex one exact target interpretation from its complete root-edge
domain. Octave-policy comparisons quotient only the exponent of prime 2;
native-exact comparisons retain every prime exponent. Every assigned pair must
match an interpretation in its directed dyad domain. Apply pairwise domain
consistency and deterministic smallest-domain branching; report a no-lift
result only after exhaustive search. Restore each selected target's integer
mapped-octave lift by matching its mapped coordinate to the shape's exact
coordinate difference. Cancellation or either work-budget limit yields
`unknown`.

**Rationale.** Comparing only tempered classes without retaining all JI
interpretations can miss a valid chord lift. Comparing only one cycle can
mistake a failed spelling for an essentially tempered chord. Prime-2 exponent
quotient is the exact JI octave relation and remains separate from a
temperament's period; native non-octave analysis has no octave quotient.
Restoring the mapped lift preserves exact coordinates in divided-period maps
and never relies on 1200-cent period assumptions.

**Consequences.** `harmonic-ji-lift.mjs#findCoherentJILift` returns a verifiable
vertex and edge witness, exhaustive `no-lift`, or incomplete `unknown`.
`harmonic-et.mjs#assessET` converts complete solver evidence
into a target-set-relative ET assessment; the solver itself does not label
shapes ET.

## D-025 — ET results carry exact cycle evidence and replayable completeness

**Decision.** Classify a shape as not dyadic when any selected target edge has
an empty domain, JI-liftable when a coherent vertex assignment is verified,
essentially tempered only after complete no-lift search, and unknown when a
search budget or cancellation prevents completion. An ET result is scoped to
mapping, target set, shape and equivalence. Representative directed cycles are
explanatory only; each selected edge is lifted to the shape's exact coordinate
difference, and the corrected cycle monzo must pass `M·v = 0`. The exhaustive
finite CSP certificate remains the proof of non-liftability.

**Rationale.** In octave analysis, canonical target representatives can make
a raw cycle sum to the mapped octave. Calling that raw sum a comma confuses
register with kernel. Restoring each known octave lift yields a true exact
kernel vector or a zero register cycle. One inconsistent cycle also does not
rule out another interpretation, so it cannot replace exhaustive search.

**Consequences.** `harmonic-et.mjs#assessET` stores target-set-relative
statuses, domain counts, a bounded-search certificate and representative
kernel cycles. `cycleWitness` verifies exact matrix images, while
`verifyETEvidence` replays a complete negative proof and recalculates its
cycles. Tuning quality and scale occurrence remain independent overlays.

## D-026 — Stream bounded harmony discovery without merging identities

**Decision.** `discoverDyadicHarmony` consumes the rooted dyadic-shape iterator
and classifies each yielded shape under one explicit mapping, JI target set and
equivalence policy. It emits immutable batches with separate ordinary JI,
essentially tempered, unknown and non-dyadic collections, then one final
completeness envelope. A shape becomes ET only after its complete no-lift
certificate; a bounded, cancelled or unassessed shape stays unknown or
unassessed. JI family identity reuses `harmonic-equivalence.mjs#harmonicIdentity`
and remains distinct from the temperament shape, exact member monzos and
register lifts. The assessment solver supplies one deterministic coherent JI
lift per shape; catalogue merging must retain additional JI labels supplied by
the ordinary chord producer.

**Rationale.** Joining enumeration and proof search must preserve the difference
between an empty complete catalogue and a partial search, as well as the
difference between ET evidence and an unresolved candidate. Reusing the shared
JI family identity prevents the ET engine from introducing another inversion
and octave normalization. Total state and compatibility counters make the job's
combined work finite, while explicit bounds remain part of the result context.

**Consequences.** The async iterator exposes `progress`, immutable result
batches and terminal states `complete`, `complete-empty`, `incomplete` or
`cancelled`. `AbortSignal` and `shouldCancel` are checked between shapes and
inside the synchronous lift solver; event-loop yielding occurs between batches
and during short time slices. The producer currently has no result cache. If a
cache is added, its key must include mapping, target set, equivalence, all
enumeration and assessment bounds, and every algorithm version; partial streams
must never be reused as complete results.

## D-027 — Catalogue jobs share mathematics and reject obsolete contexts

**Decision.** The catalogue joins established producers and preserves exact JI
rows within shape/family groups. It does not compute occurrences or placements.
Its full query context includes matrix/basis working order, tuning, target set,
categories and all producer bounds; scale/mode/tolerance do not filter it.
Worker messages carry both a monotonic request ID and full context ID. A newer
request, cancellation or destruction makes every older message ineligible.

**Rationale.** Joining records must not erase enharmonic interpretations or
promote partial/unknown searches to complete ET truth. The main thread fallback
needs the same exact proof algorithm and budgets as the Worker. Separate
algorithms would risk differing proofs and cancellation behavior.

**Consequences.** Cooperative graph, lift and chord-approximation generators are
driven by synchronous compatibility wrappers or asynchronous job wrappers.
They yield every 256 counted work items without resetting search budgets.
Each dispatcher owns an LRU of eight contexts, with a two-million-byte serialized
cap per result (at most sixteen million bytes of cached serialized payload).
Incomplete/cancelled results and oversized complete results are not cached.
The byte limit describes serialized payload, not a JavaScript heap guarantee.
Legacy Play envelopes remain supported until the planned UI migration.

## D-028 — Occurrence membership preserves voices and realization uses actual lifts

**Decision.** JI and coordinate-only shapes share one period-repeated scale
membership engine. Shape and scale context own the new occurrence ID; a JI label
is optional metadata. Every full source member and octave residue survives a
shared degree assignment. Full member links take precedence over quotient DTO
classes; repeated quotient classes without source coordinates are rejected
because their removed register lifts cannot be recovered honestly.

**Rationale.** Period membership answers whether a pitch belongs to the repeated
scale, but cannot decide whether two source voices should become one. A 1:2
octave and an augmented triad over a divided period must retain their sounding
voices. Quotient-only representatives cannot supply erased registers.

**Consequences.** Realization defaults to preserving members; full-coordinate
deduplication requires explicit `exact-unique` policy. Register moves use actual
mapped M(2), or a labelled mapped native reference, and record the full vector
per voice. Optional JI error overlays compare actual sounding intervals to ideal
reference lifts, including stretched references. Output analysis is immutable
without freezing callers' input data. Legacy occurrence IDs/counts remain
compatible; default legacy realization IDs remain stable where the sounding
coordinates are unchanged. The divided-octave composition baseline intentionally
restores its previously omitted 5/4 voice, while its historical corpus is retained.


## D-029 — Harmonic discovery is the sole chord catalogue

**Decision.** Discover → Chords always opens harmonic discovery. The former
classic-view selector and its per-device preference are removed. Older session
files continue to load, but their A/B preference is ignored. The manual
inspector remains available for direct coordinate inspection. Play consumes a
validated full-coordinate selection and resolves board placements separately.

**Rationale.** The user asked to remove the classic-view toggle. Catalogue
identity, source sound, finite-scale membership, tuning quality and a chosen
board fingering remain separate facts. A diamond approximation or ET shape
must not receive invented canonical JI metadata. No handoff may silently resize
the Play scale or change the requested registers.

**Consequences.** B uses the Stage 7 jobs and Stage 8 occurrence/realization
owners. Mapping adoption and Play scale fit are explicit. Stale catalogue
contexts clear actionable previews; ET starts/restarts explicitly and saved
assessment metadata stays historical. Optional selection provenance preserves
valid old material even when metadata is unsupported. B live family recognition
retains exact played registers and discloses canonical quality separately.
Layout scoring groups shared abstract shapes once, retaining aliases/inversions
as variants. Stage 12 migrates manual and board coordinate inspection to the
shared domains, coherent-lift solver and bounded candidate service. Older pins and session adapters remain usable. The classic catalogue toggle
was removed by the later D-029 decision; legacy saved mode values are ignored.


## D-030 — Independent voice release and bounded master output

**Decision.** A release gate after each voice's attack/decay envelope uses a
60 ms raised-cosine fade to exact zero. Interruptions never cancel an active
attack or decay. Only future, not-yet-started release curves are cancelled.
Oscillators stop after the fade, and future sequence notes cancel before onset.
A shared attenuator and soft output shaper leave signals below 0.6 unchanged and
bound excessive polyphony below 0.95; temperament pitch and frequency remain
unchanged.

**Rationale.** Longer releases alone did not solve the reported click. Cancelling
an automation ramp can remove its endpoint and change the preceding curve;
compatibility patches depend on browser automation details. An independent gate
avoids that operation entirely. Rendered stress tests also demonstrated peaks
above unity with the former square-root chord normalization and fixed held-note
gain. Output protection addresses all playback paths, including release overlap,
without limiting which notes the user can sustain.

**Validation.** Audio lifecycle and pointer integration tests; external 48 kHz
software Web Audio rendering of normal releases, interrupted decay, rapid drag,
short-tap Stop, 64-note unison chords and 100 sustained voices. This is not a
measurement of the user's browser or physical output.


## D-031 — Coordinate inspection shares catalogue harmonic truth

**Decision.** Arbitrary manual/board coordinates feed the shared target projector,
dyad index, coordinate shape projection and existing ET solver. A separate
pair-quality overlay preserves familiar mapped/alternative tolerance filtering.
The same bounded finite-coordinate candidate search serves scale and board
compatibility adapters; board reach constrains candidates, not harmony's meaning.

**Rationale.** Individually plausible inner intervals do not establish a coherent
JI chord. Mapping truth must remain independent of tolerance, physical reach,
period display folding and register changes. Reusing the established proof and
quotient owners avoids a third analytical engine.

**Consequences.** Selected chords display coherent-JI/ET/not-dyadic/unknown states,
with explicit target policy and finite evidence. Repeated harmonic classes keep
all sounding voices and are not classified as ET. Full coordinates enter proof
assessment even when the quality matrix displays intervals modulo one period.
The manual degree/session wrappers preserve old JSON and pins; a bounded-search
status is available without changing the frozen compatibility results. The A/B presentation selector was removed under D-029. No mapping,
tuning, fingerings, session identity or historical corpus is regenerated.
