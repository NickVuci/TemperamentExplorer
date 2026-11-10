# Figuration preludes

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
