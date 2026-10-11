# Harmonic discovery execution ledger

This ledger tracks the staged implementation in `Temperament_Explorer_Harmonic_Discovery_Plan.md`. The plan is a design reference; entries below are results from the actual checkout and commands. A baseline commit is evidence, not permission to reset newer source.

## Task 0.1 — Reproducible baseline fixtures

**Status:** PASS

**Audit baseline:** `89b51bbcdd5195c0c8f2dd08ac9da114834bd066` (`Temperament Lab` Site version 200 at planning audit). Reopened Site checkout reports the same commit. `git status --short` was empty before this task's files were added. Runtime: Node `v24.19.0`.

**Files added:**

- `tests/fixtures/harmonic-discovery/reference.json` — schema version 1. Captures actual preset/custom basis, rows, period/generator cents, scale size/mode, tuning, and comma inputs. Separates `expectedExisting` mapping facts from `expectedNew` acceptance expectations, so future feature expectations are not presented as current behavior.
- `docs/HARMONIC_DISCOVERY_PROGRESS.md` — this execution ledger.

The fixture includes meantone, 5-limit porcupine, the exact 2.3.5.11 porkypine subgroup, magic11, divided-octave Pajara11, augmented 128/125, and the 3.5.7 non-octave 245/243 case. Preset tuning values were read from the current code; the two custom states were constructed with the existing `fromCommas` implementation. Source paths and coordinate conventions are recorded in the fixture.

**Baseline commands and exit codes:**

| Command | Exit |
|---|---:|
| `node tests/chord-v2-identity.mjs` | 0 |
| `node tests/chord-v2-projection.mjs` | 0 |
| `node tests/chord-v2-occurrence.mjs` | 0 |
| `node tests/chord-voicings.mjs` | 0 |
| `node tests/live-chord-recognition.mjs` | 0 |
| `node tests/ji-limit-engine.mjs` | 0 |
| `node tests/non-octave-periods.mjs` | 0 |
| `node tests/chord-v2-corpus.mjs` | 0 |
| `node tests/chord-v2-discovery.mjs` | 0 |
| `node tests/chord-v2-compatibility.mjs` | 0 |
| `node tests/diamond-workspace.mjs` | 0 |
| `node tests/workflow-material.mjs` | 0 |

**Independent arithmetic check:** a Python check parsed the JSON and independently factored each fixture ratio against its declared prime basis, then dotted exponents with the recorded rows. All 30 listed existing mapping facts matched, including meantone 9/8 and 10/9 both mapping to `[−1,2]`, 81/80 mapping to `[0,0]`, and unmapped 7/4 for the relevant bases. It also confirmed the 4:5:6 meantone coordinates `[0,0]`, `[−2,4]`, `[0,1]` and the 16/15 approximation errors for `[3,−5]` and `[−15,26]` within `10⁻⁸` cents. This is a fixture validation, not a new production test or an ET implementation.

**Observed baseline:** all 12 requested existing suites passed. The frozen chord corpus reported 99 passing cases. No pre-existing failure or source/plan conflict blocked the next task. Browser interactions, full `npm test`, and build were outside task 0.1 and remain unverified here.

**Production source:** unchanged. No app implementation, existing tests, dependencies, sessions, hosting configuration, or deployment was modified.

**Dependencies checked:** none; 0.1 is complete and 0.2 is unblocked.

## Task 0.2 — Characterize identity and period boundaries

**Status:** PASS. `tests/harmonic-baseline.mjs` was added; each fixture
`expectedNew` record now has `status: "not-implemented"`. Production source did
not change.

The passing baseline distinguishes exact `4:5:6`, `5:6:8`, and `2:5:6` spellings
and verifies each seeded full-coordinate live label. The reciprocal
`1/6:5:4` keeps its distinct exact identity and `10:12:15` otonal alias.
Meantone `1:81/80` has two JI members but one full coordinate. The augmented
`1:5/4:25/16` has three full coordinates and one current generator-only period
class; this documents the existing projection behavior rather than endorsing
it as future octave-family identity. The 3.5.7 tritave maps 3/1 and leaves 2/1
and 3/2 outside its actual subgroup.

`node tests/harmonic-baseline.mjs`, identity, projection, live-recognition,
voicing and non-octave suites passed. D-013 and production identity code were
unchanged. Dependency 0.1 PASS; 0.3 unblocked.

## Task 0.3 — Capture workflow baseline and contract checklist

**Status:** PASS. This is a read-only workflow audit and a progress entry; no
production source, session format, UI state owner or deployment changed.

| Flow | Current owner and handoff |
|---|---|
| Discover → Chords | `app.mjs` routes to `chord-ui.mjs`, which uses `harmonic-inspection.mjs` for coordinate inspection, occurrences and scale discovery. |
| Play → Scale Chords → HexBoard | `hexboard-ui.mjs` hosts `chord-catalog-ui.mjs`/v2 and a separate board layout finder, with Play's own `n`/`mode` from `getLayoutStates()`. |
| Diamond → Open in Chords | `diamond-workspace.mjs` sends coordinates and a label; `fitDiamondChord` can select a fitting Discover scale/mode, then `chordWorkspace.fromCoordinates` receives them. Typed JI identity is not carried. |
| Play catalogue → Inspect/Collect | Inspect adopts a state and coordinates into Discover manual Chords; Collect creates material. |
| Session | `app.mjs` separately saves `chords`, `hexboard.catalogue`, `material`, and `layoutScale`. |
| Live labels | The shared HexBoard player's held and Shift-latched coordinates feed `scheduleLiveChordUpdate`; D-013 matching does not change selected chords. |

The active Discover chord route is an audit discrepancy with D-006's claim that
the old catalogue engine was fully removed. It stays in the migration inventory;
no removal is safe before replacement and regression checks. Diamond and
catalogue handoffs currently preserve realized coordinates and text, not a
shared harmonic record.

`node tests/chord-v2-workflow-ui.mjs`, `chord-v2-compatibility.mjs`,
`diamond-workspace.mjs`, `workflow-material.mjs`, `hexboard-player.mjs` and
`live-chord-recognition.mjs` passed. `npm run build` passed with 65 app assets.
Those suites exercise navigation, restore, independent scales, diamond handoff,
collection and sustain through test seams. Live pointer, visual and accessibility
interaction remains unverified.

**Stage 0 gate — PASS.** Preserve existing `ji2:` exact spelling separately
from a future policy-keyed octave family. A fixed matrix gives one canonical
`Mv`; alternative mappings require another consistent mapping context or
extension. A non-octave subgroup must not gain prime 2 or 1200-cent folding by
default. ET classification requires exhaustive failure of coherent JI lifts
from the selected finite target set; a cycle witness explains a branch failure,
and search-budget exhaustion must be reported as unknown.

No unresolved theory issue blocks Stage 1. Dependencies 0.1 and 0.2 PASS;
task 1.1 is unblocked.

## Task 1.1 — Introduce exact ratio-to-monzo conversion

**Status:** PASS. Added `dist/ji-monzo.mjs` and `tests/ji-monzo.mjs`.
`ratioMonzo` reduces positive rational inputs with BigInt before bounded
factorization; it returns JSON-safe sparse prime exponents, an optional vector
in the caller's actual basis order, missing-prime diagnostics and reduced ratio
strings. Raw components are limited to 256 decimal digits and reduced
components to 10^12. `mapMonzo` performs integer matrix products with BigInt
intermediates and safe-integer coordinate outputs. No existing caller changed.

The independent cases include 14/14, 81/80, 21/14, missing 7, prime 97,
basis permutation, very large common factors, invalid input and overflow.
`node tests/ji-monzo.mjs` passed. Stage 0 gate PASS; 1.2 unblocked.

## Task 1.2 — Route mapping and chord monzos through the primitive

