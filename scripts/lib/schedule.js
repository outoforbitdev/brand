/**
 * Seasonal variant selection. Dates are 'MM-DD' strings compared lexically,
 * which is chronological within a year. Windows are inclusive and may wrap
 * around the new year when `from > to`.
 */

/**
 * Format a date as 'MM-DD' in UTC.
 * @param {Date} date
 * @returns {string}
 */
export function monthDayUtc(date) {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${m}-${d}`;
}

/**
 * Whether a 'MM-DD' falls in an inclusive window, with wrap-around.
 * @param {string} monthDay
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function inWindow(monthDay, from, to) {
  if (from <= to) return monthDay >= from && monthDay <= to;
  return monthDay >= from || monthDay <= to;
}

/**
 * Whether two windows share at least one day. Two windows overlap exactly
 * when either contains the other's start.
 * @param {{from: string, to: string}} a
 * @param {{from: string, to: string}} b
 * @returns {boolean}
 */
export function windowsOverlap(a, b) {
  return inWindow(a.from, b.from, b.to) || inWindow(b.from, a.from, a.to);
}

/**
 * Choose the variant for a day: the first scheduled window containing it,
 * otherwise the alias default.
 * @param {{default: string, schedule?: {variant: string, from: string, to: string}[]}} alias
 * @param {string} monthDay
 * @returns {string}
 */
export function pickVariant(alias, monthDay) {
  const hit = (alias.schedule ?? []).find((w) =>
    inWindow(monthDay, w.from, w.to),
  );
  return hit ? hit.variant : alias.default;
}
