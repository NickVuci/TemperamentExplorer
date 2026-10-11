# Temperament App — Music Composition Suite Implementation Plan

Prepared for Nick Vuci · 24 September 2026 &#40;UTC&#41; · Version 1\.1

**Status: Phase 0 PASS\. An MVP covering Phases 1–3, a scale\-degree piano roll, Phase 4 HexBoard step entry and recording \(takes merge into the existing clips, D\-044\), the Phase 9 cue/practice seam and a rhythm game on it \(D\-045\) is implemented \(see A019–A030 and the MVP close record\); Phases 5–8 have not started\.**

**Model policy:** GPT\-6 Luna at **max** reasoning implements the work, including integration, tests, fixes, and documentation\. GPT\-6 Astra plans, orchestrates, reviews evidence, and performs the final sweep for every phase\. This task\-specific policy supersedes the repository’s ordinary model routing for this project\. No Terra or Sol assignments are included\.

## 1\. Intended result

Extend **Create** into a composition workspace where Nick can select chords from the active temperament and scale, arrange a progression, write or record melodies on the HexBoard, build a multitrack piece, and save or export it with its tuning intact\. Temperament, tuning, scale/mode, and layout remain connected through the app’s existing mathematical owners\.

The first useful milestone is a saved, looping chord progression &#40;Phase 3&#41;\. The next is a melody recorded over it &#40;Phase 4&#41;\. The core suite is complete after arrangement, context changes, durable saving, export, and final acceptance &#40;Phases 5–9&#41;\. Physical HexBoard lighting and rhythm\-game implementation remain coordinated with the separate integration plan; they do not block a working virtual composition suite\.

### The musical workflow

1. Choose a temperament and tuning; choose the **Create target scale and mode**, which may differ from Discover’s scale\.
2. Start a composition from that context and the current HexBoard layout\.
3. Add a discovered chord occurrence and its chosen voicing to a timeline; set rhythm, duration, and register\.
4. Write notes in a scale\-degree grid or record them from the virtual HexBoard while the progression plays\.
5. Arrange chord, melody, and bass clips into sections; mix and rehearse them\.
6. Preview a new tuning, scale, or layout with explicit rules for what changes\.
7. Save the complete project, render audio, or transfer supported microtonal MIDI to a DAW\.

### Workspace layout

Preserve the Discover / Play / Create navigation\. Inside Create, keep the HexBoard prominent at the top and the chord catalogue beside it on wide screens\. Add a compact composition context strip and transport, followed by the arrangement and selected clip editor\. Place project management, detailed tuning information, export, and advanced controls in secondary panels\. On narrow screens, stack the board, catalogue, and editor without shrinking controls below usable size\.

The note grid uses the selected scale’s degrees and period registers, with the app’s existing cents / coordinate / JI labels\. It must not imply a 12\-note piano keyboard\. Show out\-of\-scale notes in explicit additional rows when needed\. Selecting an event highlights compatible board positions; choosing a fingering is a separate operation\.

### Scope boundaries

The first release has one musical context per composition, several tracks/clips, a fixed project tempo and meter, note velocity, simple track sound controls, looping, recording, undo/redo, project save/open, WAV rendering, and a verified microtonal MIDI export route\. Context changes apply to the composition as an explicit operation\.

Defer tempo maps, simultaneous incompatible tunings, automated modulation between temperaments, unrestricted audio recording, sample libraries, plugin hosting, notation engraving, generative composition, and collaborative editing\. These are extensions, not prerequisites for the requested suite\. Physical device support is conditional on the separately verified device adapter\.

## 2\. Inspected baseline and reuse map

The latest saved Site version found during planning was **95**, with source commit **`a8d551a9340d6ac6ae80527055e534fd0a1df681`**\. The inspected local checkout matched that commit and was clean before and after verification\. `npm run build` succeeded; `npm test` passed **34/34 suites** on 24 September 2026 UTC\. Browser interaction, acoustic output, physical hardware, and DAW interoperability were not tested in this planning task\. &#91;R1&#93;

|Existing owner / finding                                                                                                                      |Consequence for this plan                                                                                                                                                                                                            |
|----------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`; top-level `dist/` files are authored source                                        |Preserve architecture and decisions D-001–D-008. Add small modules; do not replace the stack or regenerate authored files.                                                                                                           |
|`app.mjs#getLayoutStates` shares Discover’s temperament/tuning but owns a separate Play scale/mode                                            |Capture the actual Play context. Do not silently use `states[0].n/mode` for a composition made from a different Play scale.                                                                                                           |
|`material-ui.mjs#createMaterialWorkspace` stores up to 64 collected items with source state, coordinates, and labels                          |Reuse the collection as a source palette. Copy selected musical material into the composition; do not bind events to mutable array indices. Existing items do not carry full structured chord provenance or their own tonic-Hz field.|
|Chord v2 pipeline: identity → projection → occurrence → realization → placement                                                               |Reuse v2 IDs/data when available. The retired catalogue engine must remain retired. Chords assembled manually can retain coordinates without pretending their label establishes a JI identity.                                       |
|`hexboard.mjs#buildBoard`, `hexboard-wrapping.mjs`                                                                                            |Use canonical board output for pitch, register, disabled keys, and duplicate positions. A button number is a performance location, not a persistent musical note.                                                                    |
|`hexboard-ui.mjs#press` couples inspection/selection to DOM input; no pure snapshot API is exposed                                            |Add a narrow, read-only board/context adapter and logical note-input seam. Coordinate with the hardware plan rather than extracting it twice.                                                                                        |
|`hexboard-player.mjs` owns pointer/keyboard holds and Shift sustain                                                                           |Extend its logical event boundary for recording; preserve short clicks, drag play, latch, and release behavior.                                                                                                                      |
|`audio.mjs#createAudioEngine` owns one live Web Audio context; its internal `playEvents` calls global `stop()` and reads global sound settings|Add scoped scheduling and explicit project settings before layering preview, recording, and accompaniment. Calling the existing preview helper repeatedly is not a sequencer.                                                        |
|`app.mjs#renderWorkspace` resets the player and replaces workspace HTML                                                                       |Keep transport, recording, and project state outside disposable DOM. Playhead/highlight updates must not rebuild the entire workspace.                                                                                               |
|Session format is `temperament-lab-v1`; saved presets use a site-scoped D1 workspace and optimistic revisions                               |Add composition compatibility deliberately. Keep composition records separate from the preset endpoint’s smaller payload contract and review their access scope independently.                                             |
|Current mathematical core is prime-basis, rank-2; an EDO is an available tuning realization                                                   |Do not imply that this work adds arbitrary rank or subgroup support. Preserve coordinate identity even where two coordinates sound equal in an EDO tuning.                                                                           |

These are source findings, not proposed features\. &#91;R1&#93; The older chord implementation plan is background only: several of its migration stages are already complete, so its old engine flag and legacy path must not be reintroduced\. &#91;R3&#93;

## 3\. Frozen contracts for implementation

Phase 0 froze these design contracts after checking them against the current source and fixtures\. They govern future implementation; they do not claim the composition features already exist\.

### Musical identity and pitch

Store notes as exact integer temperament coordinates in a versioned musical context\. Store the actual voiced coordinate, including its period displacement, **once**\. Degree labels, board cells, cents, and Hz are derived views\. Retain source degree/occurrence/voicing metadata where known, but never use a label or cent tolerance to establish exact identity\.

For a stored sounding coordinate `m = [a,b]`, the resolver contract uses the app’s existing convention:

`cents = a × periodCents + b × generatorCents`

`frequencyHz = tonicHz × 2 ** (cents / 1200)`

Use the canonical pitch helpers rather than duplicating these formulas across consumers\. Wrapped input already exposes its final sounding coordinate; do not add its register again\. The scale/mode determines available degrees and their coordinate spelling; the project records tonic Hz separately from the tuning\. Octave, divided\-octave, optimized\-period, and non\-octave cases must use the actual period\. &#91;R1&#93;

Two tone IDs may intentionally have the same coordinate or frequency\. Do not delete them merely because they sound in unison\. Display equivalence, abstract coordinate equality, voice ownership, and chord cardinality are separate questions\.

### Minimal project contract

Use the existing JavaScript module style\. The following describes fields, not a requirement to introduce TypeScript or a schema framework:

|Object          |Required content / rule                                                                                                                                                                                                                                                            |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Project         |Format/schema version, stable ID/name, revision, musical-context snapshot, layout snapshot, tempo, meter, timeline resolution, tracks, clips, events, loop region, sound settings.                                                                                                 |
|Musical context |Ordered prime basis, exact mapping rows, tuning configuration and resolved `p/g`, tonic Hz, Create scale size/mode and exact degree coordinates, identity/revision. Save the resolved tuning as well as method settings so an algorithm update cannot silently retune an old piece.|
|Layout snapshot |Existing serializable HexBoard configuration and its revision. References musical context; never defines the composition’s pitch identities.                                                                                                                                       |
|Note/chord event|Stable ID, integer `startTick`, positive integer `durationTick`, velocity, one or more `{toneId, coordinate}` entries, and optional source/chord metadata. A chord event groups tones; playback does not also create a second stored set of duplicate note events.                 |
|Clip / track    |Stable IDs, clip-local events, arrangement placement, length and repeat count; track sound/mute/solo/level. Repeated instances have distinct runtime voice IDs.                                                                                                                    |
|Source metadata |Original collection item snapshot, canonical chord identity and occurrence when available, explicit voicing, source degree, and optional preferred fingering tagged with layout revision. Missing provenance is valid and must not be invented from text.                          |
|Runtime state   |Transport position, clock anchors, active voices, held inputs, undo stack, selection, and UI state. Device handles and audio nodes are never serialized. Undo history may be bounded and session-local; musical project data may not depend on it.                                 |

