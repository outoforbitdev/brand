/**
 * SVGO configuration for published brand SVGs.
 *
 * Keeps the viewBox, drops fixed width/height (e.g. Inkscape mm sizes) and
 * strips editor metadata, comments and unused ids.
 *
 * @type {import('svgo').Config}
 */
export default {
  multipass: true,
  plugins: [
    // removeViewBox is not part of preset-default in svgo 4, so the viewBox is kept.
    // floatPrecision 6 (svgo default is 3) keeps geometry rounding below the
    // visual-equality tolerance on real artwork such as the ood logo.
    { name: 'preset-default', params: { floatPrecision: 6 } },
    'removeDimensions',
    'removeEditorsNSData',
  ],
};
