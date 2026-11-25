import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifySvg } from './svg.js';
import { renderPng } from './png.js';

const tiny = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>';
const logo = simplifySvg(readFileSync(new URL('../../src/ood_logo/ood_logo.svg', import.meta.url), 'utf8'));

/** Reads the IHDR width and height from PNG bytes. */
const dims = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test('renderPng returns PNG signature', () => {
  const png = renderPng(tiny, 16);
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

for (const size of [16, 512]) {
  test(`renderPng outputs a ${size}px square for tiny svg`, () => {
    assert.deepEqual(dims(renderPng(tiny, size)), { width: size, height: size });
  });
  test(`renderPng outputs a ${size}px square for the simplified logo`, () => {
    assert.deepEqual(dims(renderPng(logo, size)), { width: size, height: size });
  });
}

test('renderPng is deterministic', () => {
  assert.ok(renderPng(logo, 64).equals(renderPng(logo, 64)));
  assert.ok(renderPng(tiny, 64).equals(renderPng(tiny, 64)));
});