Use **960 ticks per quarter note** as the internal resolution, including straight and triplet grids\. Tempo is quarter notes per minute; meter changes bar display and metronome accents\. Validate finite/safe integers and the frozen size limits below\. Convert ticks to audio seconds at scheduling time; do not accumulate floating\-point beat increments over loop cycles\.

Each edit is a project command with undo/redo\. A pointer drag is one command, and a recorded take is one command\. Validation/import/context conversion operates on a candidate copy and commits atomically; a failure leaves the existing project intact\.

### How context changes behave

|Change                                                                  |Default behavior                                                    |Explicit conversion / consequence                                                                                                                                                                                                                          |
|------------------------------------------------------------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Discover changes while a project is open                                |Project keeps its saved context; show that the app selection differs|“Apply current setup” previews a change. Opening a project offers to load its context into Create through existing owners.                                                                                                                                 |
|Tuning method or optimized period, same mapping                         |Preserve exact sounding coordinates, rhythm, and voice identities   |Recompute cents/Hz and scale ordering; revalidate degree annotations, scale membership, collisions, and board placements. Stop and invalidate queued playback before committing.                                                                           |
|Tonic Hz                                                                |Preserve interval coordinates                                       |All frequencies change by the chosen reference; saved/exported sound follows the project value.                                                                                                                                                            |
|Scale size or mode                                                      |Preserve coordinates and flag notes outside the new scale           |Optional “Reinterpret by degree” requires a preview and complete degree metadata. It changes notes deliberately, reports losses/collisions, and is one undoable command.                                                                                   |
|Board orientation, placement vector, wrapping, or board register setting|Existing composition pitches stay fixed; recompute possible cells   |Invalidate stale fingerings. A changed board register affects new played input, not previously stored events. Transposing the piece by a period is a separate musical command.                                                                             |
|Temperament / mapping / basis                                           |Keep the source project; create a converted copy                    |Reproject verified JI provenance where available, or explicitly reinterpret scale degrees with a documented policy. Coordinate pairs cannot be copied into an unrelated mapping. Unresolved notes remain visible and prevent acceptance of that conversion.|
|Equivalent mapping represented in a different integer basis             |Treat as different until an exact basis transformation is verified  |Apply that transform to all coordinates atomically; never infer it from the temperament name or tuned cents. This adapter may be deferred and the conversion reported unsupported.                                                                         |

Before Phase 6, a project’s musical context is frozen after creation; changing the app selection does not mutate it\. This makes the early stages safe without postponing the identity decisions\.

While a composition is open, one active\-Create\-context adapter supplies its saved context to the chord catalogue, virtual board, note editor, and playback resolver\. Discover can still browse another setup\. Returning to Create must restore the project\-bound board/catalogue context, not silently display the new Discover tuning against the old composition\. “Apply current setup” is the explicit bridge; closing the composition returns Create to its ordinary setup behavior\.

### Audio, input, and transport boundaries

One transport owns musical time; the existing audio engine owns all live voices\. Add a bounded lookahead scheduler using Web Audio time, with revision\-tagged event IDs, scoped cancellation, and project\-specific pitch/sound settings\. Browser callbacks replenish a queue; animation frames only update visuals\. Stopping a preview must not cancel accompaniment\. Global Stop/Escape cancels everything\. &#91;R1, R4&#93;

Define preview, transport, and live\-input voice groups\. Track overlapping sources/gestures independently, including two sources on the same physical key\. Releases target their own voice tokens\. A repeated clip gets a new occurrence token each time\. Resume races, seek, loop wrap, context changes, input disconnect, and old asynchronous callbacks cannot restart canceled audio\.

Record logical input with source, gesture/hold ID, input timestamp, board/context revision, exact sounding coordinate, and note\-on/off or sustain edge\. Preserve raw take timing; quantization creates an undoable edited version\. Store the coordinate at onset and release that same voice even if UI state changes\. MIDI timestamps require an explicit mapping to the audio clock; they are not interchangeable numbers\. &#91;R2, R4, R5&#93;

Initial loop policy: end crossing notes at the loop boundary and retrigger events belonging to the next iteration\. Display this policy; ties across repeated sections are deferred\. Initial edit\-while\-playing policy: project edits pause playback, commit atomically, and retain position\. Late callbacks after suspension never play a burst of missed notes\. Leaving Create, losing visibility, or losing the audio context pauses transport and finalizes an active take safely\.

### HexBoard and practice relationship

Expose semantic playback cues from the resolved event stream: event/tone ID, onset, release, coordinate, degree/register where valid, and optional preferred fingering\. A layout adapter returns valid cells, alternate cells, or “not playable on this layout\.” A missing fingering does not remove a valid musical event or silence its audio\.

The same cues can later feed physical LEDs or become practice targets\. Practice must state whether it accepts the exact coordinate/register, any occurrence of a degree, or a specific button\. Do not equate these modes\. The physical transport, verified SysEx protocol, permission handling, and calibration remain owned by the HexBoard integration plan\. No zero\-latency claim is part of this plan\. &#91;R2&#93;

## 4\. Execution and credit policy

### Model assignments

|Role                          |Model / responsibility                                                                                                                                                                                                     |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Phase planner and orchestrator|**GPT-6 Astra**: inspect changed context, specify contracts and expected outcomes, split work, resolve architectural ambiguity, review returned evidence, and issue corrective work packets.                               |
|Implementer                   |**GPT-6 Luna, reasoning `max`**: all product code, state integration, scheduling, pure algorithms under agreed contracts, UI, persistence, exports, tests, fixtures, fixes, and documentation.                             |
|Integrator                    |**GPT-6 Luna Max**, normally the same implementer: exclusive edits to shared controller/audio/session files and integration of completed patches.                                                                          |
|Final sweep                   |**GPT-6 Astra** at the end of every phase: inspect the integrated diff, mathematical/state boundaries, meaningful test evidence, the demonstrable deliverable, rollback, and this plan’s log; record PASS / FAIL / BLOCKED.|

Use exact available model identifiers when launching implementation agents: `gpt-6-luna`, `reasoning_effort: "max"`\. A short task\-specific context is preferred to copying the entire thread\. If that model/effort is unavailable, record the limitation and do not silently substitute a different model\. Astra should clarify or subdivide a difficult task, then return coding to Luna Max\. Astra does not become the default implementer when a packet is inconvenient\.

### Work packet contract

Every packet must name: phase/task ID; objective; input/output contracts and invariants; allowed files; forbidden/unrelated edits; dependencies; required tests and expected results; concrete demo; and the return format\. Luna reports changed files, decisions, test commands/results, failures, remaining questions, and suggested action\-log entries\.

Use one Luna implementer at a time by default\. At most two independent Luna packets should run concurrently when separate files and stable contracts make that worthwhile\. Never allow simultaneous edits to `app.mjs`, `audio.mjs`, the project schema, session code, or the same tests\. Astra reviews and assigns integration; parallel work does not bypass a dependency gate\.

Read the persistent project context once per work session, then the changed files\. Reuse fixtures and successful checks while their inputs remain unchanged\. Run focused tests while editing; broader checks occur at shared\-system changes and phase gates, not after every small patch\. Measure before adding workers or optimizing\. Do not add dependencies or replace the UI framework solely to build a timeline\.

### Gate rule

Finish a phase’s deliverable, run its required checks, complete Astra’s sweep, and update **this document** before starting the next dependent phase\. An agent’s “done” message is not evidence of acceptance\. A failure gets a bounded Luna repair packet and the relevant recheck\. Repeated failure triggers Astra diagnosis and smaller tasks, not an automatic model escalation\.

The manual demonstrations below are test scripts that Nick or an operator can run; they are not automatic requests for permission\. Continue through passed gates when implementation is authorized\. Mark unavailable browser/listening/device/DAW verification honestly and block only work that depends on that missing evidence\. Never call a release verified because its unit tests alone passed\.

Historical authorization: the original request authorized creation of this plan, not product implementation or publication\. The later user instruction authorized Phase 0 only; its evidence and implementation checkpoint are complete, but no Phase 1 work is authorized or started\.

## 5\. Phase overview

|Phase|Deliverable to test                                                      |Depends on|Current status                          |
|-----|-------------------------------------------------------------------------|----------|----------------------------------------|
|0    |Current baseline, frozen contracts, reusable fixture pack                |None      |PASS; Astra final sweep complete        |
|1    |Composition project opens from Create and survives JSON save/open        |0         |MVP implemented (A019–A027)                             |
|2    |Correctly tuned timed loop with transport and independent live playing   |1         |MVP implemented; loop untested in a browser                             |
|3    |Editable chord progression from the existing catalogue                   |2         |MVP implemented (A019–A027)                             |
|4    |Melody grid and recorded HexBoard take over accompaniment                |3         |Partial: melody grid only; recording not started                             |
|5    |Multitrack clips, sections, and basic mixing                             |4         |Not started                             |
|6    |Previewed tuning/scale/layout changes and explicit temperament conversion|5         |Not started                             |
|7    |Reliable project management, recovery, and account saving                |6         |Not started                             |
|8    |Verified WAV and microtonal MIDI export                                  |7         |Not started                             |
|9    |Playback-to-board/practice handoff and final release candidate           |8         |Partial: cue and practice-target seam only                             |

The detailed phase gates follow\. Shared seams needed by two plans are implemented once by the first plan to reach them; the second verifies and reuses the accepted implementation\.

## 6\. Detailed phases and acceptance gates

### Phase 0 — Establish contracts and a reproducible baseline

**Deliverable:** A source\-owner map, approved project/input/audio contracts, captured test fixtures, and a phase gate record\. No product feature changes are required\.

**Luna Max packets:** `P0.1` verify the current commit/policies, inspect the named owners, and run the baseline; `P0.2` capture small fixtures and a list of available UI/audio test tools\. Reuse this planning inspection if its inputs remain current\.

