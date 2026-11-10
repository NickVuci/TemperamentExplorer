import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {physicalKey, buildBoard} from '../src/hexboard/hexboard.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {scaleMembership} from '../src/chords/chord-occurrence.mjs';
import {physicalDistance} from '../src/shapes/geometric-shapes.mjs';
import {
  searchChordShapes,
  searchChordShapesSteps,
  identifySelectedShapeSteps,
  referenceLift
} from '../src/shapes/chord-shapes.mjs';
import {finishSearch, finishSearchAsync} from '../src/harmonic/harmonic-cooperative.mjs';
const identifySelectedShape = options => finishSearch(identifySelectedShapeSteps(options));
const searchChordShapesAsync = (options, cooperative) =>
  finishSearchAsync(searchChordShapesSteps(options), cooperative);
import {
  createBoardPlacementIndex,
  iteratePlacementAssignments,
  hexDistance
} from '../src/hexboard/hexboard-chords.mjs';

const state = {...makeState('meantone'), n: 7, mode: 0};
const coordinates = input =>
  projectChord(state, chordIdentity(input)).notes.map(note => note.coordinate);
const makeBoard = (coords, indices = [65, 66, 75, 76, 85, 86, 67, 74, 84, 94]) => ({
  keys: coords.map((m, i) => ({
    ...physicalKey(indices[i]),
    m: [...m],
    enabled: true,
    c: m[0] * state.p + m[1] * state.g
  }))
});
const source = coordinates('4:5:6'),
  board = makeBoard([...source, ...source.map(([p, g]) => [p + 1, g]), source[1]]);
const opts = {state, board, targets: ['4:5:6'], constraints: {span: 0, scaleOnly: false}};
const result = searchChordShapes(opts);
assert.equal(result.complete, true);
assert.ok(result.placementCount > 4);
const all = result.shapes.flatMap(shape => shape.placements),
  associations = all.flatMap(placement => placement.associations);

// Independent Cartesian enumeration on a small board, with no indexed solver or
// quotient helper: every source-member assignment, including duplicate buttons.
const brute = new Set(),
  actual = new Set();
for (const root of board.keys)
  for (const third of board.keys)
    for (const fifth of board.keys) {
      const keys = [root, third, fifth];
      if (new Set(keys.map(key => key.m.join(','))).size !== 3) continue;
      const lifts = keys.map((key, i) => key.m[0] - root.m[0] - source[i][0]);
      if (!keys.every((key, i) => key.m[1] - root.m[1] === source[i][1])) continue;
      brute.add(
        JSON.stringify([keys.map(key => key.index).sort((a, b) => a - b), root.index, lifts])
      );
    }
for (const placement of all)
  for (const a of placement.associations) {
    actual.add(JSON.stringify([[...placement.keys].sort((a, b) => a - b), a.rootKey, a.lifts]));
    assert.deepEqual(
      a.coordinates,
      a.memberKeys.map(key => board.keys.find(item => item.index === key).m)
    );
    for (let i = 0; i < a.coordinates.length; i++)
      assert.deepEqual(
        a.coordinates[i],
        a.coordinates[a.rootMember].map(
          (value, axis) =>
            value +
            a.sourceCoordinates[i][axis] -
            a.sourceCoordinates[a.rootMember][axis] +
            a.lifts[i] * a.reference.vector[axis]
        )
      );
  }
assert.deepEqual(
  actual,
  brute,
  'all finite-board reference-lift assignments match brute force exactly'
);
{
  const home = board.keys.find(k => k.index === 65),
    away = p =>
      Math.min(
        ...p.keys.map(k =>
          hexDistance(
            board.keys.find(item => item.index === k),
            home
          )
        )
      );
  for (const shape of result.shapes)
    for (let i = 1; i < shape.placements.length; i++)
      assert.ok(
        away(shape.placements[i - 1]) <= away(shape.placements[i]),
        'places nearest the tonic button come first'
      );
}
assert.ok(
  associations.some(a => a.matchKind === 'reference-voicing' && a.possibleInversions[0] > 0),
  'open/inverted realizations are included'
);
assert.ok(associations.some(a => a.matchKind === 'exact-source-voicing'));

