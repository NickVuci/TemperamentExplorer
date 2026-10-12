// Finite-board physical patterns, over the existing exact JI and mapping owners.
// A source member may move only by an integer mapped voicing-reference vector.
import {chordIdentity, MAX_CHORD_TONES} from '../chords/chord-identity.mjs';
import {projectChord} from '../chords/chord-projection.mjs';
import {harmonicIdentity, equivalencePolicy, shapeKey} from '../harmonic/harmonic-equivalence.mjs';
import {mappingContext} from '../harmonic/harmonic-context.mjs';
import {scaleMembership, searchShapeOccurrences} from '../chords/chord-occurrence.mjs';
import {voicingReference} from '../chords/chord-voicings.mjs';
import {coordinateCents} from '../core/pitch.mjs';
import {
  createBoardPlacementIndex,
  iteratePlacementAssignments,
  hexDistance
} from '../hexboard/hexboard-chords.mjs';
import {geometricShapeForKeys, boardStructureKey} from './geometric-shapes.mjs';
import {finishSearch, finishSearchAsync} from '../harmonic/harmonic-cooperative.mjs';
import {rational} from '../core/rational.mjs';

export const CHORD_SHAPE_BOUNDS = Object.freeze({
  maxTones: MAX_CHORD_TONES,
  maxNodes: 1000000,
  maxPlacements: 20000
});
export const chordShapeDefaults = () => ({
  span: 6,
  scaleOnly: true,
  rootDegree: null,
  rootKey: null,
  registerMin: null,
  registerMax: null,
  maxNodes: 250000,
  maxPlacements: 20000
});
const point = value =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const minus = (a, b) => a.map((value, axis) => value - b[axis]);
const compareKeyLists = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

export function validateChordShapeConstraints(input = {}) {
  const c = {...chordShapeDefaults(), ...input};
  if (!Number.isFinite(c.span) || c.span < 0)
    throw Error('Physical span must be nonnegative; zero means unlimited.');
  if (typeof c.scaleOnly !== 'boolean')
    throw Error('Choose whether to constrain shapes to the selected scale.');
  for (const name of ['rootDegree', 'rootKey'])
    if (c[name] !== null && (!Number.isSafeInteger(c[name]) || c[name] < 0))
      throw Error(`Invalid ${name}.`);
  for (const name of ['registerMin', 'registerMax'])
    if (c[name] !== null && !Number.isSafeInteger(c[name])) throw Error(`Invalid ${name}.`);
  if (c.registerMin !== null && c.registerMax !== null && c.registerMin > c.registerMax)
    throw Error('Minimum register exceeds maximum register.');
  for (const [name, maximum] of [
    ['maxNodes', CHORD_SHAPE_BOUNDS.maxNodes],
    ['maxPlacements', CHORD_SHAPE_BOUNDS.maxPlacements]
  ])
    if (!Number.isSafeInteger(c[name]) || c[name] < 1 || c[name] > maximum)
      throw Error(`${name} must be between 1 and ${maximum}.`);
  return c;
}

/** Exact certificate, including nonprimitive and generator-bearing reference vectors. */
export function referenceLift(difference, vector) {
  if (!point(difference) || !point(vector) || vector.every(value => value === 0)) return null;
  const axis = vector[0] !== 0 ? 0 : 1,
    lift = difference[axis] / vector[axis];
  return Number.isSafeInteger(lift) && difference.every((value, i) => value === lift * vector[i])
    ? lift || 0
    : null;
}

