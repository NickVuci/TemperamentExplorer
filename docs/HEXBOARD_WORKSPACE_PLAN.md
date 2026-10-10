# One HexBoard workspace: plan and Play-tab audit

Goal: one interface where a temperament, its tuning, a HexBoard layout and a board-driven sequencer
work together: find chords, put them in the sequencer, play them on the board, play the board to find
new chords and scales, repeat. This plan covers the first part: tidy the Play tab into one consistent
HexBoard UI, move it into Compose, then remove the Play tab. Discover's temperament search and tuning
joining the same screen is later work.

## Decisions (2026-10-10)

1. Once a composition is open, it owns the layout. Layout edits in Compose are undoable composition
   edits; a new composition starts from the current setup.
2. The Discover scale (analysis) and the Play scale (the instrument scale the board and sequencer
   use) stay separate.
3. Old, deprecated and conflicting Play code is removed, after the audit below is reviewed.
4. Recording what is played into the sequencer is later work, not part of this plan.

## Target workspace (Play first, then Compose)

- Toolbar: Layout dropdown, Export for HexBoard, Advanced layout options drawer (scale filter, layout
  family, wrapping, anchor, colours, fill).
- Board, with an optional data box (key inspector and interval details).
- Now playing: the live harmony readout for held keys (screen or HexBoard).
- One Chords panel with two modes:
  - Chord → places: search or pick a directory chord (or one sent from Discover), see and light its
    fingerings, step through them, hear them.
  - Note → chords: a selected key or degree lists the directory chords with it as the bass (root
    position and inversions, D-038).
- Practice (fingering game).

## Phases

1. **One HexBoard component.** *Done 2026-10-10 (D-040):* `hexboard-view.mjs` (picture, renderer,
   device frame) draws both boards; Compose keys play through `hexboard-player.mjs`; Play's board is
   pinned by `tests/hexboard-parity.mjs` (11 layouts, 1,463 keys). Extract from `hexboard-ui.mjs`: board model (build, colours, outlines,
   highlight layers in one precedence: sounding > shown chord > scale highlight > layout), one SVG
   renderer with full and mini sizes (replacing `svg()` and `composition-board.mjs#boardMarkup`), one
   input path (`hexboard-player.mjs`), one device snapshot. Play moves onto it with no visible change.
   Tests: per-key parity with today's Play board (fill, stroke, label, classes) on several layouts
   including wrapped and divided-period ones; existing HexBoard suites; browser check.
2. **Tidy Play** into the panels above. Remove the items marked *Remove* in the audit; fold the
   overlapping chord tools into the Chords panel. Tests: rewritten Play suites, plus an equivalence check
   that the Chords panel finds what today's tools find in both modes.
3. **Instrument ownership.** The composition owns temperament, tuning, instrument scale and layout;
   layout and scale edits in Compose are undoable. Migrations for v7/v8 sessions and
   `temperament-lab-v1`/`-v2` compositions.
4. **Move the workspace into Compose,** replacing the miniature board. Chords from either mode can be
   added at the playhead or a chosen time; the Root lane picker becomes Note → chords started from the
   roll; Fingering practice moves into Compose's Practice panel.
5. **Remove the Play tab.** Tabs become Discover and Compose; sessions on the Play view open in Compose;
   remove Play-only routing; update PROJECT_STATE and DECISIONS.

## Audit: old, deprecated and conflicting Play-related code

**Status (2026-10-10): cleanup done (D-039).** The *Remove* items, the outdated text and the test rows
below are handled: the A paths and classic catalogue are deleted, every suite runs the one remaining
path, and the full suite passes. Two corrections to the audit: Find layout alternatives' search,
`layoutCandidates`, stays as the internal search of Fill note buttons; and the diamond's own A branch
(`selectedDiamondCoordinates`) went with the flag. The *Merge* items are Phase 2 work.

Facts established 2026-10-10, before the cleanup. `harmonicMode` in `app.mjs` is only ever set to `'b'`, so every A-path
branch is unreachable in the app. Every `dist/*.mjs` module is still statically imported, so dead
code is at branch and function level. Most HexBoard test suites build the workspace without
`getHarmonicMode`, which defaults to false, so **the tests still exercise the A path the app never
uses**.

### Remove (unreachable or superseded)

