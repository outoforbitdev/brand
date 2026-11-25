import { Resvg } from '@resvg/resvg-js';

/**
 * Renders an SVG to PNG bytes at an exact pixel width.
 *
 * Intended for simplified SVGs that carry only a viewBox (no width/height),
 * so the output size is driven entirely by `size`. Square artwork yields a
 * square image. Output is deterministic for identical input.
 *
 * @param {string} svg - SVG markup (viewBox only).
 * @param {number} size - Output width in pixels.
 * @returns {Buffer} Encoded PNG bytes.
 */
export function renderPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