function preparedTarget(state, value, number, membership) {
  const raw = typeof value === 'string' ? {input: value} : value;
  if (!raw || typeof raw !== 'object') throw Error('A chord target needs a JI chord input.');
  const input = raw.input ?? raw.identity?.originalInput;
  const identity = chordIdentity(input),
    projection = projectChord(state, identity, {shapeKinds: ['exact']}),
    family = harmonicIdentity(identity, state.basis.includes(2) ? 'octave' : 'exact');
  const byRatio = new Map(projection.notes.map((note, index) => [note.ratio, {...note, index}]));
  const rootMember =
    raw.rootMember ?? identity.orderedRatios.indexOf(identity.canonicalRatios[0].label);
  if (!Number.isInteger(rootMember) || rootMember < 0 || rootMember >= identity.inputCardinality)
    throw Error('The chord root must identify a source member.');
  const members = identity.orderedRatios.map((ratio, inputIndex) => {
    const note = byRatio.get(ratio),
      declared = raw.members?.[inputIndex];
    return {
      ...declared,
      memberId: declared?.memberId ?? `input:${inputIndex}`,
      inputIndex,
      exactIndex: note.index,
      familyIndex: family.members[inputIndex].familyIndex,
      ratio,
      coordinate: note.coordinate ? [...note.coordinate] : null,
      idealCents: note.idealCents
    };
  });
  const coordinates = members.map(member => member.coordinate),
    mapped = projection.basisStatus === 'mapped',
    byGenerator = new Map(membership.notes.map(note => [note.generator, note]));
  const groups = [];
  if (mapped)
    for (const [memberIndex, member] of members.entries()) {
      let group = groups.find(group => same(group.coordinate, member.coordinate));
      if (!group) {
        group = {coordinate: [...member.coordinate], members: []};
        groups.push(group);
      }
      group.members.push(memberIndex);
    }
  const sourceOccurrences = mapped
    ? searchShapeOccurrences(
        state,
        {coordinates, equivalence: 'exact'},
        {membership, partialLimit: 0}
      )
    : null;
  return {
    ...raw,
    input,
    label: raw.label ?? identity.aliases.otonal,
    id:
      raw.id ??
      'shape-target-v1:' +
        JSON.stringify([identity.fingerprint, identity.orderedRatios, rootMember]),
    targetIndex: number,
    identity,
    chordId: identity.fingerprint,
    familyId: family.familyId,
    rootMember,
    members,
    coordinates,
    groups,
    mapped,
    mappingStatus: mapped ? 'mapped' : 'outside-basis',
    missingPrimes: projection.missingPrimes,
    sourceWithinScale: mapped && coordinates.every(coordinate => byGenerator.has(coordinate[1])),
    sourceScaleOccurrenceCount: sourceOccurrences?.completeOccurrences.length ?? 0,
    sourceStructureId: mapped ? projection.shapeIdentities.exact.id : null,
    collisionGroups: groups
      .filter(group => group.members.length > 1)
      .map(group => ({coordinate: group.coordinate, members: group.members})),
    placementCount: 0,
    shapeCount: 0,
    withinScale: null,
    hasPlayableShape: false
  };
}

// Rank intended chord tones by exact JI ratios within the shared voicing reference.
// Integer reference registers followed by this rank order exact voiced JI pitches,
// even when tuning reorders or merges their mapped sounding pitches.
function prepareToneRoles(target, reference) {
  const parse = label => label.split('/').map(BigInt),
    [rn, rd] = parse(target.members[target.rootMember].ratio),
    [vn, vd] = parse(reference.ratio);
  const classes = new Map();
  for (const member of target.members) {
    const [a, b] = parse(member.ratio);
    let n = a * rd,
      d = b * rn,
      lift = 0;
    while (n * vd >= d * vn) {
      n *= vd;
      d *= vn;
      lift++;
    }
    while (n < d) {
      n *= vn;
      d *= vd;
      lift--;
    }
    [n, d] = rational(n, d);
    const id = `${n}/${d}`;
    if (!classes.has(id)) classes.set(id, {id, n, d});
    member.referenceClass = id;
    member.sourceReferenceLift = lift;
  }
  const ordered = [...classes.values()].sort((a, b) =>
      a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0
    ),
    rank = new Map(ordered.map((value, i) => [value.id, i]));
  for (const member of target.members) member.toneIndex = rank.get(member.referenceClass);
  target.rootToneIndices = target.members.flatMap((member, index) =>
    member.referenceClass === '1/1' ? [index] : []
  );
}

function registerOf(key, byGenerator) {
  if (Number.isSafeInteger(key.register)) return key.register;
  const note = byGenerator.get(key.m[1]);
  return key.m[0] - (note?.coordinate[0] ?? 0);
}

