# Temperament Lab agent policy

These instructions apply to the entire repository. They define how agents work;
`docs/PROJECT_STATE.md` describes the current application, and
`docs/DECISIONS.md` records important architectural and mathematical decisions.

## Start with persistent context

For a new session or substantial task:

1. Read this file.
2. Read the relevant parts of `docs/PROJECT_STATE.md`.
3. Read related entries in `docs/DECISIONS.md` when a documented decision is touched.
4. Inspect the smallest relevant code and tests.
5. Choose the cheapest reliable model and a narrow test strategy.

Use current tested behavior and code as the primary evidence. When they conflict
with a documented invariant or a current user requirement, investigate instead of
silently choosing one. Never revive an older implementation from conversation
history or planning documents without confirming it is still canonical.

## Scope and repository use

- Make the smallest coherent change that fully solves the request.
- Preserve existing behavior unless the request requires changing it.
- Extend canonical shared systems instead of creating parallel calculations or
  state owners.
- Start from known modules, documented ownership, symbols, and related tests.
  Expand the search only when dependencies or unexpected behavior require it.
- Record significant unrelated risks; fix them only when they block the task or
  threaten correctness.
- The top-level files in `dist/` are authored source. Do not delete or regenerate
  them as disposable build output. `npm run build` writes the static site to
  `site/`.

## Model routing and delegation

Do not spawn agents automatically. Delegate only when it materially improves
cost, speed, reliability, or context isolation, with narrow non-overlapping tasks.

- **Luna:** mechanical edits, CSS, moves, renames, boilerplate, repetitive tests,
  documentation updates, known-symbol searches, and explicit simple refactors.
- **Terra:** read-heavy repository exploration, dependency tracing, comparison,
  duplication review, and concise subsystem summaries.
- **Sol:** normal orchestration, nontrivial implementation, multi-file integration,
  algorithms, mathematical work, debugging, and final review.
- **Astra:** only for major architecture, unusually difficult theory, subtle
  cross-system bugs that resist normal work, or a new foundational algorithm.
  Do not use or spawn Astra merely because it is available.

Prefer low or moderate reasoning for deterministic work. Increase effort only for
real mathematical, numerical, architectural, equivalence, or state-synchronization
risk. A useful pattern for substantial work is Terra investigation, Sol decision,
Luna mechanical implementation, Sol integration/review, then staged tests.

## Mathematical correctness

Treat these as sensitive: mappings and comma kernels; HNF/SNF-style integer
lattice work; subgroup, basis and rank semantics; generator and period
calculation; all tuning methods; period optimization; EDO mappings; MOS/MV and
mode generation; interval and JI classification; incidental approximations;
consistency; chord identity/equivalence; otonal/utonal pairing; rank-2 and wrapped
coordinates; sounding pitch; temperament periods; and audio frequency.

Before changing these systems:

- identify the existing invariant and canonical owner;
- inspect direct consumers and relevant regression tests;
- add a practical regression case for a bug or new mathematical behavior;
- review numerical boundaries and non-octave/divided-period cases where relevant;
- have Sol review mechanically produced changes when the mathematics warrants it.

Credit savings never override mathematical correctness.

## Implementation and testing

For substantial work, use testable stages:

`investigate → establish invariant → implement → targeted test → integrate → broader test`

- Run the narrowest useful tests during iteration.
- Run broader regression tests after changes to shared math/state, multi-module
  refactors, coherent feature completion, or final acceptance.
- Do not run the complete suite after every small edit.
- Do not accept a visual result as proof when underlying calculations changed.
- Preserve the package manager, lockfile, build system, session formats, and
  hosting configuration unless the task requires a change.

Primary commands:

- `npm test` — all top-level `tests/*.mjs` suites.
- `node tests/<suite>.mjs` — targeted suite.
- `npm run build` — bundles and validates the browser entry and Worker.

## Existing systems and deprecation

Before replacing a subsystem, determine its behavior, consumers, state ownership,
tests, shared calculations, and rationale. When a system has been replaced, remove
safe-to-remove dead paths and tests, preserve only intentional compatibility code,
and update project state. Record the replacement in `docs/DECISIONS.md` when a
future agent could reasonably reintroduce the old design.

## Persistent documentation

Update `docs/PROJECT_STATE.md` only for material changes to architecture, canonical
ownership, shared state, mathematical invariants, major capabilities, migrations,
deprecations, or significant known issues. It is a current-state reference, not a
development diary.

Update `docs/DECISIONS.md` only when several plausible designs existed, a
non-obvious mathematical or architectural choice needs rationale, an old design was
replaced deliberately, or changing the decision would have broad consequences.

Do not create documentation churn for routine UI positioning, copy, simple bug
fixes, or ordinary refactors.

## Communication and completion

Keep investigation output concise. Prefer file names, symbols, targeted excerpts,
and conclusions over raw logs or whole-file dumps. An ordinary completion report
should state what changed, the important decision if any, tests and result,
remaining risk, and whether the task is complete.

A task is complete only when requested behavior works, affected behavior is
preserved, appropriate tests pass, obsolete paths introduced by the change are
handled, material documentation is current, and significant unresolved risks are
disclosed.