**Astra planning/sweep:** Resolve coordinate/register conventions, source\-context ownership, note/clip identity, timing, atomic import, and context\-change behavior\. Freeze project limits and a target browser/device matrix\. Verify whether the physical HexBoard plan has implemented any shared seams since this inspection\.

**Acceptance checks:**

- Baseline build and full suite pass, or each pre\-existing failure is reproduced, documented, and shown not to invalidate the proposed work\.
- Capture meantone, a supported 31\-EDO realization, a genuine non\-octave reference, a divided\-octave period, optimized\-period tuning, and wrapping on/off\. Store exact states/layouts; do not rely on a preset name resolving identically forever\.
- Derive small expected pitch/coordinate/time results independently from the fixture data\. Copying the resolver’s output into its own expected values is not a test oracle\.
- Define the first composition demonstration: an eight\-bar chord progression with a melody, initially using a known playable meantone fixture\.
- Freeze performance benchmark targets: four tracks, 128 bars, and 4,096 stored one\-tone events in an editor fixture; separately measure realistic simultaneous voice counts\. These are test targets, not promises about existing performance\. Record the actual test platform and adopt measured budgets before Phase 5\.

**Gate / rollback:** **PASS.** GPT\-6 Astra completed the read\-only final sweep and accepted the fixture and documentation evidence\. The source\-only checkpoint is `debb768130b785ca546d1e42ce3330e8344cb2e9`, based on `a8d551a9340d6ac6ae80527055e534fd0a1df681`\. If rollback is needed, revert that checkpoint or remove only its five authorized paths; preserve unrelated work\. No app deployment occurred\.

### Frozen Phase 0 contracts and current-source findings

These are the frozen initial design limits for the composition product, not existing app capacity\. Astra accepted the Phase 0 evidence; this acceptance does not imply product features exist\.

**Context and material.** A project has one musical context\. Its project\-bound Create adapter supplies the same snapshot to the board, chord catalogue, editor, and resolver; Discover may browse independently\. Each stored tone has a stable `toneId` and one final sounding integer coordinate `[period,generator]`, with any voicing period displacement already included exactly once\. Board cells and source degrees are annotations, not pitch identities\. Serialize coordinate components as integers, canonicalizing signed zero to `0` while preserving exact identity for every nonzero integer\. Keep mapping, tuning, scale/mode, and layout identities separate; never copy coordinates across mappings without a verified transform\. Snapshot ordered basis/mapping, resolved `p/g`, method settings, scale coordinates, layout, and `tonicHz`\. When insertion follows the catalogue’s selected/auditioned fingering, copy that placement’s actual `coords` including `periodShift`, and retain its base voicing/occurrence metadata; do not substitute unshifted realization coordinates or add board register twice\.

**Format, import, and editing.** Standalone projects use `temperament-lab-composition-v1`\. Whole\-app saves containing a project use `temperament-lab-v2`; the new loader accepts v1 and v2, and legacy sessions without composition retain v1\. Import into a candidate clone, validate the complete reference graph and bounds, then commit atomically\. Audio runtime state is never serialized\. Musical edits are undoable commands; duplicated clips are independent copies by default\.

**Frozen initial product limits.** PPQ is 960; tempo is 20–400 quarter BPM; meter numerator is 1–32 and denominator is 1, 2, 4, 8, 16, or 32; projects have 1–16 tracks and at most 512 clips, 16,384 stored events, 1–8 tones per event, and 128 repetitions per clip\. A finite render may expand at most 131,072 tone-ons; the timeline may span at most 32,768 quarter notes and at most 7,200 seconds at the chosen tempo\. Start and duration are safe integers, start ≥ 0, duration ≥ 1; velocity is 1–127; coordinate components are integers with absolute value ≤ 10,000; tonic is 40–1,000 Hz; serialized project size is at most 8,000,000 bytes\. Undo history stops at 100 commands or 32 MiB, whichever is reached first\. Preserve out\-of\-audible\-range pitches as flagged data; playback/export preflight reports them and never silently changes or drops them\. The maximum is 64 concurrently sounding voices across all sources, including release tails; future events in a lookahead queue do not count toward this ceiling\. Reject/report overload rather than nondeterministic voice stealing\. Voice/channel limits remain independent of clip and finite\-render limits\.

**Scheduling and input contract (not implemented).** The future engine boundary is `scheduleEvents(events, {groupId, revision, tonicHz, sound})`, returning cancelable voice tokens; each tone record has `{voiceId, cents, onsetAudioSeconds, releaseAudioSeconds, velocity}`\. Provide `getClockSnapshot() → {audioSeconds, performanceMs, state, clockRevision}`, `cancelGroup(groupId)`, `cancelRevision(groupId, revision)`, and the existing global stop/panic\. Integer ticks map to audio time from a clock anchor with short lookahead; performance timestamps map through an explicit anchor, and a changed `clockRevision` invalidates old anchors\. Each input source/gesture has its own hold ID and onset token; logical note-off releases that token even if current key state changed\. Record raw timing before quantization\. Edits/context changes pause and invalidate the current revision; loop crossings cut/retrigger; seek/resume restarts notes active at the new position with a documented fresh envelope\. A minimum gate for a quick live tap never stretches a scheduled composition duration\.

**Existing owners, test techniques, and manual evidence.** `state.mjs`/`pitch.mjs` own state limits and pitch helpers; `engine.mjs` owns scale coordinates; `hexboard.mjs` plus wrapping owns `buildBoard`; chord v2 owns identity/projection/occurrence/realization/placement; `audio.mjs#createAudioEngine` owns live voices; `material-ui.mjs` owns collected source material; `app.mjs` owns the global computer-key one-shot path and session integration\. `createHexboardPlayer` exposes injected/focused virtual UI input paths, but there is no hardware input reducer/protocol, pure board snapshot API, or composition scheduler yet\. Current tests use Node’s built-in assertion runner, fake DOM/event targets, and fake audio contexts; the installed test stack has no jsdom or Playwright dependency\. Automated behavior tests can exercise pure state/clock seams and observable DOM/audio events once added\. Browser behavior, acoustic output, screen readers, physical keys/LEDs/MIDI, and DAW receiver interoperability require manual checks later\. Planned test targets are desktop Chrome on macOS and Windows 11, desktop Edge on Windows 11, and secondarily iPhone/Safari for touch/edit/audio; record exact OS, browser, and device versions when those checks run\. Test physical MIDI/HexBoard and DAW output only on verified configurations\. These are provisional product test targets, not observed environments or compatibility certification\.

**Phase 0 fixture evidence.** `tests/fixtures/composition/phase0-corpus.json` stores literal meantone 7-note mode 4, coherent 31\-EDO, 245/243 tritave, 128/125 divided\-octave, and optimized\-period meantone states; each has wrap on/off configs, axes, and selected enabled probes\. `tests/composition-phase0.mjs` checks captured pitches against integer dot products, rational EDO steps, and ratio/frequency products rather than regenerating expected snapshots from production tuners\. `tests/fixtures/composition/phase0-demo.json` is an eight\-bar specification/test fixture only, not an importable or playable feature\. The divided\-octave 4:5:6 projection has source cardinality 3, tempered cardinality 2, and `collapsedMembers=1`: the 1/1 and 5/4 members share one class modulo the 400\-cent period, while their stored coordinates differ by one period and their absolute frequencies are not equal\. The fixture does not claim the 5/4 ratio sounds at unison\. `tests/fixtures/composition/phase0-benchmark.mjs` constructs the 4×128×8 editor workload on demand and keeps concurrent\-voice stress separate; all benchmark sizes are targets, with no current editor/audio performance claim\.

### Phase 1 — Project foundation and Create integration

**Deliverable to try:** Start a named composition from the current Play scale, add one test note or imported material event through a minimal event list, export the project JSON, reload it, and inspect the same context and event\. Existing Play and chord browsing still work\.

**Luna Max packets:** `P1.1` pure project schema/validation/serialization and command history; `P1.2` context and material adapters with a read\-only board snapshot; `P1.3` minimal Create shell and session integration\. The integrator owns the final controller edits\.

**Acceptance checks:**

- A Discover scale of one size and a different Create scale produce a composition using Create’s actual size/mode\.
- Saved context includes ordered mapping/basis, resolved tuning, tonic Hz, scale coordinates, layout, tempo/meter, and stable IDs\. Reopening preserves them without rerunning a tuner automatically\.
- Existing material imports copy exact voiced coordinates\. Changing/deleting the source collection item does not mutate the composition\. Missing chord provenance stays missing\.
- A different\-source\-tuning material item is rejected with a useful explanation until conversion exists; it is never inserted using the current tuning by accident\.
- Project JSON round\-trips semantically; invalid coordinates, duplicate IDs, dangling clip references, excessive sizes, and unsupported future versions are rejected without partial mutation\.
- Current sessions without composition data open normally\. Proposed default: standalone projects use `temperament-lab-composition-v1`\. Whole\-app saves containing composition data use a new `temperament-lab-v2` envelope; the updated loader accepts both v1 and v2, while older apps reject v2 instead of silently dropping the composition\. Retain the v1 save path for sessions with no composition\. Freeze and test these exact version rules in Phase 0\.
- With a project open, its catalogue, virtual board, editor, and resolver receive the same project\-bound Create context, including after browsing a different Discover setup and returning\.
- Undo/redo works for add/edit/remove; project state survives UI rerender and navigation\. Pointer click/drag/Shift sustain and chord search focus remain intact\.

**Astra final sweep:** Review the source of every context field and the atomic load boundary\. Target existing workflow/material, HexBoard\-player, and session\-related tests plus new project tests; run build and broader regressions for the shared integration\.

**Gate / rollback:** Exported fixture and a demonstrated save/open round trip exist\. Disable the composition entry if needed; retain new project files, with no conversion of old user data\.

