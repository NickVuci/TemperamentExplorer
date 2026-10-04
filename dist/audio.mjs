// One context and one voice lifecycle for all app playback.
// The caller owns UI selection/highlighting; this module owns sound only.
export const MIN_FREQUENCY = 15;
export const MAX_FREQUENCY = 16000;
export const frequencyFor = (cents, tonic = 220) => tonic * 2 ** (cents / 1200);
export const isAudibleFrequency = frequency => Number.isFinite(frequency) && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY;

const RELEASE = .06, STOP_MARGIN = .01;
// Smooth endpoints avoid a sudden change in envelope slope at note-off.
const fadeOut = Float32Array.from({length:129},(_,i)=>(1+Math.cos(Math.PI*i/128))/2);
// Input attenuation expands the shaper's input range to +/-4. Ordinary signals
// pass through unchanged; excessive polyphony approaches +/-0.95 smoothly.
export const outputCurve = Float32Array.from({length:32769},(_,i)=>{
  const x=(i/32768*2-1)*4,a=Math.abs(x);
  return a<=.6?x:Math.sign(x)*(.6+.35*Math.tanh((a-.6)/.35));
});

export function createAudioEngine({
  getSettings = () => ({tonic:220, wave:'triangle'}),
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)({latencyHint:'interactive'}),
  onError = () => {},
} = {}) {
  let context, output, revision = 0;
  const voices = new Set();

  async function ready() {
    if (!context || context.state === 'closed') {
      context = createContext();
      const input=context.createGain(), protector=context.createWaveShaper();
      input.gain.value=.25;protector.curve=outputCurve;
      input.connect(protector);protector.connect(context.destination);output=input;
    }
    if (context.state !== 'running') await context.resume();
    return context;
  }

  function createVoice(cents, settings, at, volume, attack, duration) {
    const frequency = frequencyFor(cents, settings.tonic);
    if (!isAudibleFrequency(frequency)) return null;
    const oscillator=context.createOscillator(), gain=context.createGain(), gate=context.createGain();
    oscillator.type=settings.wave;
    oscillator.frequency.value=frequency;
    // Initialise to silence even if node construction spans a render quantum.
    gain.gain.value=0;
    gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(volume,at+attack);
    if(duration!==undefined)gain.gain.exponentialRampToValueAtTime(.001,at+duration);
    gate.gain.value=1;
    oscillator.connect(gain);gain.connect(gate);gate.connect(output);
    const voice={oscillator,gain,gate,startedAt:at,releaseAt:null,ended:false};
    voices.add(voice);
    oscillator.onended=()=>{
      voice.ended=true;voices.delete(voice);
      oscillator.disconnect();gain.disconnect();gate.disconnect();
    };
    oscillator.start(at);
    // Natural endings and interrupted notes use the same independent fade.
    if(duration!==undefined)fadeVoice(voice,at+duration);
    return voice;
  }

  function fadeVoice(voice,at){
    if(!voice||voice.ended)return;
    // Already fading: leave it alone. An earlier Stop can replace a future
    // release because its curve has not started; no active automation is cut.
    if(voice.releaseAt!==null){
      if(voice.releaseAt<=at)return;
      voice.gate.gain.cancelScheduledValues(voice.releaseAt);
    }
    voice.releaseAt=at;
    voice.gate.gain.setValueCurveAtTime(fadeOut,at,RELEASE);
    voice.oscillator.stop(at+RELEASE+STOP_MARGIN);
  }

  function stop(){
    revision++;
    if(!context)return;
    for(const voice of voices){
      if(voice.startedAt>context.currentTime){
        // Future sequence notes never start; their gain is still zero.
        voice.gate.gain.cancelScheduledValues(voice.releaseAt??context.currentTime);
        voice.gate.gain.setValueAtTime(0,context.currentTime);
        voice.releaseAt=context.currentTime;
        voice.oscillator.stop(context.currentTime);
      }else fadeVoice(voice,context.currentTime);
    }
  }

  async function playEvents(events){
    stop();
    const request=revision,settings={...getSettings()};
    try{
      await ready();
      if(request!==revision)return false;
      const now=context.currentTime;
      for(const {pitches,offset,duration} of events){
        const volume=(settings.wave==='sawtooth'?.06:.14)/Math.sqrt(pitches.length);
        for(const cents of pitches)createVoice(cents,settings,now+offset,volume,.018,duration);
      }
      return true;
    }catch(error){
      if(request===revision){stop();onError(error);}
      return false;
    }
  }

  function startVoice(cents){
    let cancelled=false,voice;
    const request=revision,settings={...getSettings()};
    ready().then(()=>{
      if(cancelled||request!==revision)return;
      // A small scheduling lead prevents an attack from starting in the past
      // if UI work and node construction cross an audio render quantum.
      voice=createVoice(cents,settings,context.currentTime+.005,settings.wave==='sawtooth'?.018:.035,.012);
    }).catch(error=>{if(!cancelled&&request===revision)onError(error);});
    return ()=>{
      cancelled=true;
      if(voice)fadeVoice(voice,Math.max(context.currentTime,voice.startedAt+.06));
    };
  }

  return {
    stop,startVoice,
    playChord:pitches=>playEvents([{pitches,offset:.02,duration:.7}]),
    playSequence:pitches=>playEvents(pitches.map((c,i)=>({pitches:[c],offset:.03+i*.15,duration:.24}))),
  };
}
