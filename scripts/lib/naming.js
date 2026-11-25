/**
 * Asset naming rules and output file name construction.
 */

const NAME_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Whether a name is lowercase snake_case: letters and digits separated by
 * single underscores.
 * @param {string} name
 * @returns {boolean}
 */
export function isValidAssetName(name) {
  return typeof name === 'string' && NAME_PATTERN.test(name);
}

/**
 * Build an output file name, e.g. `ood_logo-24x24.png` or `ood_logo.svg`.
 * @param {string} name Asset name.
 * @param {'svg'|'png'} ext File extension.
 * @param {number} [size] Pixel size, required for raster output.
 * @returns {string}
 */
export function outputFileName(name, ext, size) {
  if (ext === 'svg') return `${name}.svg`;
  return `${name}-${size}x${size}.${ext}`;
}
