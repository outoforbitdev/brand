import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, reconcileChecksums } from './checksums.js';

const V1 = { resvg: '1.0.0', svgo: '3.0.0' };
const V2 = { resvg: '2.0.0', svgo: '3.0.0' };
const buf = (s) => Buffer.from(s);
const stored = (files = {}, versions = V1) => ({ versions, files });
const opts = (o = {}) => ({
  versions: V1,
  check: false,
  allowChange: false,
  ...o,
});

test('sha256 hashes strings and buffers identically', () => {
  assert.equal(
    sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(sha256(buf('abc')), sha256('abc'));
});

test('unchanged input yields deeply equal next and no errors', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(s, new Map([['a.png', buf('a')]]), opts());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.next, s);
});

test('new path is added when not checking', () => {
  const r = reconcileChecksums(
    stored(),
    new Map([['a.png', buf('a')]]),
    opts(),
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.next.files['a.png'], sha256('a'));
});

test('new path is an error in check mode and next equals stored', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(
    s,
    new Map([
      ['a.png', buf('a')],
      ['b.png', buf('b')],
    ]),
    opts({ check: true }),
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /b\.png.*not in static-checksums\.json/);
  assert.deepEqual(r.next, s);
});

test('changed hash is an error by default and not rewritten', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(s, new Map([['a.png', buf('x')]]), opts());
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /a\.png/);
  assert.equal(r.next.files['a.png'], sha256('a'));
});

test('changed hash is rewritten when allowChange and not check', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(
    s,
    new Map([['a.png', buf('x')]]),
    opts({ allowChange: true }),
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.next.files['a.png'], sha256('x'));
});

test('allowChange is ignored in check mode', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(
    s,
    new Map([['a.png', buf('x')]]),
    opts({ check: true, allowChange: true }),
  );
  assert.equal(r.errors.length, 1);
  assert.deepEqual(r.next, s);
});

test('changed hash with differing versions names an upgrade', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(
    s,
    new Map([['a.png', buf('x')]]),
    opts({ versions: V2 }),
  );
  assert.match(r.errors.join('\n'), /resvg or svgo upgrade/);
});

test('changed hash with same versions does not blame an upgrade', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(s, new Map([['a.png', buf('x')]]), opts());
  assert.doesNotMatch(r.errors.join('\n'), /upgrade/);
});

test('version change alone with unchanged hashes is not an error', () => {
  const s = stored({ 'a.png': sha256('a') });
  const r = reconcileChecksums(
    s,
    new Map([['a.png', buf('a')]]),
    opts({ versions: V2 }),
  );
  assert.deepEqual(r.errors, []);
});

test('missing stored path is a removed error', () => {
  const s = stored({ 'a.png': sha256('a'), 'b.png': sha256('b') });
  const r = reconcileChecksums(s, new Map([['a.png', buf('a')]]), opts());
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /b\.png.*removed/);
  assert.equal(r.next.files['b.png'], sha256('b'));
});

test('does not mutate inputs', () => {
  const s = stored({ 'a.png': sha256('a') });
  const snapshot = structuredClone(s);
  const files = new Map([
    ['a.png', buf('x')],
    ['n.png', buf('n')],
  ]);
  const o = opts({ allowChange: true });
  const r = reconcileChecksums(s, files, o);
  assert.deepEqual(s, snapshot);
  assert.notEqual(r.next, s);
  assert.notEqual(r.next.files, s.files);
});

test('is idempotent', () => {
  const s = stored({ 'a.png': sha256('a') });
  const files = new Map([
    ['a.png', buf('x')],
    ['n.png', buf('n')],
  ]);
  const o = opts({ allowChange: true, versions: V2 });
  const first = reconcileChecksums(s, files, o);
  const second = reconcileChecksums(first.next, files, o);
  assert.deepEqual(second.errors, []);
  assert.deepEqual(second.next, first.next);
});

test('next.files keys are sorted regardless of input order', () => {
  const s = stored({ 'z.png': sha256('z'), 'm.png': sha256('m') });
  const files = new Map([
    ['z.png', buf('z')],
    ['m.png', buf('m')],
    ['b.png', buf('b')],
    ['a.png', buf('a')],
  ]);
  const r = reconcileChecksums(s, files, opts());
  assert.deepEqual(Object.keys(r.next.files), [
    'a.png',
    'b.png',
    'm.png',
    'z.png',
  ]);
});