### Phase 2 — Shared transport and tuned playback

**Deliverable to try:** Play a two\-bar note/chord fixture; pause, resume, seek, change tempo while stopped, and loop it\. Play a live HexBoard note and audition a chord while the loop continues\.

**Luna Max packets:** `P2.1` deterministic tick/time planner; `P2.2` scoped scheduling/cancellation in the existing audio owner; `P2.3` transport UI, playhead, metronome/count\-in, and semantic board cues\. Implement explicit tonic/wave/envelope inputs; preserve old preview methods as compatible callers\.

**Acceptance checks:**

- Resolved pitches equal the saved context’s independent expectations for every fixture, including optimized and non\-octave periods\. Coordinate/register is not applied twice\.
- Tests cover exact event times, tempo\-to\-seconds conversion, simultaneous starts, note\-off/on ordering, pauses, seeks, loop boundaries, and empty sequences\. A fake clock test runs 100 loop iterations with no cumulative tick drift or duplicate event IDs\.
- Stop during a pending `AudioContext.resume()` cannot start later audio\. Preview cancellation, live release, and track cancellation affect their own groups; global Stop clears all groups and scheduled callbacks\.
- A long note crossing the loop boundary obeys the declared cut/retrigger policy\. Mid\-note seek/resume uses a specified restart envelope for notes active at the new position, without replaying earlier attacks\.
- Input/audio readiness failures leave the transport stopped with recoverable UI\. Hidden\-page/context suspension pauses safely and never produces a catch\-up burst\.
- Playhead/highlight updates do not replace the board DOM, interrupt held gestures, or call the global render path every frame\.
- An audible loop demo is checked for stuck notes and repeated cancellation clicks\. Numerical timing tests and listening evidence are recorded separately\.

**Astra final sweep:** Inspect clock ownership, voice lifetime, and compatibility with all existing audio callers\. Run the shared audio/player suites, new scheduler tests, full regressions, and build once for the integrated phase\.

**Gate / rollback:** The loop and independent live audition demonstration passes\. Roll back only the scheduled\-transport entry point; the original shared engine behavior and portable projects remain usable\.

### Phase 3 — Chord progression editor

**Deliverable to try:** Build and save an eight\-bar progression from at least four selected catalogue occurrences\. Choose inversions/voicings, change chord lengths, insert a rest, reorder/repeat a chord, and loop the progression with board highlights\.

**Luna Max packets:** `P3.1` structured catalogue/material handoff; `P3.2` chord timeline commands and controls; `P3.3` voicing/fingering inspection and demonstration fixture\.

**Acceptance checks:**

- An inserted chord copies the selected occurrence and actual voiced coordinates, not merely its family label or the first catalogue match\.
- Inversion, spacing, ordering, and period shifts use the existing v2 realization engine\. Inversion does not create a new composition\-level theory engine or redefine canonical chord identity\.
- Chord event duration and rhythm are independent of its identity\. Dragging, resizing, numeric entry, duplication, and deletion produce valid ticks and reversible commands\.
- Otonal/utonal entries retain their distinct identities even when the catalogue groups them\. Exact cardinality collisions and missing scale occurrences are reported using existing v2 semantics\.
- A chord valid in the scale but without a complete current\-board fingering remains in the timeline and sounds correctly\. Its board status says why it cannot be placed\.
- Editing an event pauses and invalidates scheduled playback consistently; the next playback uses the edited version only\.
- Chord search typing, selection, highlights, short mouse notes, and collected\-item playback remain functional\.

**Astra final sweep:** Trace one chord end to end from v2 result through stored event, resolver, audio, and board cue\. Check progression editing and affected v2/player regressions; build the integrated result\.

**Gate / rollback:** A saved progression fixture and a short test script demonstrate the complete flow\. This is the first musically useful checkpoint\. Disable the new chord timeline entry if needed without changing the catalogue or stored collection\.

### Phase 4 — Melody editor and virtual HexBoard recording

**Deliverable to try:** Write a melody in the degree grid, then record a second take from the virtual HexBoard over the progression\. Adjust notes and velocities, quantize the take, undo the quantization, and hear the result\.

**Luna Max packets:** `P4.1` degree/register note grid and accessible event\-list fallback; `P4.2` logical input/recording reducer; `P4.3` recording/count\-in controls and non\-destructive timing edits\.

**Acceptance checks:**

- Notes can be created, moved in time/pitch, resized, selected in groups, copied, deleted, and edited numerically\. Scale snap is the default; outside\-scale notes are explicit and remain representable\.
- Record\-arm targets one track\. The first release records one bounded pass; existing material on that track is preserved as a separate take/clip until the user chooses replacement\. Arrangement looping does not silently overwrite a take\.
- Timestamp conversion, count\-in exclusion, latency\-offset handling, and note\-on/off pairing are deterministic\. Save raw timing alongside editable quantized timing; do not claim calibration that has not been measured\.
- Shift sustain records the intended held duration\. Quick taps, drag transitions, repeat keys, multiple pointers/sources, pointer cancellation, blur, navigation, and Stop terminate takes without dangling notes\.
- The logical hold reducer distinguishes sources, and releasing one source does not cut another\. Two equivalent board positions can produce separate recorded events with the same pitch\.
- Recording stores onset\-time coordinates/context\. Changing layout or context mid\-take first finalizes the take; it never retargets a held note’s release\.
- Same\-frequency EDO coincidences retain distinct abstract coordinates where provided by the board\. A recorded button ID is optional provenance, never the only stored pitch\.
- Text entry and ordinary navigation do not trigger transport or musical shortcuts\. Pointer and keyboard equivalents are available for core edits\.

**Astra final sweep:** Inspect the exact input edges observed by the recorder, how sustain is represented, and interaction with global shortcuts and rerendering\. Reuse the hardware\-plan input seam if it exists\. Run recording/editor/player tests, the shared regressions, and build\.

**Gate / rollback:** Save the two\-track progression/melody demonstration, including a raw take and its edited version\. Disable recording independently if needed; hand\-entered melodies and chord playback continue working\.

### Phase 5 — Arrangement, tracks, and basic sound controls

**Deliverable to try:** Turn the progression and melody into an A–B–A arrangement with a bass track\. Duplicate and vary clips, set loop regions, mute/solo tracks, balance levels, and choose from the app’s supported timbres\.

**Luna Max packets:** `P5.1` clips/arrangement model and editor; `P5.2` track routing, level/pan/velocity/envelope controls within the shared audio system; `P5.3` bounded transformations, profiling, and UI refinement\.

**Acceptance checks:**

- Clip copy is independent by default; linked copies are deferred unless explicitly designed\. Clip content ticks remain local while arrangement placement supplies the offset\. Repeats compile to unique voice occurrences\.
- Trim, split, resize, move, duplicate, delete, and repeat behave consistently at note boundaries\. Splitting a crossing event preserves total intended duration under a documented split/retrigger rule\.
- Chord, melody, and bass tracks sound together\. Mute/solo, preview, loop/seek, and global Stop cannot leave voices or duplicate playback behind\.
- Track instruments/settings are captured per scheduled voice; changing one track does not change another or alter its tuning\. Mix gain protects the demonstration from clipping without replacing the global audio owner\.
- Add only bounded, explicit composition transformations: transpose by a coordinate or period; repeat a motif; turn a selected chord’s existing tones into an arpeggio\. Degree transposition requires the chosen scale policy and cannot assume equal steps\.
- An arrangement undo/redo restores notes, context references, and clip ownership\. Deleted selected events clear stale inspector/board cues\.
- Run Phase 0’s editor fixture and a separate audio\-polyphony fixture\. Record edit response and scheduler/voice behavior on the selected platform, plus the actual voice ceiling and failure behavior\. Optimize only a measured bottleneck\.

**Astra final sweep:** Review clip\-to\-event expansion, polyphony, gain, and interaction cost\. The stored project must not multiply notes unnecessarily for every repeat\. Run arrangement/audio tests and full regression/build for this complete capability\.

**Gate / rollback:** A three\-track A–B–A fixture opens and plays\. Roll back advanced arrangement controls while preserving simple clips and project data; never silently flatten or discard an existing arrangement\.

### Phase 6 — Safe tuning, scale, and layout changes

**Deliverable to try:** Make variants of the same piece using two tunings of the same temperament, another scale/mode, and a different board layout\. Preview one conversion to a different temperament and inspect unresolved notes before accepting a copy\.

**Luna Max packets:** `P6.1` pure context\-difference/conversion service; `P6.2` preview/apply/cancel/undo UI; `P6.3` revalidation, cache invalidation, and saved variant fixtures\. Astra specifies the mathematical policies before implementation\.

**Acceptance checks:**

- Same\-mapping retuning preserves event coordinates and rhythm while updating frequencies\. Tuning\-quality reports refresh; exact mapping is not reclassified by cent tolerance\.
- If retuning changes scale ordering or creates a pitch collision, the change is visible\. Do not silently keep stale degree indices or drop colliding notes\.
- Changing tonic Hz shifts every sounding frequency consistently, including exports and previews\.
- Scale/mode change defaults to preserving coordinates and marks outside\-scale notes\. Degree reinterpretation is explicit, lists every changed/unresolved note, and has deterministic handling of a smaller scale; no implicit modulo fallback is permitted\.
- Layout changes preserve existing composition frequencies, recompute all candidate positions, and invalidate preferred fingerings\. Disabled overlap cells are never treated as playable positions\.
- Cross\-temperament conversion creates a separate project\. Source JI identity alone is insufficient: root/transposition, occurrence, and voicing must be resolvable too\. Free\-coordinate notes lacking a valid conversion stay unresolved until the user chooses a supported policy\.
- Apply/cancel/undo restores the entire project context, references, and layout atomically\. Playback and active recording are finalized before changes; stale async results are ignored by revision\.