for (const placement of all) {
  const reverse = identifySelectedShape({...opts, keys: placement.keys, catalogue: result});
  assert.equal(reverse.complete, true);
  assert.equal(reverse.selected.id, placement.shapeId);
  assert.deepEqual(
    new Set(reverse.matches.map(a => a.id)),
    new Set(placement.associations.map(a => a.id)),
    'forward results reverse to the same root/member/lift interpretations'
  );
  assert.ok(reverse.geometricMatches.includes(placement.shapeId));
}

// Reverse lookup reads the fixed selected keys: forward-only span, scale, root and register filters
// never hide a reading. Two buttons sounding one coordinate are an added doubling: the selected geometry
// stays whole, readings of the distinct sounding keys are reported apart, and none is an exact placement.
{
  const b = makeBoard([...source, source[0]], [65, 66, 75, 85]),
    filters = {span: 1, scaleOnly: true, rootKey: 99, registerMin: 5};
  const plain = identifySelectedShape({
    state,
    board: b,
    targets: ['4:5:6'],
    constraints: filters,
    keys: [65, 66, 75]
  });
  assert.ok(plain.matches.length, 'forward filters do not apply to fixed selected keys');
  assert.ok(plain.matches.every(a => a.exactPlacement && a.geometricMatch));
  assert.equal(plain.selected.addedDoublings, 0);
  assert.deepEqual(plain.doublingReadings, []);
  const doubled = identifySelectedShape({
    state,
    board: b,
    targets: ['4:5:6'],
    constraints: filters,
    keys: [65, 66, 75, 85]
  });
  assert.equal(doubled.selected.cells.length, 4, 'the selected geometry keeps the doubled button');
  assert.equal(doubled.selected.addedDoublings, 1);
  assert.equal(doubled.selected.doublingGroups.length, 1);
  assert.deepEqual(new Set(doubled.selected.doublingGroups[0].keys), new Set([65, 85]));
  assert.deepEqual(doubled.selected.doublingGroups[0].coordinate, source[0]);
  assert.deepEqual(doubled.matches, []);
  assert.deepEqual(doubled.shapes, []);
  assert.equal(doubled.placementCount, 0);
  assert.deepEqual(
    new Set(doubled.doublingReadings.map(a => a.id)),
    new Set(plain.matches.map(a => a.id)),
    'family readings are those of the distinct sounding keys'
  );
  for (const a of doubled.doublingReadings) {
    assert.equal(a.matchKind, 'added-doubling');
    assert.equal(a.exactPlacement, false);
    assert.equal(a.geometricMatch, false);
    assert.ok(['exact-source-voicing', 'reference-voicing'].includes(a.voicingKind));
    const root =
      a.doubledMemberKeys[a.memberKeys.indexOf(doubled.selected.doublingGroups[0].keys[0])];
    if (root) assert.deepEqual(new Set(root), new Set([65, 85]));
  }
  assert.ok(
    doubled.doublingReadings.some(a => a.doubledMemberKeys.some(keys => keys.length === 2))
  );
}

// Exact mapping collisions share one button without losing either ratio member.
{
  const collision = searchChordShapes({...opts, targets: ['1:81/80']});
  assert.equal(collision.shapes.length, 1);
  assert.equal(collision.shapes[0].metrics.cellCount, 1);
  for (const a of collision.shapes[0].placements.flatMap(p => p.associations)) {
    assert.equal(a.members.length, 2);
    assert.equal(a.memberKeys[0], a.memberKeys[1]);
    assert.equal(a.memberCells[0], a.memberCells[1]);
  }
  const octave = searchChordShapes({...opts, targets: ['1:2']});
  assert.ok(octave.placementCount);
  for (const p of octave.shapes.flatMap(shape => shape.placements))
    assert.equal(
      new Set(p.coords.map(point => point.join(','))).size,
      2,
      'distinct source coordinates never newly coalesce'
    );
  const repeats = searchChordShapes({...opts, targets: ['6:4:5:4']});
  assert.ok(repeats.placementCount);
  for (const a of repeats.shapes.flatMap(s => s.placements.flatMap(p => p.associations))) {
    assert.equal(a.members.length, 4);
    assert.equal(a.memberKeys[1], a.memberKeys[3]);
    assert.equal(a.rootMember, 1);
  }
}