**Status:** PASS. `dist/engine.mjs#mapRatio` and
`dist/chord-identity-v2.mjs` now use the shared ratio factorizer and exact map.
Their public signatures, `null` for outside-basis intervals, `ji2:` exact
fingerprints and corpus labels remain intact. Removed only the two local
factorization loops in these owners. Added cross-cancellation, missing-prime
and invalid-input assertions in `tests/shared-core.mjs` and
`tests/chord-v2-identity.mjs`.

`21/14` and `3/2` both map to meantone `[0,1]`, even when large safe common
factors cancel before the 10^12 factorization bound. Uncancelled 7/4 remains
outside 2.3.5; 81/80 and 97/64 keep exact exponents and missing-prime
diagnostics. Targeted monzo, mapping, identity, projection, corpus and
non-octave tests passed. `npm run build` passed (66 app assets); `npm test`
passed 48/48 suites. No tuning algorithm, UI, package, lockfile, session or
hosting configuration changed.

**Dependencies:** 1.1 PASS. Task 1.3 is unblocked.

## Task 1.3 — Add mapping-context keys and exact kernel witness checks

**Status:** PASS. Added `dist/harmonic-context.mjs` and
`tests/harmonic-context.mjs`; updated `ji-monzo.mjs` so its shared BigInt matrix
product also provides a zero-image predicate without unsafe coordinate
conversion. D-014 and `PROJECT_STATE.md` record the mapping-only key contract.

The context validates the actual ordered basis and rows through the existing
state constraints, using a derived reference tuning solely for validation.
The immutable record retains working order; its versioned key sorts basis
columns and applies that same permutation to both mapping rows. Tuning,
scale, labels and comma text are excluded. The witness validator returns an
exact ratio only for kernel vectors bounded to ±1000 exponents, matching
existing comma-vector input. The general kernel predicate can decide even
when a nonzero image would exceed the safe Number coordinate range.

Cases verified: meantone 81/80 maps to `[0,0]`; scaled 6561/6400 is a kernel
witness; 128/125 maps to `[7,-12]` and is not a kernel vector despite a
zero-cent coincidence at `p=1200,g=700`; paired column permutation preserves
the key, changing a column changes it; Pajara's divided-period mapping
annihilates 50/49 and 64/63. Neither `fromCommas` nor existing cache-key
consumers changed.

`node tests/harmonic-context.mjs` and `node tests/ji-monzo.mjs` passed.
`npm run build` passed with 67 app assets; `npm test` passed 49/49 suites.
No unresolved issue blocks 1.4. Dependency 1.2 PASS.

**Durable checkpoint:** local Git commit `09b73ec` records the reviewed work
through task 1.3. It is a source checkpoint, not a deployed Site version.

## Task 1.4 — Implement explicit coordinate quotients

**Status:** PASS. Added `dist/harmonic-equivalence.mjs` and
`tests/harmonic-equivalence.mjs`. `equivalencePolicy` defines exact, actual
temperament-period and mapped-octave equivalence. `quotientCoordinate` returns
the class, representative and removed integer lift; adding the removed vector
reconstructs every input exactly. `shapeKey` tries every common anchor,
deduplicates and sorts classes, and includes the versioned mapping/policy key.
It identifies common translation and permutation, with no implicit reflection.

Pajara retains the residue modulo two periods and augmented retains residues
modulo three. For a non-generator-free octave such as `[2,3]`, extended Euclid
constructs an integer unimodular transform; nonprimitive and negative octave
vectors also round-trip. A 3.5.7 native mapping permits exact/period policies
but rejects octave mode. A mapped zero octave is rejected. Legacy
`periodClass`, chord projection, occurrence and live recognition remain intact.

`node tests/harmonic-equivalence.mjs`, `non-octave-periods.mjs`,
`chord-v2-projection.mjs` and `live-chord-recognition.mjs` passed. D-015 and
`PROJECT_STATE.md` document the separated semantics. No UI, tuning, session,
package or hosting change. Dependency 1.3 PASS; task 1.5 is unblocked.

## Task 1.5 — Register-independent JI family identity

**Status:** PASS. `harmonicIdentity` groups exact rational chord members under
an explicit exact or octave policy, trying every anchor and preserving exact
input-member ratio, family class, octave lift and voice multiplicity. A
reciprocal `dualIdentity` links otonal and utonal families without merging
them. `compareExactRatios` reuses the established exact comparator. The
`4:5:6`, `5:6:8`, `2:5:6` and proportional voicings share an octave family;
the utonal dual remains distinct, and double dual returns the first family.
Repeated members and `1:2` retain their voices despite class collapse.

`node tests/harmonic-family.mjs`, `npm run build` (68 assets), and `npm test`
(51/51 suites, including the frozen chord corpus and live recognition) passed.
D-016 and `PROJECT_STATE.md` record the semantics. No UI, session, tuning, or
hosting change. Dependency 1.4 PASS; task 1.6 is unblocked.

## Task 1.6 — DTO validators and dependency-specific keys

**Status:** PASS. Added `dist/harmonic-types.mjs` and
`tests/harmonic-types.mjs`. Mapping, shape, selection and ET assessment DTOs
have pure JSON-safe validation. Canonical serialization sorts object keys and
rejects BigInt, unsupported values, unsafe integers and cycles. Versioned
mapping, tuning, target, scale/mode and layout keys retain only their declared
dependencies. Target limits reuse `ji-limit-engine.mjs#validateJILimits`;
target keys distinguish prime-limit shorthand from explicit subgroups and
native exact from octave interpretation. The ET validator rejects complete `unknown`
and incomplete ET claims, and requires status-specific evidence envelopes;
mathematical proof remains the future solver's responsibility.

Independent tests cover basis permutation, tuning and mode/layout invalidation,
non-octave target policy, divided period, invalid status combinations,
cross-context rejection and JSON/structuredClone round trips. Focused Stage 1
tests passed. `npm test` passed 52/52 suites; `npm run build` produced 69 app
assets. D-017 and `PROJECT_STATE.md` record ownership. No UI consumer,
session schema, tuning, package, hosting or deployment changed.

**Stage 1 gate — PASS.** Tasks 1.1–1.6 have passing independent tests and full
regression coverage. Exact monzos/mapping and kernel witnesses, distinct
coordinate quotients, JI family links and JSON-safe record boundaries now have
authoritative pure APIs. Existing production chord workflows retain their
compatibility paths. Limitations: target enumeration, standard chord
generation, mappings, approximations, ET search and catalogue integration
remain future stages; ET evidence validation alone does not classify a chord.
No unresolved failure blocks Stage 2.

## Task 2.1 — Expose target identity, unison and source provenance

**Status:** PASS. `ji-limit-engine.mjs` now owns shared odd-axis source-pair
enumeration. `targetSet` returns one immutable ratio target per selected
octave identity, a stable target-set/target ID, all contributing source axis
pairs with indices and exact octave lifts, unison provenance, and an explicit
subgroup-membership flag. The legacy `diamondTargets` and `targetsForLimits`
outputs remain behaviorally compatible and retain their order.

Target-set keys use odd limit, canonical prime filter, actual mapping subgroup
and representation policy; they do not vary when only the temperament matrix
changes. A numeric prime limit and the equivalent complete subgroup share an
ID. Outside-subgroup targets can remain in unfiltered display sets while being
marked unavailable in that mapping subgroup. Tests cover L=3, 15 and 97,
inverse closure, duplicates, unison, omitted-prime filtering and unchanged
legacy arrays. `node tests/ji-target-set.mjs`, `ji-limit-engine.mjs` and
`harmonic-types.mjs` passed. Dependency 1.2 and 1.6 PASS; task 2.2 unblocked.

During this task, review found the initial task 1.6 target-key helper included
the full matrix. That would have made a JI target set change identity when the
temperament changed despite identical limits/subgroup. This was corrected
before any consumer was added and recorded in D-017.