**Astra final sweep:** Recompute representative conversion examples independently and inspect the distinction between identity, degree, cents, and board placement\. Run all context fixtures, affected tuning/scale/chord/wrapping tests, full regressions, and build\.

**Gate / rollback:** The source project and all verified variants reopen exactly; cancel leaves it unchanged\. Disable conversion controls if needed and continue using each project’s frozen saved context\. Do not convert automatically on open\.

### Phase 7 — Project management, recovery, and durable saving

**Deliverable to try:** Name, duplicate, save, close, and reopen a complete composition\. Recover an interrupted local draft, then save it to the account and reopen it in another authenticated session\. Trigger a conflicting edit and preserve both versions\.

**Luna Max packets:** `P7.1` local draft/autosave and project\-manager UI; `P7.2` additive composition storage/API using existing account ownership and optimistic revisions; `P7.3` migration/recovery fixtures and save\-state feedback\.

**Acceptance checks:**

- Use versioned portable project JSON as the exchange format\. A local recovery draft is explicitly device\-local; it must not be presented as an account save or guaranteed durable backup\.
- Composition records use their own project schema/endpoint and additive database migration\. Reuse validation, request limits, and revision conflict patterns from presets; choose and document their access scope independently, and leave preset data intact\.
- Server validation checks the entire project independently of the client\. Derive project payload/event bounds from Phase 5 fixtures, not the preset endpoint’s existing limit\.
- Autosave is debounced and only writes a valid committed snapshot\. Failed saves show unsaved state and preserve a downloadable copy\. Quota, offline, authentication, and corrupt\-draft cases are recoverable\.
- Save conflicts do not overwrite a newer revision\. Offer reload or save\-as\-copy; ownership and cross\-account access tests pass\.
- Old session fixtures still open; new project schemas migrate through explicit version steps\. Unsupported newer schemas fail safely, leaving the current project and source file untouched\.
- Opening/importing restores musical context, layout, tracks, and settings atomically\. Live transport/held keys are reset; playback does not begin automatically\.

**Astra final sweep:** Review migration scope, account isolation, atomic save/load, and conflict behavior\. Use the Worker\-capable environment for account API verification; the Vite UI server alone does not prove those endpoints work\. Run persistence/session tests and full build/regression checks\.

**Gate / rollback:** Demonstrate local recovery, account save/open, and revision conflict handling with test projects\. An unavailable account runtime blocks account\-save acceptance, not portable JSON use\. API/UI rollout can be disabled while preserving stored records; rollback never deletes projects or downgrades their data\.

### Phase 8 — Audio and microtonal DAW export

**Deliverable to try:** Export the arranged piece as WAV and as a microtonal MIDI file, then open the files and compare pitch, timing, voicing, and duration with the app\. Supply a small export test project and receiver setup instructions\.

**Luna Max packets, sequential subgates:** `P8.1` offline audio renderer and WAV encoder; `P8.2` one explicit microtonal MIDI export mode with bounded channel allocation and fixtures; `P8.3` export UI, DAW instructions, and round\-trip evidence\. WAV acceptance precedes MIDI integration\.

**Export contract:**

- The real\-time player and offline renderer share the resolved event plan and voice\-construction code\. An `OfflineAudioContext` is an intentional render context, not another live synth owner\. Bound duration/memory, support cancellation, include release tails, and select a documented WAV sample rate/format\. &#91;R4&#93;
- First MIDI mode: a pitch\-bend\-per\-note/channel export for a specifically configured compatible receiver\. Establish its pitch\-bend range, note/channel assignment, program behavior, event ordering, sustain/release policy, and voice/channel limit from the official specification before implementation\. Do not label an arbitrary multichannel MIDI file “MPE compliant\.” &#91;R6&#93;
- Standard MIDI note numbers alone do not carry the suite’s complete project/context model\. Preserve the original composition JSON alongside exports\. A separate `.scl` export already exists in the app; reuse it where relevant, but do not claim that adding `.scl` makes an arbitrary MIDI file sound correctly without a verified key mapping and receiver setup\. &#91;R1&#93;
- Plain 12\-EDO approximation, if ever offered, is an explicitly lossy option with reported cent errors\. It is not the default export for this suite\.

**Acceptance checks:**

- WAV sample count, musical duration plus tail, stereo routing, mute/solo, gain, and nonzero signal match expected fixtures; finite samples remain in the encoded range\. Measured simple\-tone pitches match the project within a declared analysis tolerance\.
- Rendered note\-on/off times and simultaneous attacks match the event plan within sample\-rounding tolerance\. Export never changes the live project or plays sound unexpectedly\.
- An independent MIDI parser verifies delta times, tempo, ordering, bends\-before\-attacks, releases\-before\-channel\-reuse, and pitch\-bend resets\. Overlapping notes needing different bends never share a conflicting channel\.
- Test a chord with unequal microtonal offsets, repeated/unison notes, release tails, overlapping tracks, a non\-octave fixture, range boundaries, and exhausted channel capacity\. The exporter reports unsupported cases instead of detuning or dropping notes silently\.
- Reconstruct exported frequencies mathematically and report maximum cent error caused by MIDI/bend quantization\. Declare an accepted error budget before gating; JSON retains the original pitch model\.
- Verify playback in REAPER with a named, configured receiving instrument that actually supports the chosen mode\. Record versions/settings and observations\. File validation alone does not count as DAW interoperability; lack of DAW access remains an explicit limitation\.

**Astra final sweep:** Review shared render logic, numeric conversion, channel lifetime, specification evidence, and measured export error\. Run audio/export tests and integrated regression/build checks\. Inspect actual exported files and receiver evidence\.

**Gate / rollback:** WAV and MIDI each have an independent pass record\. Disable a failing exporter while preserving native projects and any verified export route\. Do not advertise MIDI interoperability until its receiver test passes\.

### Phase 9 — HexBoard/practice handoff and final release candidate

**Deliverable to try:** Play the finished demonstration while the virtual board shows the current and next notes/chords\. Select alternative fingerings, export or hand off the phrase as practice targets, reopen the project, and perform the entire workflow again\.

**Luna Max packets:** `P9.1` semantic cue/practice adapter using the existing shared seam; `P9.2` end\-to\-end fixtures, concise help, accessibility and layout fixes; `P9.3` bounded final repairs and release notes\.

**Acceptance checks:**

- Audio, playhead, and board cues consume the same event timeline\. Screen animation does not drive the audio clock\. Cue state is cleared or recomputed after pause, seek, loop, layout/context changes, and project load\.
- Duplicate board positions are shown as alternatives; exact\-register and any\-degree matching remain separate\. Unplayable notes/chords stay audible and are described accurately\.
- If the physical adapter is available and independently verified, route its inputs through the same recorder and its LED cues through the same semantic timeline\. Verify device release/disconnect and stale cue cancellation on the real device\. Otherwise complete the virtual/fake\-adapter tests and label physical integration pending under the separate plan\.
- Practice handoff preserves rhythm, durations, exact coordinates, relevant context, and the declared match mode\. It does not implement a second scoring or timing engine\.
- Run the complete musical/context matrix, full suite/build, and the end\-to\-end demonstration: catalogue → progression → melody record/edit → arrangement → retune/layout variant → save/open → export\.
- Check keyboard operation, focus preservation, readable labels, a narrow viewport, and the supported desktop environment\. Browser/device compatibility is reported from actual tests, not inferred from API specifications\.
- Rehearse rollback to the last accepted version without losing new project files or account records\. Update `PROJECT_STATE.md` and `DECISIONS.md` only for material new owners and decisions\.

**Astra final sweep:** Review the full integrated diff, unresolved risks, all phase evidence, the action log, cross\-plan ownership, and documented limits\. Delegate any code fixes back to Luna Max and recheck the affected evidence\.

**Gate / release:** The virtual composition suite may be accepted independently of unfinished physical hardware work\. A release requires the claimed features’ actual acceptance checks; unsupported MIDI receivers or devices are not represented as tested\. When implementation/publishing is authorized, use the existing Sites workflow and audience, then record the source commit, saved version, deployment result, and rollback version here\. Planning alone does not publish anything\.

## 7\. Proposed module and test ownership

Names below are work\-packet suggestions, not files that already exist\. Keep modules small and compatible with the current build\. The current asset collector enumerates top\-level `dist` files, and the test runner enumerates top\-level `tests/*.mjs`; use those conventions unless a deliberate build change is justified\. &#91;R1&#93;

|Boundary                                             |Proposed home / integration                                                                                         |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
|Project data, validation, commands, schema migrations|`dist/composition-project.mjs`; focused `tests/composition-project.mjs`                                             |
|Context snapshots, pitch resolution, conversion      |`dist/composition-context.mjs`; consume `state.mjs`, `pitch.mjs`, `engine.mjs`, tuning and v2 chord owners          |
|Tick planning, clip expansion, transport state       |`dist/composition-transport.mjs`; fake-clock tests independent of DOM                                               |
|Shared scheduled/held voices and render graph        |Extend `dist/audio.mjs`; a helper may be extracted under the same ownership for live/offline reuse                  |
|Logical input, takes, quantization                   |`dist/composition-recording.mjs`; shared input adapter coordinated with the hardware plan                           |
|Arrangement / clip / event editing UI                |`dist/composition-ui.mjs` and only measured, useful smaller UI modules; thin integration in `app.mjs`               |
|Board cues and preferred fingerings                  |Small adapter over canonical board snapshots and v2 placement; no parallel board builder                            |
|Local recovery / account projects                    |`dist/composition-storage.mjs`, `server/compositions.mjs`, additive database migration following current conventions|
|Offline/WAV/MIDI serialization                       |`dist/composition-export.mjs`, split only when responsibility warrants it; parser-based and audio-render fixtures   |