// Distinct JI identities can project to exactly the same physical realization;
// redundant rational spellings and additional readings do not inflate placements.
{
  const ambiguous = searchChordShapes({...opts, targets: ['4:5:6', '64:81:96', '8:10:12']});
  assert.equal(ambiguous.targets.length, 2);
  assert.equal(ambiguous.placementCount, result.placementCount);
  assert.ok(
    ambiguous.shapes.every(shape => new Set(shape.associations.map(a => a.chordId)).size === 2)
  );
  const p = ambiguous.shapes[0].placements[0],
    reverse = identifySelectedShape({...opts, keys: p.keys, targets: ['4:5:6', '64:81:96']});
  assert.equal(new Set(reverse.matches.map(a => a.chordId)).size, 2);
  const high = {...makeState('miracle11'), n: 19, mode: 0},
    a = projectChord(high, chordIdentity('4:5:6:7')).notes.map(note => note.coordinate),
    b = makeBoard(a);
  const higher = searchChordShapes({
    state: high,
    board: b,
    targets: ['4:5:6:7', '1:5/4:675/448:7/4'],
    constraints: {span: 0, scaleOnly: false}
  });
  assert.equal(higher.placementCount, 1);
  assert.equal(
    new Set(higher.shapes[0].associations.map(a => a.chordId)).size,
    2,
    'higher-prime-limit mapping ambiguities retain both readings'
  );
}

// Scale and root filters test actual candidate coordinates, not the source
// spelling's occurrence status or cents-based aliases on an unwrapped board.
{
  const outside = makeBoard([
      [0, 3],
      [-2, 7],
      [0, 4]
    ]),
    unrestricted = searchChordShapes({...opts, board: outside});
  assert.equal(unrestricted.placementCount, 1);
  assert.equal(unrestricted.shapes[0].placements[0].associations[0].withinScale, false);
  assert.equal(
    searchChordShapes({...opts, board: outside, constraints: {span: 0, scaleOnly: true}})
      .placementCount,
    0
  );
  const roots = searchChordShapes({...opts, constraints: {span: 0, scaleOnly: false, rootKey: 65}});
  assert.ok(roots.placementCount);
  assert.ok(
    roots.shapes.every(shape =>
      shape.placements.every(p => p.associations.every(a => a.rootKey === 65))
    )
  );
  const tonicDegree = scaleMembership(state).notes.find(note => note.generator === 0).degree;
  const tonic = searchChordShapes({...opts, constraints: {span: 0, rootDegree: tonicDegree}});
  assert.ok(tonic.placementCount);
  assert.ok(
    tonic.shapes.every(shape => shape.associations.every(a => a.rootDegree === tonicDegree))
  );
  const limited = searchChordShapes({...opts, constraints: {span: 1}});
  for (const p of limited.shapes.flatMap(shape => shape.placements))
    for (const i of p.keys)
      for (const j of p.keys)
        assert.ok(
          physicalDistance(
            board.keys.find(k => k.index === i),
            board.keys.find(k => k.index === j)
          ) <=
            1 + 1e-10
        );
  const noMap = searchChordShapes({...opts, targets: ['4:5:7']});
  assert.equal(noMap.targets[0].mappingStatus, 'outside-basis');
  assert.equal(noMap.placementCount, 0);
}

// Mapped octave with a generator component: source is absent but another exact
// reference-lift voicing is in the selected finite scale.
{
  const mixed = {
    name: 'mixed',
    basis: [3, 2, 5],
    rows: [
      [1, 0, 0],
      [0, 1, 4]
    ],
    p: 1901.9550008653874,
    g: 1200,
    n: 2,
    mode: 0
  };
  const b = makeBoard([
      [0, 0],
      [0, 1]
    ]),
    found = searchChordShapes({
      state: mixed,
      board: b,
      targets: ['1:5'],
      constraints: {rootKey: 65, span: 0}
    });
  assert.equal(found.targets[0].sourceScaleOccurrenceCount, 0);
  assert.equal(found.placementCount, 1);
  assert.deepEqual(found.shapes[0].placements[0].associations[0].reference.vector, [0, 1]);
  assert.deepEqual(found.shapes[0].placements[0].associations[0].lifts, [0, -3]);
}