## Task 2.2 — Add native exact target policy

**Status:** PASS. `targetSet` now supports both explicit `octave` and
`native-exact` representation policies. Native target sets retain reduced,
unfolded odd-axis ratios and their inverse source pairs; they add no powers of
2, octave folding, or inferred basis primes. IDs include the representation
policy. `inMappingSubgroup` reports eligibility against the actual subgroup,
while the existing octave diamond continues to omit unavailable 2-based cells.

On the 3.5.7 mapping fixture, 3/1 and 5/3 are valid mapped targets, while 3/2
is outside the subgroup; the native target set preserves 3:5:7 pair targets.
Inverse closure, zero-lift provenance, octave-display compatibility and
policy-specific IDs passed in `node tests/ji-target-set.mjs`. Existing
`ji-limit-engine.mjs` tests also passed. No visible display policy changed.
Dependency 2.1 PASS; task 2.3 unblocked.

## Task 2.3 — Build mapped interval index and error view

**Status:** PASS. Added `dist/harmonic-intervals.mjs` with
`mappedIntervals`, `indexByCoordinate`, `edgeInterpretations` and
`intervalError`. Each target keeps its exact ratio, monzo, missing-prime
diagnostic, mapping ID, coordinate and quotient keys. A target outside the
actual subgroup receives `coordinate:null`; the matrix is never applied to a
partial monzo as if missing primes were zero. Multiple JI identities can share
one exact or quotient coordinate and remain independently addressable.

The tuning error is a separate immutable view using `periods * actualPeriod +
generators * actualGenerator - 1200*log2(target ratio)`. Changing tuning
recomputes only that view. Non-octave mappings without 2 expose exact/period
indexes and report octave indexing unavailable. Tests independently verify
meantone 9/8 and 10/9 at [-1,2], distinct target errors, 7/4 unmapped,
unison/comma alias retention, EDO acoustic coincidence without coordinate
collapse, and tritave period error against the actual period. The new focused
suite and native/period regressions passed. Dependencies 1.4 and 2.2 PASS;
task 2.4 unblocked.

## Task 2.4 — Migrate the shared target classifier

**Status:** PASS. `engine.mjs#createTargetClassifier` now projects its supplied
target rows through `harmonic-intervals.mjs`, builds one exact coordinate
index, and queries all target identities at the inspected coordinate. It
preserves the prior `mapped` versus tolerance-based `hits` response and M/A/O
provenance, including mapped targets outside tolerance alongside valid nearby
outside-basis hits. A shared `signedIntervalError` is used by the classifier
and `approximation-compat.mjs`; approximation search bounds and candidate domains did
not change.

The dreamtone 13/12 versus 15/14 regression verifies mapped-outside-tolerance
and nearby-hit coexistence. `shared-core`, `shared-ji`, `octave-matrix`,
`diamond-tolerance`, `tonality-diamond`, `scale-milestones`,
`harmonic-intervals` and `ji-target-set` passed. The legacy classifier
signature and display priorities remain intact. No UI layout, session,
keyboard, tuning or hosting change. Dependencies 2.3 PASS.

**Stage 2 gate — PASS.** Shared target construction now retains target-set
identity, subgroup, source axis pairs and octave/native representation. The
mapped interval index projects only complete subgroup monzos and preserves
enharmonic JI aliases. The first existing classifier consumes that index and
keeps its compatibility behavior. Stage 2 is complete; standard chord
producers and catalogue remain future work. Stage 3.1 is next and is not
started.

## Task 3.1 — Separate projection classes and cardinalities

**Status:** PASS. `projectChord` now exposes named exact, period and octave
shape identities with stable member-to-class links, and returns an explicit
native-exact identity for non-octave analysis. The coordinate-only
`projectCoordinateShape` adapter applies the same equivalence engine to
objects without JI spellings. Existing `temperedCardinality`, collision
groups, occurrence-facing `temperedFingerprint`, and `cardinalityStatus`
remain period-based; the projection labels that compatibility contract rather
than silently changing it. Exact JI octave-family and dual-family identities
are also exposed independently of the temperament quotient.

Tests cover 4:5:6; its octave-displaced 5:6:8 spelling; the reciprocal
utonal-family link; a comma unison; 1:2; three distinct octave residues in
128/125 augmented temperament; Pajara's two-period octave with a multiregister
member collision; and unavailable octave equivalence for native 3.5.7.
`node tests/chord-v2-projection.mjs` passed, as did
`node tests/chord-v2-corpus.mjs` (99 frozen outcomes, including occurrence
counts) and `git diff --check`. Dependencies 1.5 and 2.3 PASS; task 3.2 is
unblocked. No consumer behavior or UI changed.

## Task 3.2 — Extract curated JI chord identities and dual families

**Status:** PASS. New `harmonic-ji-chords.mjs` owns the explicit curated seed
list and bounded harmonic-series segment producer. `curatedJIChords()` returns
exact identities with octave-family/dual-family IDs, exact reciprocal identity
and stable source provenance. `makeJIInterpretation()` is also available for
custom exact identities; absent explicit presentation metadata, it does not
infer an otonal/utonal label. `chordCandidates()` remains the compatibility
wrapper and returns only the previous five fields. Rich family data is built
only when requested, so discovery and live recognition do not pay that cost.

The compatibility regression checks all 224 candidates in their old order,
labels, forms and pair IDs against the pre-extraction SHA-256 fingerprint.
Further tests verify 4:5:6/5:6:8 share a family but retain distinct exact
identities; the reciprocal exact dual round-trips; a custom chord stays
unclassified; and source records do not freeze caller-owned inputs. Exact duals
are constructed by reciprocating canonical rational members rather than
reciprocating integer display aliases; the latter can exceed parser bounds for
larger curated candidates.

Passed: `node tests/chord-v2-discovery.mjs`,
`node tests/live-chord-recognition.mjs`,
`node tests/chord-v2-relationships.mjs`,
`node tests/layout-recommendations.mjs`, `node tests/chord-v2-ui.mjs`, and
`git diff --check`. Legacy candidate order/count and existing discovery, live
recognition, relationship and layout behavior remain unchanged. Dependency
3.1 PASS; task 3.3 is unblocked.

## Task 3.3 — Generate target-derived harmonic lines and bounded subsets

**Status:** PASS. `harmonicLines(mapping, targetSpec)` consumes the shared
`targetSet` and its actual source-axis cells, then validates every projected
interval through `mappedIntervals` and the exact monzo mapper. Mapped numerator
axes sharing a denominator axis form candidate lines. Common integer factors
are removed only to establish proportional JI identity; original denominator
axis rows, source cells, octave lifts, exact member coordinates and target IDs
remain as provenance. The source-axis scope is explicitly finite and separate
from arbitrary dyadic chord search. Otonal lines derive from integer partials;
their reciprocal identities are emitted as linked utonal records. A line is a
chord only when all its dyads map under the selected target set and it has at
most eight members. Larger or pair-incomplete sets remain full collections.

`analyzeJIDyads` classifies every custom chord edge as mapped, target-limit
failure, or mapping-subgroup failure; zero-edge repeated unisons are marked
degenerate. Harmonic-axis results count mapped source cells, subgroup failures
and pairs excluded by target limits separately. Thus the 1/5:1:5 example at
L=5 reports its 25/1 edge as an odd-limit failure while its two root-relative
dyads remain mapped.
`enumerateJISubsets` accepts a harmonic-line catalogue, defaults to sizes 3–6,
requires a single explicit selection for sizes 7–8, and pages deterministic
combinations with a context-bound resumable cursor. The default page is 48,
maximum 128, and each call has a bounded scan count. The line cache is LRU
bounded to 24 target/mapping contexts. Native non-octave analysis requires the
shared `native-exact` target policy; octave target policy is rejected if prime 2
is absent from the mapping subgroup.

