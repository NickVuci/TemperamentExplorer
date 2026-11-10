// One context and one voice lifecycle for all app playback.
// The caller owns UI selection/highlighting; this module owns sound only.
const MIN_FREQUENCY = 15;
const MAX_FREQUENCY = 16000;
export const frequencyFor = (cents, tonic = 220) => tonic * 2 ** (cents / 1200);
export const isAudibleFrequency = frequency =>
  Number.isFinite(frequency) && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY;

const RELEASE = 0.06,
  STOP_MARGIN = 0.01;
// Live notes reach full level quickly; the output soft-clipper keeps the short ramp click-free.
const LIVE_ATTACK = 0.004;
// Smooth endpoints avoid a sudden change in envelope slope at note-off.
const fadeOut = Float32Array.from({length: 129}, (_, i) => (1 + Math.cos((Math.PI * i) / 128)) / 2);
// Input attenuation expands the shaper's input range to +/-4. Ordinary signals
// pass through unchanged; excessive polyphony approaches +/-0.95 smoothly.
export const outputCurve = Float32Array.from({length: 32769}, (_, i) => {
  const x = ((i / 32768) * 2 - 1) * 4,
    a = Math.abs(x);
  return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.35 * Math.tanh((a - 0.6) / 0.35));
});

export function createAudioEngine({
  getSettings = () => ({tonic: 220, wave: 'triangle'}),
  createContext = () =>
    new (globalThis.AudioContext || globalThis.webkitAudioContext)({latencyHint: 'interactive'}),
  onError = () => {}
} = {}) {
  let context,
    output,
    revision = 0,
    clockRevision = 0;
  const voices = new Set();
  // Voice groups ('live', 'preview', 'transport', ...) let one source cancel its own
  // sound without touching another. Every group has its own revision so a request
  // started before a cancel can never start audio after it.
  const groups = new Map();
  const groupState = id => {
    let g = groups.get(id);
    if (!g) {
      g = {revision: 0};
      groups.set(id, g);
    }
    return g;
  };

  async function ready() {
    if (!context || context.state === 'closed') {
      context = createContext();
      clockRevision++;
      const input = context.createGain(),
        protector = context.createWaveShaper();
      input.gain.value = 0.25;
      protector.curve = outputCurve;
      input.connect(protector);
      protector.connect(context.destination);
      output = input;
    }
    if (context.state !== 'running') await context.resume();
    return context;
  }

  function createVoice(
    cents,
    settings,
    at,
    volume,
    attack,
    duration,
    group = 'live',
    voiceRevision = 0
  ) {
    const frequency = frequencyFor(cents, settings.tonic);
    if (!isAudibleFrequency(frequency)) return null;
    const oscillator = context.createOscillator(),
      gain = context.createGain(),
      gate = context.createGain();
    oscillator.type = settings.wave;
    oscillator.frequency.value = frequency;
    // Initialise to silence even if node construction spans a render quantum.
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + attack);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    gate.gain.value = 1;
    oscillator.connect(gain);
    gain.connect(gate);
    gate.connect(output);
    const voice = {
      oscillator,
      gain,
      gate,
      startedAt: at,
      releaseAt: null,
      ended: false,
      group,
      revision: voiceRevision
    };
    voices.add(voice);
    oscillator.onended = () => {
      voice.ended = true;
      voices.delete(voice);
      oscillator.disconnect();
      gain.disconnect();
      gate.disconnect();
    };
    oscillator.start(at);
    // Natural endings and interrupted notes use the same independent fade.
    if (duration !== undefined) fadeVoice(voice, at + duration);
    return voice;
  }

  function fadeVoice(voice, at) {
    if (!voice || voice.ended) return;
    // Already fading: leave it alone. An earlier Stop can replace a future
    // release because its curve has not started; no active automation is cut.
    if (voice.releaseAt !== null) {
      if (voice.releaseAt <= at) return;
      voice.gate.gain.cancelScheduledValues(voice.releaseAt);
    }
    voice.releaseAt = at;
    voice.gate.gain.setValueCurveAtTime(fadeOut, at, RELEASE);
    voice.oscillator.stop(at + RELEASE + STOP_MARGIN);
  }

  // Ends one voice now: a future note never starts, a sounding one fades out.
  function silence(voice) {
    if (voice.startedAt > context.currentTime) {
      // Future sequence notes never start; their gain is still zero.
      voice.gate.gain.cancelScheduledValues(voice.releaseAt ?? context.currentTime);
      voice.gate.gain.setValueAtTime(0, context.currentTime);
      voice.releaseAt = context.currentTime;
      voice.oscillator.stop(context.currentTime);
    } else fadeVoice(voice, context.currentTime);
  }

  // Global stop: every group, including anything a pending resume would have started.
  function stop() {
    revision++;
    for (const g of groups.values()) g.revision++;
    if (!context) return;
    for (const voice of voices) silence(voice);
  }

  function cancelGroup(groupId) {
    groupState(groupId).revision++;
    if (!context) return;
    for (const voice of voices) if (voice.group === groupId) silence(voice);
  }

  function cancelRevision(groupId, voiceRevision) {
    if (!context) return;
    for (const voice of voices)
      if (voice.group === groupId && voice.revision === voiceRevision) silence(voice);
  }

  // `scope` null: the original behaviour (cut everything first). A scope name only
  // replaces that group's earlier sound, so a preview never cancels a playing piece.
  async function playEvents(events, scope = null, override) {
    if (scope) cancelGroup(scope);
    else stop();
    const request = revision,
      groupRequest = groupState(scope ?? 'preview').revision,
      settings = {...getSettings(), ...override};
    const current = () =>
      request === revision && (!scope || groupState(scope).revision === groupRequest);
    try {
      await ready();
      if (!current()) return false;
      const now = context.currentTime;
      for (const {pitches, offset, duration} of events) {
        const volume = (settings.wave === 'sawtooth' ? 0.06 : 0.14) / Math.sqrt(pitches.length);
        for (const cents of pitches)
          createVoice(cents, settings, now + offset, volume, 0.018, duration, scope ?? 'preview');
      }
      return true;
    } catch (error) {
      if (current()) {
        if (scope) cancelGroup(scope);
        else stop();
        onError(error);
      }
      return false;
    }
  }

  // Resolves once the context is running. Call from a user gesture before scheduling.
  const prepare = () => ready();

  /**
   * Schedules timed voices for a group. Each voice is {voiceId, cents, onsetAudioSeconds,
   * releaseAudioSeconds, velocity, chordSize?}. Pitch comes from the caller's tonic/wave
   * overrides when supplied, otherwise the app's central audio settings. Returns one cancelable token per
   * voice that was started; voices already past, inaudible, or from a stale revision are skipped.
   */
  function scheduleVoices(list, {groupId, revision: wanted, settings} = {}) {
    if (!groupId) throw Error('scheduleVoices needs a groupId.');
    if (!context || context.state !== 'running')
      throw Error('Audio is not ready; call prepare() from a user gesture first.');
    const g = groupState(groupId);
    if (wanted !== undefined && wanted !== g.revision) return [];
    const resolved = {...getSettings(), ...settings},
      tokens = [],
      now = context.currentTime;
    for (const v of list) {
      if (!(v.releaseAudioSeconds > now)) continue;
      const at = Math.max(v.onsetAudioSeconds, now),
        duration = v.releaseAudioSeconds - at;
      if (!(duration > 0)) continue;
      const share =
        ((resolved.wave === 'sawtooth' ? 0.06 : 0.14) / Math.sqrt(Math.max(1, v.chordSize ?? 1))) *
        Math.min(1.27, Math.max(0, (v.velocity ?? 100) / 100));
      const voice = createVoice(v.cents, resolved, at, share, 0.018, duration, groupId, g.revision);
      if (voice)
        tokens.push({
          voiceId: v.voiceId,
          cancel: () => {
            if (!voice.ended) silence(voice);
          }
        });
    }
    return tokens;
  }

  /** Clock anchors: AudioContext seconds paired with performance.now() milliseconds. */
  function getClockSnapshot() {
    const perf = () => globalThis.performance?.now?.() ?? Date.now();
    if (!context) return {audioSeconds: null, performanceMs: perf(), state: 'none', clockRevision};
    const ts = context.getOutputTimestamp?.();
    const anchored =
      ts &&
      Number.isFinite(ts.contextTime) &&
      Number.isFinite(ts.performanceTime) &&
      ts.performanceTime > 0;
    return {
      audioSeconds: context.currentTime,
      performanceMs: perf(),
      anchor: anchored
        ? {audioSeconds: ts.contextTime, performanceMs: ts.performanceTime}
        : {audioSeconds: context.currentTime, performanceMs: perf()},
      state: context.state,
      clockRevision
    };
  }

  function startVoice(cents, settingsOverride) {
    let cancelled = false,
      voice,
      target = cents;
    const request = revision,
      settings = {...getSettings(), ...settingsOverride};
    const begin = lead => {
      if (cancelled || request !== revision) return;
      voice = createVoice(
        target,
        settings,
        context.currentTime + lead,
        settings.wave === 'sawtooth' ? 0.018 : 0.035,
        LIVE_ATTACK
      );
    };
    // A running context starts the voice in this call, at once; only a new or suspended context
    // waits for resume, with a small lead so its attack cannot start in the past.
    if (context && context.state === 'running') begin(0);
    else
      ready()
        .then(() => begin(0.005))
        .catch(error => {
          if (!cancelled && request === revision) onError(error);
        });
    const release = () => {
      cancelled = true;
      if (voice) fadeVoice(voice, Math.max(context.currentTime, voice.startedAt + 0.06));
    };
    // Glide a held voice to a new pitch without restarting it; a short time constant avoids clicks.
    release.retune = next => {
      if (!Number.isFinite(next)) return;
      target = next;
      const frequency = frequencyFor(next, settings.tonic);
      if (voice && !voice.ended && isAudibleFrequency(frequency))
        voice.oscillator.frequency.setTargetAtTime(frequency, context.currentTime, 0.008);
    };
    return release;
  }

  return {
    stop,
    startVoice,
    prepare,
    scheduleVoices,
    cancelGroup,
    cancelRevision,
    getClockSnapshot,
    /** The audio device's buffering, in ms (null before audio starts). */
    outputLatency: () =>
      context && context.state !== 'closed'
        ? ((context.baseLatency ?? 0) + (context.outputLatency ?? 0)) * 1000
        : null,
    // Audition that leaves a playing composition alone.
    // `settings` ({tonic, wave}) lets a composition audition in its own tuning reference.
    previewChord: (pitches, settings) =>
      playEvents([{pitches, offset: 0.02, duration: 0.7}], 'preview', settings),
    previewSequence: (pitches, settings) =>
      playEvents(
        pitches.map((c, i) => ({pitches: [c], offset: 0.03 + i * 0.15, duration: 0.24})),
        'preview',
        settings
      ),
    playChord: pitches => playEvents([{pitches, offset: 0.02, duration: 0.7}]),
    playSequence: pitches =>
      playEvents(pitches.map((c, i) => ({pitches: [c], offset: 0.03 + i * 0.15, duration: 0.24})))
  };
}
