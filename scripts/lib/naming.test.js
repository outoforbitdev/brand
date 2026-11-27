import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAssetName, outputFileName } from './naming.js';

test('isValidAssetName accepts snake_case', () => {
  assert.equal(isValidAssetName('ood_logo'), true);
});

test('isValidAssetName rejects bad names', () => {
  for (const n of ['Ood_logo', 'ood-logo', 'ood__logo', '']) {
    assert.equal(isValidAssetName(n), false, n);
  }
});

test('outputFileName builds raster and vector names', () => {
  assert.equal(outputFileName('ood_logo', 'png', { width: 24, height: 24 }), 'ood_logo-24x24.png');
  assert.equal(outputFileName('ood_logo', 'png', { width: 24, height: 12 }), 'ood_logo-24x12.png');
  assert.equal(outputFileName('ood_logo', 'svg'), 'ood_logo.svg');
});