// A non-octave reference spanning two temperament periods must retain its residue.
{
  const native = {
    name: 'divided tritave',
    basis: [3, 5],
    rows: [
      [2, 0],
      [0, 1]
    ],
    p: 950.9775004326937,
    g: 386,
    n: 3,
    mode: 0
  };
  const b = makeBoard([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0]
    ]),
    o = {state: native, board: b, targets: ['1:3'], constraints: {span: 0, rootKey: 65}};
  const found = searchChordShapes(o);
  assert.equal(found.placementCount, 2);
  for (const a of found.shapes.flatMap(s => s.placements.flatMap(p => p.associations)))
    assert.equal(a.coordinates[1][0] % 2, 0);
  assert.equal(
    searchChordShapes({...o, constraints: {...o.constraints, registerMax: 3}}).placementCount,
    1
  );
  assert.equal(identifySelectedShape({...o, keys: [65, 66]}).matches.length, 0);
  assert.equal(referenceLift([1, 0], [2, 0]), null);
  assert.equal(referenceLift([4, 0], [2, 0]), 2);
  assert.equal(referenceLift([0, -3], [0, 1]), -3);
}

// Tuning only changes sounding-pitch diagnostics on the same structural board.
{
  const retuned = searchChordShapes({...opts, state: {...state, g: 100}});
  const structure = r =>
    r.shapes.map(s => [
      s.id,
      s.placements.map(p => [
        p.id,
        p.associations.map(a => [
          a.id,
          a.exactVoicingId,
          a.rootToneIndices,
          a.bassToneIndices,
          a.possibleInversions
        ])
      ])
    ]);
  assert.deepEqual(structure(retuned), structure(result));
  const before = associations.find(a => a.sourceVoicing && a.rootKey === 65),
    after = retuned.shapes
      .flatMap(s => s.placements.flatMap(p => p.associations))
      .find(a => a.id === before.id && a.rootKey === 65);
  assert.notDeepEqual(after.soundingBassMembers, before.soundingBassMembers);
  assert.deepEqual(after.bassToneIndices, before.bassToneIndices);
}

// Bounds and cancellation are explicit; cooperative and synchronous paths agree.
{
  const nodes = searchChordShapes({...opts, constraints: {span: 0, maxNodes: 1}});
  assert.equal(nodes.complete, false);
  assert.equal(nodes.reason, 'max-nodes');
  assert.equal(nodes.visited, 1);
  const placements = searchChordShapes({...opts, constraints: {span: 0, maxPlacements: 1}});
  assert.equal(placements.placementCount, 1);
  assert.equal(placements.reason, 'max-placements');
  const aborted = new AbortController();
  aborted.abort();
  const cancelled = searchChordShapes({...opts, signal: aborted.signal});
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(cancelled.complete, false);
  let boundaries = 0;
  const async = await searchChordShapesAsync(opts, {
    yieldControl: async () => {
      boundaries++;
    }
  });
  assert.ok(boundaries > 0);
  assert.deepEqual(async, result);
  const real = buildBoard(state, {
    base: 7,
    style: 'bosanquet',
    center: 65,
    offset: 0,
    rotation: 0,
    register: 0,
    outside: false,
    periodWrapping: true
  });
  let cancel = false;
  const interrupted = await searchChordShapesAsync(
    {
      ...opts,
      board: real,
      onProgress: () => {
        cancel = true;
      },
      shouldCancel: () => cancel
    },
    {yieldControl: async () => {}}
  );
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.cancelled, true);
  const index = createBoardPlacementIndex(board),
    domains = [index.keys, index.keys],
    iterator = iteratePlacementAssignments(index, domains, {maxNodes: 2});
  let step;
  do {
    step = iterator.next();
  } while (!step.done);
  assert.equal(step.value.reason, 'max-nodes');
}
console.log(
  'Chord shapes: exhaustive brute-force parity, exact reverse certificates, collision/alias multiplicity, roots, scale, reference lifts and bounded cooperative search passed.'
);