function makeAssociation({state, target, root, choices, reference, geometry, byGenerator, policy}) {
  const members = Array(target.members.length),
    lifts = Array(target.members.length),
    memberKeys = Array(target.members.length),
    coordinates = Array(target.members.length);
  target.groups.forEach((group, index) =>
    group.members.forEach(member => {
      const choice = choices[index];
      members[member] = {...target.members[member]};
      lifts[member] = choice.lift;
      memberKeys[member] = choice.key.index;
      coordinates[member] = [...choice.key.m];
    })
  );
  const cellByKey = new Map(geometry.keys.map((key, cell) => [key, cell])),
    memberCells = memberKeys.map(key => cellByKey.get(key));
  const relative = coordinates.map(coordinate => minus(coordinate, root.m)),
    exactVoicingId = shapeKey(policy, coordinates);
  const sourceVoicing = lifts.every(lift => lift === 0),
    withinScale = coordinates.every(coordinate => byGenerator.has(coordinate[1]));
  const id =
    'shape-reading-v1:' + JSON.stringify([target.id, target.rootMember, lifts, memberCells]);
  const lowest = Math.min(...coordinates.map(coordinate => coordinateCents(state, coordinate))),
    bassMembers = coordinates
      .map((coordinate, member) => ({member, cents: coordinateCents(state, coordinate)}))
      .filter(note => Math.abs(note.cents - lowest) < 1e-7)
      .map(note => note.member);
  const intended = members
    .map((member, index) => ({
      index,
      register: member.sourceReferenceLift + lifts[index],
      tone: member.toneIndex
    }))
    .sort((a, b) => a.register - b.register || a.tone - b.tone || a.index - b.index);
  const bassToneIndices = intended
    .filter(note => note.register === intended[0].register && note.tone === intended[0].tone)
    .map(note => note.index);
  return {
    id,
    targetId: target.id,
    input: target.input,
    chordId: target.chordId,
    familyId: target.familyId,
    label: target.label,
    form: target.form ?? null,
    rootMember: target.rootMember,
    rootKey: root.index,
    rootDegree: byGenerator.get(root.m[1])?.degree ?? null,
    sourceCoordinates: target.coordinates.map(coordinate => [...coordinate]),
    coordinates,
    memberCells,
    memberKeys,
    members,
    lifts,
    reference: {
      kind: reference.kind,
      ratio: reference.ratio,
      vector: [...reference.m],
      idealCents: reference.idealCents
    },
    exactVoicingId,
    sourceStructureId: target.sourceStructureId,
    relativeCoordinates: relative,
    matchKind: sourceVoicing ? 'exact-source-voicing' : 'reference-voicing',
    sourceVoicing,
    withinScale,
    bassMembers,
    soundingBassMembers: [...bassMembers],
    rootToneIndices: [...target.rootToneIndices],
    bassToneIndices,
    possibleInversions: [...new Set(bassToneIndices.map(index => members[index].toneIndex))],
    registers: members.map((_, i) =>
      registerOf(
        choices[target.groups.findIndex(group => group.members.includes(i))].key,
        byGenerator
      )
    )
  };
}

/**
 * Cooperative forward search. Events contain progress, never partial truth claims;
 * the returned result reports the exact searched bounds and completeness.
 * `selectedKeys` is used by reverse lookup to require one exact physical key set.
 */
