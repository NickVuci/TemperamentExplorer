// The six sample compositions in examples/compositions, offered on Compose's start screen. Each is
// read only when chosen, so the files stay out of the app's start-up work.
export const SAMPLES = Object.freeze([
  {
    name: 'Clockwork',
    tuning: '12 EDO',
    meter: '4/4',
    load: () =>
      import('../../examples/compositions/01-clockwork-12edo.composition.json', {
        with: {type: 'json'}
      })
  },
  {
    name: 'Lantern Waltz',
    tuning: 'Meantone · Bosanquet',
    meter: '3/4',
    load: () =>
      import('../../examples/compositions/02-lantern-waltz-meantone-bosanquet.composition.json', {
        with: {type: 'json'}
      })
  },
  {
    name: 'Lantern Waltz',
    tuning: 'Meantone · Wicki-Hayden',
    meter: '3/4',
    load: () =>
      import(
        '../../examples/compositions/03-lantern-waltz-meantone-wicki-hayden.composition.json',
        {
          with: {type: 'json'}
        }
      )
  },
  {
    name: 'Seven Quills',
    tuning: 'Porcupine',
    meter: '7/8',
    load: () =>
      import('../../examples/compositions/04-seven-quills-porcupine.composition.json', {
        with: {type: 'json'}
      })
  },
  {
    name: 'Glass Harbor',
    tuning: 'Magic',
    meter: '6/8',
    load: () =>
      import('../../examples/compositions/05-glass-harbor-magic.composition.json', {
        with: {type: 'json'}
      })
  },
  {
    name: 'Half-Octave Mirrors',
    tuning: 'Pajara',
    meter: '5/4',
    load: () =>
      import('../../examples/compositions/06-half-octave-mirrors-pajara.composition.json', {
        with: {type: 'json'}
      })
  }
]);

/** The sample's file as text, ready for the composition opener. */
export async function sampleText(index) {
  const sample = SAMPLES[index];
  if (!sample) throw Error('No such sample composition.');
  const module = await sample.load();
  return JSON.stringify(module.default);
}
