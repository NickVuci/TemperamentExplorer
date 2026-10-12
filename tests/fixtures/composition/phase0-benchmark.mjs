import {readFileSync} from 'node:fs';

// Deterministic editor and polyphony recipes. These describe test data only;
// they make no claim about current editor or audio performance.
const corpus = JSON.parse(readFileSync(new URL('./phase0-corpus.json', import.meta.url), 'utf8'));
const source = corpus.fixtures.find(f => f.id === 'meantone-7-mode4');
if (!source)
  throw Error('The deterministic editor benchmark needs its frozen Meantone source fixture.');
const scaleCoordinates = source.scale.coordinates.map(note => note.coordinate);
export const EDITOR_BENCHMARK = Object.freeze({
  trackCount: 4,
  barCount: 128,
  eighthNotesPerBar: 8,
  ppq: 960,
  tempoQuarterBpm: 120,
  meter: Object.freeze({numerator: 4, denominator: 4}),
  eventsPerTrack: 1024,
  totalEvents: 4096,
  totalTicks: 491520,
  durationSeconds: 256
});

export function createEditorBenchmark() {
  const tracks = Array.from({length: EDITOR_BENCHMARK.trackCount}, (_, trackIndex) => {
    const id = `benchmark-track-${String(trackIndex + 1).padStart(2, '0')}`;
    const events = [];
    for (let bar = 0; bar < EDITOR_BENCHMARK.barCount; bar++) {
      for (let eighth = 0; eighth < EDITOR_BENCHMARK.eighthNotesPerBar; eighth++) {
        const eventId = `${id}-bar-${String(bar + 1).padStart(3, '0')}-eighth-${eighth + 1}`;
        const sourceDegree = (bar + eighth + trackIndex) % scaleCoordinates.length;
        const periodShift = trackIndex % 2;
        const base = scaleCoordinates[sourceDegree];
        events.push({
          id: eventId,
          bar: bar + 1,
          eighth: eighth + 1,
          startTick: bar * 3840 + eighth * 480,
          durationTick: 480,
          velocity: 100,
          sourceDegree,
          periodShift,
          tones: [{toneId: `${eventId}-tone-1`, coordinate: [base[0] + periodShift, base[1]]}]
        });
      }
    }
    return {id, name: `Benchmark ${trackIndex + 1}`, events};
  });
  return {
    format: 'composition-benchmark-recipe-v1',
    sourceFixtureId: source.id,
    ticksPerQuarter: EDITOR_BENCHMARK.ppq,
    tempoQuarterBpm: EDITOR_BENCHMARK.tempoQuarterBpm,
    meter: {...EDITOR_BENCHMARK.meter},
    totalTicks: EDITOR_BENCHMARK.totalTicks,
    durationSeconds: EDITOR_BENCHMARK.durationSeconds,
    tracks
  };
}

export function createVoiceStressRecipe() {
  return {
    status: 'unmeasured until the composition audio scheduler exists',
    polyphonyLevels: [1, 8, 16, 32].map(tones => ({source: 'transport', tones})),
    mixedSourceCeiling: {transport: 24, live: 20, preview: 20, total: 64},
    maxConcurrentSoundingVoices: 64,
    releaseTailsCountTowardCeiling: true,
    lookaheadQueueEventsCountTowardCeiling: false
  };
}