Fixture files may live in a subdirectory, but their test entry points must be discovered by the actual test command\. Keep UI tests from passing solely because a source string exists; prefer observable commands, state transitions, DOM behavior, event plans, and rendered/exported output\.

## 8\. Cross\-phase regression matrix

|Case                                                |Essential invariant                                                        |First gate; recheck when affected|
|----------------------------------------------------|---------------------------------------------------------------------------|---------------------------------|
|Meantone plus a supported 31-EDO realization        |Abstract coordinates survive tuning changes and EDO pitch coincidences     |1–2; 6, 8–9                      |
|Divided-octave / non-octave / optimized periods     |Register shift uses actual `p`, never a hard-coded octave                  |1–2; 6, 8–9                      |
|Discover and Create use different scale/mode        |Composition captures the scale actually played in Create                   |1; 6–7                           |
|Wrapping on/off, manual vector, both axis flips     |Layout changes cells, not saved note pitches; overlap cells stay disabled  |1–4; 6, 9                        |
|Same degree at several cells or registers           |Degree, sounding coordinate, register, cell, and input source stay distinct|2–4; 9                           |
|Valid chord with no fingering                       |Chord remains musically valid and audible                                  |3; 6, 9                          |
|Collected item from another source tuning           |No silent retuning during insertion                                        |1, 3; 6                          |
|Short tap, drag, Shift sustain, blur/Stop           |Every recorded/played onset has correct release ownership                  |2, 4; 9                          |
|Audition while accompaniment plays                  |Preview does not cancel the arrangement                                    |2; 5, 9                          |
|Loop wrap, seek, late callbacks, async audio resume |No duplicate, stale, or stuck voices                                       |2; 5, 9                          |
|Unsupported conversion or future project schema     |Current project remains unchanged; no silent data loss                     |1, 6–7                           |
|Save conflict / offline / failed import             |Recoverable state and explicit save result                                 |7; 9                             |
|Unequal simultaneous MIDI bends / channel exhaustion|No silent pitch substitution or note loss                                  |8; 9                             |

Do not rerun the whole matrix for a copy edit\. Recheck the rows whose inputs or owners changed, plus the phase’s stated integrated gate\.

## 9\. Action log and plan maintenance — mandatory

**This document is the execution record\.** Every work session related to this plan must update it\. A separate task tracker or chat message does not satisfy the logging requirement\.

At implementation kickoff, place this plan at `docs/COMPOSITION_SUITE_PLAN.md` and keep the delivered plan document synchronized with that content\. Update the same delivered file identity; do not create successive unrelated “final” copies\. Preserve the repository’s normal source\-control history\. Record which copy was updated and any synchronization failure; do not claim both are current if one write failed\. The repository’s project\-state document is still a concise current\-state reference, not a substitute activity diary\.

For **every material action**, append a row or grouped entry with: UTC time; phase/task; actor and actual model/effort if known; action and affected files; command/inspection evidence; result; decisions/deviations; and next step\. Log successful work, failed attempts, abandoned approaches, test failures, repairs, gate decisions, blockers, rollbacks, and publication\. Batch related read\-only inspections into one entry, but retain significant failures and their resolution\. Do not record credentials or invent usage/credit numbers\.

Update the phase\-status table after every gate\. Append decisions rather than erasing earlier failed attempts\. When a requirement changes, note the reason, affected tests/dependencies, and who authorized it\. If a schema or contract changes after a passed phase, explicitly reopen its affected acceptance checks\.

### Actions completed while preparing and executing this plan

All listed dates are **24 September 2026 UTC**\. A001–A011 record the initial planning work; the planning actor’s runtime model was not recorded\. A012–A014 record root’s source preparation and baseline reuse, followed by P0.1/P0.2 execution by GPT\-6 Luna Max\. A015 records root’s orchestration review (runtime model not exposed) and GPT\-6 Astra’s explicit read\-only final sweep (reasoning effort not separately configured)\. A016 records root’s checkpoint and initial plan synchronization; A017 records P0.3 documentation close by GPT\-6 Luna Max; A018 records root’s synchronization confirmation\. These log entries do not authorize work beyond Phase 0\.