export function* searchChordShapesSteps({
  state,
  board,
  targets = [],
  constraints = {},
  signal,
  shouldCancel,
  onProgress,
  near = 65,
  selectedKeys = null
} = {}) {
  const mapping = mappingContext(state),
    c = validateChordShapeConstraints(constraints),
    membership = scaleMembership(state),
    byGenerator = new Map(membership.notes.map(note => [note.generator, note]));
  if (c.rootDegree !== null && c.rootDegree >= membership.n)
    throw Error('The chosen root degree is absent from the selected scale.');
  if (!Array.isArray(targets)) throw Error('Chord targets must be an array.');
  const boardId = boardStructureKey(board),
    index = createBoardPlacementIndex(board),
    policy = equivalencePolicy(state, 'exact'),
    budget = {visited: 0, placements: 0};
  let home = null;
  const cancelled = () => !!(signal?.aborted || shouldCancel?.()),
    shapeGroups = new Map(),
    placementMap = new Map(),
    targetRecords = [],
    targetSeen = new Map(),
    targetStats = new Map();
  const selectedSet = selectedKeys === null ? null : new Set(selectedKeys),
    selectedCount = selectedSet?.size;
  const result = {
    version: 1,
    mappingId: mapping.id,
    boardId,
    constraints: c,
    targets: targetRecords,
    shapes: [],
    complete: true,
    limited: false,
    cancelled: false,
    reason: null,
    visited: 0,
    placementCount: 0,
    bounds: {
      ...c,
      sourceTones: [2, MAX_CHORD_TONES],
      domain: selectedSet ? 'selected-keys' : 'finite-board',
      enabledKeys: index.keys.length,
      voicings: 'all-integer-reference-lifts'
    }
  };
  const checkpoint = phase => {
    const event = {
      type: 'search-checkpoint',
      phase,
      visited: budget.visited,
      placementCount: placementMap.size,
      shapeCount: shapeGroups.size,
      targetsPrepared: targetRecords.length
    };
    onProgress?.(event);
    return event;
  };
  const finish = reason => {
    result.reason = reason;
    result.cancelled = reason === 'cancelled';
    result.limited = reason !== null && !result.cancelled;
    result.complete = reason === null;
    result.visited = budget.visited;
    result.placementCount = placementMap.size;
    result.shapes = [...shapeGroups.values()]
      .map(group => {
        // Places nearest the tonic button come first; key lists break ties deterministically.
        const away = placement =>
          home
            ? Math.min(...placement.keys.map(key => hexDistance(index.byIndex.get(key), home)))
            : 0;
        group.placements.sort((a, b) => away(a) - away(b) || compareKeyLists(a.keys, b.keys));
        group.associations = [...group._associations.values()];
        delete group._associations;
        return group;
      })
      .sort(
        (a, b) => b.metrics.score - a.metrics.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );
    for (const target of targetRecords) {
      const stats = targetStats.get(target.id);
      target.placementCount = stats.placements.size;
      target.shapeCount = stats.shapes.size;
      target.hasPlayableShape = target.placementCount > 0;
      target.withinScale = target.placementCount ? stats.withinScale : null;
      target.searchComplete = result.complete;
    }
    return result;
  };
  if (cancelled()) return finish('cancelled');
  for (let i = 0; i < targets.length; i++) {
    if (cancelled()) return finish('cancelled');
    const target = preparedTarget(state, targets[i], i, membership);
    if (!targetSeen.has(target.id)) {
      targetRecords.push(target);
      targetSeen.set(target.id, target);
      targetStats.set(target.id, {placements: new Set(), shapes: new Set(), withinScale: false});
    } else {
      const prior = targetSeen.get(target.id);
      prior.inputs = [...new Set([...(prior.inputs ?? [prior.input]), target.input])];
    }
    if (i % 16 === 15) yield checkpoint('prepare');
  }
  let reference;
  try {
    reference = voicingReference(state);
  } catch (error) {
    result.error = error.message;
    return finish('reference-unavailable');
  }
  result.reference = {
    kind: reference.kind,
    ratio: reference.ratio,
    vector: [...reference.m],
    idealCents: reference.idealCents
  };
  for (const target of targetRecords) prepareToneRoles(target, reference);
  const eligible = index.keys.filter(key => {
    if ((selectedSet && !selectedSet.has(key.index)) || (c.scaleOnly && !byGenerator.has(key.m[1])))
      return false;
    const register = registerOf(key, byGenerator);
    return (
      (c.registerMin === null || register >= c.registerMin) &&
      (c.registerMax === null || register <= c.registerMax)
    );
  });
  home = index.byIndex.get(near) ?? eligible[0] ?? null;
  const roots = eligible.filter(
    key =>
      (c.rootKey === null || key.index === c.rootKey) &&
      (c.rootDegree === null || byGenerator.get(key.m[1])?.degree === c.rootDegree)
  );
  if (home) roots.sort((a, b) => hexDistance(a, home) - hexDistance(b, home) || a.index - b.index);
  let rootCount = 0;
  for (const target of targetRecords) {
    if (!target.mapped || (selectedSet && target.groups.length !== selectedCount)) continue;
    const sourceRoot = target.coordinates[target.rootMember],
      rootGroup = target.groups.findIndex(group => group.members.includes(target.rootMember));
    for (const root of roots) {
      if (cancelled()) return finish('cancelled');
      const domains = target.groups.map((group, groupIndex) => {
        if (groupIndex === rootGroup) return [{key: root, lift: 0}];
        const relative = minus(group.coordinate, sourceRoot),
          choices = [];
        for (const key of eligible) {
          if (c.span && index.distance(root, key).span > c.span + 1e-10) continue;
          const lift = referenceLift(minus(minus(key.m, root.m), relative), reference.m);
          if (lift !== null) choices.push({key, lift});
        }
        return choices.sort(
          (a, b) =>
            index.distance(root, a.key).span - index.distance(root, b.key).span ||
            a.key.index - b.key.index
        );
      });
      if (domains.every(domain => domain.length)) {
        const iterator = iteratePlacementAssignments(index, domains, {
          span: c.span,
          distinctCoordinates: true,
          maxNodes: c.maxNodes,
          budget,
          signal,
          shouldCancel
        });
        let step;
        while (!(step = iterator.next()).done) {
          if (step.value.type === 'search-checkpoint') {
            yield checkpoint('search');
            continue;
          }
          const event = step.value,
            geometry = geometricShapeForKeys(board, event.keys),
            placementId = 'hex-placement-v1:' + JSON.stringify(geometry.keys);
          let placement = placementMap.get(placementId);
          if (!placement && placementMap.size >= c.maxPlacements) {
            iterator.return();
            return finish('max-placements');
          }
          let group = shapeGroups.get(geometry.id);
          if (!group) {
            group = {
              id: geometry.id,
              cells: geometry.cells,
              metrics: geometry.metrics,
              placements: [],
              associations: [],
              _associations: new Map()
            };
            shapeGroups.set(group.id, group);
          }
          if (!placement) {
            placement = {
              id: placementId,
              shapeId: geometry.id,
              keys: geometry.keys,
              coords: geometry.keys.map(key => [...index.byIndex.get(key).m]),
              pitches: geometry.keys.map(key => coordinateCents(state, index.byIndex.get(key).m)),
              reach: geometry.metrics.reach,
              span: geometry.metrics.span,
              associations: []
            };
            placementMap.set(placementId, placement);
            group.placements.push(placement);
          }
          const association = makeAssociation({
            state,
            target,
            root,
            choices: event.choices,
            reference,
            geometry,
            byGenerator,
            policy
          });
          if (!placement.associations.some(record => record.id === association.id))
            placement.associations.push(association);
          const stats = targetStats.get(target.id);
          stats.placements.add(placementId);
          stats.shapes.add(group.id);
          stats.withinScale ||= association.withinScale;
          let reading = group._associations.get(association.id);
          if (!reading) {
            reading = {...association, placementIds: [], rootDegrees: []};
            group._associations.set(association.id, reading);
          }
          if (!reading.placementIds.includes(placementId)) reading.placementIds.push(placementId);
          if (!reading.rootDegrees.includes(association.rootDegree))
            reading.rootDegrees.push(association.rootDegree);
        }
        if (!step.value.complete) return finish(step.value.reason);
      }
      if (++rootCount % 8 === 0) yield checkpoint('search');
    }
    yield checkpoint('search');
  }
  return finish(null);
}

