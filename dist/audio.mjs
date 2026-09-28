// One context and one voice lifecycle for all app playback.
// The caller owns UI selection/highlighting; this module owns sound only.
export const MIN_FREQUENCY = 15;
export const MAX_FREQUENCY = 16000;
export const frequencyFor = (cents, tonic = 220) => tonic * 2 ** (cents / 1200);
export const isAudibleFrequency = frequency => Number.isFinite(frequency) && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY;

export function createAudioEngine({
  getSettings = () => ({tonic:220, wave:'triangle'}),
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  onError = () => {},
} = {}) {
  let context, revision = 0;
  const voices = new Set();

  async function ready() {
    if (!context || context.state === 'closed') context = createContext();
    await context.resume();
    return context;
  }

  function createVoice(cents, settings, at, volume, attack, duration) {
    const frequency = frequencyFor(cents, settings.tonic);
    if (!isAudibleFrequency(frequency)) return null;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = settings.wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + attack);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const voice = {oscillator, gain, volume, startedAt:at, released:false};
    voices.add(voice);
    oscillator.onended = () => {
      voices.delete(voice);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    if (duration !== undefined) oscillator.stop(at + duration + .03);
    return voice;
  }

  function stop() {
    revision++; // Invalidates playback still awaiting resume().
    for (const voice of voices) {
      voice.released = true;
      try { voice.oscillator.stop(); } catch {}
    }
  }

  async function playEvents(events) {
    stop();
    const request = revision, settings = {...getSettings()};
    try {
      await ready();
      if (request !== revision) return false;
      const now = context.currentTime;
      for (const {pitches, offset, duration} of events) {
        const volume = (settings.wave === 'sawtooth' ? .06 : .14) / Math.sqrt(pitches.length);
        for (const cents of pitches) createVoice(cents, settings, now + offset, volume, .018, duration);
      }
      return true;
    } catch (error) {
      if (request === revision) { stop(); onError(error); }
      return false;
    }
  }

  function releaseVoice(voice) {
    if (!voice || voice.released) return;
    voice.released = true;
    // A quick mouse click can end before the first audio quantum. Keep a
    // short audible gate, then release normally; Stop still stops immediately.
    const now = Math.max(context.currentTime, voice.startedAt + .06), param = voice.gain.gain;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(voice.volume, now);
    }
    param.linearRampToValueAtTime(0, now + .035);
    voice.oscillator.stop(now + .04);
  }

  function startVoice(cents) {
    let cancelled = false, voice;
    const request = revision, settings = {...getSettings()};
    ready().then(() => {
      if (cancelled || request !== revision) return;
      voice = createVoice(cents, settings, context.currentTime, settings.wave === 'sawtooth' ? .018 : .035, .012);
    }).catch(error => { if (!cancelled && request === revision) onError(error); });
    return () => { cancelled = true; releaseVoice(voice); };
  }

  return {
    stop, startVoice,
    playChord: pitches => playEvents([{pitches, offset:.02, duration:.7}]),
    playSequence: pitches => playEvents(pitches.map((c,i) => ({pitches:[c], offset:.03+i*.15, duration:.24}))),
  };
}
