# Chord Shape Discovery — implementation handoff

> **Status, 2026-10-12: Phase 1 completed from this checkpoint; nothing here remains to resume.**
> Current behavior is documented in `docs/PROJECT_STATE.md` (Chord shapes (Play)) and `docs/DECISIONS.md`
> (D-050). The gaps listed below were closed, `tests/shape-explorer-ui.mjs` exists, and the full suite,
> production build and headless-Edge QA passed. This file is task history only and can be deleted.

**Paused at the user's request on 2026-10-12 to conserve usage.**

This is a task handoff, not product documentation or a completion claim. The core
engine, persistence, jobs and retuning guard are implemented with targeted tests.
The UI is integrated but has not completed its own interaction tests or browser
verification. The complete test suite and production build have not been run.
Everything remains uncommitted.

## Workspace and instructions

- Work in `C:\Users\nvuci\OneDrive\Code\TemperamentExplorer\TemperamentExplorer`.
  The chat initially opened in HexBoard, but this feature belongs entirely to
  TemperamentExplorer. No HexBoard firmware changes are required.
- Read this repository's `AGENTS.md`, relevant `docs/PROJECT_STATE.md`, and
  `docs/DECISIONS.md`. Top-level `dist/` files are **authored source**. Never clean
  or regenerate them as disposable build output. `site/` is generated output.
- The original detailed request is attached at
  `C:\Users\nvuci\.codex\attachments\de184d95-6877-4022-bea9-4018dfaab2f5\Pasted text.txt`.
  The user subsequently approved the narrower Phase 1 plan in chat.
- Git needs a per-command trust override in this sandbox:
  `git -c safe.directory=C:/Users/nvuci/OneDrive/Code/TemperamentExplorer/TemperamentExplorer ...`.
  No global Git configuration was changed.
- Use `npm.cmd` in PowerShell: `npm.ps1` is blocked by execution policy.
  The `python` launcher also failed in this environment; Node works.

### Pre-existing user edits — preserve these

These seven files were already modified before implementation began:

```text
dist/harmonic-catalogue-ui.mjs
dist/harmonic-chord-space.mjs
dist/harmonic-dyad-graph.mjs
tests/harmonic-catalogue-ui.mjs
tests/harmonic-chord-space.mjs
tests/harmonic-dyad-graph.mjs
tests/harmonic-focus.mjs
```

They contain mapping/cache/classification fixes and associated tests. Do not
revert or overwrite them. This task additionally adds a `shapeTargets()` getter
to `harmonic-catalogue-ui.mjs`; its diff therefore contains both kinds of work.

## Agreed scope and mathematical contract

The first release includes forward shape discovery, reverse lookup, a visual
catalogue inside Play's existing Chord → places panel, placement navigation,
geometric ranking, saved shapes, and an atomic retuning guard.

User decisions:

- Retain **2–8 source tones**. Source tones that map to identical full coordinates
  share one physical key, with all source identities retained.
- Search **all voicings within declared bounds**, not only the existing
  original/compact/open examples. Distinct source coordinate groups must retain
  distinct sounding coordinates; do not silently collapse an octave doubling.
- Use translation-only physical IDs. Rotations/reflections are distinct exact
  shapes. Existing harmonic shape IDs are a different concept.
- Retunes that would rearrange the selected scale or key assignments must be
  rejected atomically. Normal retunes update cents without changing structure.
- Human finger assignments, ergonomic ratings, weighted target collections,
  layout optimization and cross-temperament comparison are **later phases**.

Important implementation invariants:

```text
axial cell: q = (x - y) / 2, r = y

key.m - rootKey.m = sourceMember.m - sourceRoot.m + lift * reference.m
```

`lift` must be an exact integer verified in both coordinates. The reference is
the existing mapped octave where available, otherwise the existing mapped
reference interval. Never replace a mapped octave with `[1,0]` in divided-period
or generator-bearing-octave mappings. Check scale membership on the resulting
voicing, not merely on the original source voicing.

Default bounds: span 6 neighbouring-key spacings (0 means unrestricted physical
span), all available board registers, 250,000 search nodes, 20,000 placements.
Node budgets may rise to 1,000,000. Cards paginate in groups of 24.

Geometry score is `100 / (1 + span + meanPairDistance)`, explicitly a geometric
compactness heuristic, not a human biomechanics model. Partial source/placement
searches must stay visibly partial; no-result does not prove absence or ET.

The current app deliberately removed ranked Smart Layout (D-036), the second
chord catalogue (D-039), and a board-wide independent chord search (D-041).
This work extends the single harmony source and existing Play panel. Do not
revive those removed systems to finish Phase 1.

## Implemented and targeted-tested

### Geometry and placement engine

- **`dist/geometric-shapes.mjs`**: axial canonicalization, translation IDs,
  physical distances, metrics/score, canonical key ordering, structural board key.