export function searchChordShapes(options) {
  return finishSearch(searchChordShapesSteps(options));
}
export function searchChordShapesAsync(options, cooperative = {}) {
  return finishSearchAsync(searchChordShapesSteps(options), cooperative);
}

/** Distinct sounding coordinates of selected keys, in canonical cell order; repeated keys are doublings. */
export function selectedSoundingKeys(board, keys) {
  const byIndex = new Map((board?.keys ?? []).map(key => [key.index, key])),
    groups = new Map();
  for (const index of geometricShapeForKeys(board, keys).keys) {
    const id = byIndex.get(index).m.join(',');
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(index);
  }
  const list = [...groups.values()];
  return {
    keys: list.map(group => group[0]),
    doublingGroups: list
      .filter(group => group.length > 1)
      .map(group => ({coordinate: [...byIndex.get(group[0]).m], keys: group}))
  };
}

/**
 * The same assignment engine, restricted to exactly the selected physical cells. The keys are fixed, so
 * span, scale, root and register filters do not apply; each reading reports `withinScale` instead.
 * A forward placement never gives two keys one sounding coordinate. Selected keys that repeat one are an
 * added doubling: the readings of their distinct sounding keys are `doublingReadings`, never `matches`
 * or shapes, and the selected geometry is kept whole.
 */
