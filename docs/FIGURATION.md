# Figuration preludes

## Compose a prelude

**Create → Compose** opens with the **Prelude** panel. It works in three steps.

1. **Harmony.** Choose a plan: **Tonic frame**, **Bass octave**, **Sequence**, **Comma pump** or
   **My chords** (your own chord lane). Set the home degree and the number of voices. Each card is
   one harmony, with its place in the form, its chord and its bass. Press a card to hear it. Where
   a bass can carry other chords, the counter on the card steps through them. The line chart shows
   the bass and the top voice across the piece.
2. **Figure.** Choose the order in which the voices sound, the note value, how long each harmony
   lasts and how the notes are held. **Hear the harmonies** plays the plan as block chords.
   **Write the prelude** fills the chord lane and attaches the figure; Undo takes it back in one
   step. Melody notes you have written stay.
3. **Practice on the HexBoard.** Seven stages, each opening Play with its settings chosen: the
   harmonies as held chords, the bass line alone, the top voice alone, the figure on one harmony,
   each section, the whole prelude at your own pace, then in time from 60% speed. A completed
   stage is marked, and the results screen offers the next one.

### Comma pump

A comma pump moves the root by pure intervals (3/2, 5/4, 6/5, 7/4 and their kin) that, in just
intonation, would end a comma away from where they began. In a temperament that tempers the comma
out, the last move arrives exactly home. Meantone's is the syntonic comma pump (81/80): the root
moves by 5/3, 4/3, 4/3, 4/3. The plan finds the shortest pump whose roots all lie in your scale;
where the temperament has several, the **Comma** list offers them. Each card shows the interval
its root moved by. A short pump is played twice.

### Non-chord tones

**Non-chord tones** adds suspensions, or suspensions and passing tones. Both come from the voice
leading that is already there. A voice that steps down into a harmony may hold its old note for
the first sounding of the figure and then resolve. A voice about to move by a third may take the
note between for the last sounding. They need the figure **twice per harmony**; the opening frame
is left plain. A decorated harmony appears as two chords in the chord lane.

### Hand shapes

With **Comfortable hand shapes**, the hand model from the shape explorer (your hand size and
finger settings) rates how each voicing lies under the hands: the right hand takes the top three
voices, the left the rest. Voicings that strain the hand are avoided where the voice leading
allows, and each card shows the grade, A to D. **Closest voice leading** ignores the hands.

### One voice at a time

Play's **Voice** setting charts the bass, the top voice or the inner voices alone. The bass-line
and top-voice practice stages use it.

The harmonies are voice-led before any figure is applied: the bass follows the plan, the upper
voices move as little as they can and stay on keys of the saved layout, and the top voice rises
toward a high point about two-thirds through. The figure only spreads those voices through time.
Chords come from the chord directory while the app is set to the composition's tuning and scale;
otherwise the plan uses the scale's most concordant three-note chords and says so.

To change one harmony's figure by hand, select its chord and use **Edit attached figure** below.

## Draw a figure by hand


In **Create → Compose**, arrange your harmonies in the chord lane. Select a chord,
open **Figuration**, and choose **New figure**. The roll becomes a pattern editor
whose numbered rows follow that reference chord from lowest to highest pitch.

Draw notes using the usual grid, selection, duration and velocity tools. Empty
time is a rest; notes can overlap or start together. Set the cycle length in
quarter notes, including any trailing rests. Where the chord overlay recognizes
octaves, the octave range exposes higher and lower chord-tone rows. These are
mapped octaves, not necessarily single temperament periods. Without octave
equivalence, figures use the chord's written pitches only.

**Whole HexBoard (automatic)** exposes every playable chord-tone register on the
composition's saved layout. It is the default generation range. Disabled and
command buttons do not extend the range. **Manual octave limits** lets you choose
a narrower or explicitly written range instead.

The **Tone** and **Octave** controls set selected notes explicitly or add a note
at the playhead. They also distinguish references that happen to share a pitch,
such as a chord's upper voice and an octave-shifted lower voice.

**Generate** defaults to three voices: a low, accented bass on each beat, a moving
middle voice and a faster treble figure. Choose one to four voices. The bass follows
the chord's written bass, including inversions; automatic range places it on its
lowest playable octave. Upper lines use different rhythmic rates and span the
available range above it. Bass notes are longer and louder, and remain when the
rest percentage thins the upper voices. Narrow layouts can limit the number of
distinct simultaneous pitches. Bass and middle notes have different roll colours.

Generation uses the current roll grid, contour, range, rest percentage and velocity.
**Reroll** makes another random figure. Generation produces a fixed pattern:
playing, reopening and changing harmonies do not randomize its rhythm or chord-tone
order. Automatic patterns fit their register positions again for each new harmony,
so their notes remain on the saved layout. Manual octave references stay fixed.
**Audition** plays the drawing. **Save** stores it in this browser; **Save as**
creates a separate saved figure. Figures can also be imported and exported as
individual files, or moved with Settings' saved-preset backup.

Choose **Apply to**: the selected chord, chords starting in the loop, or the whole
progression. **Apply as a new pattern** embeds a copy in the composition. Each
chord restarts that figure, repeats it at its written rhythm, and cuts off notes
at the chord's end. Harmony gaps stay silent. Different chords can use different
patterns. A chord inside a repeated clip uses its attachment on every repetition.

Attached notes have dashed outlines. Their chord-tone numbers follow later chord
edits, including inversions. Select their source chord and use **Edit attached
figure**; **Update attached pattern** changes all chords using that composition's
copy. Saving a library figure alone does not change existing pieces. Deleting a
saved figure does not remove copies embedded in compositions.

**Detach to notes** turns one attachment into ordinary editable melody notes.
**Remove figure** removes its generated notes. These composition edits can be
undone. Existing melody notes are preserved when applying figures; overlap
warnings identify passages where both sound. Overlapping harmonies, insufficient
chord tones and unsupported octave shifts must be corrected before playback or
practice.

The chord lane is a silent template by default. Enable **Sound harmony** to hear
sustained chords underneath. Open **Play** to practice the melody with the normal
Timed or Wait settings and the composition's saved HexBoard layout. Notes without
playable buttons are reported before starting. You can select attached notes and
choose their buttons without detaching them.

Save the composition to retain its figures, attachments and button choices.
Compositions with figuration use composition format v2; older compositions still
open. Adaptive patterns use figuration format v2; fixed-octave patterns retain v1.
Older app versions must be updated to read adaptive patterns.
