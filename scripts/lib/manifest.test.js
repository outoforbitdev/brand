import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManifest, readViewBox } from './manifest.js';

let root;
const svg = (vb) =>
  `<svg xmlns="http://www.w3.org/2000/svg"${vb ? ` viewBox="${vb}"` : ''}></svg>`;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'manifest-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.svg'), svg('0 0 100 100'));
  writeFileSync(join(root, 'src/b.svg'), svg('0 0 100 100'));
  writeFileSync(join(root, 'src/wide.svg'), svg('0 0 100 50'));
  writeFileSync(join(root, 'src/novb.svg'), svg());
});
after(() => rmSync(root, { recursive: true, force: true }));

const asset = (o = {}) => ({
  name: 'a',
  source: 'src/a.svg',
  formats: ['svg', 'png'],
  sizes: [16, 32],
  ...o,
});
const errs = (m) => validateManifest({ assets: [], dynamic: [], ...m }, root);
const has = (list, text) =>
  assert.ok(
    list.some((e) => e.includes(text)),
    `expected "${text}" in ${JSON.stringify(list)}`,
  );

test('valid manifest returns no errors', () => {
  const m = {
    assets: [asset(), asset({ name: 'b', source: 'src/b.svg' })],
    dynamic: [
      {
        name: 'dyn',
        default: 'a',
        schedule: [{ variant: 'b', from: '12-01', to: '12-31' }],
      },
    ],
  };
  assert.deepEqual(errs(m), []);
});

test('bad name', () => has(errs({ assets: [asset({ name: 'Bad-Name' })] }), 'Bad-Name'));
test('missing source', () =>
  has(errs({ assets: [asset({ source: 'src/nope.svg' })] }), 'src/nope.svg'));
test('duplicate asset names', () =>
  has(errs({ assets: [asset(), asset()] }), 'duplicate'));
test('duplicate output paths', () => {
  const m = { assets: [asset(), asset({ name: 'b', source: 'src/b.svg' })], dynamic: [{ name: 'a', default: 'b', schedule: [] }] };
  has(errs(m), 'duplicate');
});
test('non-square viewBox', () =>
  has(errs({ assets: [asset({ source: 'src/wide.svg' })] }), 'square'));
test('missing viewBox', () =>
  has(errs({ assets: [asset({ source: 'src/novb.svg' })] }), 'viewBox'));
test('bad size', () => {
  for (const s of [0, -4, 1.5, '16']) {
    has(errs({ assets: [asset({ sizes: [s] })] }), 'size');
  }
});
test('dynamic default not static', () =>
  has(errs({ assets: [asset()], dynamic: [{ name: 'd', default: 'zzz', schedule: [] }] }), 'zzz'));
test('dynamic variant not static', () =>
  has(
    errs({
      assets: [asset()],
      dynamic: [{ name: 'd', default: 'a', schedule: [{ variant: 'qqq', from: '01-01', to: '01-02' }] }],
    }),
    'qqq',
  ));
test('variants with different formats or sizes', () => {
  const m = {
    assets: [asset(), asset({ name: 'b', source: 'src/b.svg', sizes: [16] })],
    dynamic: [{ name: 'd', default: 'a', schedule: [{ variant: 'b', from: '01-01', to: '01-02' }] }],
  };
  has(errs(m), 'identical');
});
test('overlapping windows including wrap-around', () => {
  const m = {
    assets: [asset(), asset({ name: 'b', source: 'src/b.svg' })],
    dynamic: [
      {
        name: 'd',
        default: 'a',
        schedule: [
          { variant: 'b', from: '12-20', to: '01-05' },
          { variant: 'b', from: '01-01', to: '01-10' },
        ],
      },
    ],
  };
  has(errs(m), 'overlap');
});
test('bad window date format and impossible dates', () => {
  const mk = (from, to) => ({
    assets: [asset(), asset({ name: 'b', source: 'src/b.svg' })],
    dynamic: [{ name: 'd', default: 'a', schedule: [{ variant: 'b', from, to }] }],
  });
  has(errs(mk('1-1', '12-31')), '1-1');
  has(errs(mk('02-30', '03-01')), '02-30');
  has(errs(mk('13-01', '03-01')), '13-01');
  assert.deepEqual(errs(mk('02-29', '03-01')), []);
});

test('readViewBox parses and rejects', () => {
  assert.deepEqual(readViewBox(svg('0 0 10 20')), { width: 10, height: 20 });
  assert.equal(readViewBox(svg()), null);
});