|ID  |Action                                                                                        |Evidence / result                                                                                                                                                                                                                                                                           |Impact / next step                                                                                                                         |
|----|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
|A001|Read the file-persistence workflow and checked continuity requirements                        |Read the Library and Personal Context skill instructions; existing named documents supplied the required prior context, so no conversation-history search was needed                                                                                                                        |Use current source and current plan contents as evidence                                                                                   |
|A002|Retrieved the existing physical HexBoard/rhythm plan and chord-engine plan                    |Read `Temperament_Lab_HexBoard_Rhythm_Integration_Plan.md` and both portions of `Temperament_App_Chord_Engine_Implementation_Plan.docx`                                                                                                                                                     |Reuse shared seams; old implementation stages are not treated as current code                                                              |
|A003|Resolved the app and inspected its latest saved source version                                |Site title Temperament Lab; latest saved version 95; source `a8d551a9340d6ac6ae80527055e534fd0a1df681`                                                                                                                                                                                      |Established a concrete planning baseline                                                                                                   |
|A004|Compared an older available checkout with the matching current checkout                       |Older checkout was `f3437e2`; inspected repository policy/current-state/decision files and the delta to `a8d551a`                                                                                                                                                                           |Used the matching current source for code findings                                                                                         |
|A005|Attempted source preparation, then used an already available verified checkout                |Preparation returned “Unable to prepare the Site.” Existing checkout matched the saved source commit and was clean                                                                                                                                                                          |No source change or deployment resulted; no need to retry preparation for read-only planning                                               |
|A006|Inspected material, context, audio, input, board, session, persistence, build, and test owners|Relevant symbols/files are listed in Sections 2 and 7. Some initial path probes were absent; corrected the material owner to `material-ui.mjs`                                                                                                                                              |Found global preview cancellation, independent Play scale, limited material provenance, and DOM-reset hazards                              |
|A007|Checked primary API/format references                                                         |W3C Web Audio and Web MIDI and the MIDI Association overview were accessible. One guessed MIDI URL and Scala page opens failed; the complete MIDI export specification remains a Phase 8 input                                                                                              |No unverified protocol bytes, browser-support promises, or Scala/DAW interoperability claims were added                                    |
|A008|Ran baseline build and tests on the matching source                                           |`npm run build`: pass. `npm test`: 34/34 suites pass. `git status --short`: clean afterward                                                                                                                                                                                                 |Existing code unchanged; acoustic/browser/hardware testing still unperformed                                                               |
|A009|Authored the implementation plan and model policy                                             |Ten phases (0–9), explicit Luna Max packets, Astra sweeps, demos, tests, rollbacks, context semantics, and log requirements                                                                                                                                                                 |Product implementation remains not started                                                                                                 |
|A010|Reviewed plan structure and cross-phase consistency                                           |Verified all 10 phases include deliverables, Luna packets, tests, Astra review, and gate/rollback fields; reference markers and code fences are consistent. Reviewed context ownership, source provenance, old-session compatibility, audio cancellation, and conditional hardware/DAW gates|Clarified project-bound Create context and explicit v1/v2 session envelopes. All product phases remain not started; plan ready for delivery|
|A011|Saved the completed plan and recorded the delivery outcome                                    |Initial document save succeeded as `Temperament_App_Composition_Suite_Implementation_Plan.md`; this final log update retains the same document identity                                                                                                                                     |Plan delivered for implementation handoff. No app code was edited and no deployment was made                                               |
|A012|Opened the isolated Phase 0 checkout and reused current-source baseline evidence                |On 24 September 2026 UTC, inspected source `a8d551a9340d6ac6ae80527055e534fd0a1df681`; checkout was clean before fixture edits. Read/materialized library plan version 4 to `docs/COMPOSITION_SUITE_PLAN.md` (format-only content delta); current Site version remains 95. `npm ci --ignore-scripts` installed 32 packages. P0.1 read-only inventory by GPT-6 Luna Max; supplied unchanged-HEAD baseline `npm run build` and `npm test` passed 34/34 and was reused.|No production file changed. Phase 0 only is authorized; Phase 1–9 remain not started. |
|A013|Captured the Phase 0 source corpus, demo, deterministic benchmark, and independent assertions  |Added `tests/fixtures/composition/phase0-corpus.json`, `phase0-demo.json`, `phase0-benchmark.mjs`, and `tests/composition-phase0.mjs`. Initial targeted run failed because JavaScript emitted signed `-0` in a calculated coordinate; canonicalized signed zero to `0` in the test oracle, retaining exact comparison for all other integer components. Rerun `node tests/composition-phase0.mjs`: pass. Snapshots remain literal and tuner-independent; v2 occurrence/realization/fingering, ratio/EDO/pitch, board wrapping, melody timing, benchmark counts, and mutation checks passed.|Recorded fixed-ratio, non-octave, divided-period-class, optimized-period, Create-context, and audio/input contracts in this plan. No product feature or performance claim is implemented; Astra final sweep remains pending. |
|A014|Ran the integrated build and test gate after the fixture/document changes                             |24 September 2026 UTC: `npm run build` passed (`Worker built with 48 app assets`); `npm test` passed **35/35 suites**, including `composition-phase0.mjs`. Platform: Node v24.19.0, npm 11.9.0, Linux x86_64. `git rev-parse HEAD` remained `a8d551a9340d6ac6ae80527055e534fd0a1df681`; only the four Phase 0 deliverable paths and this plan were untracked/changed. `npm` printed an environment warning for the `http-proxy` config, but both commands succeeded.|Automated Phase 0 checks pass. No browser, acoustic, screen-reader, physical MIDI/Hardware, or DAW observation was attempted. The independent/Astra acceptance review is recorded in A015. |
|A015|Completed independent integration review and the explicit Astra final acceptance sweep              |24 September 2026 UTC: root independently reran `node tests/composition-phase0.mjs` (PASS) and `git diff --cached --check` (PASS), confirmed exactly five authorized paths, and reviewed the exact selected fingering, EDO metadata, optimized-period reference, period-class semantics, signed-zero handling, in-scale benchmark pitches, and melody timing. GPT-6 Astra performed a read-only review of guidance, invariants, contracts, and all five paths; accepted the focused test, build, and 35/35 suite evidence, with no material blocker, edits, or test rerun. Refinements accepted: canonical EDO config, non-pure optimized-period ratio handling, scale-valid benchmark notes, copying actual selected placement coordinates, explicit melody starts/durations, and signed-zero canonicalization.|Phase 0 gate PASS. No production feature was implemented. Root was the primary orchestration/review actor; Astra’s runtime effort was not separately configured. |
|A016|Committed/pushed the Phase 0 source checkpoint and synchronized the initial plan snapshot             |Root created and pushed source-only checkpoint `debb768130b785ca546d1e42ce3330e8344cb2e9`, based on `a8d551a9340d6ac6ae80527055e534fd0a1df681`. The initial plan snapshot was saved as version 5 to the same delivered document identity. No app deployment occurred. This final Phase 0 close update will be synchronized by root after Luna returns; no later document version or commit is asserted here.|Rollback by reverting checkpoint `debb768130b785ca546d1e42ce3330e8344cb2e9` or removing only its five Phase 0 paths; preserve unrelated work. Phase 1 remains unauthorized and unstarted. |
|A017|Recorded the Phase 0 close decision in the same plan document identity                                     |GPT-6 Luna Max updated only `docs/COMPOSITION_SUITE_PLAN.md` to version 1.1, recording the formal Astra PASS, complete close evidence, test-target matrix, remaining manual/performance gates, and next handoff. The initial version-5 synchronization predates this close update.|Root will synchronize this final documentation update as its immediate next action. No new commit hash or saved document version is claimed. Phase 1 is eligible for planning as P1.1 only after separate authorization. |
|A018|Confirmed final gate-record delivery and added this synchronization receipt|24 September 2026, 02:03 UTC: root pushed the Phase 0 acceptance record at source commit `5e78d0ab27b584668314f385a9893f9f80c5f9d2` and saved the same delivered plan identity as version 6. A byte comparison of the two plan copies passed. This receipt records those completed operations and is included in the final documentation synchronization; it does not change fixture or product code.|Source and delivered gate records are synchronized. All technical checks and the Astra PASS remain valid. No deployment or Phase 1 work occurred.|
|A019|Authorization and scope for the MVP|4 October 2026: the user asked for an MVP of the composition suite in the Temperament app, prepared for a later HexBoard rhythm game/learning mode\. The user chose the scope "Phases 1–3 + melody grid + game\-ready cue stream" over a larger recording scope and a smaller Phases 1–3 only scope\. Actor: Claude Sonnet 5\.5 \(claude\-sonnet\-5\-5\) in Claude Code; reasoning effort not recorded\.|Deviation: this plan's GPT\-6 Luna/Astra model policy could not be followed; the Astra final sweep was replaced by self\-review plus the test and browser evidence below, so no phase here is formally Astra\-accepted\. Phase 4 recording and Phases 5\-8 remain unauthorized\.|
|A020|Baseline on the current checkout|npm ci \-\-ignore\-scripts; npm run build passed \(85 assets\); npm test 73/74\. The one failure, diamond\-controls\.mjs line 91, asserts an exact LF CSS string but dist/style\.css has CRLF endings from the Windows checkout \(core\.autocrlf=true\)\. Platform: Windows 11 10\.0\.26200, Node v22\.16\.0, npm 10\.9\.2\.|Pre\-existing and environmental, not caused by this work; it still fails identically at the end\. The repository has grown to 74 suites since the plan's 35\.|
|A021|P1: project and context (composition-project\.mjs, composition-context\.mjs)|Schema, frozen limits, validation, atomic parseProject, commands with bounded undo/redo, context snapshot, resolver, degree annotation, guarded chord import\. Tests composition\-project\.mjs and composition\-context\.mjs pass\. Pitch oracle: literal values from phase0\-corpus\.json for all five fixtures; the eight\-bar fixture builds a project that lasts exactly 19\.2 s\.|The context stores the complete temperament state next to the resolved fields so a project reopens without re\-running a tuner\. Items from another tuning are rejected with an explanation\.|
|A022|P2: shared audio engine and transport (audio\.mjs, composition-transport\.mjs)|Additive voice groups, per\-group revisions, scheduleVoices, cancelGroup, cancelRevision, getClockSnapshot, previewChord/previewSequence\. Existing audio and hexboard\-player suites unchanged and passing\. New fake\-clock tests: exact times, 100 loop iterations without drift or duplicate ids, pause/resume/seek, no catch\-up burst, suspension, stop during pending resume\.|Legacy playChord/playSequence/startVoice keep their global cut\. Edits pause playback \(plan policy\)\. Loop wrap cuts crossing notes and retriggers the next iteration\.|
|A023|Cue seam and input seam (composition-cues\.mjs, hexboard-player\.mjs)|buildCueTimeline, activeCues, toPracticeTargets \(match modes exact\-coordinate, any\-degree, button\); optional onInput hold events with unchanged note behaviour\. Tests include the fixture's recorded board cells and period shifts, and captured probes for all five temperaments with wrapping on and off \(60 checks\)\.|No scoring or timing engine was added; it belongs to the HexBoard integration plan\. Same\-key presses from two sources still share one voice \(pre\-existing\)\.|
|A024|P3 and melody UI (composition-view\.mjs, composition-ui\.mjs) and app wiring|Chord progression from the collection \(add, length, reorder, duplicate, rest, delete, hear\), melody grid, transport, project save/open, practice export, undo/redo\. app\.mjs wiring is thin; composition\-session\.mjs holds the v1/v2 rules and the composition is validated before any other restore\. Styles appended after the style\-contract boundary\.|Auditions in Create use the preview group so a playing piece is not cancelled\. Four existing suites needed harness updates for the new dependency \(three vm stubs and one source ordering\); no production behaviour was changed for them\.|
|A025|Automated verification|npm run build passed \(92 assets\)\. npm test 81/82: all 8 new suites pass \(composition\-audio, \-context, \-cues, \-input, \-project, \-session, \-transport, \-ui\); the only failure is the A020 CRLF one\. A mutation check \(removing the edit\-pauses\-playback call\) made composition\-ui\.mjs fail as intended and was reverted\.|Tests exercise observable state and fake clocks; they do not prove browser or acoustic behaviour\.|
|A026|Browser verification in headless Chrome|Chrome 154\.0\.8037\.95 on Windows 11 10\.0\.26200 via the DevTools protocol against the Vite dev server: 35 checks passed with no console errors \(favicon 404 ignored\): new composition, four collected chords, chord length edit, six melody notes, playback with the playhead advancing and an AudioContext in the running state, pause/stop, edit pauses, undo/redo, practice\-target export with layout cells, v2 session save, page reload and restore, v1 session still opens, tab switch pauses, Play tab intact\.|Evidence is DOM state and screenshots only\. Audio output was not listened to, and loop playback was not exercised in the browser\.|
|A027|Documentation|Updated this plan, docs/PROJECT_STATE\.md \(Create and a Composition suite section\) and docs/DECISIONS\.md \(D\-032\)\.|Work is uncommitted in the working tree\.|
|A028|Piano roll for odd rhythms \(composition\-grid, \-edit, \-roll\-input; view, ui, transport\)|11 October 2026, Claude Opus 5\.5 in Claude Code: tuplet, dotted, swing and custom n:m grids; beat groups; Draw/Select tools, box selection, multi\-note move/copy/resize, velocity lane, ruler seek and loop, Edit and Rhythm menus \(quantize, split, fit n:m, legato, retrograde, Euclidean fill\), zoom, keyboard shortcuts; edits apply live during playback \(D\-043\)\. npm test and build passed; headless Chrome checks of drawing, selection, menus, 7/8, swing, zoom and phone width\.|Uncommitted\.|
|A029|Phase 4: HexBoard input and recording \(composition\-record, transport timeAt/count\-in/metronome\)|Held keys light roll rows and name the chord; selected notes light their keys; step entry for melody and chords; Rec with count\-in records at heard time, merging takes into the existing clips \(deviation from separate takes, D\-044\)\. Tests: composition\-record, composition\-hexboard\-input; headless Chrome checks of row lighting and step entry\. Physical HexBoard and listening unverified\.|Uncommitted\.|
|A030|Rhythm game \(composition\-game, \-game\-ui, \-game\-view\)|Game mode with Play and Learn, timing windows at heard time, holds, combo, results with timing histogram and weakest bars, speed trainer, calibration, browser\-stored best scores, HexBoard LED cues \(D\-045\)\. Tests: composition\-game, composition\-game\-ui; headless Chrome play\-through by an in\-page autoplayer \(16 notes: 12 Perfect, 4 skipped as Miss, timing −5 ms ±13 ms\), Learn on chords, calibration screen, phone width\. npm test 103/103 and build passed\.|Uncommitted\. Physical HexBoard, listening and a real player's timing remain unverified\.|

### Entry template for future actions

```text
Action ID / UTC time:
Phase / task / prior gate:
Actor / actual model / reasoning effort:
Action and affected files:
Evidence: commands, fixtures, observations, commit or artifact:
Result: passed / failed / blocked / partial; include exact limitation:
Decision or deviation and reason:
Plan / project-state / decision-document updates:
Next action:
```

### Required phase\-close record

```text
Phase:
Deliverable demonstrated / fixture:
Luna Max work packets and integration commit:
Tests and measurements actually run:
Manual / acoustic / DAW / hardware observations:
Astra final-sweep findings and repaired items:
Unverified items and their dependent features:
Gate: PASS / FAIL / BLOCKED, with reason:
Rollback checkpoint and method:
Plan synchronized; next permitted phase:
```

