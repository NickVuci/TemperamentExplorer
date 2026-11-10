import {queryCatalogue, hasInterpretation} from '../../src/harmonic/harmonic-catalogue.mjs';

/** Finds a catalogue entry by id or interpretation in a result, or queries one direct input. */
export async function getHarmonicEntry(queryOrResult, idOrInput) {
  if (queryOrResult?.version === 1 && Array.isArray(queryOrResult.items))
    return (
      queryOrResult.items.find(
        item => item.id === idOrInput || hasInterpretation(item, idOrInput)
      ) ?? null
    );
  const result = await queryCatalogue({
    ...queryOrResult,
    categories: [],
    directInputs: [idOrInput],
    cursor: null
  });
  return result.items[0] ?? null;
}
