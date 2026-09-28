# Chord engine version 2 — released

Open Play → Scale chords. The new engine is now the sole catalogue engine; the preview switch and old engine have been removed. Existing browser preview preferences no longer affect it.

Enter a chord such as `4:5:6:7:9:11`, `1:5/4:3/2`, or compact reciprocal `1/6:5:4`. Reordered and proportional forms have the same exact identity; input order/spelling remain available. Repeated members do not count as distinct notes.

Four separate answers are shown:
- Mapping: whether every relative prime exponent is in the temperament basis.
- Tuning: maximum and RMS member errors relative to the lowest JI tone; worst-pair/RMS are also in details. Root-relative tolerance is not an all-dyads guarantee.
- Cardinality: unique JI members versus mapped period classes. Formal collisions are distinct from coincident pitches caused by a tuning.
- Scale: exact complete occurrences at roots in the selected HexBoard target scale and mode. Generator equality establishes membership, never cent tolerance.

For the supplied Magic[19] case, all six members map and are within10¢, but the generator span20 needs at least21 consecutive positions. Best partials contain five of six members. The explicitly tested21- and22-note scales have one and two complete occurrences respectively. Changing board layout or tuning tolerance cannot create missing exact members.

Complete roots lead to inversions, spacing, voice ordering, actual-period displacement, register/reach bounds and alternate physical fingerings. Harmonic spelling is the default spacing; Compact and Open remain available under the voicing options. Audio uses the selected keys' tuned pitches. No available fingering does not mean no scale occurrence. Collapsed members share a voice. Manual layout vectors, wrapping, flips, colours, period labels and HexBoard drag/sustain playback are unchanged.

Discovery is finite, not exhaustive: 219 canonical candidates (hard cap256), from curated chords, harmonic segments starting2–16 with up to8 tones, and reciprocals. Filters include cardinality, odd limit, form, root-relative error, generator span, scale occurrence, collisions and exact JI containment. Sort by accuracy, roots, span or ratio name. Tempered aliases share a translated period-class set but retain their distinct JI identity/cardinality/errors. Search is incremental and cancellable, with a worker where supported.

Partial matches list exact missing mapped coordinates. Approximate substitute suggestions are separate, with signed deviation from the missing mapped pitch and occupied degrees excluded. They are independent options, not certified replacement chords. JI subsets/supersets and tempered aliases search the same bounded catalogue, capped24 results per group.

Limits:2–8 input members,300characters, positive integer numerator/denominator≤1,000,000, scales≤256notes, at most24 retained partials (first6 shown),8 larger scales per diagnostic API (4inUI), inherited20,000physical-placement cap. No new dependency, service or telemetry.

Compatibility: existing version 2 settings load directly. Older catalogue sessions preserve their raw settings and spelling, and migrate supported chord input, tone bounds, spacing and reach. A saved root is recovered only when its root and recorded degree assignment uniquely match an exact occurrence in the restored scale; otherwise select a root again. Restoring waits for the temperament and layout state before resolving occurrences. Tolerance and odd limit remain linked to the app's shared JI settings. The session file format remains temperament-lab-v1.

Verification: full automated suites and production build; controller end-to-end tests;99-case old/new corpus with all differences explained. Performance measured on Node24/AMD EPYC managed container: default discovery median44ms; broad256-note search median194ms (worker/progress); exact256-note occurrence median0.45ms. These are not browser guarantees. No compatible supervised browser preview is available for this buildless Worker, so wide/narrow screenshots and real keyboard/screen-reader playback review remain manual acceptance checks. Native labeled controls and responsive styles are covered by source/component assertions.

UI follow-up: the main panel now contains a search bar, paired chord types, the selected chord's occurrences, and inversion/fingering controls. Search filters the list live without discarding the selected occurrence; ratio input also offers direct lookup outside current catalogue filters. Settings and diagnostics are collapsed at the bottom. There is no engine selector.

Retirement approval: Nick explicitly requested sole-engine adoption and removal after the v87/v88 preview checkpoints. The old JI catalogue parser/search/worker/renderer/controller are removed. Shared manual chord inspection and pairwise exploration, voicing, audio, material collection and HexBoard placement remain supported; these are features consumed alongside the exact JI engine, not a fallback catalogue.

Verification after retirement: 34/34 suites, including a frozen 99-case corpus and deferred legacy/current session restoration. Superseded implementation-specific legacy suites were removed; reciprocal label cases and shared voicing/placement checks now use the new identity/occurrence APIs. Rollback is a deployment of source checkpoint bafbe9386ccba2eb91ed116057456e63ed8d7c50 (v88), not a runtime engine switch. Keep a session backup when using an older release; it cannot interpret new-only selections.
