import { optimize } from 'svgo';
import { Resvg } from '@resvg/resvg-js';
import config from '../svgo.config.js';

/**
 * Simplifies an SVG for publishing using the shared SVGO config.
 *
 * @param {string} svg - Source SVG markup.
 * @returns {string} Optimized SVG markup.
 */
export function simplifySvg(svg) {
  return optimize(svg, config).data;
}

/**
 * Removes width and height attributes from the root svg element so that
 * rendering is driven purely by the viewBox.
 *
 * Without this, an mm-sized source is first rounded to a whole pixel size
 * (for example 88.95mm to 336px) and then scaled, which shifts edge
 * antialiasing relative to a viewBox-only render of the same artwork.
 *
 * @param {string} svg - SVG markup.
 * @returns {string} SVG markup with the root width/height removed.
 */
function stripRootDimensions(svg) {
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, ''),
  );
}

/**
 * Rasterizes an SVG to raw RGBA pixels at a fixed width.
 *
 * The width is set explicitly (fitTo) so original and simplified render at
 * the same pixel size even when only one carries mm width/height.
 *
 * @param {string} svg - SVG markup.
 * @param {number} size - Render width in pixels.
 * @returns {{pixels: Uint8Array, width: number, height: number}} Decoded image.
 */
function rasterize(svg, size) {
  const image = new Resvg(stripRootDimensions(svg), { fitTo: { mode: 'width', value: size } }).render();
  return { pixels: image.pixels, width: image.width, height: image.height };
}

/**
 * Asserts two SVGs render to the same image within a per-channel tolerance.
 *
 * @param {string} original - Original SVG markup.
 * @param {string} simplified - Simplified SVG markup.
 * @param {{size?: number, tolerance?: number}} [opts] - Render width (default 512)
 *   and maximum allowed per-channel difference (default 2).
 * @throws {Error} Naming the first differing pixel, or on a size mismatch.
 */
export function assertVisuallyEqual(original, simplified, opts = {}) {
  const { size = 512, tolerance = 2 } = opts;
  const a = rasterize(original, size);
  const b = rasterize(simplified, size);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Rendered size differs: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
  for (let i = 0; i < a.pixels.length; i++) {
    if (Math.abs(a.pixels[i] - b.pixels[i]) > tolerance) {
      const px = Math.floor(i / 4);
      const x = px % a.width;
      const y = Math.floor(px / a.width);
      throw new Error(
        `Renders differ at pixel (${x}, ${y}) channel ${i % 4}: ${a.pixels[i]} vs ${b.pixels[i]}`,
      );
    }
  }
}