Tests verify 4:5:6 and its dual family at L=5, the seventh at L=7, the 4:5:6:7:9:11
family at L=11, mixed root-valid/pair-invalid custom chords, target-limit versus
mapping failures, non-octave targets, >8-member collections, page/cursor
resumption, explicit large-size selection, and stable source-cell provenance
under axis/source ordering changes. `node tests/harmonic-ji-chords.mjs` passed.
The final L=97 benchmark built the harmonic axes in 76.55 ms (421 mapped source
cells) and enumerated a 128-item size-8 page from a 19-member line in 199.42 ms
(75,582 combinations total, still paged). Large-page execution should stay in a
worker when the catalogue query layer is connected; no UI was connected in
this task.

Final Stage 3 gate — PASS. `npm test` exited 0 (55/55 suites), `npm run build`
exited 0 (71 app assets), and `git diff --check` exited 0. No existing
discovery, live recognition, relationship, scale, diamond, or HexBoard UI path
was migrated. Stage 3 is complete.

## Task 4.1 — Validate explicit alternative mapping contexts

**Status:** PASS. New `harmonic-mappings.mjs#validateMappingVariant` adapts the
existing exact `checkAssignments` solver. It distinguishes an identical mapping
(including paired basis-column reordering), an exact unimodular coordinate
rebase, an extension that preserves every old prime column, and a separate
changed mapping context. Extension proposals that contradict an existing
column are conflicts; insufficient equations remain unresolved. A fixed
in-basis target reports its single canonical image and an empty list of
alternatives within that mapping.

Every accepted context has a stable mapping ID and validation evidence.
`previewMappingVariant` projects every exact chord member and every unordered
dyad through the same validated candidate context, then attaches exact shape
identities when the whole chord is in-basis. It is pure: it does not adopt a
mapping, mutate active state, or invent tuning errors when no candidate tuning
was supplied.

Tests cover the meantone 5/4 conflict and unique image; both planned 7/4
extensions (`[-5,10]` and `[2,-2]`) with unchanged 2.3.5 columns; a combined
77/32 relation that cannot determine 7 and 11 separately; fractional-coordinate
rejection; basis reorder and unimodular rebase; changed-context assignment
validation; full 4:5:6 projection and a candidate 7/4 projection. Passed
`node tests/harmonic-mappings.mjs`, `node tests/harmonic-context.mjs`,
`node tests/harmonic-types.mjs`, `node tests/analysis-workspace.mjs`,
`node tests/harmonic-ji-chords.mjs`, `node tests/chord-v2-projection.mjs`, and
`git diff --check`. Existing assignment UI and chord consumers were not
migrated. Task 4.2 was unblocked.

## Task 4.2 — Enumerate bounded one-prime extensions

**Status:** PASS. `enumerateMappingExtensions(context, target, options)` now
searches a single missing prime only. For each generator coefficient `b` in
the selected interval, it checks the nearest integer period coefficient(s) to
the prime's ideal cents and offsets −1, 0 and +1. Bounds are 16 by default,
with explicit 32 and 64 expansions; mapping coefficients remain within the
existing ±1000 limit. Each proposed prime column is validated through
`validateMappingVariant` and the exact `checkAssignments` solver, so every
result is a complete mapping context that preserves all original columns.

Results rank by the target interval's absolute tuning error under the supplied
or active period/generator, then by `|generator column|` and stable coordinate
order. They retain target ratio and source target ID, missing prime/exponent,
candidate mapping/tuning IDs, column and full target coordinates, signed and
absolute error, inherited tuning values, and validation evidence. The tuning
cents are inherited for comparison only; no retuning or adoption occurs. The
response reports the finite searched domain, counts, truncation, coefficient
rejections and limitations, and returns at most 20 candidates. A target already
in the active subgroup reports its unique canonical coordinate with no search;
targets containing multiple missing primes stay unresolved for automatic search
but can still be validated through complete explicit assignments.

Tests cover meantone 11/8 with 99 bounded columns and the top 20 ranked results;
exact old-column preservation and assignment revalidation; source JI target
provenance; explicit wider bounds and deterministic truncation; mapped 16/15
with no alternate; 49/4 with exponent 2 and rejection of a fractional inferred
7 column; unsupported automatic 7-and-11 search plus successful explicit
assignments; and 11/3 in the native non-octave tritave mapping using its actual
period. Passed `node tests/harmonic-mapping-extensions.mjs` and
`node tests/harmonic-mappings.mjs`.

Final Stage 4 gate — PASS. `npm test` exited 0 (57/57 suites), `npm run build`
exited 0 (72 app assets), and `git diff --check` exited 0. No catalogue UI,
scale, diamond, or HexBoard consumer has been migrated. Stage 4 is complete;
Stage 5 is next.

## Task 5.1 — Implement bounded temperament-lattice approximation search

**Status:** PASS. New `harmonic-approximations.mjs` searches integer
period/generator coordinates over a finite generator-coefficient interval. For
each generator it evaluates the nearest period coefficient and both sides of
an exact tie. The default bound is ±32, hard cap ±256; mapped targets retain an
independent canonical error baseline and return only strict improvements of at
least 0.1 cents by default (maximum three). Outside-basis targets keep a null
canonical baseline. Candidate coordinate identities remain exact; tuning error
and optional exact target-set collision lookup are derived assessments, never
mapping changes. Coordinates normalize negative zero to zero.

The tests verify the independent meantone 16/15 reference (canonical `[3,-5]`,
alternative `[-15,26]`, 3.8128-cent improvement), a separate rectangular
brute-force oracle, a negative-generator optimum, exact period ties, a stretched
period, a canonical result outside the search window, and an incidental
coordinate collision with mapped 5/4. Error records preserve requested JI
identity even when another target maps to the same coordinate.
`node tests/harmonic-approximations.mjs` and `git diff --check` passed. No
existing scale or diamond caller changed. Task 5.2 is unblocked.

## Task 5.2 — Add scale and mode approximation-domain adapters

**Status:** PASS. `approximation-compat.mjs#approximationDomain(kind,state)` now exposes
the non-finite bounded temperament-lattice descriptor, the deduplicated
coordinates generated by every ordered dyad in the current matrix span plus
the span period, and the tonic-relative note coordinates in the selected mode.
The domain reports its span and source count; mode observations also retain
the source note's cents so legacy display precision is preserved. `matrixOctave`
uses the existing `matrixScale` span, including repeated-octave spans for
divided-period temperaments.

The existing `candidates`, `bestApproximations` and
`bestModeApproximations` functions are now compatibility adapters over shared
coordinate evaluation and rank policies in `harmonic-approximations.mjs`.
Mapped secondary results and candidate ordering are unchanged. Shared ranking
prepares mapping, tuning and target once per finite domain, avoiding repeated
factorization for each coordinate.

Tests compare the exposed interval set with an independently enumerated ordered
dyad domain, distinguish it from tonic-relative mode notes, verify selected
mode identity, exercise one-period and whole-octave divided-period spans, retain
an unavailable canonical secondary, and keep distinct coordinates on cents
ties. `node tests/approximation-domains.mjs`,
`node tests/harmonic-approximations.mjs`, `node tests/tonality-diamond.mjs`,
`node tests/shared-ji.mjs`, `node tests/refactor-regression.mjs`, and
`git diff --check` passed. The frozen output digest is unchanged. Task 5.3 is
unblocked.

## Task 5.3 — Evaluate bounded chord-level approximation alternatives

**Status:** PASS. `harmonic-approximations.mjs#searchChordApproximations`
accepts an exact JI chord identity or interpretation and a mapping/tuning
context. It fixes the normalized first member at `[0,0]`, builds bounded
root-relative coordinate choices for each other exact member, and derives every
unordered dyad as `rightMember - leftMember`. Thus every candidate is a
mathematically realizable shape and independent edge optima cannot fabricate a
chord. Each shape links back to its exact identity, preferred interpretation,
family/dual IDs and presentation form; it remains an approximation under the
active mapping, never a mapping variant.