| Item | Where | Why |
| --- | --- | --- |
| A-path Play chord catalogue | `chord-catalog-ui.mjs` and the modules only it reaches: `chord-v2-ui.mjs`, `chord-discovery-view-v2.mjs`, `chord-realization-view-v2.mjs`, `chord-relationships-v2.mjs`, `chord-relationships-view-v2.mjs`, `chord-session-v2-adapter.mjs`; `hexboard-ui.mjs` `catalogue`, `syncHarmonicMode`, `refreshCatalogue`, `onCatalogueRefresh`. The worker file `chord-v2-worker.mjs` stays: the live catalogue jobs use it. | Only shown when `getHarmonicMode()` is false, which the app never does. The catalogue object is still created and restored on every session load (that is the only live use of `chord-session-v2-adapter.mjs`), but its state is never displayed. PROJECT_STATE's claim that the adapter "continues migrating compatible saved sessions" describes only this. |
| `harmonicMode` flag and its A branches | `app.mjs` (about 19 checks), `settings.harmonicMode` in sessions, `getHarmonicMode` option | Always `'b'`. Keep reading old session values; stop writing them. |
| Find layout alternatives | `hexboard-ui.mjs` `suggest`/`candidate` actions, `suggestionsMarkup`, `hexboard.mjs#layoutCandidates` | A coverage-ranked layout list; conflicts with D-036 (fixed built-in layouts replaced the ranked layout search). |
| Two-board session shape | `hexboard-ui.mjs#restore` accepts `configs` of length 1 or 2 but uses only the first | Leftover of the removed two-board comparison. Keep accepting length 2 on load; always write 1. |
| Unused CSS | `.strip`, `.key`, `.sequence` (old scale strip); styles of removed panels | Dead after the scale line and earlier removals. Needs the style-contract test updated (below). |

### Merge into the Chords panel (overlapping)

| Item | Where | Becomes |
| --- | --- | --- |
| Manual selection & pairwise search | `hexboard-ui.mjs` `finders`, `finderMarkup`, `chords-*` and `selectChord` controls, `discoverBoardChords` | Select keys on the board → Now playing / Chord → places. The whole-board search has result caps; the key-centred search does not. |
| Chords on key X | `key-harmonies-ui.mjs`, `hexboard-ui.mjs#harmoniesAt` | Note → chords mode. |
| Discover hand-off panel | `harmonic-play-ui.mjs` (`acceptHarmonicSelection`, Fit Play scale) | Chord → places mode. |
| Live chord readout | `hexboard-ui.mjs#updateLiveChord`/`renderPlayed`, `played-chord.mjs` | Now playing. |

### Keep (current, move into the shared component)

Layout chooser and saved/built-in layouts (`layout-chooser.mjs`, `layout-presets.mjs`,
`builtin-layouts.mjs`); advanced layout fields (base, offset, style, rotation, device rotation,
register, register alignment, period wrapping and placement, copy period step, palette, layer growth,
custom colours, period labels, outside keys); export; fill note buttons; put tonic on selected button;
inspector (data box); scale highlight from collected material; physical HexBoard sync and brightness;
fingering game.

### Outdated text and tests (conflicting with current behaviour)

| Item | Where |
| --- | --- |
| Footer help: "In B, select a harmony…", "Computer keyboard note playing is disabled", the A/B "classic view" note | `index.html` footer |
| A/B wording describing removed or unreachable paths | PROJECT_STATE lines that say A retains its Play catalogue/envelope, and "The classic catalogue presentation remains for the requested A/B comparison" (Current boundaries) |
| `harmonic-focus.mjs` expects the text "Otonal spelling", which the analysis no longer shows | failing before 2026-10-09 |
| `style-contract.mjs` pins a hash of the pre-refactor stylesheet, which no longer matches | failing before 2026-10-09 |
| Suites that run the A path by default (switch them to the B path) | `audio`, `board-cache`, `builtin-layouts`, `default-scale`, `diamond-workspace`, `generated-scales`, `hexboard*`, `key-harmonies`, `layout-presets`, `period-*`, `shared-ji`, `workflow-material` |
| Suites that import the A catalogue but also cover live modules (split, do not delete) | `chord-v2-compatibility` (identity, session adapter), `chord-v2-realization` (`chord-realization-v2.mjs`, `chord-analysis-v2.mjs`), `chord-v2-ui` (`chord-discovery-v2.mjs`, `chord-analysis-v2.mjs`), `chord-v2-workflow-ui` |

### Not Play-specific (out of scope)

`chord-ui.mjs`/`chords.mjs` (`chordWorkspace` in `app.mjs`) is Discover's live manual note inspector.
