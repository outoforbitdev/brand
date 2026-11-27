import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifySvg } from './svg.js';
import { pngDimensions, renderPng } from './png.js';

const tiny = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>';
const logo = simplifySvg(readFileSync(new URL('../../src/ood_logo/ood_logo.svg', import.meta.url), 'utf8'));

test('renderPng returns PNG signature', () => {
  const png = renderPng(tiny, 16);
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

for (const size of [16, 512]) {
  test(`renderPng outputs a ${size}px square for tiny svg`, () => {
    assert.deepEqual(pngDimensions(renderPng(tiny, size)), { width: size, height: size });
  });
  test(`renderPng outputs a ${size}px square for the simplified logo`, () => {
    assert.deepEqual(pngDimensions(renderPng(logo, size)), { width: size, height: size });
  });
}

test('renderPng takes the height from the aspect ratio', () => {
  const shape = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"></svg>`;
  assert.deepEqual(pngDimensions(renderPng(shape(20, 10), 24)), { width: 24, height: 12 });
  assert.deepEqual(pngDimensions(renderPng(shape(10, 20), 24)), { width: 24, height: 48 });
});

test('renderPng is deterministic', () => {
  assert.ok(renderPng(logo, 64).equals(renderPng(logo, 64)));
  assert.ok(renderPng(tiny, 64).equals(renderPng(tiny, 64)));
});