- **`dist/hexboard-chords.mjs`**: shared board placement index and cooperative
  assignment iterator, retaining the `chordPlacements()` compatibility API.
- **`dist/chord-shapes.mjs`**: `searchChordShapes`, generator/async forms,
  `identifySelectedShape`, constraints validation, exact reference-lift witnesses,
  source collision groups, source-scale diagnostics, deduplication and limits.
  Associations retain source/member/cell links, root, lifts, intended JI inversion
  roles, and separately derived sounding bass information.
- **Tests:** `tests/geometric-shapes.mjs`, `tests/chord-shapes.mjs`.
  Includes an independent brute-force oracle on small boards, translation and
  orientation checks, forward/reverse round trips, aliases, collisions, 5-limit
  and higher-prime examples, non-octave/divided references, mixed-generator octave
  lifts, constraints, cancellation and async parity.

A probe of major and minor triads on a meantone board found 215 geometric shapes
and 10,826 physical placements within the default limits. This is a development
probe, not a universal performance guarantee.

### Source universe and saved shapes

- **`dist/shape-targets.mjs`**: async `buildShapeTargets`, using existing exact JI
  enumeration before collision removal, curated identities, and explicit targets.
  Supports size/form/family filters, source completeness and labelled explicit
  exceptions. Source metadata is structural, not tuned-error data.
- **`dist/shape-preset-data.mjs`**: validates a saved shape against its source,
  mapping, board and exact member-to-cell/lift certificate.
  `shapePresetFromPlacement(name,{state,config,shape,placement,association,target})`
  produces a record for the store. `shapePresetForState` revalidates it.
- **`dist/preset-store.mjs`**: adds kind `shape`, up to 512 saved shapes, optional
  backup `shapes`, old-backup compatibility, revisions and existing storage errors.
- **Tests:** `tests/shape-targets.mjs`, `tests/shape-presets.mjs`.
  Existing preset-store and layout-presets suites also passed.

### Jobs and retuning

- **`dist/shape-jobs.mjs`**: independent shape job controller/dispatcher, source
  preparation, search, cache, cancellation, fresh pitches/bass data after retunes.
  Directory family filters and incomplete-directory status propagate into results.
- **`dist/harmonic-catalogue-jobs.mjs`**: extracts reusable `createSearchJobs`,
  preserving the existing catalogue wrapper.
- **`dist/chord-v2-worker.mjs`**: routes shape and catalogue jobs.
- **`tests/shape-jobs.mjs`**: real Worker/fallback parity, reverse lookup,
  cancellation, stale replies, worker failures, cache/retune and partial results.
  Existing harmonic-catalogue-jobs suite passed.
- **`dist/retuning-guard.mjs`**, tuning-related **`dist/app.mjs`** changes:
  stage candidates and JI explorer/assignment edits before committing. Compare
  Discover and independent Play scale coordinates, axes, layout fallback validity,
  key coordinates/degrees/enabled/conflict state. Reject structural changes without
  leaking drafts or modifying selection/configuration.
- **`tests/retuning-guard.mjs`** executes both pure preflight and actual app handlers.
  `hexWorkspace.retuningSnapshot()` returns a clone of raw configuration without
  calling mutating `config()` or `serialize()`.

## Implemented but incomplete / not fully verified

### UI integration

**`dist/shape-explorer-ui.mjs`** currently provides target entry/listing, directory
target mode, constraints, search/cancel, reverse selection search, cards, placement
cycling, reading selection, highlights, audition, collection handoff, save/remove/
Find here, and session serialization.

Integration changes exist in:

- `dist/hexboard-ui.mjs`: Shapes/Selected voicing views within Chord → places,
  Identify shape button, event routing, separate shape highlight, session state,
  `shapeExplorer` accessor, and the raw retuning snapshot.
- `dist/harmonic-catalogue-ui.mjs`: `shapeTargets()` exposes active directory
  sizes/form/families and completeness.
- `dist/app.mjs`: passes the directory getter into the HexBoard workspace.
- `dist/hexboard-view.mjs`: cropped, noninteractive previews using the shared
  renderer; optional multiple chord-tone labels without replacing original labels.
- `dist/style.css`: controls, cards, details, saved list and narrow-screen layout.

Recent UI fixes were written but have not received their own completed test run:
mapping-aware saved-record matching; result invalidation when targets change;
resetting old-session UI defaults; validated constraints; throttled progress redraw;
retune-only presentation updates instead of cloning all results on every render;
and `shapeMaterialSelection` provenance for collection handoffs.

**`tests/shape-explorer-ui.mjs` did not exist at the pause checkpoint.** It was the
next work item. Use actual fallback jobs with a real board restricted to a few
enabled keys and a memory preset store to keep these tests fast and realistic.

### Known gaps to finish

