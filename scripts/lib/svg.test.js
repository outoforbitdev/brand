import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifySvg, assertVisuallyEqual } from './svg.js';

const fixture = readFileSync(new URL('./fixtures/inkscape.svg', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../../src/ood_logo/ood_logo.svg', import.meta.url), 'utf8');

/** Returns the opening root tag of an SVG string. */
const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];

test('simplifySvg strips editor data and dimensions but keeps viewBox', () => {
  const out = simplifySvg(fixture);
  assert.ok(!out.includes('inkscape'));
  assert.ok(!out.includes('sodipodi'));
  assert.ok(!out.includes('<!--'));
  assert.match(out, /viewBox="0 0 100 100"/);
  assert.ok(!rootTag(out).includes('width="'));
  assert.ok(out.length < fixture.length);
});

test('simplifySvg passes a plain svg through with its viewBox', () => {
  const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>';
  assert.match(simplifySvg(plain), /viewBox="0 0 10 10"/);
});

test('assertVisuallyEqual accepts a simplified inkscape fixture', () => {
  assert.doesNotThrow(() => assertVisuallyEqual(fixture, simplifySvg(fixture)));
});

test('assertVisuallyEqual throws when fill colour differs', () => {
  const a = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>';
  const b = a.replace('#f00', '#00f');
  assert.throws(() => assertVisuallyEqual(a, b), /pixel/i);
});

test('real ood logo simplifies smaller and renders identically', () => {
  const out = simplifySvg(logo);
  assert.ok(out.length < logo.length);
  assert.doesNotThrow(() => assertVisuallyEqual(logo, out));
});