The canonical whole-chord projection is a separate `complete`/`incomplete`
comparison. When complete, candidates must improve the sum of absolute dyad
errors by at least 0.1 cents by default; when any exact member is outside the
mapping subgroup, improvement is null and the selected target context is
retained. Candidate edges expose exact coordinate, JI ratio, tuning error and
optional exact target-set collision links. JI cents remain `1200*log2(ratio)`;
tempered cents use the actual supplied period/generator, including non-octave
periods.

Bounds are explicit: generator coefficient ±32 by default (hard cap ±256),
best eight root-relative choices per member by default (maximum 32), 10,000
combinations, 250,000 pair-coordinate derivations, and 12 returned shapes.
Candidate products are traversed best-first by summed root-relative member
error. Per-member shortlist truncation or either work cap sets `partial`; the
result reports the retained domain, combination/cancellation counts and result
truncation separately. An LRU cache holds 24 query contexts.

`node tests/chord-approximations.mjs` verifies incompatible edge-wise optima,
all edge coordinates derived from vertices, a complete three-note brute-force
oracle, 4:5:6 canonical comparison and improvement, exact utonal links, mapped
identity collision lookup, a native 3.5.7 non-octave temperament, and both
combination and cancellation caps. Stage tests also passed for bounded interval
search, finite approximation domains, harmonic JI chords, mapping alternatives,
the Tonality Diamond, shared JI settings, and frozen pre-refactor outputs.

**Final Stage 5 gate — PASS.** `npm test` exited 0 (60/60 suites),
`npm run build` exited 0 (73 app assets), and `git diff --check` passed. Existing
chord catalogue, diamond, scale/mode and HexBoard UI consumers have not yet been
migrated. Stage 6 ET discovery is unblocked.

## Task 6.1 — Build exact dyad domains

**Status:** PASS. New `harmonic-dyad-graph.mjs#buildDyadIndex` consumes the
shared target set and exact mapping context. Octave-folded target sets use the
mapped-octave quotient; native-exact sets use full coordinate equality. Each
unique tempered class is one graph vertex, while all JI target identities that
map there remain separate edge interpretations. Reciprocal target IDs,
collapsed non-unison interpretations, and outside-subgroup exclusions are
retained explicitly. `domainsForShape` returns directed domains for every
ordered pair of distinct members, with an empty-edge/non-dyadic state and a
separate repeated-vertex/degenerate state. Tuning and cent tolerance do not
participate.

`node tests/harmonic-dyad-graph.mjs` passed. It checks direct matrix projection
for every target in a finite set, meantone 9/8 and 10/9 aliases and inverse
domains, 81/80 collapsed into unison at the expanded target set, 7/4 outside
the meantone subgroup, Pajara's [1,0] octave residue, tuning independence, an
empty dyad edge, and native 3/1 / 1/3 indexing. Related harmonic context,
equivalence, interval and DTO tests passed. The Stage 6 build gate remains
pending. Task 6.2 is unblocked.

## Task 6.2 — Find coherent JI lifts for one supplied shape

**Status:** PASS. New `harmonic-ji-lift.mjs#findCoherentJILift` treats the
first member as a fixed unison and each other member's complete root-edge
interpretation list as its finite domain. It applies all-pairs arc consistency,
then branches by smallest remaining domain with stable target-ID ordering.
Every assignment is checked against every directed dyad domain. Successful
witnesses include exact basis-order monzos and the integer mapped-octave lift
needed to reconstruct each supplied coordinate; native-exact shapes retain
their complete monzos with no octave assumption. Exhaustive no-lift,
not-dyadic, degenerate, cancelled and budget-exhausted states remain distinct.
Search has explicit state and compatibility-check budgets; exhaustion returns
`unknown`.

`node tests/harmonic-ji-lift.mjs` passed. Major and minor meantone chords,
porcupine harmony and the native 3/1 dyad produce verifiable all-pair witnesses.
An independent Cartesian-product oracle agrees on those positive examples and
the meantone didymic tetrad at odd limits 9 and 27. Limit 9 exhaustively fails
while limit 27 returns a lift; a dreamtone fixture exercises a failed branch
followed by a successful alternative. A one-state budget and explicit
cancellation both return unknown. The Stage 6.1 edge-index suite and the
harmonic context, equivalence, interval, and DTO suites also passed. Task 6.3 is
unblocked.

## Task 6.3 — Produce comma-cycle evidence and ET assessment

**Status:** PASS. New `harmonic-et.mjs` returns the four planned statuses and
keeps each assessment scoped to its mapping, selected JI target set, shape and
equivalence. Positive results carry the solver's coherent vertex and edge
witness. ET results include all directed edge-domain counts, the complete
finite-search certificate and representative conflict cycles. Each cycle edge
is lifted so its mapped coordinate equals the supplied shape difference; the
corrected monzo is checked by exact matrix multiplication and
`validateKernelWitness`. `verifyETEvidence` replays complete no-lift searches
under their recorded budgets, verifies dyadic counts, checks positive lifts,
and recomputes stored comma cycles. Empty-edge and incomplete/cancelled outcomes
remain distinct.

The shared `ji-limit-engine.mjs#targetId` now reduces a ratio after octave
folding. Testing reciprocal 8/5 showed that the previous unreduced 10/8 target
ID failed to link back to the existing 5/4 record; the exact normalization fix
also protects reciprocal links for dyad and cycle evidence.

`node tests/harmonic-et.mjs` passed, along with the dyad-index, lift solver,
target-set, interval, equivalence, mapping-context and DTO suites. The meantone
didymic shape is ET at odd limits 9 and 15, then JI-liftable at 27 with the
same shape ID. The augmented 128/125 triad is ET at 5 and JI-liftable at 25.
Its raw 5/4 cycle maps to `[3,0]` (one mapped octave); after exact register
correction its monzo is `[-7,0,3]`, ratio 125/128, and image `[0,0]`. Tampered
cycle or matrix evidence is rejected. Task 6.4 is unblocked.

## Task 6.4 — Enumerate bounded rooted dyadic candidates

**Status:** PASS. `harmonic-dyad-graph.mjs#enumerateDyadicShapes` now exposes
a one-shot lazy iterator over compatible vertex cliques containing the
unison class. The finite vertices are unique exact temperament classes, so
collapsed JI targets remain interpretations rather than duplicate notes.
Requested chord sizes default to 3 and 4. Shape IDs use the shared
translation/permutation key; reflection is not an equivalence. JI-liftable and
potentially ET shapes are both yielded without pre-classification or scale
filtering.

The default finite bounds are 128 rooted neighbor classes, 5,000 candidate
shapes, 1,000,000 search nodes and 50,000 directed-domain checks, with explicit
hard caps. The iterator's live progress distinguishes completion, neighbor
truncation, work-cap exhaustion, cancellation, and consumer stop. It includes
counts for duplicate shapes and both tested and returned candidates.

`node tests/harmonic-dyad-enumeration.mjs` passed. Complete meantone triangle
results match an exhaustive rooted-subset oracle; every yielded chord is
dyadic, repeated translated shapes collapse, and the didymic tetrad is found
without a seed. A regular JI major triad also remains in the result set. Tests
cover candidate, vertex, domain-check and search-node bounds, cancellation,
early consumer stop, reflection distinction, and native-exact non-octave
classes. The dyad-index and ET suites also passed. Task 6.5 is unblocked.

## Task 6.5 — Stream bounded harmony discovery and ET assessments

