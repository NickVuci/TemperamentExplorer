import {mappingKey} from './layout-preset-data.mjs';

// Built-in layouts for the built-in temperaments, each fixed data at mode 1 of its target scale. Every
// temperament has a recommended layout first (the highest-scoring layout of the former ranked layout
// search at its default, interval-complete MOS scale: chromatic direction, melodic continuity and the
// playability of the 15-limit JI triads and tetrads), then conventional layouts:
//  - Bosanquet: the board turned so key columns stand upright; the base MOS's large step L rises
//    up-right, its small step s falls down-right, and the chroma L − s goes straight up. The base is
//    the MOS of 5–12 notes per octave whose L is nearest 9/8 (with periods too small for that, the
//    smallest MOS of two or more notes per period).
//  - Wicki-Hayden: rows level; a whole-tone-sized step to the right, the fifth up-right and the
//    fourth (fifth − that step) up-left. Only where that step and the fifth reach every note.
// A conventional layout's target scale is the smallest MOS (at least the default scale, at most 41
// notes per octave, or the default when it is larger) that covers most of the board; keys outside it still play their
// lattice pitch. Its root key is the one nearest the board's centre (key 65) from which every scale degree is on the board.
// They behave like saved layouts that cannot be changed: listed in the Layout dropdown, and the
// recommended layout is used when entering the temperament unless a saved layout is its default.
const KIND_NAMES = {
  recommended: 'Recommended',
  bosanquet: 'Bosanquet',
  'wicki-hayden': 'Wicki-Hayden'
};
const DATA = {
  meantone: {
    context: {
      name: 'Meantone',
      basis: [2, 3, 5],
      rows: [
        [1, 1, 0],
        [0, 1, 4]
      ],
      p: 1200,
      g: 696.6512
    },
    layouts: [
      {
        kind: 'recommended',
        n: 7,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 64,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  dreamtone: {
    context: {
      name: 'Dreamtone',
      basis: [2, 3, 5, 11, 13],
      rows: [
        [1, 1, 0, 4, 10],
        [0, 1, 4, -1, -11]
      ],
      p: 1200,
      g: 690.1826
    },
    layouts: [
      {
        kind: 'recommended',
        n: 19,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 33,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 19,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 50,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  septimal: {
    context: {
      name: 'Septimal meantone',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 1, 0, -3],
        [0, 1, 4, 10]
      ],
      p: 1200,
      g: 696.6562
    },
    layouts: [
      {
        kind: 'recommended',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 64,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porcupine: {
    context: {
      name: 'Porcupine (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, 2, 3],
        [0, -3, -5]
      ],
      p: 1200,
      g: 163.6048949435196
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 8,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 45,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  magic: {
    context: {
      name: 'Magic (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, 0, 2],
        [0, 5, 1]
      ],
      p: 1200,
      g: 380.61879685352966
    },
    layouts: [
      {
        kind: 'recommended',
        n: 13,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 10,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  hanson: {
    context: {
      name: 'Hanson (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, 0, 1],
        [0, 6, 5]
      ],
      p: 1200,
      g: 317.10325531994255
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 34,
        config: {
          base: 11,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porcupine11: {
    context: {
      name: 'Porcupine (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 2, 3, 2, 4],
        [0, -3, -5, 6, -4]
      ],
      p: 1200,
      g: 162.8156
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 8,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 45,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porcupine7: {
    context: {
      name: 'Porcupine (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 2, 3, 2],
        [0, -3, -5, 6]
      ],
      p: 1200,
      g: 162.94930713096676
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 8,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 45,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porkypine: {
    context: {
      name: 'Porkypine (2.3.5.11)',
      basis: [2, 3, 5, 11],
      rows: [
        [1, 2, 3, 4],
        [0, -3, -5, -4]
      ],
      p: 1200,
      g: 163.99507746134103
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 29,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 29,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porcupinefowl: {
    context: {
      name: 'Porcupinefowl (13-limit)',
      basis: [2, 3, 5, 7, 11, 13],
      rows: [
        [1, 2, 3, 2, 4, 4],
        [0, -3, -5, 6, -4, -2]
      ],
      p: 1200,
      g: 162.83139027306274
    },
    layouts: [
      {
        kind: 'recommended',
        n: 15,
        config: {
          base: 8,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 45,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  porcupinefish: {
    context: {
      name: 'Porcupinefish (13-limit)',
      basis: [2, 3, 5, 7, 11, 13],
      rows: [
        [1, 2, 3, 2, 4, 6],
        [0, -3, -5, 6, -4, -17]
      ],
      p: 1200,
      g: 162.34582449342736
    },
    layouts: [
      {
        kind: 'recommended',
        n: 37,
        config: {
          base: 22,
          offset: 0,
          style: 'compressed',
          rotation: 4,
          mirror: false,
          flipHorizontal: false,
          flipVertical: true,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 45,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -3,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  magic7: {
    context: {
      name: 'Magic (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 0, 2, -1],
        [0, 5, 1, 12]
      ],
      p: 1200,
      g: 380.45755240334705
    },
    layouts: [
      {
        kind: 'recommended',
        n: 13,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 10,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  magic11: {
    context: {
      name: 'Magic (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 0, 2, -1, 6],
        [0, 5, 1, 12, -8]
      ],
      p: 1200,
      g: 380.70084777914127
    },
    layouts: [
      {
        kind: 'recommended',
        n: 22,
        config: {
          base: 16,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 10,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  miracle7: {
    context: {
      name: 'Miracle (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 1, 3, 3],
        [0, 6, -7, -2]
      ],
      p: 1200,
      g: 116.675585412639
    },
    layouts: [
      {
        kind: 'recommended',
        n: 21,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  miracle11: {
    context: {
      name: 'Miracle (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 1, 3, 3, 2],
        [0, 6, -7, -2, 15]
      ],
      p: 1200,
      g: 116.64686978015675
    },
    layouts: [
      {
        kind: 'recommended',
        n: 31,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  pajara7: {
    context: {
      name: 'Pajara (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [2, 3, 5, 6],
        [0, 1, -2, -2]
      ],
      p: 600,
      g: 107.34377294696299
    },
    layouts: [
      {
        kind: 'recommended',
        n: 5,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 17,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  pajara11: {
    context: {
      name: 'Pajara (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [2, 3, 5, 6, 8],
        [0, 1, -2, -2, -6]
      ],
      p: 600,
      g: 107.18262864664534
    },
    layouts: [
      {
        kind: 'recommended',
        n: 11,
        config: {
          base: 6,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 17,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  diaschismic: {
    context: {
      name: 'Diaschismic (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [2, 3, 5],
        [0, 1, -2]
      ],
      p: 600,
      g: 104.95848650376078
    },
    layouts: [
      {
        kind: 'recommended',
        n: 5,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 17,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  schismic: {
    context: {
      name: 'Schismic (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, 1, 7],
        [0, 1, -8]
      ],
      p: 1200,
      g: 701.7307720370886
    },
    layouts: [
      {
        kind: 'recommended',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 55,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 64,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  garibaldi: {
    context: {
      name: 'Garibaldi (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 1, 7, 11],
        [0, 1, -8, -14]
      ],
      p: 1200,
      g: 702.077449257893
    },
    layouts: [
      {
        kind: 'recommended',
        n: 17,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 55,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 17,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 51,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  meanpop: {
    context: {
      name: 'Meanpop (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 1, 0, -3, 11],
        [0, 1, 4, 10, -13]
      ],
      p: 1200,
      g: 696.4509356502256
    },
    layouts: [
      {
        kind: 'recommended',
        n: 31,
        config: {
          base: 19,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  huygens: {
    context: {
      name: 'Huygens (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 1, 0, -3, -7],
        [0, 1, 4, 10, 18]
      ],
      p: 1200,
      g: 697.0314718042999
    },
    layouts: [
      {
        kind: 'recommended',
        n: 19,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 4,
          mirror: false,
          flipHorizontal: false,
          flipVertical: true,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 19,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 50,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  mohajira: {
    context: {
      name: 'Mohajira (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 1, 0, 6, 2],
        [0, 2, 8, -11, 5]
      ],
      p: 1200,
      g: 348.49098835640757
    },
    layouts: [
      {
        kind: 'recommended',
        n: 24,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  rastmic: {
    context: {
      name: 'Rastmic (2.3.11)',
      basis: [2, 3, 11],
      rows: [
        [1, 1, 2],
        [0, 2, 5]
      ],
      p: 1200,
      g: 350.54863275099825
    },
    layouts: [
      {
        kind: 'recommended',
        n: 7,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 66,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  mavila: {
    context: {
      name: 'Mavila (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, 1, 4],
        [0, 1, -3]
      ],
      p: 1200,
      g: 679.1113579352327
    },
    layouts: [
      {
        kind: 'recommended',
        n: 7,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 30,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 16,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 62,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  superpyth: {
    context: {
      name: 'Superpyth (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 1, -3, 4],
        [0, 1, 9, -2]
      ],
      p: 1200,
      g: 710.1193267849073
    },
    layouts: [
      {
        kind: 'recommended',
        n: 17,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 27,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 17,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 51,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  archy: {
    context: {
      name: 'Archy (2.3.7)',
      basis: [2, 3, 7],
      rows: [
        [1, 1, 4],
        [0, 1, -2]
      ],
      p: 1200,
      g: 709.3900548647395
    },
    layouts: [
      {
        kind: 'recommended',
        n: 5,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 27,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 12,
        config: {
          base: 7,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 64,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: -1,
          ag: 2,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  augmented: {
    context: {
      name: 'Augmented (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [3, 4, 7],
        [0, 1, 0]
      ],
      p: 400,
      g: 305.0691154305116
    },
    layouts: [
      {
        kind: 'recommended',
        n: 3,
        config: {
          base: 3,
          offset: 0,
          style: 'period',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 13,
        config: {
          base: 3,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  augene: {
    context: {
      name: 'Augene (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [3, 4, 7, 10],
        [0, 1, 0, -2]
      ],
      p: 400,
      g: 309.3248528894082
    },
    layouts: [
      {
        kind: 'recommended',
        n: 5,
        config: {
          base: 5,
          offset: 0,
          style: 'period',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 13,
        config: {
          base: 3,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  diminished: {
    context: {
      name: 'Diminished (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [4, 6, 9],
        [0, 1, 1]
      ],
      p: 300,
      g: 98.26600841023391
    },
    layouts: [
      {
        kind: 'recommended',
        n: 3,
        config: {
          base: 2,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 10,
        config: {
          base: 2,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  diminished7: {
    context: {
      name: 'Diminished (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [4, 6, 9, 11],
        [0, 1, 1, 1]
      ],
      p: 300,
      g: 95.96188211368742
    },
    layouts: [
      {
        kind: 'recommended',
        n: 3,
        config: {
          base: 2,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 10,
        config: {
          base: 2,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  blackwood: {
    context: {
      name: 'Blackwood (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [5, 8, 11],
        [0, 0, 1]
      ],
      p: 240,
      g: 155.1255291693632
    },
    layouts: [
      {
        kind: 'recommended',
        n: 2,
        config: {
          base: 2,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 8,
        config: {
          base: 2,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  injera: {
    context: {
      name: 'Injera (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [2, 3, 4, 5],
        [0, 1, 4, 4]
      ],
      p: 600,
      g: 94.77116937015415
    },
    layouts: [
      {
        kind: 'recommended',
        n: 6,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 19,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  hedgehog: {
    context: {
      name: 'Hedgehog (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [2, 1, 1, 2],
        [0, 3, 5, 5]
      ],
      p: 600,
      g: 435.44833518838766
    },
    layouts: [
      {
        kind: 'recommended',
        n: 11,
        config: {
          base: 7,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 18,
        config: {
          base: 4,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  catakleismic: {
    context: {
      name: 'Catakleismic (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 0, 1, -3],
        [0, 6, 5, 22]
      ],
      p: 1200,
      g: 316.7705416630961
    },
    layouts: [
      {
        kind: 'recommended',
        n: 34,
        config: {
          base: 15,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 34,
        config: {
          base: 11,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  orwell: {
    context: {
      name: 'Orwell (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 0, 3, 1],
        [0, 7, -3, 8]
      ],
      p: 1200,
      g: 271.5097029687143
    },
    layouts: [
      {
        kind: 'recommended',
        n: 22,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  orwell11: {
    context: {
      name: 'Orwell (11-limit)',
      basis: [2, 3, 5, 7, 11],
      rows: [
        [1, 0, 3, 1, 3],
        [0, 7, -3, 8, 2]
      ],
      p: 1200,
      g: 271.4552150051592
    },
    layouts: [
      {
        kind: 'recommended',
        n: 22,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  sensi: {
    context: {
      name: 'Sensi (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, -1, -1, -2],
        [0, 7, 9, 13]
      ],
      p: 1200,
      g: 443.3492721960972
    },
    layouts: [
      {
        kind: 'recommended',
        n: 19,
        config: {
          base: 8,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 27,
        config: {
          base: 8,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  negri: {
    context: {
      name: 'Negri (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 2, 2, 3],
        [0, -4, 3, -2]
      ],
      p: 1200,
      g: 125.43474358685954
    },
    layouts: [
      {
        kind: 'recommended',
        n: 19,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 29,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  semaphore: {
    context: {
      name: 'Semaphore (2.3.7)',
      basis: [2, 3, 7],
      rows: [
        [1, 2, 3],
        [0, -2, -1]
      ],
      p: 1200,
      g: 249.31099076371487
    },
    layouts: [
      {
        kind: 'recommended',
        n: 5,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 29,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'wicki-hayden',
        n: 19,
        config: {
          base: 9,
          offset: 0,
          style: 'manual',
          rotation: 0,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 0,
          outside: true,
          ap: 0,
          ag: 1,
          bp: 1,
          bg: -2,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  slendric: {
    context: {
      name: 'Slendric (2.3.7)',
      basis: [2, 3, 7],
      rows: [
        [1, 1, 3],
        [0, 3, -1]
      ],
      p: 1200,
      g: 233.7473514456023
    },
    layouts: [
      {
        kind: 'recommended',
        n: 11,
        config: {
          base: 5,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 41,
        config: {
          base: 11,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  valentine: {
    context: {
      name: 'Valentine (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, 1, 2, 3],
        [0, 9, 5, -3]
      ],
      p: 1200,
      g: 77.86731237389188
    },
    layouts: [
      {
        kind: 'recommended',
        n: 31,
        config: {
          base: 9,
          offset: 0,
          style: 'bosanquet',
          rotation: 4,
          mirror: false,
          flipHorizontal: false,
          flipVertical: true,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 12,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  myna: {
    context: {
      name: 'Myna (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, -1, 0, 1],
        [0, 10, 9, 7]
      ],
      p: 1200,
      g: 310.0880453798073
    },
    layouts: [
      {
        kind: 'recommended',
        n: 23,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 31,
        config: {
          base: 11,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  wurschmidt: {
    context: {
      name: 'Würschmidt (5-limit)',
      basis: [2, 3, 5],
      rows: [
        [1, -1, 2],
        [0, 8, 1]
      ],
      p: 1200,
      g: 387.77623006910636
    },
    layouts: [
      {
        kind: 'recommended',
        n: 19,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 34,
        config: {
          base: 10,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  hemiwurschmidt: {
    context: {
      name: 'Hemiwürschmidt (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [1, -1, 2, 2],
        [0, 16, 2, 5]
      ],
      p: 1200,
      g: 193.8883373676453
    },
    layouts: [
      {
        kind: 'recommended',
        n: 37,
        config: {
          base: 6,
          offset: 0,
          style: 'bosanquet',
          rotation: 4,
          mirror: false,
          flipHorizontal: false,
          flipVertical: true,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 37,
        config: {
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  ennealimmal: {
    context: {
      name: 'Ennealimmal (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [9, 13, 19, 24],
        [0, 2, 3, 2]
      ],
      p: 133.33333333333334,
      g: 84.32151925315765
    },
    layouts: [
      {
        kind: 'recommended',
        n: 8,
        config: {
          base: 5,
          offset: 0,
          style: 'compressed',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 8,
        config: {
          base: 2,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  },
  compton: {
    context: {
      name: 'Compton (7-limit)',
      basis: [2, 3, 5, 7],
      rows: [
        [12, 19, 27, 32],
        [0, 0, 1, 2]
      ],
      p: 100,
      g: 84.1428822260972
    },
    layouts: [
      {
        kind: 'recommended',
        n: 3,
        config: {
          base: 3,
          offset: 0,
          style: 'period',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: false,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: true,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      },
      {
        kind: 'bosanquet',
        n: 3,
        config: {
          base: 2,
          offset: 0,
          style: 'bosanquet',
          rotation: 2,
          mirror: false,
          flipHorizontal: false,
          flipVertical: false,
          center: 65,
          register: 0,
          deviceRotation: 1,
          outside: true,
          ap: 1,
          ag: 0,
          bp: 0,
          bg: 1,
          periodWrapping: false,
          periodPlacement: null,
          copyPeriodStep: 1,
          registerAlignment: 'scale',
          palette: 'spectrum',
          layerGrowth: 'balanced'
        }
      }
    ]
  }
};

export const BUILTIN_LAYOUTS = Object.freeze(
  Object.entries(DATA).flatMap(([key, {context, layouts}]) =>
    layouts.map(({kind, n, config}) => {
      const name = `${context.name} · ${KIND_NAMES[kind]}`;
      return Object.freeze({
        id: kind === 'recommended' ? `builtin:${key}` : `builtin:${key}:${kind}`,
        name,
        kindName: KIND_NAMES[kind],
        builtin: true,
        state: Object.freeze({
          name,
          context: Object.freeze({...context, n, mode: 0}),
          config: Object.freeze({...config, layerColors: {}, keyColors: {}, degreeColors: {}})
        })
      });
    })
  )
);

/** Built-in layouts for this state's mapping (the same basis and mapping rows), recommended layout first. */
export const builtinLayoutsFor = s =>
  BUILTIN_LAYOUTS.filter(layout => mappingKey(layout.state.context) === mappingKey(s));