1. **Reverse added doublings:** `identifySelectedShapeSteps` currently requires the
   selected exact key set to be generated by the forward engine. Two selected
   buttons with identical sounding coordinates therefore lose family readings.
   Implement the agreed distinction: preserve selected geometry, report added
   doubling/family readings separately, never call them exact forward placements.
   The UI already checks `result.selected?.addedDoublings`, but the engine does
   not currently set that flag. Add regression tests.
2. **Related shapes:** reverse engine accepts an optional catalogue for geometric
   and related-shape matches, but jobs/UI do not yet supply that catalogue. Add a
   usable route from a reverse reading to other shapes for that JI identity. A
   “Find other shapes for this reading” action can reuse the forward engine.
   Current UI geometry filters are all/same key count/exact selection, not
   rotation/reflection similarity. Optional transformation grouping must preserve IDs.
3. **Harmonic classification handoff:** ensure a reverse selection without indexed
   JI matches can reach the existing coordinate inspector/ET assessment, keeping
   bounded absence, ET and approximate readings clearly separate. Do not implement
   a second classification engine or infer ET from an empty result list.
4. **Preset import refresh:** app import currently refreshes temperament presets
   and layouts, not the shape explorer saved list. Add `shapeExplorer.init()` to
   the successful import refresh and check the import summary accounts for shapes.
5. **UI correctness:** test and fix target/association schema handling, multi-label
   overlays, selected-reading save/reload, placement cycling, collection provenance,
   rejected storage operations, old sessions, and retained selection after accepted
   retuning. Replace raw `matchKind` identifiers in visible text with clear labels.
6. **Completeness/responsiveness:** canonical JI source enumeration is still
   synchronous inside its existing bounded stage, with cancellation checkpoints
   before/after it. Confirm worst-case fallback responsiveness; make cooperative
   only if necessary, preserving the existing canonical enumerator.
7. **Production documentation:** no README/PROJECT_STATE/DECISIONS updates had
   landed at pause. Add concise current-state descriptions after remaining behavior
   is working. Document geometry ownership, exact reference lifts, limits,
   persistence and retuning rejection. Keep this handoff separate from product docs.

## Verification already observed

The following suites passed during this implementation (some before the latest
UI edits; do not interpret this as a final full regression run):

```text
geometric-shapes       chord-shapes          shape-targets
shape-presets          shape-jobs            retuning-guard
hexboard-chords        chord-v2-realization  harmonic-catalogue-jobs
preset-store           layout-presets        tuning-methods
default-scale          hexboard              scale-milestones
play-chords            hexboard-parity       harmonic-play-integration
```

Before implementation, chord-v2-projection and harmonic-shape-realization also
passed. The board parity check compared 1,463 keys across 11 layouts successfully.
`node --check dist/shape-explorer-ui.mjs` passed before its last incremental edits.
Latest `git diff --check` passed, with LF→CRLF warnings only.

**Not run:** full `npm.cmd test`, production `npm.cmd run build`, completed UI
controller tests, browser interaction/responsive QA. No final completion claim.

### Browser/build environment

- Vite's default config bundling failed with an esbuild parent-directory access
  error in the sandbox. This worked:
  `npm.cmd run dev -- --host 127.0.0.1 --configLoader runner`.
- That Vite server was stopped when writing this handoff; restart it to resume QA.
- Browser skill was read and its runtime initialized. `getForUrl` returned
  “No browser is available”; documented discovery returned `[]`. Therefore no
  actual browser interactions or screenshots were verified.
- Installed Edge exists at
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, but no headless
  fallback was launched and no Playwright dependency was installed. Follow the
  available Browser skill/tool requirements when resuming.
- If production build encounters the same filesystem restriction, request the
  necessary sandbox escalation and retry; do not change the build architecture
  just to work around the environment.

## Recommended resume order

1. Read this handoff and repository instructions; inspect `git status` and diffs.
   Preserve all pre-existing user changes and all current uncommitted feature work.
2. Add/run `tests/shape-explorer-ui.mjs`; fix integration failures first. Verify the
   material selection and saving paths against actual validated records.
3. Finish reverse doubling semantics and the related-shape/inspector handoffs.
   Add their correctness tests and preset-import refresh.
4. Recheck target limits, partial-result labels, worker/fallback cancellation and
   accepted/rejected retuning behavior in the integrated UI.
5. Complete browser QA when a browser is available, including small screens,
   retained original key labels, selecting/hearing/cycling/saving shapes, source
   collisions, Shift sustain, and existing Note → chords/practice behavior.
6. Update README and current-state/decision documentation. Do not document task
   history there; this file is the task history/handoff.
7. Run targeted suites, then `npm.cmd test`, `npm.cmd run build`, and
   `git -c safe.directory=C:/Users/nvuci/OneDrive/Code/TemperamentExplorer/TemperamentExplorer diff --check`.
   Review the final diff and report actual test results and any remaining limits.

There is no commit, deployment, active goal, or completed release to resume from;
the working tree itself contains the implementation checkpoint.