**Status:** PASS. `harmonic-et.mjs#discoverDyadicHarmony` now joins the finite
rooted shape iterator to the existing exact ET assessor. It emits immutable
batches containing separate `jiInterpretations`, `essentiallyTempered`,
`unknown` and `notDyadic` collections, followed by a terminal completeness
envelope. Each JI-liftable shape carries one deterministic coherent JI
interpretation with the existing `harmonicIdentity` family ID, mapping-ordered
monzos, basis metadata, all assigned dyads and exact register lifts. Its generic
JI form does not require an otonal or utonal label. The JI family ID, tempered
shape ID and registered interpretation ID remain separate. A later catalogue
query still needs to merge additional JI chord identities produced by the
ordinary chord engine; this assessment returns one coherent witness per shape.

Discovery tracks total explored CSP states and compatibility checks in addition
to the enumerator's own finite bounds. Per-shape and job-wide defaults are
100,000 / 1,000,000 and 500,000 / 2,000,000 respectively, with validated hard
caps. Results are not cached. The job polls cancellation before shapes and
passes the same signal/predicate into the lift solver; it yields immutable
batches and cooperatively yields to the event loop between batches and after
8 ms work slices. A job reports `complete-empty` only when the bounded domain
and every candidate were fully assessed. Partial enumeration, unknown CSP
results, cancellation and known unassessed candidates remain distinguishable.

`node tests/harmonic-et-discovery.mjs` passed. It verifies meantone ordinary JI
and didymic ET rows in one run; shared 4:5:6 / 5:6:8 family identity; target-set
expansion changing the same shape from ET to liftable; generic coherent JI
records and exact mapped dyads; native-exact 3:1 identity; deterministic frozen
batches; unknown, total-budget, candidate-cap and empty-result states; and
cancellation before enumeration, inside the synchronous solver, between
batches, and by consumer stop. No incomplete case is promoted to ET.

**Stage 6 gate:** PASS after the complete regression and build commands run for this gate.
The standalone discovery test and existing ET/shape suites passed; the full
`npm test` run passed **65/65 suites** and `npm run build` bundled 76 app assets.
No catalogue UI, worker or session format was changed in Stage 6.


## Stage 7 recovery baseline — 29 September 2026

The earlier conversation reported Stage 7 complete, but its code was unavailable
in the current workspace, Library checkpoints, hosted source and GitHub. No
Stage 7 code or commit was inferred from that report. This execution explicitly
rebuilds Stage 7 from the verified Stage 6 checkout at
`b4a8e60469e7f108f225383c5f5e56b78bf7df43`. Tasks 3.3, 4.2, 5.3 and 6.5 are PASS
in the inherited ledger. The user authorized rebuilding Stage 7 before Stage 8.

## Task 7.1 — Join category producers into one catalogue query

**Status:** PASS. `harmonic-catalogue.mjs` exposes `queryCatalogue`,
`getHarmonicEntry`, `resolveSelection` and full `catalogueContext`. It combines
shared mapped intervals, curated/line/subset JI interpretations, bounded ET
assessments, compatible mapping extensions and incidental interval/chord
approximations. Exact JI interpretations retain individual rows, reciprocal
links and shape/family reverse groups. Registered generic lift witnesses remain
attached to their assessments. ET rows do not fabricate JI identities. Native
exact queries use exact JI-family and tempered-shape policies.

Mapping status, all-pair target eligibility and tuning error remain separate.
Scale/mode/board/tolerance do not filter catalogue records. Custom lookup precedes
browse caps; every page cursor includes the full query context. Empty, incomplete,
unknown, record-capped and cancelled results remain distinct. Query output is
bounded to 512 rows by default, hard cap 2,000, default page 50 (maximum 128).
Target subsets preserve their producer's resumable cursor. Legacy Play discovery
continues through its compatibility API; only the board-independent service is
re-exported at that boundary. No UI migration is claimed.

Files: new `dist/harmonic-catalogue.mjs`, its regression suite, transitional
exports in `dist/chord-discovery-v2.mjs`, current ownership documentation.
`node tests/harmonic-catalogue.mjs` exited 0. Tests cover 4:5:6/5:6:8 alias/family
retention, reciprocal links, arbitrary custom lookup outside browse bounds,
retuning, scale/mode/tolerance independence, pagination/context rejection,
ET at odd limits 9 versus 27, unknown-on-budget, mapping and approximation
categories, and native non-octave policy.

## Task 7.2 — Worker jobs, cancellation, cooperative search and bounded cache

**Status:** PASS. Implementation, independent review and integration checks passed.
`harmonic-catalogue-jobs.mjs` owns per-workspace query/ET/approximation envelopes
`{requestId,contextId,kind,payload}` with progress/error/completion messages.
The latest-request controller rejects wrong contexts and obsolete generations;
cancellation/destroy settles pending jobs and releases worker/cache resources.
Worker transport failure falls back to the same dispatcher. The legacy worker
continues accepting the previous Play envelope, with obsolete errors suppressed.

`harmonic-cooperative.mjs` drives shared generator implementations synchronously
or asynchronously. Graph adjacency/traversal, CSP compatibility/state work and
chord-approximation combinations checkpoint every 256 counted work items. The
same counters, traversal order, proof witnesses and budget meanings are retained;
cancellation can yield unknown/partial, never false ET. No parallel proof engine
was introduced. Interval approximation and mapping-extension operations remain
finite bounded existing producers, yielding between targets.

The LRU stores at most eight query contexts and only complete results with at
most 2,000,000 serialized bytes each. Incomplete/unknown/cancelled searches and
larger results are not cached. This stricter count is an intentional deviation
from the plan's initial 32-context suggestion, supported by the payload sizes
below. Cache metrics report hits, misses, skipped oversized results and capacity;
serialized size is not claimed to bound JavaScript heap memory. Full context
includes working basis order, matrix, tuning, target spec, categories and all
bounds. Scale/mode/layout changes do not invalidate catalogue identities. No
resumable ET cache is claimed; incomplete jobs are recomputed.

`node tests/harmonic-catalogue-jobs.mjs` exited 0. It tests real Node worker-thread
execution of the browser worker through a fixture, query/ET/approximation parity
with fallback, out-of-order stale responses, retune/target cache misses,
cancellation/destroy, empty/partial/error messages, transport failure fallback,
LRU and byte limits, sync/async ET/lift/approximation equality, and cancellation
at the 256th approximation combination. Existing independent CSP, clique and
approximation oracles remain passing.

### Stage 7 representative timing/memory observations

Runtime: Node v24.19.0, Linux x86_64 in this execution container. Measurements
are single cold/repeat observations, not latency guarantees or peak heap tests.
Meantone, exact 2.3.5 subgroup, triangles/tetrads, all ordinary producers plus ET;
ET candidate cap explicitly reduced to 128 for these representative runs. All
other ET state/check budgets retain their defaults. Record hard bound 2,000.

| Odd limit | Cold ms | Repeat ms | Rows | Result | Serialized bytes | Heap before / after |
|---|---:|---:|---:|---|---:|---|
| 15 | 260 | 167 | 259 | complete | 3,101,041 | 8,645,488 / 24,567,232 |
| 31 | 261 | 199 | 318 | incomplete: candidate cap | 3,779,969 | 30,293,744 / 33,280,096 |
| 97 | 261 | 235 | 318 | incomplete: candidate cap | 4,526,014 | 38,892,864 / 52,206,600 |

At 15 the job assessed 20 unique shapes, 21 solver states and 198 compatibility
checks; the complete 3.1 MB result was deliberately skipped by the 2 MB cache.
At 31/97 the producer assessed 66/56 unique shapes and 102/114 states;
857/688 compatibility checks, with candidate-cap incompleteness preserved.
No incomplete result was cached. For a one-chord complete lookup, cold 17.2 ms,
warm cache hit 1.1 ms, 13,588 bytes. All producer counts and bounds remain in
the returned terminal envelope. Default ET bounds are separately exercised by
the catalogue and existing discovery suites.

### Stage 7 integration checks

