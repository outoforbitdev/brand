import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthDayUtc,
  inWindow,
  windowsOverlap,
  pickVariant,
} from './schedule.js';

test('inWindow is inclusive on both ends', () => {
  assert.equal(inWindow('12-01', '12-01', '12-31'), true);
  assert.equal(inWindow('12-31', '12-01', '12-31'), true);
  assert.equal(inWindow('11-30', '12-01', '12-31'), false);
  assert.equal(inWindow('01-01', '12-01', '12-31'), false);
});

test('inWindow handles wrap-around windows', () => {
  assert.equal(inWindow('12-20', '12-15', '01-05'), true);
  assert.equal(inWindow('01-05', '12-15', '01-05'), true);
  assert.equal(inWindow('01-06', '12-15', '01-05'), false);
});

test('inWindow accepts leap day', () => {
  assert.equal(inWindow('02-29', '02-01', '03-01'), true);
});

test('monthDayUtc formats in UTC', () => {
  assert.equal(monthDayUtc(new Date('2026-12-31T23:59:59Z')), '12-31');
  assert.equal(monthDayUtc(new Date('2026-12-31T23:59:59-05:00')), '01-01');
});

test('pickVariant returns default outside any window', () => {
  const alias = {
    default: 'base',
    schedule: [{ variant: 'winter', from: '12-01', to: '12-31' }],
  };
  assert.equal(pickVariant(alias, '06-15'), 'base');
  assert.equal(pickVariant(alias, '12-10'), 'winter');
  assert.equal(pickVariant({ default: 'base' }, '12-10'), 'base');
});

test('windowsOverlap detects overlaps', () => {
  assert.equal(
    windowsOverlap({ from: '12-01', to: '12-31' }, { from: '12-31', to: '01-05' }),
    true,
  );
  assert.equal(
    windowsOverlap({ from: '12-01', to: '12-10' }, { from: '12-11', to: '12-31' }),
    false,
  );
});
