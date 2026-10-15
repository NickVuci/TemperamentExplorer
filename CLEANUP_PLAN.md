# Temperament Lab cleanup plan

Baseline: `main` at `3fba599` (2026-10-12). The HexBoard firmware is out of scope.

**Status (2026-10-12):** 16 of the 20 items are done and 4 have not been started.
All of the work is on the local branch `cleanup`, in 31 commits on top of `main`,
with one or more commits per item. Nothing has been pushed.

- `npm test` passes 116 of 116 suites in about 15 s. At baseline it took 100 s, run
  one suite at a time.
- `npm run lint`, `npm run format:check` and `npm run build` are clean.
- The built site loads in headless Edge with no errors, and both workers start.

## How to read this

- **Cost:** S = under 2 hours · M = half a day to 2 days · L = 3–5 days ·
  XL = 1–2 weeks, done in steps.
- **Benefit:** High / Medium / Low, for whoever maintains the code next, whether a
  person or an agent.
- **Priority:** P1 = do now · P2 = schedule it · P3 = do it when convenient, or skip it.
- Items are ranked from smallest and most impactful to hardest and least
  impactful. Priority is a separate judgment.

## At a glance

| # | Change | Cost | Benefit | Priority | Status |
|---|---|---|---|---|---|
| 1 | Delete the retired Worker/D1 backend | S | High | P1 | Done |
| 2 | Run test suites in parallel | S | High | P1 | Done |
| 3 | Format and lint the code | S | High | P1 | Done |
| 4 | Fix contradictions in `PROJECT_STATE.md` | S | Medium | P1 | Done |
| 5 | Delete task-history docs; move data files out of `docs/` | S | Medium | P1 | Done |
| 6 | Remove unused exports and the dead `discoverChords` path | S | Medium | P2 | Done |
| 7 | Stop deploying ~100 unbundled modules | S | Medium | P2 | Done |
| 8 | Add CI | S | Medium | P2 | Done; has not run yet |
| 9 | Rename `dist/` (authored source) to `src/` | M | High | P2 | Done |
| 10 | Slim `PROJECT_STATE.md`, `DECISIONS.md` and the plan docs | M | Medium | P2 | **Not started** |
| 11 | Retire APIs only tests use | M | Medium | P2 | Done |
| 12 | Replace source-text tests with behavior tests | L | High | P2 | Done |
| 13 | Speed up the slowest suites | M | Low–Med | P3 | Done |
| 14 | Consolidate duplicated small helpers | S–M | Low | P3 | Done |
| 15 | Remove dead CSS selectors | S–M | Low | P3 | **Not started** |
| 16 | Import from owning modules; drop re-export shims | M | Low | P3 | Done |
| 17 | Decompose `app.mjs` | XL | High | P2 | Done |
| 18 | Group modules into folders; drop `-v2` suffixes | L | Low–Med | P3 | Done (with #9) |
| 19 | Consolidate the stylesheet | L | Low–Med | P3 | **Not started** |
| 20 | Split the largest UI modules | L | Low–Med | P3 | **Not started** |

---

## What has been done

| # | Result |
|---|---|
| 1 | Removed `server/`, `db/`, `drizzle/`, `drizzle.config.ts` and the two drizzle dependency trees. `.openai/hosting.json` is kept, as you asked. `vite` is pinned to a patched version, and `npm audit` is clean. |
| 2 | `scripts/test.mjs` runs suites in a pool. `TEST_CONCURRENCY` caps the pool size. |
| 3 | Prettier and ESLint (undefined and unused names) cover every file, including the seven files that tests used to read as text. Both formatting commits are listed in `.git-blame-ignore-revs`. Formatting changed nothing that renders: every element's on-screen box matched before and after, in all three sections at desktop and phone widths. |
| 4 | Fixed the false "not implemented" claim and the leftover A/B and backend statements in `PROJECT_STATE.md`. |
| 5 | Deleted about 360 KB of finished-task docs and screenshots. The chord corpus moved to `tests/fixtures/`. |
| 6 | Removed `discoverChords`, its helpers, three unused exports, and the slow suite that tested only that code. |
| 7 | `site/` now holds only the 10 files that run, about 1.1 MB instead of 2.3 MB. |
| 8 | `.github/workflows/ci.yml` runs `npm ci`, lint, the format check, the tests and the build on Node 22. It has not run yet because nothing has been pushed. |
| 9 + 18 | Source moved from `dist/` to `src/`, grouped into `core/`, `chords/`, `harmonic/`, `shapes/`, `diamond/`, `hexboard/`, `composition/`, `presets/`, `ui/` and `app/`. The `-v2` names are gone, and workers start through `src/workers.mjs`. |
| 11 | Superseded test-only APIs are deleted, and their tests now run against the production functions. Deliberate test oracles moved to `tests/support/`. Module internals are no longer exported. |
| 12 | No suite reads `app.mjs`, `index.html`, `style.css` or a UI module as text any more. `tests/support/dom.mjs` boots the real app in jsdom with a silent Web Audio stand-in, and provides helpers for clicks, changes, keys, pointer events, opening sessions, downloads and resizes. It also parses `index.html` and `style.css`. The style checks pass on both the old and the reformatted stylesheet. Seven app features that no test reached before now have coverage: the custom mapping editor, Hear interval, the `.scl` export, Play scale, the scale actions, matrix paging and inspection, and the HexBoard connection panel. |
| 13 | The three slowest suites are faster. A full run takes about 15 s, up from about 6 s at the end of #13, because 18 suites now boot the app. |
| 14 | One `gcd`, plus shared number formatters (`fixed`, `signedFixed`) and the register-sign helper in `ui/ui.mjs`. |
| 16 | Every name is imported from the module that owns it, and the re-export shims are gone. |
| 17 | See below. |

**#17, `app.mjs`:** the file went from 2,152 lines (formatted) to 1,252. Its parts
now live in `src/app/`:

| Module | Owns |
|---|---|
| `ji-settings.mjs` | Odd limit, prime filter and tolerance, read from the shared controls |
| `matrix-view.mjs` | Interval matrix rendering, plus the matrix pane: paging, the inspector, chord picks, labels and span |
| `diamond-details.mjs` | The diamond's interval and chord readout |
| `tuning-panel.mjs` | Header preset chooser, tuning method, JI target explorer and custom mapping |
| `scale-pane.mjs` | Scale and mode menus, milestones, the scale view and the scale's actions |
| `focus-sync.mjs` | The focused chord shared by the directory, diamond, matrix and Play |
| `session.mjs` | Writing session files, validating them, and reading older ones |
| `hexboard-connection.mjs` | The physical HexBoard: device, lights, status, latency probe and brightness |

- The controller holds one `state` instead of a one-element `states` array.
- The 4,465-character click handler is gone. The click and change handlers are now
  short lists that pass events to the panes and workspaces.
- The extracted matrix and diamond renderers produce the same markup as the old
  functions in all 432 combinations of temperament, span, layout, labels, filter
  and page that I checked.

**Behavior changes made along the way:**
- **Session loading checks more before it changes anything.** A file with an
  invalid temperament now leaves the app untouched. Before, it restored five
  workspaces and then failed.
- **Unreachable code removed.** No control renders these anymore, so only the old
  sliced tests could reach them:
  - the change handler's `preset`, `g` and `p` field branches
  - `readTuning`'s `optimizePeriod` branch
  - the click handler's `data-target` branch

## What still needs to be done

| # | Change | Cost | Notes |
|---|---|---|---|
| 15 | Remove dead CSS selectors | S–M | See below |
| 10 | Slim the docs | M (about 1 day) | Can be done any time |
| 20 | Split the largest UI modules | L | One module at a time |
| 19 | Consolidate the stylesheet | L | Do after #15 |

My estimate for all four is 2–3 sessions of the length we have been working.
Optional follow-ups from the finished items are listed after the four items.

### 15. Remove dead CSS selectors (S–M, P3)

About 20 class selectors in `style.css` (170 KB, 8,625 lines after formatting)
match nothing in the JS or HTML: `faint`, `targettable`, `approximation-kind`,
`secondary-approximation`, `hex-chord-choice`, `workspace-tabs`,
`linked-ji-controls`, `diamond-controls`, `diamond-options`, `hex-export-only`,
`hex-manual-chords`, `harmony-heading`, `melody-controls`, `chord-strip`,
`note-grid-wrap`, `note-grid`, `composition-sound`, `live-note-label`,
`dyad-table` and `dyad-ambiguous`.

- Some class names are built from template strings, so confirm each one before
  deleting it.
- `tests/diamond-controls.mjs` still asserts on the dead `.diamond-controls` rule.
  Drop that check in the same change.
- Re-pin the cascade hash in `tests/style-contract.mjs`. Changing the hash is the
  intended way to accept a new cascade.

### 10. Slim the docs (M, P2)

- **`docs/PROJECT_STATE.md`** is 88 KB and 1,191 lines, and agents are told to
  read it first. Either split it per subsystem with a one-page index, or cut it to
  the current state only.
- **`docs/DECISIONS.md`** is 71 KB. Collapse its 4 superseded decisions to one-line
  pointers.
- **`docs/COMPOSITION_SUITE_PLAN.md`** is 96 KB and still refers to `dist/` paths
  and `app.mjs` functions that have since moved. The MVP is done, so reduce it to
  a short roadmap of phases 5–8.
- **`docs/HEXBOARD_WORKSPACE_PLAN.md`** lists outdated items that are already
  gone. Fold its remaining goal (moving Play into Compose) into that roadmap.
- **`AGENTS.md` model routing** (Luna/Terra/Sol/Astra): keep this section only if
  you still route work across those models.

### 20. Split the largest UI modules (L, P3)

#12 is done, so this item is no longer blocked. Split markup builders from event
handling, as `src/app/` now does:

| Module | Size |
|---|---|
| `composition/composition-ui.mjs` | 73 KB, 2,223 lines |
| `harmonic/harmonic-catalogue-ui.mjs` | 69 KB, 1,679 lines |
| `hexboard/hexboard-ui.mjs` | 68 KB, 1,538 lines |
| `shapes/shape-explorer-ui.mjs` | 51 KB, 1,196 lines |
| `composition/composition-view.mjs` | 45 KB, 669 lines |

### 19. Consolidate the stylesheet (L, P3, after #15)

- Group rules by component together with their media queries.
- Replace repeated hard-coded colors with the `:root` tokens.

For QA, compare every element's box in headless Edge before and after the change,
in each section at desktop and phone widths. That check took minutes for #3; see
the decisions below about adding it to the repo.

### Optional follow-ups from finished items

| Follow-up | Cost | Benefit |
|---|---|---|
| The workspace modules (`preset-ui`, `chord-ui`, `comma-ui`, `hexboard-ui`) still read the temperament through a one-element `getStates()` array, and `preset-ui` passes an index everywhere. Switching them to `getState()` touches 4 modules and 28 test files. | M | Low |
| `app.mjs` still holds the workspace wiring, `renderWorkspace`, placement of the shared controls, navigation, Reset, the keyboard handler and preset backup import/export. Moving navigation and control placement into `src/app/navigation.mjs` would be the next step. | M | Low–Med |
| The full test run grew from about 6 s to about 15 s because 18 suites boot the app. This is acceptable, but suites could share boots if it grows further. | S–M | Low |

## Issues and possible improvements that need a decision

All of these came up during the cleanup and were left alone because they change
product behavior or go beyond cleanup. The first four happen on `main` too.

1. **Older session files with an odd limit of "basis" cannot be opened.**
   - Sessions saved before version 5 can store `settings.limit: "basis"`, for
     example `tests/fixtures/magic19-session.json`. The odd-limit field is a number
     input, so it cannot hold "basis". Loading stops with "Odd limit must be an odd
     number from 3 through 97." after the temperament and workspaces have already
     been restored.
   - Fix: map "basis" to the temperament's basis limit in `src/app/session.mjs`,
     and validate the shared controls before anything is applied.
   - Cost S. I recommend fixing it.
2. **Work started on Play redraws Discover several seconds later.**
   - After a visit to Play, a background job finishes and replaces Discover's whole
     workspace. Under load, this took focus away from the Discover search field in
     tests. Two suites had to be ordered so that their Play visit comes last.
   - On a slow machine a user could lose the caret or an open control.
   - Fix: find the job (most likely the Play shapes search) and limit it to the
     partial refresh the directory already uses.
   - Cost S–M. I recommend investigating.
3. **The Discover directory after a Play visit.**
   - In the test page, and on `main` in headless Edge, the Triads/Tetrads/Pentads/
     Hexads groups disappeared after a visit to Play while the status still read
     "34 chords · complete".
   - In the final browser check (Play, then Compose, then back to Discover), the
     groups were present but filtered to Play's bass ("27 chords with Play scale
     degree 0 as the bass"). That filter comes from "Follow what I play".
   - Decide whether following Play's bass should carry over to Discover, then
     confirm the exact trigger of the missing groups. Cost S–M.
4. **A Play size the menu does not offer is saved as 0.**
   - It can only be reached by scripts, but such a session then fails to open with
     "Invalid HexBoard coordinates."
   - Fix: validate in the HexBoard workspace's change handler. Cost S, low priority.
5. **Make session loading fully transactional.** Session loading still applies the
   workspaces before a few later steps that can fail (see issue 1). Building the
   whole new app state before applying any of it would make every failure leave
   the app untouched. Cost M.
6. **Add the layout-geometry comparison to the repo.** Today it is a scratch script:
   it boots the page in headless Edge and compares every element's box between two
   versions. As `scripts/layout-diff.mjs` it would make #15, #19 and future CSS work
   cheap to check. It needs a local Edge or Chrome. Cost S.
7. **Decide what happens to this file.** `CLEANUP_PLAN.md` is untracked.
   `AGENTS.md` keeps engineering history out of the repository docs, so I suggest
   keeping it out of the repo, or deleting it once the branch is merged.

## Before merging `cleanup`

- **Push the branch so CI runs for the first time.** CI checks lint, formatting,
  the tests and the build.
- **Update `.git-blame-ignore-revs` if you squash or rebase.** It lists the two
  formatting commits, `96e90a3` and `19ee210`, by their branch hashes, which
  change on a squash or rebase.
- **Confirm the deployment.** `.openai/hosting.json` was kept. Check that the host
  serves `site/`, which is now just the app shell.
- **Close other open branches first.** Every file moved (`dist/` → `src/` folders)
  and seven large files were reformatted, so other open branches will conflict.
  Merge or rebase them before or right after this branch.

## Considered and not recommended

- **TypeScript conversion:** XL churn. If you want type checking, `// @ts-check`
  with JSDoc on the calculation modules gives most of the safety with no build
  step.
- **Adopting Vitest or Jest:** the plain Node suites work, and the parallel runner
  and jsdom harness cover what was missing.
- **Moving `builtin-layouts.mjs` (51 KB of data) to JSON:** it is bundled either
  way, so maintenance doesn't improve.
- **Removing legacy session migrations and tuning-name aliases:** the README
  documents them as intentional compatibility, and removing them would break old
  saved files.