`npm test` exited 0: **67/67 suites**. `npm run build` exited 0: **79 app assets**.
After aligning the row hard cap/page default with the plan, the two new suites
were rerun and passed. `git diff --check` exited 0. The build is repeated during
final checkpoint preparation to capture the final source. UI interactions,
listening, deployment and Stage 8 are outside this completed service boundary.
Independent review and final checkpoint commit are recorded below once complete.


**Independent review:** Sol inspected the catalogue/job ownership and generator
refactors against the existing invariants and D-026/D-027; no blocking issue was
found. Its minor finding (empty LRU placeholders counted as cache entries for
uncached partial/oversized results) was fixed. The regression now asserts that
oversized results occupy zero LRU entries. Interval and mapping-context records
also have exact ratio IDs so every category can use the shared selection contract;
no category needs a fabricated JI chord.

**Final Stage 7 gate:** PASS. After the review fix and ratio-selection overlays,
`npm test` exited 0 (67/67 suites) and `npm run build` exited 0 (79 app assets).
All required pure catalogue and worker/fallback gates pass. No remaining blocker.
Stage 8.1 is unblocked. No Discover/Play UI migration or production publication
was performed. The checkpoint contains the complete source, tests, ledger and
local Git history through this Stage 7 rebuild; dependencies are excluded and can
be restored from the existing lockfile. This supersedes the unavailable earlier
Stage 7 report as the implementation evidence for continuing Stage 8.

## Task 8.1 — Shared shape occurrence engine

**Status:** PASS. Based on Stage 7 checkpoint
`46cb2e8744028562c65377c7e7df3c5bed2a5841`.
`chord-occurrence-v2.mjs#searchShapeOccurrences` accepts mapped JI shapes or
coordinate-only shapes and uses exact period-repeated scale membership. Every
source voice retains its full coordinate, harmonic quotient/residue, degree and
period lift, even when several voices share a degree. Full source member links
take precedence over quotient-only DTO classes; repeated classes without full
source coordinates are rejected rather than inventing erased register lifts.
Policies/inverses come from the active mapping. Shape/scale context owns new
occurrence IDs; tonic anchoring is a separate field/subset. Scale/mode changes
leave the harmonic shape ID unchanged. No tuning tolerance or board dependency
enters membership. `analyzeShape` returns immutable copied analysis without
mutating or freezing caller-owned shapes/membership coordinates.

The compatibility `searchOccurrences` adapter retains legacy JI occurrence IDs,
ordering and counts. The frozen 99-case chord corpus passes. New tests check
4:5:6 / 5:6:8 alias occurrence truth, independent root/mode membership oracles,
tonic-only versus anywhere, ET without fabricated JI labels, repeated members on
one degree, augmented-triad octave residues, native exact 3/1 membership, DTO
source-member retention, minimal equivalence metadata and input ownership.
Direct canonical `native-exact` projection records normalize to the established
exact identity policy; occurrence and realization tests cover this boundary.

## Task 8.2 — Full-voice realization and mapped reference lifts

**Status:** PASS. `chord-realization-v2.mjs#realizeShape` and the JI compatibility
adapter share `chord-voicings.mjs#shapeVoicings`. Member policy defaults to
`preserve`; `exact-unique` is an explicit full-coordinate deduplication choice.
Realization resolves a canonical complete occurrence by ID and ignores tampered
assignment payloads. `voices[]` carries member/input correspondence, source and
sounding coordinates, degree/period lift and full reference-coordinate lift.
Mapped octave moves use actual M(2), including a generator component; native
3/1 reference moves are labelled separately. JI ratios and tuning errors are
optional overlays. Coordinate-only voicings expose null JI quality fields.
Pair-error indices follow output voice order, and stretched reference errors
use the actual sounding interval against its ideal JI reference.

The new realization suite checks 5:6:8 general inversion, 1:2 as two voices,
repeated input members, coincident comma-mapped voices, augmented-triad three
voices on one degree, native 3/1, stretched octave/tritave errors, full lift
round-trips, optional ET voicing/selection and a generator-component M(2).
Existing compact/original/open tests pass. Placement remains separate.

**Intentional compatibility change:** the divided-octave composition fixture
now sounds all three `[0,0]`, `[1,0]`, `[1,1]` members at 0, 400 and
705.0691154305116 cents. Its previously discarded 5/4 voice is retained and its
complete fingering is `[65,66,56]`. The historical corpus is unchanged; the
test records an explicit Stage 8 oracle. Other legacy realization IDs remain
stable by omitting the default member policy from their compatibility ID.

**Integration gate:** `npm test` exited 0 (**69/69 suites**);
`npm run build` exited 0 (**79 app assets**). The two new suites and composition
regression passed after the review fixes. No UI migration or production
publication was performed; Stage 9 owns Discover catalogue integration.

**Review corrections:** Sol identified caller freezing, ignored source-member
links/optional inverse metadata, source links losing precedence when reduced
coordinates were also present, and rejection of canonical `native-exact`
projection records. All were corrected and each boundary has a regression.
The final full suite and build were repeated after these corrections with the
results above. Default legacy realization-ID drift was caught by the full
composition regression and corrected; intentional full-voice restoration is
documented explicitly rather than rewriting the historical corpus.

**Final Stage 8 gate:** PASS. Independent Sol verification of the corrected
boundaries found no blockers; both focused shape suites exited 0.
`git diff --check` exited 0. Stage 8.1 and 8.2 are complete, and Stage 9 is
unblocked. The source checkpoint includes tests, current ownership/decision
documentation and local Git history; dependencies can be restored from the
unchanged lockfile. No production deployment or browser/acoustic acceptance
is claimed for this service stage.

## A/B application release — Discover and Play integration

**Status:** implementation and acceptance gate PASS, 29 September 2026.
The starting checkpoint was completed Stage 8 (`88b97048a18bbf988e5ee3667daebdbdcb4f3dbc`);
the live app still exposed the earlier interface. This release makes the staged
services usable through B · Harmonic discovery while preserving A · Current chords
as the default and an immediate comparison option.

**Delivered scope.** Stage 9's board-independent Discover → Chords catalogue
uses the shared Stage 7 jobs for five categories, exact lookup, reciprocal/family
links, independent Discover/Play scale filters, selected roots and full-voice
realizations. JI mapping remains available above tolerance. Mapping alternatives
show preserved-column previews and require adoption; interval/whole-chord
approximations retain the canonical baseline. ET searches require Start and show
finite bounds, target-set-relative status, cycle evidence and proof completeness.
Stale previews/actions are cleared before a changed context begins loading.

Stage 10 handoffs preserve diamond cell IDs, exact spellings, repeated voices and
actual sounding coordinates, with canonical and approximation provenance kept
separate. Reverse links match exact sounded ratios/coordinates, including
inversions. B live recognition adds complete octave-family/native-exact matches
without losing played registers or recognizing only a triad subset of extra notes.
Mapped interpretation and canonical tuning quality are disclosed independently.
Optional harmonic metadata survives material/session round-trips; unsupported
optional metadata leaves valid sounding material intact. Old sessions still load.

Stage 11 connects selected harmonies to Play through validated selections.
Handoff preserves the requested voicing and the independent Play scale; scale
fit is explicit and affects Play only. No fingering is silently chosen. The top
three exact fingerings are shown first with More available. Layout desirability
consumes the shared shape engine, counts each abstract shape once, and keeps
register aliases/inversions as variants rather than extra votes.

**Intentional remaining work.** Stage 12's legacy removal and final migration
of the analytical/manual inspector are deferred while the user-requested A/B
comparison remains available. The retained A paths are compatibility behavior,
not a second implementation of the new catalogue's mathematical services.
No acoustic, physical HexBoard, Safari/touch or screen-reader acceptance is claimed.

