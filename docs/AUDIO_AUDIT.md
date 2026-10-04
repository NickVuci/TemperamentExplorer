# Audio audit — 2026-10-04

## Final correction and rendered verification

The final engine replaces cancellation-based release with an independent gain
gate for every voice. Its 60 ms raised-cosine release reaches exact zero before
oscillator shutdown, without rewriting any attack or decay automation. A future
release may be overridden by Stop, and future sequence notes cancel silently.
New gain nodes initialise to zero and held notes start with a 5 ms scheduling
lead. All voices share soft output protection: linear below 0.6, bounded below
0.95 at excessive summed levels. Pitch and temperament calculations are untouched.

`web-audio-engine` 0.13.4 rendered the actual engine at 48 kHz (128-frame quanta).
This is an independent software implementation, not native Safari/Chrome.

| Scenario | Version 240 peak | Corrected peak | Final tail |
| --- | ---: | ---: | ---: |
| 64-note unison chord | 1.057988 | 0.902367 | 0 |
| 100 sustained unison voices | 3.325154 | 0.950000 | 0 |
| Interrupted single-note decay | 0.131720 | 0.131720 | 0 |
| Rapid dragging | 0.054541 | 0.106368 | 0 |
| Short tap followed by Stop | 0.032777 | 0.031236 | 0 |
| Normal held-note release | 0.033252 | 0.033252 | 0 |

Rapid dragging has greater overlap with the longer smooth release; it remains
well below clipping. Three waveforms (sine, triangle, sawtooth) at 15, 55, 440 and
16000 Hz passed finite-sample, bounded-peak and digital-silence checks. Stop after
a short tap leaves no delayed audible gate. The final step from the last nonzero sample into silence stays below 0.00001
in every scenario. Native and compatibility API fixtures
verify the original envelope is never changed on release.

Reproduction: install `web-audio-engine@0.13.4` in a temporary directory, then
run `node scripts/audio-render-audit.mjs <absolute-package-path>/lib/index.js`.
An optional second argument supplies the baseline audio module for comparisons.
No renderer dependency is included in the production app.

The output clipping and cancellation defects have been addressed. Device-level
audio output remains unmeasured; the tests do not establish that every possible
iOS/hardware glitch is eliminated. The following sections retain the initial
audit findings as historical evidence.

The broader suite passed 72 of 73 suites. The unchanged
`harmonic-workspace-render.mjs` fixture fails because its VM context lacks
`parsePrimeFilterInput`; this is unrelated to the audio graph. Audio and PCM
checks pass.

## Initial audit

Audited version 239 (source 14981c6f985f280e4822b939b5b7a4385021b4d9).

## Confirmed discontinuity and correction

The fallback in `dist/audio.mjs:releaseVoice` cancelled the future endpoint of an
active ramp, then set the computed instantaneous gain. Removing that endpoint
also removes the ramp leading up to it. A fading note consequently reverted to
its previous peak before the new gain event. This is not fixed merely by adding
a longer release.

A scheduled-event evaluator reproduces this for a one-note chord interrupted at
5.3 seconds: the preceding sample's gain changes from 0.0209762565 to 0.14.
The fix reconstructs the truncated linear or exponential ramp before anchoring
the release. Tests cover interruption during attack, decay, and the final fade.
These are numerical automation tests, not browser-rendered PCM recordings.

Specification: https://www.w3.org/TR/webaudio-1.0/#dom-audioparam-cancelscheduledvalues

## Other findings

- All app sound originates in one shared engine. Matrix/chord auditions, scales,
  collected materials, HexBoard and diamond playback use this engine. No second
  oscillator engine or ScriptProcessor path was found.
- Timed notes now reach exactly zero before oscillator stop. Held-note release
  reaches zero five milliseconds before stop. Cleanup happens in `onended`.
- Playback uses band-limited browser oscillators (triangle, sine or sawtooth),
  with attack envelopes. No sample file loop boundaries are involved.
- `ready()` unnecessarily called `resume()` for every held note even while the
  context was running. It now resumes only when needed. There is no demonstrated
  causal link between redundant resume calls and the reported clicks.
- No master headroom management or limiter exists. Chord gain scales as
  0.14/sqrt(N) for triangle/sine, so the worst-case summed peak is 0.14*sqrt(N):
  64 identical simultaneous notes reach 1.12. Held notes use 0.035 each;
  29 phase-aligned held voices can exceed 1. These are deterministic worst-case
  bounds, not a measurement of the user's normal chords. Sustained voices and
  release tails can accumulate. Clipping remains a separate unresolved risk.
- UI reset releases held notes; audio Stop skips voices already releasing.
  Consequently a previously scheduled short-tap gate can finish after Stop.
  Its envelope stays continuous, but stop latency can approach 100 ms.
- Pointer transitions release the old voice and start the new voice with
  independent envelopes. They do not abruptly change oscillator frequency.
- Chord recognition runs on the main thread via requestAnimationFrame; synthesis
  uses native Web Audio nodes. Device/browser underruns remain possible but were
  not measured in this environment.

## Validation and limits

`node tests/audio.mjs` exercises playback scheduling, envelope continuity,
resume/cancellation races, invalid frequencies, node cleanup, held-note release,
and actual pointer-to-layout-to-audio integration (octave, divided-octave and
tritave periods, dragging, wrapping and Shift sustain).

The earlier mock tests recorded API calls without simulating cancellation of
ramp endpoints; they could pass despite discontinuous gain automation. The new
regression evaluates the resulting automation timeline.

No recording from the user's device was available. No local browser audio
renderer was installed. The fallback defect is reproduced and corrected, but
it is not established as the cause of the user's audible click. The native
cancelAndHoldAtTime path, hardware output and iOS interruption behavior still
need device-level verification if the symptom remains. Check whether a simple
single note clicks on automatic end, whether only interrupted notes click,
and whether clicks increase with sustain/polyphony; these distinguish the
remaining hypotheses without changing the temperament calculations.
