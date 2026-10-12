// A browser-like page for behavior tests: the real index.html in a jsdom window, with the
// window's DOM globals installed so the app modules run unchanged under Node.
import {readFileSync} from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const indexHtml = () => readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8');
const styleCss = () => readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');

/** A detached document for structural checks of static markup. Scripts do not run. */
export function parseHtml(html = indexHtml()) {
  return new JSDOM(html, {url: 'http://localhost/', virtualConsole: new VirtualConsole()}).window
    .document;
}

// Names the app reads from the global scope. Node already defines some (navigator, performance,
// structuredClone, …); those that belong to the page are replaced with the window's.
const pageGlobals = new Set([
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'innerWidth',
  'innerHeight',
  'Event',
  'CustomEvent',
  'EventTarget',
  'Blob',
  'File',
  'URL'
]);

export function installPage(window) {
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis && !pageGlobals.has(key)) continue;
    let value;
    try {
      value = window[key];
    } catch {
      continue;
    }
    if (value === undefined) continue;
    Object.defineProperty(globalThis, key, {
      value: typeof value === 'function' && /^[a-z]/.test(key) ? value.bind(window) : value,
      configurable: true,
      writable: true
    });
  }
  Object.defineProperty(globalThis, 'window', {value: window, configurable: true, writable: true});
}

// jsdom has no layout, observers or media queries; the app only needs them to exist.
function addMissingBrowserApis(window, downloads) {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= query => ({
    media: query,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {}
  });
  window.document.elementFromPoint ??= () => null;
  window.Element.prototype.scrollIntoView ??= function () {};
  if (!window.PointerEvent)
    window.PointerEvent = class extends window.MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    };
  // Downloads: the app builds a Blob URL and clicks a temporary link.
  const blobs = new Map();
  window.URL.createObjectURL = blob => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = () => {};
  const click = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download && blobs.has(this.href))
      downloads.push({name: this.download, blob: blobs.get(this.href)});
    else click.call(this);
  };
}

/** A silent Web Audio stand-in that records every oscillator the app starts. */
export function fakeAudio() {
  const started = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    setValueCurveAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {}
  });
  const node = extra => ({connect() {}, disconnect() {}, ...extra});
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = node();
    outputLatency = 0;
    baseLatency = 0;
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createGain() {
      return node({gain: param()});
    }
    createDynamicsCompressor() {
      return node({
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param()
      });
    }
    createWaveShaper() {
      return node({curve: null, oversample: 'none'});
    }
    createOscillator() {
      const oscillator = node({
        type: 'sine',
        frequency: param(),
        detune: param(),
        onended: null,
        start() {
          started.push(oscillator);
        },
        stop() {}
      });
      return oscillator;
    }
  }
  return {AudioContext: FakeAudioContext, started};
}

/**
 * Boots src/app.mjs once in this process against a fresh page. Returns helpers that drive the
 * page the way a user would.
 */
export async function bootApp({html = indexHtml(), url = 'http://localhost/'} = {}) {
  const errors = [],
    downloads = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const {window} = new JSDOM(html, {url, pretendToBeVisual: true, virtualConsole});
  addMissingBrowserApis(window, downloads);
  installPage(window);
  const audio = fakeAudio();
  window.AudioContext = globalThis.AudioContext = audio.AudioContext;
  window.addEventListener('error', event => errors.push(event.error ?? event.message));
  const {document} = window;
  await import('../../src/app.mjs');
  const page = {
    window,
    document,
    audio,
    errors,
    downloads,
    $: selector => document.querySelector(selector),
    $$: selector => [...document.querySelectorAll(selector)],
    /** Lets queued tasks and timers run. */
    async settle(rounds = 3) {
      for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 0));
    },
    async until(predicate, {timeout = 10000, message = 'condition'} = {}) {
      const deadline = Date.now() + timeout;
      while (!predicate()) {
        if (Date.now() > deadline) throw Error(`Timed out waiting for ${message}.`);
        await new Promise(resolve => setImmediate(resolve));
      }
    },
    element(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) throw Error(`No element ${target}.`);
      return el;
    },
    click(target, init = {}) {
      const el = page.element(target);
      el.dispatchEvent(
        new window.MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ...init})
      );
      return el;
    },
    change(target, value) {
      const el = page.element(target);
      if (value !== undefined) {
        if (el.type === 'checkbox') el.checked = value;
        else el.value = String(value);
      }
      el.dispatchEvent(new window.Event('change', {bubbles: true}));
      return el;
    },
    input(target, value) {
      const el = page.element(target);
      if (value !== undefined) el.value = String(value);
      el.dispatchEvent(new window.Event('input', {bubbles: true}));
      return el;
    },
    pointer(target, type, init = {}) {
      const el = page.element(target);
      el.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pointerId: 1,
          pointerType: 'mouse',
          ...init
        })
      );
      return el;
    },
    key(target, key, init = {}) {
      const el = page.element(target);
      el.dispatchEvent(
        new window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init})
      );
      return el;
    },
    /** Picks a built-in temperament from the temperament chooser. */
    chooseTemperament(key) {
      return page.change('[data-saved-preset="0"]', `builtin:${key}`);
    },
    /** Switches section through its tab, as a user would. */
    section(name) {
      return page.click(`#tab-${name}`);
    },
    /** The text of the most recent download whose file name matches. */
    async downloaded(pattern) {
      const file = downloads.findLast(item => pattern.test(item.name));
      if (!file) throw Error(`No download matching ${pattern}.`);
      return file.blob.text();
    },
    /**
     * Ends the test process. The app keeps background work (catalogue jobs, timers) that would
     * otherwise keep the process alive or run against a closed page; each suite is its own process.
     */
    async close() {
      await page.settle();
      process.exit(process.exitCode ?? 0);
    }
  };
  await page.settle();
  return page;
}

/** Parsed style rules, so tests check declarations rather than the stylesheet's formatting. */
export function cssRules(css = styleCss()) {
  const {document} = new JSDOM('<!doctype html><head></head>', {
    virtualConsole: new VirtualConsole()
  }).window;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const rules = [];
  const visit = (list, media) => {
    for (const rule of list) {
      if (rule.selectorText !== undefined)
        rules.push({selector: rule.selectorText, media, style: rule.style, cssText: rule.cssText});
      else if (rule.cssRules)
        visit(rule.cssRules, rule.conditionText ?? rule.media?.mediaText ?? media);
    }
  };
  visit(style.sheet.cssRules, null);
  const normalize = selector =>
    selector
      .replace(/\s+/g, ' ')
      .replace(/\s*([>,+~])\s*/g, '$1')
      .trim();
  return {
    rules,
    /**
     * Every rule whose selector list includes this selector. `media` limits the search to rules
     * inside a matching media query, or with null to rules outside any media query.
     */
    find(selector, {media} = {}) {
      const want = normalize(selector);
      return rules.filter(
        rule =>
          normalize(rule.selector)
            .split(',')
            .some(part => part === want) &&
          (media === undefined ||
            (media === null
              ? rule.media === null
              : (rule.media ?? '').replace(/\s+/g, ' ').includes(media)))
      );
    },
    /** The last value the cascade gives a property for this selector, by source order. */
    value(selector, property, options) {
      const found = this.find(selector, options)
        .map(rule => rule.style.getPropertyValue(property))
        .filter(Boolean);
      return found.at(-1) ?? '';
    }
  };
}