### Phase 0 close record — PASS

**Phase:** Phase 0, establish contracts and a reproducible baseline\.

**Deliverable demonstrated / fixture:** The source-owner map and frozen design contracts are recorded above\. Five literal temperament/tuning/layout cases have independent assertions; the eight\-bar meantone piece is a specification/test fixture only, not an implemented composition feature\. The on\-demand 4×128×8 editor workload and separate concurrent\-voice recipe are deterministic fixtures; their performance remains unmeasured\.

**Luna Max work packets and integration checkpoint:** GPT\-6 Luna Max completed P0.1 inventory, P0.2 fixture/contract capture, and P0.3 documentation close\. Root committed and pushed the five authorized Phase 0 paths at `debb768130b785ca546d1e42ce3330e8344cb2e9`, based on source `a8d551a9340d6ac6ae80527055e534fd0a1df681`\. No production feature code changed\.

**Tests and measurements actually run:** `node tests/composition-phase0.mjs` passed (Luna Max and an independent root rerun); `npm run build` passed and built 48 app assets; `npm test` passed 35/35 suites; root’s staged `git diff --cached --check` passed\. Test platform was Node v24.19.0 / npm 11.9.0 / Linux x86_64\. These checks verify fixture determinism and bounds only; no editor, audio, or latency budget was measured\.

**Manual / acoustic / DAW / hardware observations:** None\. Browser interaction, audio listening, screen readers, physical MIDI/HexBoard, and DAW receivers were not tested\.

**Astra final-sweep findings and repaired items:** GPT\-6 Astra performed a read\-only final review of guidance, invariants, contracts, and all five authorized paths and returned PASS with no material blocker, edits, or test rerun\. It accepted canonical EDO metadata, explicit non\-pure optimized\-period reference handling, scale\-valid benchmark pitches, copying the actual selected placement including period shift, explicit melody starts/durations, and signed\-zero canonicalization; all were incorporated before final acceptance\.

**Unverified items and their dependent features:** Browser and acoustic behavior remain future product validation; run planned Chrome/macOS, Chrome/Windows 11, Edge/Windows 11, and secondary iPhone/Safari checks with exact OS/browser/device versions recorded\. Physical MIDI/HexBoard and DAW checks require verified configurations\. Measure editor and voice performance and adopt budgets before Phase 5; MIDI interoperability and physical-device acceptance remain in their later phase gates\.

**Gate: PASS.** The unchanged source baseline, fixture oracles, stored demo/benchmark recipes, tests, build, and frozen contracts passed review; GPT\-6 Astra accepted the evidence\. This gate approves Phase 0 only and does not imply composition product features exist\.

**Rollback checkpoint and method:** Revert source checkpoint `debb768130b785ca546d1e42ce3330e8344cb2e9` or remove only its five Phase 0 paths, preserving unrelated work\. No app deployment was made\.

**Plan synchronized; next permitted phase:** The Phase 0 acceptance record was pushed at source commit `5e78d0ab27b584668314f385a9893f9f80c5f9d2` and saved to the same delivered document identity as version 6; A018 records the successful synchronization and matching contents\. The closing documentation includes that receipt\. P1.1 is the next eligible packet after authorization to continue; Phase 1 has not started\.

Current handoff: **Phase 0 passed\.** P0.1 and P0.2 are complete, and P0.3 recorded the formal close; Phase 1–9 product work has not started\. The captured source is `a8d551a9340d6ac6ae80527055e534fd0a1df681` and the integration checkpoint is `debb768130b785ca546d1e42ce3330e8344cb2e9`\. P1.1 is next eligible after authorization, but the current authorization remains limited to Phase 0\.

### MVP close record — PARTIAL PASS (MVP scope)

**Phase:** Phases 1–3 plus a melody grid and the Phase 9 cue/practice seam, as authorized in A019.

**Deliverable demonstrated:** Create opens a composition from the current Play setup, builds a progression from collected chords, edits a scale-degree melody, plays and loops it in the project's tuning, saves/opens project JSON and whole-app sessions, and exports versioned practice targets with the layout's keys (A026). The Phase 3 deliverable was demonstrated in a real browser; the saved fixture is the eight-bar meantone project built in tests/composition-project.mjs.

**Work packets and integration:** One implementer (Claude Sonnet 5.5), sequential: project/context, audio/transport, cues/input, UI, app wiring, documentation. No parallel packets. Not committed.

**Tests and measurements actually run:** A020, A025, A026. No performance budget (4 tracks, 128 bars, 4,096 events) was measured.

**Manual / acoustic / DAW / hardware observations:** None beyond headless Chrome DOM and screenshot checks.

**Astra final sweep:** Not performed (model unavailable); replaced by self-review, a mutation check and the evidence above. This is a deviation from the plan, not an acceptance.

**Unverified items and their dependent features:** Listening for stuck notes or clicks; browser loop playback; Edge, Safari/iPhone, macOS; keyboard and screen-reader operation of the grid; narrow-viewport layout beyond one CSS breakpoint; physical HexBoard and DAW; Worker/account storage (not implemented); editor and voice performance budgets. Phase 4 recording, 5 arrangement/mixing, 6 conversion, 7 persistence/accounts and 8 export are not started.

**Gate: PARTIAL PASS for the MVP scope.** The phases above are not formally accepted; the missing sweep and the unverified items must be closed before any release claim.

**Rollback:** Everything is uncommitted. Remove the new dist/composition-*.mjs and tests/composition-*.mjs, and revert dist/app.mjs, dist/audio.mjs, dist/hexboard-player.mjs, dist/style.css, the three harness edits in tests/, and the docs; saved project files stay valid because they use their own format.

**Next permitted step:** A formal review of this MVP, then Phase 4 recording on the onInput seam. The rhythm game or learning mode should consume toPracticeTargets and onInput.

## 10\. Implementation kickoff brief

> Implement the attached Temperament App Music Composition Suite plan in the existing app. Astra owns planning, orchestration, architectural decisions, and the final sweep of every phase. Delegate product code, integration, tests, repairs, and documentation to GPT-6 Luna with reasoning effort max; do not use Terra or Sol and do not silently substitute another model. Begin at Phase 0, inspect the current repository guidance and source, and reuse current evidence when its inputs are unchanged. Give Luna narrow work packets with explicit files, contracts, expected tests, and a demo. Use one implementer by default; parallelize only independent files behind stable contracts. Do not start the next dependent phase until its predecessor’s deliverable and acceptance gate pass. Log every material action, failure, decision, gate, and deployment in this same plan document, keeping its delivered copy synchronized. Preserve the existing math, chord-v2 engine, shared audio owner, session compatibility, and actual temperament period. Coordinate shared input/clock/board seams with the HexBoard integration plan. Continue through passed gates without repeatedly asking for permission; report genuine blockers and unavailable observations accurately. Deliver each phase as a concrete, testable increment.

## 11\. Evidence and references

The product requirements, phase boundaries, benchmark proposals, and conversion policies above are design proposals\. Repository observations and external API facts are identified separately\. Primary code and standards are the relevant evidence for this software plan; no empirical music\-perception claim requires a literature review here\.

- **&#91;R1&#93; Current Temperament Lab source**, commit `a8d551a9340d6ac6ae80527055e534fd0a1df681`, inspected 24 September 2026 UTC\. `AGENTS.md`; `docs/PROJECT_STATE.md`; `docs/DECISIONS.md`; `dist/app.mjs`; `dist/material-ui.mjs`; `dist/audio.mjs`; `dist/pitch.mjs`; `dist/engine.mjs`; `dist/hexboard*.mjs`; chord\-v2 ownership documented in project state; `server/index.mjs`; `db/schema.ts`; `scripts/build.mjs`; `scripts/test.mjs`; and the existing audio/player/workflow test entry points\. Baseline commands and outcomes are recorded in A008\. Current app: [Temperament Lab](https://nick-vuci-temperament-lab.nickvuci.chatgpt.site)\.
- **&#91;R2&#93; Temperament Lab × physical HexBoard: integration and rhythm practice plan**, 23 September 2026, file `Temperament_Lab_HexBoard_Rhythm_Integration_Plan.md`, read in full\. Source for coordination requirements, proposed logical input/clock/cue seams, and the outstanding firmware/device verification gate\. Its assumptions about firmware are not independent proof of protocol support\.
- **&#91;R3&#93; Temperament App Chord Engine Implementation Plan**, version 1\.0, 17 September 2026, file `Temperament_App_Chord_Engine_Implementation_Plan.docx`, read in full\. Background for the identity/projection/occurrence/voicing/placement separation\. Current source takes precedence over its outdated rollout and model assignments\.
- **&#91;R4&#93; W3C, **[**Web Audio API — Recommendation, 17 June 2021**](https://www.w3.org/TR/2021/REC-webaudio-20210617/)\. Primary reference for audio\-time scheduling and offline rendering\. The moving `/TR/webaudio/` URL returned a newer working draft during research; this plan cites the dated Recommendation and requires checking actual browser behavior\.
- **&#91;R5&#93; W3C, **[**Web MIDI API**](https://www.w3.org/TR/webmidi/), inspected 24 September 2026\. Primary reference for input event timestamps and timestamped output/queue clearing\. This specification is not evidence that every target browser exposes the API or that a physical LED has zero latency\.
- **&#91;R6&#93; MIDI Association, **[**MIDI Polyphonic Expression specification adopted**](https://midi.org/midi-polyphonic-expression-mpe-specification-adopted), inspected 24 September 2026\. Explains channel\-wide pitch\-bend behavior and MPE’s use of separate channels for individual notes\. It is an overview, not the complete byte/file\-format specification; Phase 8 must obtain the applicable official specification before freezing export behavior\.
