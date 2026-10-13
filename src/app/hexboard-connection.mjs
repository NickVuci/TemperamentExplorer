// The physical HexBoard (Web MIDI, delegated control): its keys press the on-screen board that is
// showing, and its lights follow the layout, highlights and held keys. The header shows the
// connection, a key-to-sound latency probe and the LED brightness, which this browser remembers.
import {createHexboardDevice} from '../hexboard/hexboard-device.mjs';
import {createHexboardSync, clampBrightness} from '../hexboard/hexboard-sync.mjs';

const BRIGHTNESS_KEY = 'temperament-lab-hexboard-brightness';

/**
 * deps: `pressKey(index, t)`, `releaseKey(index)` and `getSnapshot()` for the board that is
 * showing, `audio` (the audio engine), `onEncoderPress()`, `notify(message)` and optional
 * `document` and `storage`.
 */
export function createHexboardConnection(deps) {
  const doc = () => deps.document ?? globalThis.document,
    $ = selector => doc().querySelector(selector),
    storage = () => deps.storage ?? globalThis.localStorage;
  let connectedName = '',
    probeTimer = null;

  const device = createHexboardDevice({
    onKey: (index, down, t) => {
      if (down) {
        sync.keyDown(index, t);
        scheduleProbe();
      } else sync.keyUp(index);
    },
    onEncoder: event => {
      if (event === 'press') deps.onEncoderPress();
    },
    onStatus: (status, detail) => showStatus(status, detail)
  });
  const sync = createHexboardSync({
    device,
    pressKey: (index, t) => deps.pressKey(index, t),
    releaseKey: index => deps.releaseKey(index),
    getSnapshot: () => deps.getSnapshot(),
    startVoice: c => deps.audio.startVoice(c)
  });

  function showBrightness(value) {
    const input = $('#hexboard-brightness'),
      out = $('#hexboard-brightness-value'),
      percent = Math.round(value * 100);
    if (input) input.value = String(percent);
    if (out) out.textContent = `${percent}%`;
  }

  // The board's key-to-sound time inside the app, and the audio device's own buffering.
  function connectedText() {
    const delay = sync.inputDelay(),
      output = deps.audio.outputLatency();
    const probe =
      delay === null
        ? ''
        : ` · key to sound ${delay.toFixed(1)} ms in the app${output === null ? '' : ` + ${output.toFixed(0)} ms audio output`}`;
    return `HexBoard connected${connectedName ? ': ' + connectedName : ''}${probe}`;
  }

  function scheduleProbe() {
    if (probeTimer) return;
    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (!device.connected) return;
      const text = $('#hexboard-status');
      if (text) {
        text.textContent = connectedText();
        text.title = text.textContent;
      }
    }, 400);
  }

  function showStatus(status, detail = {}) {
    const button = $('#hexboard-connect'),
      text = $('#hexboard-status');
    button.textContent = status === 'connected' ? 'Disconnect HexBoard' : 'Connect HexBoard';
    button.disabled = status === 'connecting';
    if (status === 'connected') connectedName = detail.name ?? '';
    const message =
      status === 'connected'
        ? connectedText()
        : status === 'connecting'
          ? 'Connecting…'
          : status === 'error'
            ? detail.message
            : detail.reason === 'unplugged'
              ? 'HexBoard unplugged'
              : '';
    text.textContent = message;
    text.title = message;
    const brightness = $('.hexboard-brightness');
    if (brightness) brightness.hidden = status !== 'connected';
    if (status === 'connected') sync.start();
    else {
      sync.stop();
      if (status === 'disconnected') sync.releaseAll();
      if (status === 'error') deps.notify(message);
    }
  }

  {
    let saved = null;
    try {
      saved = storage()?.getItem(BRIGHTNESS_KEY);
    } catch {}
    showBrightness(sync.setBrightness(saved === null ? 1 : clampBrightness(Number(saved) / 100)));
  }
  $('#hexboard-brightness').oninput = e => {
    const value = sync.setBrightness(Number(e.target.value) / 100);
    showBrightness(value);
    try {
      storage()?.setItem(BRIGHTNESS_KEY, String(Math.round(value * 100)));
    } catch {}
  };
  $('#hexboard-connect').onclick = async () => {
    if (device.connected) {
      sync.releaseAll();
      device.disconnect();
      return;
    }
    void deps.audio.prepare().catch(() => {});
    await device.connect();
  };

  return {
    device,
    sync,
    /** Lets go of every held key and closes the connection. */
    release() {
      sync.releaseAll();
      device.disconnect();
    }
  };
}
