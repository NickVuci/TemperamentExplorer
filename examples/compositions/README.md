# Sample compositions

Six original eight-bar pieces for the Compose piano roll and its Play mode. Each
`.composition.json` is a standalone `temperament-lab-composition-v1` file containing
melody, chords, tempo, meter, tuning, scale and a playable HexBoard layout.

## Open a song

1. Choose the app's **Compose** tab, then **Open composition…**. With a song already
   open, use its **Project → Open…** menu.
2. Select one of the JSON files below. Use **Fit** to see the whole piece.
3. Play the song in Compose, or switch to **Play** within the composition workspace
   for **Timed** or **Wait**. Choose Melody, Chords or Both; every note has a key for
   exact-pitch and degree matching.

These files use the composition opener. The header's **Open session** is for
whole-app session files. When the app offers **Load the composition's setup into
the app**, use it to make the chord directory match the song before adding new
harmonies. Existing notes already use the song's saved setup.

The header **Audio** menu controls the sounding tonic and instrument. For a
consistent comparison, set the tonic to **196 Hz** and sound to **Triangle**.

## Pieces

All tempos are quarter notes per minute. Scale sizes count notes per temperament
period, which is an octave except in Pajara.

| File | Tuning and scale | Layout | Meter / tempo | Useful checks |
| --- | --- | --- | --- | --- |
| [Clockwork](01-clockwork-12edo.composition.json) | 12 EDO, 12 notes | Recommended, wrapped | 4/4, 104 | Straight eighths, 2:1 swing, triplets, quintuplets, rests, syncopation, long holds and velocity differences |
| [Lantern Waltz — Bosanquet](02-lantern-waltz-meantone-bosanquet.composition.json) | Meantone, 7-note major scale | Bosanquet, unwrapped | 3/4, 92 | Chord inversions, root/bass labels, melody over held chords |
| [Lantern Waltz — Wicki-Hayden](03-lantern-waltz-meantone-wicki-hayden.composition.json) | Same meantone tuning and notes | Wicki-Hayden, unwrapped | 3/4, 92 | Compare suggested buttons and chord shapes with the Bosanquet version |
| [Seven Quills](04-seven-quills-porcupine.composition.json) | Porcupine (5-limit), 15 notes | Recommended, wrapped | 7/8 grouped 2+2+3, 112 | Uneven beat groups, narrow passing steps, repeated notes and a rest |
| [Glass Harbor](05-glass-harbor-magic.composition.json) | Magic (5-limit), 13 notes | Recommended, wrapped | 6/8 grouped 3+3, 76 | Compound beat groups, stacked thirds and close descending steps |
| [Half-Octave Mirrors](06-half-octave-mirrors-pajara.composition.json) | Pajara (7-limit), 5 notes per 600-cent period | Recommended, wrapped | 5/4 grouped 3+2, 100 | Divided-octave pitch/degree labels, register shifts and asymmetric phrases |

The waltz files contain identical music with distinct project IDs and layouts.
Their layouts use the built-in geometry with a seven-note major target scale;
saved registers are chosen to cover the music. The other microtonal pieces use
the preset tunings and recommended scale sizes. Clockwork uses the meantone
mapping with an exact 700-cent generator and 1200-cent period.

Each song has separate editable melody and chord clips, with no clip repeats or
muted parts. Bars **3–6** form a saved loop region; looping starts disabled. Enable
it in Compose or select the loop section in Play. Notes keep their exact timing
when opened; the editor's current grid is independent of the saved rhythm.

## Regenerate and validate

From the repository root:

```sh
node scripts/generate-sample-compositions.mjs
node tests/sample-compositions.mjs
```

The generator overwrites these six sample files deterministically. Save your own
edits under different filenames. Validation uses the app's loader, pitch resolver,
piano-roll rows and Play chart to check that the files are editable and playable.