export function* identifySelectedShapeSteps(options = {}) {
  const {state, board, keys, catalogue = null} = options;
  if (
    !Array.isArray(keys) ||
    !keys.length ||
    keys.length > MAX_CHORD_TONES ||
    new Set(keys).size !== keys.length
  )
    throw Error('Select one to eight distinct enabled keys.');
  const byIndex = new Map((board?.keys ?? []).map(key => [key.index, key]));
  if (keys.some(index => !byIndex.get(index)?.enabled || byIndex.get(index)?.command))
    throw Error('Reverse lookup requires enabled note keys.');
  const geometry = geometricShapeForKeys(board, keys),
    coordinates = geometry.keys.map(index => [...byIndex.get(index).m]),
    policy = equivalencePolicy(state, 'exact');
  const sounding = selectedSoundingKeys(board, keys),
    addedDoublings = geometry.keys.length - sounding.keys.length;
  const selected = {
    ...geometry,
    coordinates,
    exactVoicingId: shapeKey(policy, coordinates),
    pitches: coordinates.map(coordinate => coordinateCents(state, coordinate)),
    soundingKeys: sounding.keys,
    doublingGroups: sounding.doublingGroups,
    addedDoublings
  };
  const {maxNodes, maxPlacements} = validateChordShapeConstraints(options.constraints);
  const constraints = {...chordShapeDefaults(), span: 0, scaleOnly: false, maxNodes, maxPlacements};
  const result = yield* searchChordShapesSteps({
    ...options,
    constraints,
    selectedKeys: sounding.keys
  });
  const readings = result.shapes.flatMap(shape =>
    shape.placements.flatMap(placement =>
      placement.associations.map(association => ({...association, placementId: placement.id}))
    )
  );
  const keysAt = new Map(sounding.doublingGroups.map(group => [group.keys[0], group.keys]));
  const matches = addedDoublings
    ? []
    : readings.map(reading => ({...reading, geometricMatch: true, exactPlacement: true}));
  const doublingReadings = addedDoublings
    ? readings.map(reading => ({
        ...reading,
        matchKind: 'added-doubling',
        voicingKind: reading.matchKind,
        geometricMatch: false,
        exactPlacement: false,
        doubledMemberKeys: reading.memberKeys.map(key => keysAt.get(key) ?? [key])
      }))
    : [];
  const chordIds = new Set(readings.map(match => match.chordId));
  return {
    ...result,
    shapes: addedDoublings ? [] : result.shapes,
    placementCount: addedDoublings ? 0 : result.placementCount,
    selected,
    matches,
    doublingReadings,
    geometricMatches: (catalogue?.shapes ?? [])
      .filter(shape => shape.id === geometry.id)
      .map(shape => shape.id),
    relatedShapes: (catalogue?.shapes ?? [])
      .filter(
        shape =>
          shape.id !== geometry.id &&
          shape.associations.some(association => chordIds.has(association.chordId))
      )
      .map(shape => shape.id)
  };
}
export function identifySelectedShape(options) {
  return finishSearch(identifySelectedShapeSteps(options));
}
