import {mapRatio} from './engine.mjs';

const PURE_EPSILON = 1e-7;
const COLOR_STOPS = [
  [0, '#fff'],
  [0.006, '#fff'],
  [0.02, '#22c55e'],
  [0.25, '#84cc16'],
  [0.5, '#fde047'],
  [0.75, '#fb923c'],
  [1, '#dc2626']
];

function srgbToLinear(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(value) {
  value = Math.max(0, Math.min(1, value));
  return Math.round(
    255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
  );
}
function hexToOklab(hex) {
  const rgb =
      hex.length === 4
        ? [...hex.slice(1)].map(c => parseInt(c + c, 16))
        : hex
            .slice(1)
            .match(/../g)
            .map(c => parseInt(c, 16)),
    [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ];
}
const LAB_STOPS = COLOR_STOPS.map(([position, color]) => [position, hexToOklab(color)]);

/** Pure intervals are white; errors use a smooth, perceptually even green-yellow-red spectrum. */
export function errorColor(error, maxError) {
  const magnitude = Math.abs(Number(error) || 0);
  if (magnitude <= PURE_EPSILON) return '#fff';
  const maximum = Math.max(PURE_EPSILON, Number(maxError) || 0),
    amount = Math.min(1, magnitude / maximum),
    index = Math.min(
      LAB_STOPS.length - 2,
      Math.max(0, LAB_STOPS.findIndex(([position]) => position >= amount) - 1)
    ),
    [start, a] = LAB_STOPS[index],
    [end, b] = LAB_STOPS[index + 1],
    mix = (amount - start) / (end - start),
    lab = a.map((value, i) => value + (b[i] - value) * mix);
  return `rgb(${oklabToRgb(lab).join(', ')})`;
}

export function maximumMappedTargetError(s, targets) {
  let maximum = 0;
  for (const t of targets) {
    const m = mapRatio(t.n, t.d, s);
    if (m) maximum = Math.max(maximum, Math.abs(m[0] * s.p + m[1] * s.g - t.c));
  }
  return maximum;
}