**Verification.** `npm test` passed **72/72 suites**, `npm run build` passed
with **83 app assets**, and `git diff --check` passed. The new integration suites
cover 5:6:8, repeated/coincident voices, native exact 3/1, preserved source sound,
explicit fit/no-fit, old/new optional metadata, target invalidation and session
restoration. Existing frozen corpus, composition, matrix/diamond, audio/player,
layout and tuning suites pass. Sol review found an inversion-to-diamond index
mismatch and missing above-tolerance disclosure for family matches; both were
fixed and receive regressions. Review of abstract layout vote grouping found no blocker.

Browser acceptance used the supervised Chrome preview: B Discover catalogue,
root/inversion → Play, three explicit fingering choices, switching A and B,
and an explicit meantone 9-odd-limit tetrad ET search. Its completed proof showed
80/81 and 81/80 kernel-cycle evidence; changing controls required a fresh search.
The reviewed checkpoint is prepared for publication to the existing Site;
production status and the published source SHA are recorded by Sites version history.

## Stage 12 — Final analytical migration and release

**Source baseline:** `e9ff2ecf4af14c0c36e964b1dab198a2e6790221` (Site version 241).
The user's request to finish the chord plan supersedes the earlier deferral of
Stage 12. The separate composition-suite plan is outside this task.

### Task 12.1 — Shared manual-coordinate inspection

**Status: PASS.** Added `harmonic-inspection.mjs`: arbitrary full coordinates use
existing `projectCoordinateShape`, `buildDyadIndex`, `domainsForShape` and
`assessET`. No new quotient definition, target enumerator or ET solver was added.
The shared target classifier remains the tuning/approximation owner, with a
separate preferred-within-tolerance overlay. Mapping and coherent-lift status
remain independent of quality filtering. The manual inspector feeds period
placements into assessment, shows coherent JI/ET/not-dyadic/unknown states and
finite comma evidence, and retains its original note, inversion and audition
controls. Repeated harmonic classes retain their voices without a false ET claim.

The manual inspector uses `harmonic-inspection.mjs` directly. Occurrences use
`searchShapeOccurrences`; Find uses the shared bounded coordinate search. No
active independent manual occurrence/search-cache/target-selection rule remains.
Old pin state and voicing round-trip, legacy pins are visible, and the manual
inspector has an explicit return to the harmonic catalogue.

**Checks:** `node tests/harmonic-inspection.mjs` exit 0. Independently fixed
examples: didymic meantone ET at L=9 and JI-liftable at L=27 with unchanged shape
ID; unknown under a one-state/check budget; mapping remains true above tolerance;
raised-bass major-family identity; augmented triad retains three octave classes;
native 3.5.7 uses exact target policy. Existing coherence/quotient oracles remain
passing. Full voiced input is preserved; no map/tuning/session reset occurs.

### Task 12.2 — Shared board candidates and selected-key inspection

**Status: PASS.** `discoverBoardChords` uses the same coordinate candidate search
as the scale adapter. Its physical reach predicate and exact full-coordinate
placements remain separate. Selected/imported board shapes receive the same
mapped-domain/coherent-lift assessment as manual coordinates. The independent
`bestChordTarget` import is removed; all physical helper exports remain.

Bounds: 250,000 visited nodes, 20,000 occurrences and 1,000 groups. Complete versus
partial status is displayed; no incomplete result claims absence. An exhaustive
small-board triple oracle independently checks every pair using the existing
target classifier and physical distance, with and without alternative matches.

**Checks:** `node tests/hexboard-chords.mjs`, `node tests/harmonic-inspection.mjs`,
and `node tests/refactor-regression.mjs` exit 0. Large-layout discovery, reach,
wrapping, imported voicings, clearing and export colours pass. The frozen
pre-refactor chord-search hash remains exactly unchanged; no expected snapshot
or historical corpus was regenerated.

### Task 12.3 — Remove obsolete rules and document intentional adapters

**Status: PASS.** Removed unused `chordShape`/`bestChordTarget`, the manual search
cache and independent generator-occurrence loop. Import/call-site checks found
no remaining runtime consumers of these removed symbols. Compatibility JSON is
preserved; new manual bounds are nonenumerable properties consumed directly by
the UI. Both compatibility search adapters share the bounded candidate owner.

D-006/D-029 and new D-031 document final ownership. B is the new-device default;
explicit stored A choices and older session restore remain compatible. A/B is
retained for the user-requested presentation comparison, not as a selector for
retired mathematical engines. `chord-session-v2-adapter` and the classic curated
catalogue presentation remain intentional compatibility paths. Help no longer
advertises removed computer-keyboard note playing. Audio, temperament/tuning,
composition, layout geometry and repository dependencies are unchanged.

A pre-existing `harmonic-workspace-render` failure came from a missing VM import
and outdated heading/caption expectations. Its fixture now supplies the current
prime-filter parser and asserts actual mapping/target IDs and current control
parking. It still tests every preset, limit changes, A/B switches, asynchronous
refreshes, and recovery after a renderer exception; it is not weakened to a
source snapshot.

**Checks:** full `npm test` exit 0 — **74/74 suites**. `git diff --check` exit 0.
All existing mathematical, frozen corpus, realization, layout, material, session,
audio, pointer and export regressions pass.

### Task 12.4 — Automated workflow and bounded performance sign-off

**Status: automated acceptance PASS; live device acceptance unverified.**
Focused catalogue/diamond/Play/job suites and the full suite cover forward and
reverse diamond provenance, 5:6:8 and register families, collection/session
round-trip, independent Play scale and explicit fit, top-three fingerings,
16/15 approximation comparisons, mapping adoption guards, ET 9→27, magic11
scale availability, divided periods, native exact analysis and stale-worker
rejection/cancellation. The shared inspector adds manual and board acceptance.

**Representative measurements:** Node v24.19.0, Linux x86_64, AMD EPYC 9V74.
Meantone, exact 2.3.5 subgroup, JI catalogue only, 512-row cap. Single cold/repeat
observations; heap before/after is not peak memory. Timing is not a UI guarantee.

| Odd limit | Cold ms | Repeat ms | Rows | Complete | JSON bytes | Heap before / after | Manual tetrad ms / status |
|---|---:|---:|---:|---|---:|---|---|
| 15 | 206.0 | 131.4 | 226 | yes | 3,076,278 | 9,565,384 / 29,956,464 | 12.0 / ET |
| 31 | 159.8 | 164.0 | 227 | yes | 3,292,874 | 31,300,952 / 43,859,488 | 3.1 / JI-liftable |
| 97 | 185.9 | 175.1 | 227 | yes | 4,289,358 | 31,033,856 / 50,702,504 | 4.1 / JI-liftable |

All large complete payloads correctly bypass the 2,000,000-byte cache cap. A
single 4:5:6 lookup was 6.3 ms cold and 0.4 ms on the repeat cache hit, 13,588
bytes. Dispatcher metrics recorded one miss, one stored entry and one hit.
`harmonic-catalogue-jobs` re-exercised actual worker/fallback parity, cancellation,
transport failures, stale responses, oversized-result cache exclusion and bounded
cooperative search; exit 0. Unknown remains unknown under limited proof budgets.

**Review:** no core solver/quotient rewrite. Exact independent example tests,
small-board exhaustive oracle, unchanged frozen search hash, and explicit
mapping-versus-quality review validate the adapter boundary. No mathematical
contract contradiction or correctness blocker was found.

**Verification limits:** the required control-browser skill is unavailable in
this environment, so desktop/mobile visual, Safari/touch, physical HexBoard,
screen-reader and device-level acoustic acceptance are not claimed. Earlier
Stage 9–11 browser observations remain historical, not verification of this
patch. Current numerical voiced-coordinate and pointer/audio tests pass. No
optional composition or hardware-integration expansion is included.

**Release:** final build and native Site publication follow this ledger entry;
Sites version history records the exact resulting commit and deployment.
All remaining implementation tasks are complete. Live device checks are the
explicit outstanding verification item, rather than hidden unfinished code.
