import {chordIdentity} from '../chords/chord-identity.mjs';
import {harmonicIdentity} from '../harmonic/harmonic-equivalence.mjs';
import {projectChord} from '../chords/chord-projection.mjs';
import {occurrenceShape} from '../chords/chord-occurrence.mjs';
import {sourceShapeVoicing} from '../harmonic/harmonic-selection.mjs';
import {mappingContext} from '../harmonic/harmonic-context.mjs';
import {validateHarmonicSelection} from '../harmonic/harmonic-types.mjs';

/** Source sound, cell provenance and exact spelling remain separate. */
export function diamondHarmonicSelection(state, members, {label = 'Diamond selection'} = {}) {
  if (!Array.isArray(members) || members.length < 2 || members.length > 8)
    throw Error('Choose two through eight diamond voices for Chords.');
  const coords = members.map(member => member.coordinate),
    identity = chordIdentity(members.map(member => member.ratio).join(':')),
    policy = state.basis.includes(2) ? 'octave' : 'exact',
    family = harmonicIdentity(identity, policy),
    projection = projectChord(state, identity),
    shape = {
      coordinates: coords,
      members: members.map((member, inputIndex) => ({
        memberId: `diamond:${member.cellId}`,
        inputIndex
      })),
      equivalence: policy
    },
    normalized = occurrenceShape(state, shape),
    voicing = sourceShapeVoicing(state, shape),
    canonical = members.every(member => member.mapped) && projection.basisStatus === 'mapped';
  return validateHarmonicSelection({
    version: 1,
    mappingId: mappingContext(state).id,
    shapeId: normalized.id,
    source: 'diamond',
    shape,
    voicing,
    label,
    ...(canonical ? {harmonicId: family.familyId, interpretationId: identity.fingerprint} : {}),
    exactSpelling: members.map(member => member.ratio),
    provenance: {cells: structuredClone(members), canonicalMapping: canonical}
  });
}
