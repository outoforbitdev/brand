import { Resvg } from '@resvg/resvg-js';

/**
 * Renders an SVG to PNG bytes at an exact pixel width.
 *
 * Intended for simplified SVGs that carry only a viewBox (no width/height),
 * so the output size is driven entirely by `width`. The height follows the
 * artwork's aspect ratio, rounded to a whole pixel. Output is deterministic for
 * identical input.
 *
 * @param {string} svg - SVG markup (viewBox only).
 * @param {number} width - Output width in pixels.
 * @returns {Buffer} Encoded PNG bytes.
 */
export function renderPng(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

/**
 * Reads the pixel dimensions from a PNG's IHDR chunk.
 *
 * @param {Buffer} png - Encoded PNG bytes.
 * @returns {{width: number, height: number}}
 */
export function pngDimensions(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
