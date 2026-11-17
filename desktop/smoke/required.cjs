// Smoke steps fail with a named reason, not a TypeError, when the engine state
// lacks something a later step depends on.
/**
 * @template T
 * @param {T | null | undefined} value
 * @param {string} what
 * @returns {T}
 */
function required(value, what) {
  if (value === null || value === undefined)
    throw new Error(`Smoke state is missing ${what}`);
  return value;
}
module.exports = { required };
