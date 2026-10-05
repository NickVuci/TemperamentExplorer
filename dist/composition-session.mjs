// Whole-app session envelope rules for compositions.
// A save with no composition stays `temperament-lab-v1`, so existing sessions and older
// apps are unaffected. A save that contains a composition is `temperament-lab-v2`; this
// loader accepts both, and an older app rejects v2 rather than silently dropping the piece.
import {parseProject} from './composition-project.mjs';

export const SESSION_V1='temperament-lab-v1';
export const SESSION_V2='temperament-lab-v2';

export const isSessionFormat=format=>format===SESSION_V1||format===SESSION_V2;
export const sessionFormat=project=>project?SESSION_V2:SESSION_V1;
export const compositionForSave=project=>project?{composition:project}:{};

/**
 * The composition inside a loaded session, validated as a candidate before the caller
 * changes anything else. Returns null when there is none (v1 files, or v2 without one).
 * Throws a descriptive Error if a present composition is invalid.
 */
export function compositionFromSession(data){
  if(data?.format!==SESSION_V2||data.composition==null)return null;
  return parseProject(data.composition);
}
