// The shared JI settings that Discover and Play read: odd limit, prime filter, tolerance, cell
// labels and target filter, resolved from the shared controls for a temperament. Dependencies are
// read when used, so workspaces created later can be passed as getters.
import {parsePrimeFilterInput, validateJILimits} from '../core/ji-limit-engine.mjs';
import {targets} from '../core/engine.mjs';
import {maximumMappedTargetError} from '../core/ji-error-color.mjs';
import {maximumDiamondError} from '../diamond/tonality-diamond.mjs';
import {allTargets} from './matrix-view.mjs';

/**
 * deps: `$` (finds a shared control), `getState()`, `getDiamondScope()`, `getManualTolerance()`
 * (null when automatic) and `diamondLayout()`.
 */
export function createJISettings(deps) {
  const {$} = deps;
  // The prime filter control shows the basis itself when it follows the basis.
  const primeSelection = () => {
    const input = $('#primeLimit');
    return input.value === input.dataset?.basisValue ? 'basis' : input.value;
  };

  /** Odd limit and prime filter for a temperament. Throws for limits out of range. */
  function coverage(s) {
    const limit =
        $('#limit').value === 'basis' ? Math.max(3, ...s.basis) : Number($('#limit').value),
      primeLimitSelection = primeSelection(),
      primeLimit = parsePrimeFilterInput(primeLimitSelection, s.basis);
    validateJILimits({oddLimit: limit, primeLimit});
    return {limit, primeLimit, primeLimitSelection};
  }

  /** The largest error among the current temperament's mapped targets and diamond cells. */
  function automaticTolerance() {
    const s = deps.getState(),
      {limit, primeLimit} = coverage(s),
      cfg = {limit, primeLimit},
      ts = allTargets(targets(limit, primeLimit), s, cfg);
    return Math.max(
      maximumMappedTargetError(s, ts),
      maximumDiamondError(s, {
        ...cfg,
        scope: deps.getDiamondScope(),
        diamondLayout: deps.diamondLayout(),
        filter: $('#targetfilter').value,
        outside: true
      })
    );
  }

  /** The full settings for a temperament; also publishes the active tolerance to its control. */
  function current(s = deps.getState()) {
    const cfg = coverage(s),
      autoTolerance = automaticTolerance(),
      manual = deps.getManualTolerance(),
      tol = manual ?? autoTolerance;
    $('#tolerance').value = String(tol);
    return {
      ...cfg,
      layout: $('#layout').value,
      labels: $('#labels').value,
      ts: targets(cfg.limit, cfg.primeLimit),
      tol,
      maxError: tol,
      autoTolerance,
      toleranceAutomatic: manual === null,
      filter: $('#targetfilter').value,
      outside: true
    };
  }

  return {coverage, automaticTolerance, current};
}
